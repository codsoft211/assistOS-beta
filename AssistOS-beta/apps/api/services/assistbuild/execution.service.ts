/**
 * AssistBuild Execution Service
 * Manages workflow execution lifecycle
 */

import { db } from '../../db.js';
import { 
  assistbuildExecutions,
  assistbuildExecutionLogs,
} from '../../../../shared/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import type {
  AssistBuildExecution,
  AssistBuildExecutionLog,
  ListExecutionsQuery,
  WorkflowJobData,
  ExecutionSummary,
} from './types.js';
import { WorkflowService } from './workflow.service.js';

export class ExecutionService {
  /**
   * Create a new execution record
   */
  static async createExecution(data: {
    workflowId: string;
    tenantId: string;
    userId: string;
    triggerData?: any;
    environment: 'sandbox' | 'production';
  }): Promise<AssistBuildExecution> {
    const [execution] = await db
      .insert(assistbuildExecutions)
      .values({
        workflowId: data.workflowId,
        tenantId: data.tenantId,
        status: 'pending',
        environment: data.environment,
        triggeredBy: 'manual', // Phase 1: always manual
        triggerUserId: data.userId,
        triggerData: data.triggerData || {},
        executionContext: {},
        startedAt: new Date(),
      })
      .returning();

    return execution;
  }

  /**
   * Enqueue a workflow execution job
   * NOTE: Uses dynamic import to avoid initialization issues
   */
  static async enqueueExecution(data: WorkflowJobData): Promise<void> {
    // Dynamic import to avoid circular dependencies and initialization order issues
    const { enqueueWorkflowExecution } = await import('../../../worker/queues/workflow-execution.js');
    await enqueueWorkflowExecution(data);
  }

  /**
   * Update execution status
   */
  static async updateExecution(
    executionId: string,
    data: Partial<Pick<AssistBuildExecution, 
      'status' | 
      'currentNodeId' | 
      'executionContext' | 
      'startedAt' | 
      'completedAt' | 
      'durationMs' | 
      'errorMessage' | 
      'errorNodeId' | 
      'errorStack'
    >>
  ): Promise<void> {
    await db
      .update(assistbuildExecutions)
      .set(data)
      .where(eq(assistbuildExecutions.id, executionId));
  }

  /**
   * Create an execution log entry
   */
  static async createLog(data: {
    executionId: string;
    tenantId: string;
    nodeId: string;
    nodeType: string;
    nodeName: string;
    status: 'running' | 'success' | 'failed' | 'skipped';
    inputData?: any;
    outputData?: any;
    errorMessage?: string;
    errorStack?: string;
  }): Promise<string> {
    const [log] = await db
      .insert(assistbuildExecutionLogs)
      .values(data)
      .returning({ id: assistbuildExecutionLogs.id });

    return log.id;
  }

  /**
   * Update execution log entry
   */
  static async updateLog(
    logId: string,
    data: Partial<Pick<AssistBuildExecutionLog,
      'status' |
      'outputData' |
      'errorMessage' |
      'errorStack' |
      'completedAt' |
      'durationMs'
    >>
  ): Promise<void> {
    await db
      .update(assistbuildExecutionLogs)
      .set(data)
      .where(eq(assistbuildExecutionLogs.id, logId));
  }

  /**
   * Get execution by ID
   */
  static async getExecution(
    executionId: string,
    tenantId: string
  ): Promise<AssistBuildExecution | null> {
    const [execution] = await db
      .select()
      .from(assistbuildExecutions)
      .where(
        and(
          eq(assistbuildExecutions.id, executionId),
          eq(assistbuildExecutions.tenantId, tenantId)
        )
      )
      .limit(1);

    return execution || null;
  }

  /**
   * Get execution logs
   */
  static async getExecutionLogs(
    executionId: string,
    tenantId: string
  ): Promise<AssistBuildExecutionLog[]> {
    const logs = await db
      .select()
      .from(assistbuildExecutionLogs)
      .where(
        and(
          eq(assistbuildExecutionLogs.executionId, executionId),
          eq(assistbuildExecutionLogs.tenantId, tenantId)
        )
      )
      .orderBy(assistbuildExecutionLogs.startedAt);

    return logs;
  }

  /**
   * List executions for a workflow
   */
  static async listExecutions(
    tenantId: string,
    query: ListExecutionsQuery = {}
  ): Promise<{ executions: AssistBuildExecution[]; total: number }> {
    const { workflowId, status, page = 1, limit = 50 } = query;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(assistbuildExecutions.tenantId, tenantId)];
    
    if (workflowId) {
      conditions.push(eq(assistbuildExecutions.workflowId, workflowId));
    }
    
    if (status) {
      conditions.push(eq(assistbuildExecutions.status, status));
    }

    // Get executions
    const executions = await db
      .select()
      .from(assistbuildExecutions)
      .where(and(...conditions))
      .orderBy(desc(assistbuildExecutions.startedAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assistbuildExecutions)
      .where(and(...conditions));

    return {
      executions,
      total: count,
    };
  }

  /**
   * Get execution summary with workflow and logs
   */
  static async getExecutionSummary(
    executionId: string,
    tenantId: string
  ): Promise<ExecutionSummary | null> {
    const execution = await this.getExecution(executionId, tenantId);
    if (!execution) {
      return null;
    }

    const workflow = await WorkflowService.get(execution.workflowId, tenantId);
    if (!workflow) {
      return null;
    }

    const logs = await this.getExecutionLogs(executionId, tenantId);

    const successfulNodes = logs.filter(l => l.status === 'success').length;
    const failedNodes = logs.filter(l => l.status === 'failed').length;
    const totalNodes = logs.length;
    const progress = totalNodes > 0 ? Math.round((successfulNodes / totalNodes) * 100) : 0;

    return {
      execution,
      workflow,
      logs,
      totalNodes,
      successfulNodes,
      failedNodes,
      progress,
    };
  }

  /**
   * Cancel a running execution
   */
  static async cancelExecution(
    executionId: string,
    tenantId: string
  ): Promise<AssistBuildExecution> {
    const execution = await this.getExecution(executionId, tenantId);
    if (!execution) {
      throw new Error('Execution not found');
    }

    if (execution.status !== 'running' && execution.status !== 'pending') {
      throw new Error(`Cannot cancel execution with status: ${execution.status}`);
    }

    const [updated] = await db
      .update(assistbuildExecutions)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        durationMs: execution.startedAt 
          ? Date.now() - execution.startedAt.getTime()
          : undefined,
      })
      .where(
        and(
          eq(assistbuildExecutions.id, executionId),
          eq(assistbuildExecutions.tenantId, tenantId)
        )
      )
      .returning();

    return updated;
  }

  /**
   * Retry a failed execution
   */
  static async retryExecution(
    executionId: string,
    tenantId: string,
    userId: string
  ): Promise<AssistBuildExecution> {
    const originalExecution = await this.getExecution(executionId, tenantId);
    if (!originalExecution) {
      throw new Error('Execution not found');
    }

    if (originalExecution.status !== 'failed') {
      throw new Error('Can only retry failed executions');
    }

    // Create a new execution with same parameters
    const newExecution = await this.createExecution({
      workflowId: originalExecution.workflowId,
      tenantId,
      userId,
      triggerData: originalExecution.triggerData,
      environment: originalExecution.environment as 'sandbox' | 'production',
    });

    // Enqueue the job
    await this.enqueueExecution({
      workflowId: originalExecution.workflowId,
      executionId: newExecution.id,
      tenantId,
      userId,
      triggerData: originalExecution.triggerData,
      environment: originalExecution.environment as 'sandbox' | 'production',
    });

    return newExecution;
  }

  /**
   * Get recent executions for a tenant (dashboard view)
   */
  static async getRecentExecutions(
    tenantId: string,
    limit: number = 10
  ): Promise<AssistBuildExecution[]> {
    const executions = await db
      .select()
      .from(assistbuildExecutions)
      .where(eq(assistbuildExecutions.tenantId, tenantId))
      .orderBy(desc(assistbuildExecutions.startedAt))
      .limit(limit);

    return executions;
  }

  /**
   * Get execution statistics for a tenant
   */
  static async getTenantStats(tenantId: string) {
    const [stats] = await db
      .select({
        totalExecutions: sql<number>`count(*)::int`,
        runningExecutions: sql<number>`count(*) FILTER (WHERE status = 'running')::int`,
        completedExecutions: sql<number>`count(*) FILTER (WHERE status = 'completed')::int`,
        failedExecutions: sql<number>`count(*) FILTER (WHERE status = 'failed')::int`,
        avgDurationMs: sql<number>`avg(duration_ms)::int`,
      })
      .from(assistbuildExecutions)
      .where(eq(assistbuildExecutions.tenantId, tenantId));

    return {
      totalExecutions: stats.totalExecutions || 0,
      runningExecutions: stats.runningExecutions || 0,
      completedExecutions: stats.completedExecutions || 0,
      failedExecutions: stats.failedExecutions || 0,
      successRate: stats.totalExecutions 
        ? Math.round((stats.completedExecutions / stats.totalExecutions) * 100)
        : 0,
      avgDurationMs: stats.avgDurationMs || 0,
    };
  }
}
