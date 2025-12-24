/**
 * AssistBuild Workflow Automation Routes
 * 
 * API endpoints for visual workflow builder (Phase 1: MVP with 2 nodes)
 * Provides workflow management and execution capabilities
 */

import { Router } from 'express';
import { z } from 'zod';
import { WorkflowService } from '../services/assistbuild/workflow.service.js';
import { ExecutionService } from '../services/assistbuild/execution.service.js';
import logger from '../logger.js';

const router = Router();

// ==================== Validation Schemas ====================

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  definition: z.object({
    nodes: z.array(z.object({
      id: z.string(),
      type: z.string().min(1).max(100),
      name: z.string().optional(),
      position: z.object({
        x: z.number(),
        y: z.number(),
      }),
      config: z.any(),
    })),
    edges: z.array(z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      condition: z.string().optional(),
      loopBack: z.boolean().optional(),
    })),
    variables: z.record(z.any()).optional(),
  }),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  status: z.enum(['draft', 'published']).optional().default('draft'),
});

const updateWorkflowSchema = createWorkflowSchema.partial();

const executeWorkflowSchema = z.object({
  triggerData: z.any().optional(),
  environment: z.enum(['sandbox', 'production']).optional(),
});

// ==================== Workflow Management ====================

/**
 * GET /api/assistbuild/workflows
 * List all workflows for the current tenant
 */
router.get('/workflows', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status, environment, page, limit } = req.query;

    const workflows = await WorkflowService.list(tenantId, {
      status: status as any,
      environment: environment as any,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json(workflows);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to list workflows');
    res.status(500).json({ error: 'Failed to list workflows' });
  }
});

/**
 * GET /api/assistbuild/workflows/:id
 * Get a specific workflow by ID
 */
router.get('/workflows/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const workflow = await WorkflowService.get(id, tenantId);

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json(workflow);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to get workflow');
    res.status(500).json({ error: 'Failed to get workflow' });
  }
});

/**
 * POST /api/assistbuild/workflows
 * Create a new workflow
 */
router.post('/workflows', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = createWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const workflow = await WorkflowService.create({
      ...parsed.data,
      tenantId,
      createdBy: userId,
    });

    logger.info(
      { workflowId: workflow.id, tenantId, userId },
      '[Workflow Routes] Created workflow'
    );

    res.status(201).json(workflow);
  } catch (error: any) {
    logger.error({ error }, '[Workflow Routes] Failed to create workflow');

    if (error.message?.includes('validation')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

/**
 * PUT /api/assistbuild/workflows/:id
 * Update an existing workflow
 */
router.put('/workflows/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    const parsed = updateWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const workflow = await WorkflowService.update(id, tenantId, parsed.data);
    res.json(workflow);
  } catch (error: any) {
    logger.error({ error, workflowId: req.params.id }, '[Workflow Routes] Failed to update workflow');
    res.status(403).json({ error: error.message || 'Failed to update workflow' });
  }
});

/**
 * DELETE /api/assistbuild/workflows/:id
 * Delete a workflow
 */
router.delete('/workflows/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deleted = await WorkflowService.delete(id, tenantId);

    if (!deleted) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    logger.info(
      { workflowId: id, tenantId, userId },
      '[Workflow Routes] Deleted workflow'
    );

    res.status(204).send();
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to delete workflow');
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

/**
 * POST /api/assistbuild/workflows/:id/publish
 * Publish a workflow (make it active)
 */
router.post('/workflows/:id/publish', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;
    const workflow = await WorkflowService.publish(id, tenantId);
    res.json(workflow);
  } catch (error: any) {
    logger.error({ error, id: req.params.id }, '[Workflow Routes] Failed to publish workflow');
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/assistbuild/workflows/:id/versions
 * Create a new sandbox iteration from another version
 */
router.post('/workflows/:id/versions', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;
    const workflow = await WorkflowService.createNextVersion(id, tenantId, userId);
    res.status(201).json(workflow);
  } catch (error: any) {
    logger.error({ error, id: req.params.id }, '[Workflow Routes] Failed to create new version');
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/assistbuild/workflows/:id/archive
 * Archive a workflow (soft delete)
 */
router.post('/workflows/:id/archive', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const workflow = await WorkflowService.archive(id, tenantId);

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    logger.info(
      { workflowId: id, tenantId, userId },
      '[Workflow Routes] Archived workflow'
    );

    res.json(workflow);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to archive workflow');
    res.status(500).json({ error: 'Failed to archive workflow' });
  }
});

/**
 * POST /api/assistbuild/workflows/:id/duplicate
 * Duplicate a workflow
 */
router.post('/workflows/:id/duplicate', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const workflow = await WorkflowService.duplicate(id, tenantId, userId);

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    logger.info(
      { workflowId: workflow.id, sourceWorkflowId: id, tenantId, userId },
      '[Workflow Routes] Duplicated workflow'
    );

    res.status(201).json(workflow);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to duplicate workflow');
    res.status(500).json({ error: 'Failed to duplicate workflow' });
  }
});

/**
 * GET /api/assistbuild/workflows/:id/stats
 * Get workflow statistics
 */
router.get('/workflows/:id/stats', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await WorkflowService.getStats(id, tenantId);

    if (!stats) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json(stats);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to get workflow stats');
    res.status(500).json({ error: 'Failed to get workflow stats' });
  }
});

// ==================== Execution Management ====================

/**
 * POST /api/assistbuild/workflows/:id/execute
 * Trigger workflow execution
 */
router.post('/workflows/:id/execute', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate workflow exists and is published
    const workflow = await WorkflowService.get(id, tenantId);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    if (workflow.status !== 'published') {
      return res.status(400).json({ error: 'Workflow must be published before execution' });
    }

    const parsed = executeWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const { triggerData, environment } = parsed.data;

    // Debug: Log triggerData
    console.log('EXECUTE ENDPOINT - triggerData received:', JSON.stringify(triggerData, null, 2));

    // Create execution record
    const execution = await ExecutionService.createExecution({
      workflowId: id,
      tenantId,
      userId,
      triggerData,
      environment: environment || workflow.environment || 'sandbox',
    });

    // Enqueue for background processing
    await ExecutionService.enqueueExecution({
      workflowId: id,
      executionId: execution.id,
      tenantId,
      userId,
      triggerData,
      environment: execution.environment,
    });

    logger.info(
      { workflowId: id, executionId: execution.id, tenantId, userId },
      '[Workflow Routes] Started workflow execution'
    );

    res.status(202).json(execution);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to execute workflow');
    res.status(500).json({ error: 'Failed to execute workflow' });
  }
});

/**
 * GET /api/assistbuild/executions
 * List executions for the current tenant
 */
router.get('/executions', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { workflowId, status, page, limit } = req.query;

    const executions = await ExecutionService.listExecutions(tenantId, {
      workflowId: workflowId as string,
      status: status as any,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json(executions);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to list executions');
    res.status(500).json({ error: 'Failed to list executions' });
  }
});

/**
 * GET /api/assistbuild/executions/:id
 * Get execution details
 */
router.get('/executions/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const execution = await ExecutionService.getExecution(id, tenantId);

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(execution);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to get execution');
    res.status(500).json({ error: 'Failed to get execution' });
  }
});

/**
 * GET /api/assistbuild/executions/:id/logs
 * Get execution logs (node-level details)
 */
router.get('/executions/:id/logs', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const logs = await ExecutionService.getExecutionLogs(id, tenantId);

    res.json(logs);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to get execution logs');
    res.status(500).json({ error: 'Failed to get execution logs' });
  }
});

/**
 * GET /api/assistbuild/executions/:id/summary
 * Get execution summary with statistics
 */
router.get('/executions/:id/summary', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const summary = await ExecutionService.getExecutionSummary(id, tenantId);

    if (!summary) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(summary);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to get execution summary');
    res.status(500).json({ error: 'Failed to get execution summary' });
  }
});

/**
 * POST /api/assistbuild/executions/:id/cancel
 * Cancel a running execution
 */
router.post('/executions/:id/cancel', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const execution = await ExecutionService.cancelExecution(id, tenantId);

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    logger.info(
      { executionId: id, tenantId, userId },
      '[Workflow Routes] Cancelled execution'
    );

    res.json(execution);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to cancel execution');
    res.status(500).json({ error: 'Failed to cancel execution' });
  }
});

/**
 * POST /api/assistbuild/executions/:id/retry
 * Retry a failed execution
 */
router.post('/executions/:id/retry', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const execution = await ExecutionService.retryExecution(id, tenantId, userId);

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found or cannot be retried' });
    }

    logger.info(
      { executionId: execution.id, originalExecutionId: id, tenantId, userId },
      '[Workflow Routes] Retried execution'
    );

    res.status(201).json(execution);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to retry execution');
    res.status(500).json({ error: 'Failed to retry execution' });
  }
});

// ==================== Statistics ====================

/**
 * GET /api/assistbuild/stats
 * Get tenant-level workflow statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await ExecutionService.getTenantStats(tenantId);

    res.json(stats);
  } catch (error) {
    logger.error({ error }, '[Workflow Routes] Failed to get tenant stats');
    res.status(500).json({ error: 'Failed to get tenant stats' });
  }
});

export default router;
