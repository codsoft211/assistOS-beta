/**
 * Scheduled Workflow API Routes
 * 
 * Endpoints for managing scheduled workflows:
 * - POST /api/scheduled-workflows - Create a scheduled workflow
 * - GET /api/scheduled-workflows - List all scheduled workflows
 * - GET /api/scheduled-workflows/:id - Get scheduled workflow details
 * - PUT /api/scheduled-workflows/:id - Update scheduled workflow
 * - DELETE /api/scheduled-workflows/:id - Delete/unschedule workflow
 * - POST /api/scheduled-workflows/:id/pause - Pause scheduled workflow
 * - POST /api/scheduled-workflows/:id/resume - Resume scheduled workflow
 * - POST /api/scheduled-workflows/:id/run-now - Trigger immediate execution
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../../apps/worker/db.js';
import { 
  scheduleWorkflow, 
  unscheduleWorkflow,
  getActiveScheduledWorkflows 
} from '../../../apps/worker/queues/scheduled-workflow.js';
import { enqueueWorkflowExecution } from '../../../apps/worker/queues/workflow-execution.js';
import { randomUUID } from 'crypto';
import logger from '../logger.js';

const router = Router();

// Helper to get tenant from request (added by auth middleware)
function getTenantId(req: Request): string | undefined {
  return (req as any).user?.activeTenantId || req.session?.activeTenantId;
}

function getUserId(req: Request): string | undefined {
  return (req as any).user?.id || req.session?.userId;
}

/**
 * Create a scheduled workflow
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { workflowId, name, scheduleType, scheduleConfig } = req.body;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!workflowId || !name || !scheduleType || !scheduleConfig) {
      return res.status(400).json({ 
        error: 'Missing required fields: workflowId, name, scheduleType, scheduleConfig' 
      });
    }

    // Validate schedule type
    if (!['interval', 'cron', 'once'].includes(scheduleType)) {
      return res.status(400).json({ 
        error: 'Invalid scheduleType. Must be: interval, cron, or once' 
      });
    }

    // Create scheduled workflow record
    const id = randomUUID();
    
    const result = await pool.query(`
      INSERT INTO invoice_workflow_schema.scheduled_workflows 
      (id, workflow_id, tenant_id, name, schedule_type, schedule_config, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING *
    `, [
      id,
      workflowId,
      tenantId,
      name,
      scheduleType,
      JSON.stringify(scheduleConfig),
      userId,
    ]);

    const scheduledWorkflow = result.rows[0];

    // Schedule the job in BullMQ
    const { jobId, nextRunAt } = await scheduleWorkflow({
      scheduledWorkflowId: id,
      workflowId,
      tenantId,
      userId,
      scheduleType,
      scheduleConfig,
    });

    // Update with next run time
    await pool.query(`
      UPDATE invoice_workflow_schema.scheduled_workflows
      SET next_run_at = $1
      WHERE id = $2
    `, [nextRunAt, id]);

    logger.info(
      { scheduledWorkflowId: id, workflowId, scheduleType },
      '[Scheduled Workflows API] Created scheduled workflow'
    );

    res.status(201).json({
      ...scheduledWorkflow,
      next_run_at: nextRunAt,
      job_id: jobId,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[Scheduled Workflows API] Failed to create');
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * List scheduled workflows for tenant
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await pool.query(`
      SELECT 
        sw.*,
        w.name as workflow_name
      FROM invoice_workflow_schema.scheduled_workflows sw
      LEFT JOIN public.assistbuild_workflows w ON sw.workflow_id::text = w.id::text
      WHERE sw.tenant_id = $1
      ORDER BY sw.created_at DESC
    `, [tenantId]);

    res.json(result.rows);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[Scheduled Workflows API] Failed to list');
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Get scheduled workflow by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);

    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await pool.query(`
      SELECT 
        sw.*,
        w.name as workflow_name,
        w.definition as workflow_definition
      FROM invoice_workflow_schema.scheduled_workflows sw
      LEFT JOIN public.assistbuild_workflows w ON sw.workflow_id::text = w.id::text
      WHERE sw.id = $1 AND sw.tenant_id = $2
    `, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled workflow not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[Scheduled Workflows API] Failed to get');
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Update scheduled workflow
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, scheduleType, scheduleConfig } = req.body;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get existing record
    const existing = await pool.query(`
      SELECT * FROM invoice_workflow_schema.scheduled_workflows
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled workflow not found' });
    }

    const current = existing.rows[0];

    // Unschedule old job
    await unscheduleWorkflow(id);

    // Update record
    const result = await pool.query(`
      UPDATE invoice_workflow_schema.scheduled_workflows
      SET 
        name = COALESCE($1, name),
        schedule_type = COALESCE($2, schedule_type),
        schedule_config = COALESCE($3, schedule_config),
        updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5
      RETURNING *
    `, [
      name || current.name,
      scheduleType || current.schedule_type,
      scheduleConfig ? JSON.stringify(scheduleConfig) : current.schedule_config,
      id,
      tenantId,
    ]);

    // Re-schedule with new config
    const { jobId, nextRunAt } = await scheduleWorkflow({
      scheduledWorkflowId: id,
      workflowId: current.workflow_id,
      tenantId,
      userId: userId!,
      scheduleType: scheduleType || current.schedule_type,
      scheduleConfig: scheduleConfig || current.schedule_config,
    });

    logger.info(
      { scheduledWorkflowId: id },
      '[Scheduled Workflows API] Updated scheduled workflow'
    );

    res.json({
      ...result.rows[0],
      next_run_at: nextRunAt,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[Scheduled Workflows API] Failed to update');
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Delete/unschedule workflow
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);

    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Unschedule from queue
    await unscheduleWorkflow(id);

    // Delete from database
    await pool.query(`
      DELETE FROM invoice_workflow_schema.scheduled_workflows
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    logger.info(
      { scheduledWorkflowId: id },
      '[Scheduled Workflows API] Deleted scheduled workflow'
    );

    res.json({ success: true });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[Scheduled Workflows API] Failed to delete');
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Pause scheduled workflow
 */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);

    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Unschedule from queue
    await unscheduleWorkflow(id);

    // Update status
    await pool.query(`
      UPDATE invoice_workflow_schema.scheduled_workflows
      SET status = 'paused', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    logger.info(
      { scheduledWorkflowId: id },
      '[Scheduled Workflows API] Paused scheduled workflow'
    );

    res.json({ success: true, status: 'paused' });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[Scheduled Workflows API] Failed to pause');
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Resume scheduled workflow
 */
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get workflow details
    const result = await pool.query(`
      SELECT * FROM invoice_workflow_schema.scheduled_workflows
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled workflow not found' });
    }

    const sw = result.rows[0];

    // Re-schedule
    const { jobId, nextRunAt } = await scheduleWorkflow({
      scheduledWorkflowId: id,
      workflowId: sw.workflow_id,
      tenantId,
      userId,
      scheduleType: sw.schedule_type,
      scheduleConfig: sw.schedule_config,
    });

    logger.info(
      { scheduledWorkflowId: id, nextRunAt },
      '[Scheduled Workflows API] Resumed scheduled workflow'
    );

    res.json({ success: true, status: 'active', next_run_at: nextRunAt });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[Scheduled Workflows API] Failed to resume');
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Run scheduled workflow immediately (manual trigger)
 */
router.post('/:id/run-now', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get workflow details
    const result = await pool.query(`
      SELECT * FROM invoice_workflow_schema.scheduled_workflows
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled workflow not found' });
    }

    const sw = result.rows[0];
    const executionId = randomUUID();

    // Enqueue immediate execution
    await enqueueWorkflowExecution({
      workflowId: sw.workflow_id,
      executionId,
      tenantId,
      userId,
      environment: 'sandbox',
      triggerData: {
        scheduledWorkflowId: id,
        manualTrigger: true,
        triggeredAt: new Date().toISOString(),
      },
    });

    // Update run count
    await pool.query(`
      UPDATE invoice_workflow_schema.scheduled_workflows
      SET 
        run_count = run_count + 1,
        last_run_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [id]);

    logger.info(
      { scheduledWorkflowId: id, executionId },
      '[Scheduled Workflows API] Triggered immediate execution'
    );

    res.json({ 
      success: true, 
      executionId,
      message: 'Workflow execution queued'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[Scheduled Workflows API] Failed to run now');
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Get active scheduled jobs from queue (admin endpoint)
 */
router.get('/admin/active-jobs', async (req: Request, res: Response) => {
  try {
    const activeJobs = await getActiveScheduledWorkflows();
    res.json(activeJobs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
