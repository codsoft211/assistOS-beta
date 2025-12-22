import { Router } from 'express';
import { db } from '../db';
import { 
  workflowExecutions, 
  automationExecutions, 
  agentRuns 
} from '../../../shared/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/executions/automations
 * Lista execuções de automations com paginação e filtros
 */
router.get('/automations', requireAuth, async (req, res) => {
  const tenantId = req.session.activeTenantId!;
  const { 
    status, 
    automationId, 
    limit = 50, 
    offset = 0 
  } = req.query;
  
  try {
    // Build conditions
    const conditions = [eq(automationExecutions.tenantId, tenantId)];
    
    if (status) {
      conditions.push(eq(automationExecutions.status, status as string));
    }
    
    if (automationId) {
      conditions.push(eq(automationExecutions.automationId, automationId as string));
    }
    
    // Get executions
    const executions = await db
      .select()
      .from(automationExecutions)
      .where(and(...conditions))
      .orderBy(desc(automationExecutions.startedAt))
      .limit(Number(limit))
      .offset(Number(offset));
    
    // Get total count
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(automationExecutions)
      .where(and(...conditions));
    
    res.json({
      data: executions,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset)
      }
    });
    
  } catch (error) {
    console.error('[API] Error listing automation executions:', error);
    res.status(500).json({ 
      error: 'Failed to list automation executions' 
    });
  }
});

/**
 * GET /api/executions/automations/:id
 * Detalhes de uma execution específica
 */
router.get('/automations/:id', requireAuth, async (req, res) => {
  const tenantId = req.session.activeTenantId!;
  const { id } = req.params;
  
  try {
    const [execution] = await db
      .select()
      .from(automationExecutions)
      .where(and(
        eq(automationExecutions.id, id),
        eq(automationExecutions.tenantId, tenantId)
      ))
      .limit(1);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json(execution);
    
  } catch (error) {
    console.error('[API] Error fetching execution:', error);
    res.status(500).json({ error: 'Failed to fetch execution' });
  }
});

/**
 * GET /api/executions/workflows
 * Lista execuções de workflows
 */
router.get('/workflows', requireAuth, async (req, res) => {
  const tenantId = req.session.activeTenantId!;
  const { status, workflowId, limit = 50, offset = 0 } = req.query;
  
  try {
    const conditions = [eq(workflowExecutions.tenantId, tenantId)];
    
    if (status) {
      conditions.push(eq(workflowExecutions.status, status as string));
    }
    
    if (workflowId) {
      conditions.push(eq(workflowExecutions.workflowId, workflowId as string));
    }
    
    const executions = await db
      .select()
      .from(workflowExecutions)
      .where(and(...conditions))
      .orderBy(desc(workflowExecutions.startedAt))
      .limit(Number(limit))
      .offset(Number(offset));
    
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(workflowExecutions)
      .where(and(...conditions));
    
    res.json({
      data: executions,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset)
      }
    });
    
  } catch (error) {
    console.error('[API] Error listing workflow executions:', error);
    res.status(500).json({ error: 'Failed to list workflow executions' });
  }
});

/**
 * GET /api/executions/agents
 * Lista execuções de agents
 * Note: Only selecting columns that exist in the database (durationMs may not be migrated)
 */
router.get('/agents', requireAuth, async (req, res) => {
  const tenantId = req.session.activeTenantId!;
  const { status, agentId, limit = 50, offset = 0 } = req.query;
  
  try {
    const conditions = [eq(agentRuns.tenantId, tenantId)];
    
    if (status) {
      conditions.push(eq(agentRuns.status, status as string));
    }
    
    if (agentId) {
      conditions.push(eq(agentRuns.agentId, agentId as string));
    }
    
    // Select only columns that exist in the database
    // Note: durationMs column may not be migrated yet
    const executions = await db
      .select({
        id: agentRuns.id,
        tenantId: agentRuns.tenantId,
        environment: agentRuns.environment,
        agentId: agentRuns.agentId,
        status: agentRuns.status,
        inputData: agentRuns.inputData,
        outputData: agentRuns.outputData,
        errorMessage: agentRuns.errorMessage,
        errorStack: agentRuns.errorStack,
        startedAt: agentRuns.startedAt,
        completedAt: agentRuns.completedAt,
      })
      .from(agentRuns)
      .where(and(...conditions))
      .orderBy(desc(agentRuns.startedAt))
      .limit(Number(limit))
      .offset(Number(offset));
    
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(agentRuns)
      .where(and(...conditions));
    
    res.json({
      data: executions,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset)
      }
    });
    
  } catch (error) {
    console.error('[API] Error listing agent runs:', error);
    res.status(500).json({ error: 'Failed to list agent runs' });
  }
});

/**
 * GET /api/executions/stats
 * Estatísticas gerais de execuções
 */
router.get('/stats', requireAuth, async (req, res) => {
  const tenantId = req.session.activeTenantId!;
  const { period = '7d' } = req.query; // 7d, 30d, 90d
  
  try {
    // Calculate date range
    const daysAgo = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const since = new Date();
    since.setDate(since.getDate() - daysAgo);
    
    // Automation stats
    const automationStats = await db
      .select({
        total: count(),
        status: automationExecutions.status
      })
      .from(automationExecutions)
      .where(and(
        eq(automationExecutions.tenantId, tenantId),
        sql`${automationExecutions.startedAt} >= ${since}`
      ))
      .groupBy(automationExecutions.status);
    
    // Workflow stats
    const workflowStats = await db
      .select({
        total: count(),
        status: workflowExecutions.status
      })
      .from(workflowExecutions)
      .where(and(
        eq(workflowExecutions.tenantId, tenantId),
        sql`${workflowExecutions.startedAt} >= ${since}`
      ))
      .groupBy(workflowExecutions.status);
    
    // Agent stats
    const agentStats = await db
      .select({
        total: count(),
        status: agentRuns.status
      })
      .from(agentRuns)
      .where(and(
        eq(agentRuns.tenantId, tenantId),
        sql`${agentRuns.startedAt} >= ${since}`
      ))
      .groupBy(agentRuns.status);
    
    res.json({
      period: period as string,
      since: since.toISOString(),
      automations: automationStats,
      workflows: workflowStats,
      agents: agentStats
    });
    
  } catch (error) {
    console.error('[API] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
