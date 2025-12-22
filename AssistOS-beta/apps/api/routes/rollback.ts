// GAP #6: Rollback System - REST API endpoints
// Manage rollback points, execute rollbacks, and track history

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant-middleware';
import { RollbackService } from '../services/rollback.service';
import { db } from '../db';
import { rollbackPoints, rollbackExecutions } from '../../../shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import type { Environment } from '../../../shared/types/environment';

const router = Router();
const rollbackService = new RollbackService();

// All routes require authentication and tenant context
router.use(requireAuth);
router.use(tenantMiddleware);

/**
 * GET /api/rollback/history
 * List rollback points and executions for tenant
 */
router.get('/history', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req.query.environment as Environment) || 'production';
    const limit = parseInt(req.query.limit as string) || 50;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch rollback points
    const points = await db
      .select()
      .from(rollbackPoints)
      .where(and(
        eq(rollbackPoints.tenantId, tenantId),
        eq(rollbackPoints.environment, environment)
      ))
      .orderBy(desc(rollbackPoints.createdAt))
      .limit(limit);

    // Fetch recent executions
    const executions = await db
      .select()
      .from(rollbackExecutions)
      .where(and(
        eq(rollbackExecutions.tenantId, tenantId),
        eq(rollbackExecutions.environment, environment)
      ))
      .orderBy(desc(rollbackExecutions.initiatedAt))
      .limit(limit);

    res.json({
      success: true,
      data: {
        points,
        executions,
        environment,
      },
    });
  } catch (error: any) {
    console.error('[Rollback API] Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rollback history',
      details: error.message,
    });
  }
});

/**
 * GET /api/rollback/points/:id
 * Get detailed information about a specific rollback point
 */
router.get('/points/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [point] = await db
      .select()
      .from(rollbackPoints)
      .where(and(
        eq(rollbackPoints.id, id),
        eq(rollbackPoints.tenantId, tenantId)
      ))
      .limit(1);

    if (!point) {
      return res.status(404).json({
        success: false,
        error: 'Rollback point not found',
      });
    }

    res.json({
      success: true,
      data: point,
    });
  } catch (error: any) {
    console.error('[Rollback API] Error fetching point:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rollback point',
      details: error.message,
    });
  }
});

/**
 * POST /api/rollback/create-snapshot
 * Manually create a rollback snapshot
 */
const createSnapshotSchema = z.object({
  environment: z.enum(['sandbox', 'production']).default('production'),
  trigger: z.string().optional().default('manual'),
  metadata: z.record(z.any()).optional(),
  description: z.string().optional(),
});

router.post('/create-snapshot', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = createSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const { environment, trigger, metadata, description } = parsed.data;

    // Create snapshot
    const result = await rollbackService.captureSnapshot({
      tenantId,
      environment,
      trigger,
      metadata: {
        ...metadata,
        createdBy: userId,
        description,
      },
    });

    const point = result.point;

    res.json({
      success: true,
      data: point,
      message: 'Rollback snapshot created successfully',
    });
  } catch (error: any) {
    console.error('[Rollback API] Error creating snapshot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create rollback snapshot',
      details: error.message,
    });
  }
});

/**
 * POST /api/rollback/execute
 * Execute a rollback to a specific point
 */
const executeRollbackSchema = z.object({
  rollbackPointId: z.string(),
  dryRun: z.boolean().optional().default(false),
  reason: z.string().optional(),
});

router.post('/execute', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = executeRollbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const { rollbackPointId, dryRun, reason } = parsed.data;

    // Verify rollback point exists and belongs to tenant
    const [point] = await db
      .select()
      .from(rollbackPoints)
      .where(and(
        eq(rollbackPoints.id, rollbackPointId),
        eq(rollbackPoints.tenantId, tenantId)
      ))
      .limit(1);

    if (!point) {
      return res.status(404).json({
        success: false,
        error: 'Rollback point not found',
      });
    }

    // Execute rollback
    const result = await rollbackService.executeRollback({
      rollbackPointId,
      tenantId,
      environment: point.environment,
      userId,
      async: false, // Execute synchronously for now
    });

    // Get execution record
    const [execution] = await db
      .select()
      .from(rollbackExecutions)
      .where(eq(rollbackExecutions.id, result.executionId))
      .limit(1);

    if (dryRun) {
      return res.json({
        success: true,
        data: { ...result, dryRun: true },
        message: 'Dry run mode not yet implemented. Use async: false for actual rollback.',
      });
    }

    res.json({
      success: true,
      data: {
        ...result,
        execution,
      },
      message: result.status === 'completed' 
        ? 'Rollback executed successfully' 
        : result.status === 'failed'
        ? 'Rollback execution failed'
        : 'Rollback in progress',
    });
  } catch (error: any) {
    console.error('[Rollback API] Error executing rollback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute rollback',
      details: error.message,
    });
  }
});

/**
 * GET /api/rollback/executions/:id
 * Get status and details of a rollback execution
 */
router.get('/executions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [execution] = await db
      .select()
      .from(rollbackExecutions)
      .where(and(
        eq(rollbackExecutions.id, id),
        eq(rollbackExecutions.tenantId, tenantId)
      ))
      .limit(1);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Rollback execution not found',
      });
    }

    res.json({
      success: true,
      data: execution,
    });
  } catch (error: any) {
    console.error('[Rollback API] Error fetching execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rollback execution',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/rollback/points/:id
 * Delete a rollback point (with safety checks)
 */
router.delete('/points/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify point exists
    const [point] = await db
      .select()
      .from(rollbackPoints)
      .where(and(
        eq(rollbackPoints.id, id),
        eq(rollbackPoints.tenantId, tenantId)
      ))
      .limit(1);

    if (!point) {
      return res.status(404).json({
        success: false,
        error: 'Rollback point not found',
      });
    }

    // Check if point was used in executions
    const executions = await db
      .select()
      .from(rollbackExecutions)
      .where(eq(rollbackExecutions.rollbackPointId, id))
      .limit(1);

    if (executions.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete rollback point that has been used in executions',
      });
    }

    // Delete point
    await db
      .delete(rollbackPoints)
      .where(eq(rollbackPoints.id, id));

    res.json({
      success: true,
      message: 'Rollback point deleted successfully',
    });
  } catch (error: any) {
    console.error('[Rollback API] Error deleting point:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete rollback point',
      details: error.message,
    });
  }
});

export default router;
