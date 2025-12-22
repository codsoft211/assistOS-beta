// FASE 4: Approval Workflow for Code Generation
// Endpoints for approve/reject/deploy generated code with permission checks and audit trail

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { generatedCode, codeGenerationValidations, users } from '../../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getUserRoleInTenant } from '../services/tenant.service';
import fs from 'fs/promises';
import path from 'path';
import { codeGenerationRateLimiter } from '../middleware/rate-limit';
import { codeGenerationService } from '../services/code-generation.service';
import { RollbackSnapshots } from '../middleware/rollback-snapshot.middleware';

const router = Router();

// ==================== POST /code ====================
// Generate code via AssistBuild with rate limiting and resource quotas

const generateCodeSchema = z.object({
  files: z.record(z.string(), z.string()), // { "client/src/components/Button.tsx": "code...", ... }
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  blueprintId: z.string().optional(),
  executionPlanId: z.string().optional(),
  metadata: z.object({
    description: z.string().optional(),
    conversationId: z.string().optional(),
  }).optional(),
});

router.post('/code', codeGenerationRateLimiter, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = generateCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const { files, environment, blueprintId, executionPlanId, metadata } = parsed.data;

    // Call CodeGenerationService with rate limiting + quota checks
    const result = await codeGenerationService.generateCode({
      tenantId,
      userId,
      environment,
      files,
      blueprintId,
      executionPlanId,
      metadata: {
        ...metadata,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Return appropriate status code based on result
    if (result.quotaViolation) {
      return res.status(429).json({
        error: result.error,
        code: result.quotaViolation.code,
        quotaType: result.quotaViolation.quotaType,
        limit: result.quotaViolation.limit,
        currentUsage: result.quotaViolation.currentUsage,
        resetAt: result.quotaViolation.resetAt,
      });
    }

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        status: result.status,
        coreProtectionIssues: result.coreProtectionIssues,
        validationResult: result.validationResult,
      });
    }

    return res.status(201).json({
      success: true,
      generatedCodeId: result.generatedCodeId,
      status: result.status,
      validationResult: result.validationResult,
    });
  } catch (error) {
    console.error('[AssistBuild] Code generation error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== PERMISSION HELPERS ====================

async function checkApprovalPermission(userId: string, tenantId: string): Promise<boolean> {
  const role = await getUserRoleInTenant(userId, tenantId);
  return role === 'admin' || role === 'owner';
}

async function createAuditRecord(
  generatedCodeId: string,
  validationType: 'approval' | 'rejection' | 'deployment',
  passed: boolean,
  metadata?: Record<string, any>
) {
  await db.insert(codeGenerationValidations).values({
    generatedCodeId,
    validationType,
    status: 'completed',
    passed,
    results: metadata ? { metadata } : undefined,
    startedAt: new Date(),
    completedAt: new Date(),
  });
}

// ==================== POST /code/:id/approve ====================
// Approve generated code after validation and sandbox testing

const approveCodeSchema = z.object({
  autoDeploy: z.boolean().optional().default(false),
});

router.post('/code/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check permission: admin or owner only
    const hasPermission = await checkApprovalPermission(userId, tenantId);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only admins and owners can approve code generation',
      });
    }

    const { autoDeploy } = approveCodeSchema.parse(req.body);

    // Get the generated code record
    const [codeRecord] = await db
      .select()
      .from(generatedCode)
      .where(and(
        eq(generatedCode.id, id),
        eq(generatedCode.tenantId, tenantId)
      ))
      .limit(1);

    if (!codeRecord) {
      return res.status(404).json({ error: 'Generated code not found' });
    }

    // Validate status
    if (codeRecord.status !== 'pending_approval') {
      return res.status(400).json({ 
        error: 'Invalid status',
        message: `Code must be in 'pending_approval' status. Current status: ${codeRecord.status}`,
      });
    }

    // Validate sandbox tests passed
    if (!codeRecord.sandboxTestResults?.passed) {
      return res.status(400).json({ 
        error: 'Sandbox tests not passed',
        message: 'Cannot approve code that has not passed sandbox testing',
      });
    }

    // Transaction: Update status + create audit record
    await db.transaction(async (tx) => {
      // Update generatedCode status
      await tx
        .update(generatedCode)
        .set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(generatedCode.id, id));

      // Create audit record
      await tx.insert(codeGenerationValidations).values({
        generatedCodeId: id,
        validationType: 'approval',
        status: 'completed',
        passed: true,
        results: {
          metadata: {
            approvedBy: userId,
            approvedAt: new Date().toISOString(),
            autoDeploy,
          },
        },
        startedAt: new Date(),
        completedAt: new Date(),
      });
    });

    // Fetch updated record
    const [updatedCode] = await db
      .select()
      .from(generatedCode)
      .where(eq(generatedCode.id, id))
      .limit(1);

    console.log(`[AssistBuild] Code ${id} approved by user ${userId}`);

    res.json({
      success: true,
      code: updatedCode,
      message: 'Code generation approved successfully',
    });

  } catch (error: any) {
    console.error('[AssistBuild] Approve error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }

    res.status(500).json({ error: 'Failed to approve code generation' });
  }
});

// ==================== POST /code/:id/reject ====================
// Reject generated code with reason

const rejectCodeSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

router.post('/code/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check permission: admin or owner only
    const hasPermission = await checkApprovalPermission(userId, tenantId);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only admins and owners can reject code generation',
      });
    }

    const { reason } = rejectCodeSchema.parse(req.body);

    // Get the generated code record
    const [codeRecord] = await db
      .select()
      .from(generatedCode)
      .where(and(
        eq(generatedCode.id, id),
        eq(generatedCode.tenantId, tenantId)
      ))
      .limit(1);

    if (!codeRecord) {
      return res.status(404).json({ error: 'Generated code not found' });
    }

    // Validate status
    if (codeRecord.status !== 'pending_approval') {
      return res.status(400).json({ 
        error: 'Invalid status',
        message: `Code must be in 'pending_approval' status. Current status: ${codeRecord.status}`,
      });
    }

    // Transaction: Update status + create audit record
    await db.transaction(async (tx) => {
      // Update generatedCode status
      await tx
        .update(generatedCode)
        .set({
          status: 'rejected',
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(generatedCode.id, id));

      // Create audit record
      await tx.insert(codeGenerationValidations).values({
        generatedCodeId: id,
        validationType: 'rejection',
        status: 'completed',
        passed: false,
        results: {
          metadata: {
            rejectedBy: userId,
            rejectedAt: new Date().toISOString(),
            reason,
          },
        },
        startedAt: new Date(),
        completedAt: new Date(),
      });
    });

    // Fetch updated record
    const [updatedCode] = await db
      .select()
      .from(generatedCode)
      .where(eq(generatedCode.id, id))
      .limit(1);

    console.log(`[AssistBuild] Code ${id} rejected by user ${userId}: ${reason}`);

    res.json({
      success: true,
      code: updatedCode,
      message: 'Code generation rejected',
    });

  } catch (error: any) {
    console.error('[AssistBuild] Reject error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }

    res.status(500).json({ error: 'Failed to reject code generation' });
  }
});

// ==================== POST /code/:id/deploy ====================
// Deploy approved code to production
// GAP #6: Auto-snapshot before code deployment

router.post('/code/:id/deploy', RollbackSnapshots.codeGeneration, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check permission: admin or owner only
    const hasPermission = await checkApprovalPermission(userId, tenantId);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only admins and owners can deploy code',
      });
    }

    // Get the generated code record
    const [codeRecord] = await db
      .select()
      .from(generatedCode)
      .where(and(
        eq(generatedCode.id, id),
        eq(generatedCode.tenantId, tenantId)
      ))
      .limit(1);

    if (!codeRecord) {
      return res.status(404).json({ error: 'Generated code not found' });
    }

    // Validate status
    if (codeRecord.status !== 'approved') {
      return res.status(400).json({ 
        error: 'Invalid status',
        message: `Code must be approved before deployment. Current status: ${codeRecord.status}`,
      });
    }

    // Check if already deployed
    if (codeRecord.deployedAt) {
      return res.status(400).json({ 
        error: 'Already deployed',
        message: 'This code has already been deployed to production',
      });
    }

    // Deploy files to production
    // NOTE: In a real system, this would:
    // 1. Copy files from sandbox to production location
    // 2. Run migrations if needed
    // 3. Restart services
    // For now, we'll simulate deployment by updating the database
    const deploymentResult = {
      filesDeployed: Object.keys(codeRecord.files || {}).length,
      deployedFiles: Object.keys(codeRecord.files || {}),
      deployedAt: new Date().toISOString(),
    };

    // Transaction: Update status + create audit record
    await db.transaction(async (tx) => {
      // Update generatedCode status
      await tx
        .update(generatedCode)
        .set({
          status: 'deployed',
          deployedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(generatedCode.id, id));

      // Create audit record
      await tx.insert(codeGenerationValidations).values({
        generatedCodeId: id,
        validationType: 'deployment',
        status: 'completed',
        passed: true,
        results: {
          metadata: {
            deployedBy: userId,
            deployedAt: new Date().toISOString(),
            filesDeployed: deploymentResult.filesDeployed,
            deployedFiles: deploymentResult.deployedFiles,
          },
        },
        startedAt: new Date(),
        completedAt: new Date(),
      });
    });

    // Fetch updated record
    const [updatedCode] = await db
      .select()
      .from(generatedCode)
      .where(eq(generatedCode.id, id))
      .limit(1);

    console.log(`[AssistBuild] Code ${id} deployed to production by user ${userId}`);

    res.json({
      success: true,
      code: updatedCode,
      deployment: deploymentResult,
      message: 'Code deployed to production successfully',
    });

  } catch (error: any) {
    console.error('[AssistBuild] Deploy error:', error);
    res.status(500).json({ error: 'Failed to deploy code' });
  }
});

// ==================== GET /code/pending ====================
// List all code pending approval for the tenant

router.get('/code/pending', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all pending code for this tenant
    const pendingCode = await db.query.generatedCode.findMany({
      where: and(
        eq(generatedCode.tenantId, tenantId),
        eq(generatedCode.status, 'pending_approval')
      ),
      orderBy: [desc(generatedCode.createdAt)],
      with: {
        // Note: Drizzle doesn't support nested relations out of the box
        // We'll need to fetch related data separately if needed
      },
    });

    // Fetch validation results for each code
    const enrichedCode = await Promise.all(
      pendingCode.map(async (code) => {
        // Get all validations for this code
        const validations = await db.query.codeGenerationValidations.findMany({
          where: eq(codeGenerationValidations.generatedCodeId, code.id),
          orderBy: [desc(codeGenerationValidations.createdAt)],
        });

        return {
          ...code,
          validations,
        };
      })
    );

    res.json({
      pending: enrichedCode,
      total: enrichedCode.length,
    });

  } catch (error: any) {
    console.error('[AssistBuild] List pending error:', error);
    res.status(500).json({ error: 'Failed to list pending code' });
  }
});

// ==================== GET /code/:id ====================
// Get detailed information about a specific code generation

router.get('/code/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the generated code record
    const [codeRecord] = await db
      .select()
      .from(generatedCode)
      .where(and(
        eq(generatedCode.id, id),
        eq(generatedCode.tenantId, tenantId)
      ))
      .limit(1);

    if (!codeRecord) {
      return res.status(404).json({ error: 'Generated code not found' });
    }

    // Get all validations for this code
    const validations = await db.query.codeGenerationValidations.findMany({
      where: eq(codeGenerationValidations.generatedCodeId, id),
      orderBy: [desc(codeGenerationValidations.createdAt)],
    });

    // Get user info for approved/rejected by
    let approvedByUser = null;
    let rejectedByUser = null;

    if (codeRecord.approvedBy) {
      [approvedByUser] = await db
        .select({ 
          id: users.id, 
          firstName: users.firstName, 
          lastName: users.lastName, 
          email: users.email 
        })
        .from(users)
        .where(eq(users.id, codeRecord.approvedBy))
        .limit(1);
    }

    if (codeRecord.rejectedBy) {
      [rejectedByUser] = await db
        .select({ 
          id: users.id, 
          firstName: users.firstName, 
          lastName: users.lastName, 
          email: users.email 
        })
        .from(users)
        .where(eq(users.id, codeRecord.rejectedBy))
        .limit(1);
    }

    res.json({
      code: codeRecord,
      validations,
      approvedByUser,
      rejectedByUser,
    });

  } catch (error: any) {
    console.error('[AssistBuild] Get code error:', error);
    res.status(500).json({ error: 'Failed to get code details' });
  }
});

export default router;
