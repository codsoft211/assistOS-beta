// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/services/runtime-orchestrator.ts (529 lines)

import { db } from "../../../apps/api/db";

// TODO: Add these tables to schema if they don't exist
// import { 
//   executionPlans, 
//   codeValidationResults,
//   tenantCodeFiles,
//   tenantCodeArtifacts,
//   tenantCodeReleases,
//   codeGenerationAudit,
//   sandboxExecutions
// } from "../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";

// TODO: Migrate policy engine service when needed
// import { checkPolicy, createGovernanceSnapshot } from "../../../apps/api/services/policy-engine-service";
import * as crypto from "crypto";

/**
 * RuntimeOrchestrator
 * 
 * The brain of Configuration Studio v2.0 - orchestrates the entire lifecycle:
 * 1. Plan → 2. Generate Code → 3. Review → 4. Build → 5. Test → 6. Deploy Sandbox → 7. Deploy Production
 * 
 * Responsibilities:
 * - State machine management (execution_plans status transitions)
 * - Policy enforcement via PolicyEngine
 * - Safety gates at each phase
 * - Transparency (user approval points)
 * - Audit logging
 */

export type ExecutionPlanStatus = 
  | 'drafted' 
  | 'generated_code' 
  | 'validated' 
  | 'deployed_sandbox'
  | 'approved_for_production' 
  | 'deployed_production' 
  | 'failed';

export interface CreateExecutionPlanParams {
  tenantId: string;
  requestedByUserId: string;
  summary: string;
  blueprintId?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface GenerateCodeParams {
  executionPlanId: string;
  files: Array<{
    filePath: string;
    code: string;
    language?: string;
  }>;
  blueprintId?: string;
}

/**
 * Phase 1: Create Execution Plan (Draft)
 * 
 * Creates a plan describing what will be done BEFORE touching code.
 * User can review and approve before generation starts.
 */
export async function createExecutionPlan(params: CreateExecutionPlanParams): Promise<string> {
  // Check policies
  const tenantId = params.tenantId;
  
  // Determine if human approval is needed
  const riskLevel = params.riskLevel || 'medium';
  const requiresHumanApproval = riskLevel === 'high' || riskLevel === 'medium';
  
  // Create execution plan
  const [plan] = await db.insert(executionPlans).values({
    tenantId,
    requestedByUserId: params.requestedByUserId,
    status: 'drafted',
    summary: params.summary,
    riskLevel,
    requiresHumanApproval,
    blueprintId: params.blueprintId,
    diffSummary: { created: [], modified: [], deleted: [] }, // Will be filled during generation
  }).returning();
  
  return plan.id;
}

/**
 * Phase 2: Generate Code
 * 
 * Writes code files to tenant_code_files (sandbox environment).
 * Logs to code_generation_audit for compliance.
 */
export async function generateCode(params: GenerateCodeParams): Promise<void> {
  const plan = await db.query.executionPlans.findFirst({
    where: eq(executionPlans.id, params.executionPlanId)
  });
  
  if (!plan) {
    throw new Error(`Execution plan ${params.executionPlanId} not found`);
  }
  
  if (plan.status !== 'drafted') {
    throw new Error(`Cannot generate code for plan in status ${plan.status}`);
  }
  
  try {
    // Write files to tenant_code_files
    const createdFiles: string[] = [];
    const modifiedFiles: string[] = [];
    
    for (const file of params.files) {
      // Check if file already exists
      const existing = await db.query.tenantCodeFiles.findFirst({
        where: and(
          eq(tenantCodeFiles.tenantId, plan.tenantId),
          eq(tenantCodeFiles.environment, 'sandbox'),
          eq(tenantCodeFiles.filePath, file.filePath)
        ),
        orderBy: [desc(tenantCodeFiles.version)]
      });
      
      const nextVersion = existing ? existing.version + 1 : 1;
      
      // Insert new version
      await db.insert(tenantCodeFiles).values({
        tenantId: plan.tenantId,
        environment: 'sandbox',
        filePath: file.filePath,
        code: file.code,
        version: nextVersion,
        language: file.language || 'typescript',
        createdBy: plan.requestedByUserId,
      });
      
      if (existing) {
        modifiedFiles.push(file.filePath);
      } else {
        createdFiles.push(file.filePath);
      }
      
      // Audit log
      await db.insert(codeGenerationAudit).values({
        tenantId: plan.tenantId,
        executionPlanId: params.executionPlanId,
        userId: plan.requestedByUserId,
        action: 'generate_code',
        filePath: file.filePath,
        codeSnapshot: file.code.substring(0, 10000), // Truncate for storage
        blueprintId: params.blueprintId,
        riskLevel: plan.riskLevel,
      });
    }
    
    // Update plan status and diff_summary
    await db.update(executionPlans)
      .set({
        status: 'generated_code',
        diffSummary: {
          created: createdFiles,
          modified: modifiedFiles,
          deleted: []
        },
        updatedAt: new Date(),
      })
      .where(eq(executionPlans.id, params.executionPlanId));
      
  } catch (error: any) {
    // Mark plan as failed
    await db.update(executionPlans)
      .set({
        status: 'failed',
        failureReason: `Code generation failed: ${error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(executionPlans.id, params.executionPlanId));
      
    throw error;
  }
}

/**
 * Phase 3: Validate Code
 * 
 * Runs static analysis on generated code:
 * - ESLint/TypeScript checks
 * - Dangerous operation detection (fs.unlink, process.exit, etc)
 * - Tenant isolation validation (all queries include tenantId)
 * - Secret access validation (only via getTenantSecret())
 * 
 * Results saved to code_validation_results.
 */
export async function validateCode(executionPlanId: string): Promise<{
  passed: boolean;
  errors: number;
  warnings: number;
}> {
  const plan = await db.query.executionPlans.findFirst({
    where: eq(executionPlans.id, executionPlanId)
  });
  
  if (!plan) {
    throw new Error(`Execution plan ${executionPlanId} not found`);
  }
  
  if (plan.status !== 'generated_code') {
    throw new Error(`Cannot validate plan in status ${plan.status}`);
  }
  
  try {
    // Get all files for this plan
    const files = await db.query.tenantCodeFiles.findMany({
      where: and(
        eq(tenantCodeFiles.tenantId, plan.tenantId),
        eq(tenantCodeFiles.environment, 'sandbox')
      ),
      orderBy: [desc(tenantCodeFiles.createdAt)],
      limit: 100 // Limit to recent files
    });
    
    let errorCount = 0;
    let warningCount = 0;
    
    // Basic validation rules (in production, would use ESLint/TypeScript)
    const dangerousPatterns = [
      { pattern: /fs\.unlink|fs\.rmdir|fs\.rm\(/g, message: 'Filesystem deletion operations not allowed', severity: 'error' },
      { pattern: /child_process|exec|spawn/g, message: 'Process execution not allowed', severity: 'error' },
      { pattern: /process\.exit/g, message: 'process.exit() not allowed', severity: 'error' },
      { pattern: /eval\(|Function\(/g, message: 'Dynamic code execution not allowed', severity: 'error' },
      { pattern: /\.query\.[^(]+\(/g, message: 'Database query without tenant isolation check', severity: 'warning' },
    ];
    
    for (const file of files) {
      for (const { pattern, message, severity } of dangerousPatterns) {
        const matches = file.code.match(pattern);
        if (matches) {
          await db.insert(codeValidationResults).values({
            executionPlanId,
            filePath: file.filePath,
            severity: severity as 'error' | 'warning',
            message,
            lineNumber: null, // Would need proper parsing for line numbers
          });
          
          if (severity === 'error') errorCount++;
          if (severity === 'warning') warningCount++;
        }
      }
    }
    
    // Update plan status
    if (errorCount === 0) {
      await db.update(executionPlans)
        .set({
          status: 'validated',
          updatedAt: new Date(),
        })
        .where(eq(executionPlans.id, executionPlanId));
    } else {
      await db.update(executionPlans)
        .set({
          status: 'failed',
          failureReason: `Code validation failed: ${errorCount} errors found`,
          updatedAt: new Date(),
        })
        .where(eq(executionPlans.id, executionPlanId));
    }
    
    return {
      passed: errorCount === 0,
      errors: errorCount,
      warnings: warningCount,
    };
    
  } catch (error: any) {
    await db.update(executionPlans)
      .set({
        status: 'failed',
        failureReason: `Validation failed: ${error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(executionPlans.id, executionPlanId));
      
    throw error;
  }
}

/**
 * Phase 4-5: Build & Test (Sandbox Deploy)
 * 
 * Bundles code and tests in sandbox environment.
 * Creates artifact and release record.
 */
export async function deploySandbox(executionPlanId: string): Promise<string> {
  const plan = await db.query.executionPlans.findFirst({
    where: eq(executionPlans.id, executionPlanId)
  });
  
  if (!plan) {
    throw new Error(`Execution plan ${executionPlanId} not found`);
  }
  
  if (plan.status !== 'validated') {
    throw new Error(`Cannot deploy sandbox for plan in status ${plan.status}`);
  }
  
  // Check sandbox deployment policy
  const policyCheck = await checkPolicy(plan.tenantId, 'auto_deploy_to_sandbox');
  if (!policyCheck.allowed) {
    throw new Error(policyCheck.message || 'Sandbox deployment not allowed by policy');
  }
  
  try {
    // Get all files for bundling
    const files = await db.query.tenantCodeFiles.findMany({
      where: and(
        eq(tenantCodeFiles.tenantId, plan.tenantId),
        eq(tenantCodeFiles.environment, 'sandbox')
      )
    });
    
    // Create simple bundle (in production would use esbuild/webpack)
    const bundleCode = files.map(f => f.code).join('\n\n');
    const bundleHash = crypto.createHash('sha256').update(bundleCode).digest('hex');
    const artifactPath = `/${plan.tenantId}/sandbox/bundle-${bundleHash.substring(0, 16)}.js`;
    
    // Create artifact
    const [artifact] = await db.insert(tenantCodeArtifacts).values({
      tenantId: plan.tenantId,
      environment: 'sandbox',
      artifactPath,
      artifactHash: bundleHash,
      sizeBytes: Buffer.byteLength(bundleCode),
      buildMetadata: {
        timestamp: new Date().toISOString(),
        fileCount: files.length,
      }
    }).returning();
    
    // Create release
    const [release] = await db.insert(tenantCodeReleases).values({
      tenantId: plan.tenantId,
      environment: 'sandbox',
      artifactId: artifact.id,
      artifactHash: bundleHash,
      deployedBy: plan.requestedByUserId,
      blueprintVersionId: plan.blueprintId, // Link to blueprint if used
      riskLevelAtDeploy: plan.riskLevel,
    }).returning();
    
    // Mock sandbox execution test
    await db.insert(sandboxExecutions).values({
      executionPlanId,
      tenantId: plan.tenantId,
      moduleName: 'sandbox_test',
      executionTier: 'vm2',
      inputData: { test: true },
      outputData: { success: true },
      success: true,
      latencyMs: 42,
    });
    
    // Update plan status
    await db.update(executionPlans)
      .set({
        status: 'deployed_sandbox',
        updatedAt: new Date(),
      })
      .where(eq(executionPlans.id, executionPlanId));
      
    // Audit log
    await db.insert(codeGenerationAudit).values({
      tenantId: plan.tenantId,
      executionPlanId,
      userId: plan.requestedByUserId,
      action: 'deploy_sandbox',
      riskLevel: plan.riskLevel,
    });
    
    return release.id;
    
  } catch (error: any) {
    await db.update(executionPlans)
      .set({
        status: 'failed',
        failureReason: `Sandbox deployment failed: ${error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(executionPlans.id, executionPlanId));
      
    throw error;
  }
}

/**
 * Phase 6-7: Deploy to Production
 * 
 * Final deployment with governance checks and audit trail.
 * Requires human approval (unless policy allows auto-deploy).
 */
export async function deployProduction(executionPlanId: string, approverUserId: string): Promise<string> {
  const plan = await db.query.executionPlans.findFirst({
    where: eq(executionPlans.id, executionPlanId)
  });
  
  if (!plan) {
    throw new Error(`Execution plan ${executionPlanId} not found`);
  }
  
  if (plan.status !== 'deployed_sandbox' && plan.status !== 'approved_for_production') {
    throw new Error(`Cannot deploy production for plan in status ${plan.status}`);
  }
  
  // Check production deployment policy
  const policyCheck = await checkPolicy(plan.tenantId, 'auto_deploy_to_production');
  
  if (!policyCheck.allowed && plan.status !== 'approved_for_production') {
    // Mark as waiting for approval
    await db.update(executionPlans)
      .set({
        status: 'approved_for_production', // Waiting state
        updatedAt: new Date(),
      })
      .where(eq(executionPlans.id, executionPlanId));
      
    throw new Error(policyCheck.message || 'Production deployment requires human approval');
  }
  
  try {
    // Get files (production copies from sandbox)
    const sandboxFiles = await db.query.tenantCodeFiles.findMany({
      where: and(
        eq(tenantCodeFiles.tenantId, plan.tenantId),
        eq(tenantCodeFiles.environment, 'sandbox')
      )
    });
    
    // Copy to production environment
    for (const file of sandboxFiles) {
      await db.insert(tenantCodeFiles).values({
        tenantId: file.tenantId,
        environment: 'production',
        filePath: file.filePath,
        code: file.code,
        version: 1, // Reset version for production
        language: file.language,
        createdBy: file.createdBy,
      });
    }
    
    // Create production bundle
    const bundleCode = sandboxFiles.map(f => f.code).join('\n\n');
    const bundleHash = crypto.createHash('sha256').update(bundleCode).digest('hex');
    const artifactPath = `/${plan.tenantId}/production/bundle-${bundleHash.substring(0, 16)}.js`;
    
    const [artifact] = await db.insert(tenantCodeArtifacts).values({
      tenantId: plan.tenantId,
      environment: 'production',
      artifactPath,
      artifactHash: bundleHash,
      sizeBytes: Buffer.byteLength(bundleCode),
    }).returning();
    
    // Create governance snapshot
    const governanceSnapshot = await createGovernanceSnapshot(plan.tenantId);
    
    // Create production release with full audit info
    const [release] = await db.insert(tenantCodeReleases).values({
      tenantId: plan.tenantId,
      environment: 'production',
      artifactId: artifact.id,
      artifactHash: bundleHash,
      deployedBy: plan.requestedByUserId,
      approverUserId,
      blueprintVersionId: plan.blueprintId,
      riskLevelAtDeploy: plan.riskLevel,
      governanceSnapshot: governanceSnapshot as any,
    }).returning();
    
    // Update plan to deployed
    await db.update(executionPlans)
      .set({
        status: 'deployed_production',
        updatedAt: new Date(),
      })
      .where(eq(executionPlans.id, executionPlanId));
      
    // Audit log
    await db.insert(codeGenerationAudit).values({
      tenantId: plan.tenantId,
      executionPlanId,
      userId: approverUserId,
      action: 'deploy_production',
      riskLevel: plan.riskLevel,
    });
    
    return release.id;
    
  } catch (error: any) {
    await db.update(executionPlans)
      .set({
        status: 'failed',
        failureReason: `Production deployment failed: ${error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(executionPlans.id, executionPlanId));
      
    throw error;
  }
}

/**
 * Get execution plan status
 */
export async function getExecutionPlanStatus(executionPlanId: string) {
  const plan = await db.query.executionPlans.findFirst({
    where: eq(executionPlans.id, executionPlanId)
  });
  
  if (!plan) {
    throw new Error(`Execution plan ${executionPlanId} not found`);
  }
  
  const validationResults = await db.query.codeValidationResults.findMany({
    where: eq(codeValidationResults.executionPlanId, executionPlanId)
  });
  
  return {
    ...plan,
    validationResults,
  };
}
