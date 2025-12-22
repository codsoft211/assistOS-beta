/**
 * WorkflowScheduler - Manages scheduled and on-demand workflow executions
 * 
 * Features:
 * - Execute workflows on-demand
 * - Schedule workflows with cron expressions
 * - Track executions in workflowExecutions table
 * - Integrate with WorkflowExecutor
 */

import * as cron from 'node-cron';
import { WorkflowExecutor } from './WorkflowExecutor';
import { db } from '../../apps/api/db';
import { tenantWorkflows, workflowExecutions } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { WorkflowDefinition } from './types';

interface ScheduledWorkflow {
  id: string;
  tenantId: string;
  workflowId: string;
  schedule: string; // cron expression
  input: any;
  task: cron.ScheduledTask;
}

/**
 * WorkflowScheduler - Orchestrates when workflows execute
 * 
 * Handles both on-demand and scheduled workflow execution, delegating
 * the actual execution to WorkflowExecutor.
 */
export class WorkflowScheduler {
  private scheduledWorkflows: Map<string, ScheduledWorkflow> = new Map();
  private workflowExecutor: WorkflowExecutor;
  
  constructor() {
    this.workflowExecutor = new WorkflowExecutor();
  }
  
  /**
   * Execute a workflow immediately (on-demand)
   * 
   * @param workflowId - Workflow ID to execute
   * @param tenantId - Tenant ID
   * @param userId - User ID (for execution context)
   * @param input - Input data for the workflow
   * @returns Execution ID for tracking
   */
  async executeNow(
    workflowId: string,
    tenantId: string,
    userId: string,
    input?: any
  ): Promise<string> {
    console.log(`[WorkflowScheduler] Executing workflow: ${workflowId}`);
    
    try {
      // Fetch workflow definition from database
      const workflowRecords = await db.select()
        .from(tenantWorkflows)
        .where(and(
          eq(tenantWorkflows.id, workflowId),
          eq(tenantWorkflows.tenantId, tenantId)
        ))
        .limit(1);
      
      if (workflowRecords.length === 0) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      
      const workflowRecord = workflowRecords[0];
      
      // Check if workflow is active
      if (!workflowRecord.isActive) {
        throw new Error(`Workflow is not active: ${workflowId}`);
      }
      
      // Convert database format to WorkflowDefinition
      const workflowDefinition: WorkflowDefinition = {
        id: workflowRecord.id,
        name: workflowRecord.name,
        steps: (workflowRecord.steps || []).map((step: any) => ({
          id: step.id,
          name: step.name,
          action: step.type, // Map 'type' to 'action'
          config: step.config || {},
          onError: 'stop' as const, // Default error policy
        })),
      };
      
      // Execute workflow via WorkflowExecutor
      const executionId = await this.workflowExecutor.execute(
        workflowDefinition,
        tenantId,
        {
          ...input,
          triggeredBy: userId,
        }
      );
      
      console.log(`[WorkflowScheduler] Workflow execution started: ${executionId}`);
      return executionId;
      
    } catch (error: any) {
      console.error(`[WorkflowScheduler] Error executing workflow ${workflowId}:`, error);
      throw error;
    }
  }
  
  /**
   * Schedule a workflow to run periodically
   * 
   * @param id - Unique identifier for this schedule
   * @param workflowId - Workflow ID to execute
   * @param tenantId - Tenant ID
   * @param userId - User ID (for execution context)
   * @param schedule - Cron expression (e.g., '0 9 * * *' for daily at 9am)
   * @param input - Input data for the workflow (optional)
   */
  scheduleWorkflow(
    id: string,
    workflowId: string,
    tenantId: string,
    userId: string,
    schedule: string,
    input?: any
  ): void {
    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }
    
    // Stop existing schedule if it exists (prevent cron job leaks)
    const existingSchedule = this.scheduledWorkflows.get(id);
    if (existingSchedule) {
      console.log(`[WorkflowScheduler] Stopping existing schedule: ${id}`);
      existingSchedule.task.stop();
    }
    
    // Create scheduled task
    const task = cron.schedule(schedule, async () => {
      try {
        console.log(`[WorkflowScheduler] Executing scheduled workflow: ${id}`);
        await this.executeNow(workflowId, tenantId, userId, input);
      } catch (error) {
        console.error(`[WorkflowScheduler] Error executing scheduled workflow ${id}:`, error);
      }
    });
    
    // Store schedule
    this.scheduledWorkflows.set(id, {
      id,
      tenantId,
      workflowId,
      schedule,
      input,
      task
    });
    
    console.log(`[WorkflowScheduler] Workflow scheduled: ${id} (${schedule})`);
  }
  
  /**
   * Unschedule a workflow
   * 
   * @param id - Schedule ID to remove
   * @returns true if workflow was unscheduled, false if not found
   */
  unscheduleWorkflow(id: string): boolean {
    const scheduled = this.scheduledWorkflows.get(id);
    if (!scheduled) {
      return false;
    }
    
    scheduled.task.stop();
    this.scheduledWorkflows.delete(id);
    
    console.log(`[WorkflowScheduler] Workflow unscheduled: ${id}`);
    return true;
  }
  
  /**
   * List all scheduled workflows
   * 
   * @returns Array of scheduled workflow metadata
   */
  listScheduled(): Array<{
    id: string;
    tenantId: string;
    workflowId: string;
    schedule: string;
  }> {
    return Array.from(this.scheduledWorkflows.values()).map(({ id, tenantId, workflowId, schedule }) => ({
      id,
      tenantId,
      workflowId,
      schedule
    }));
  }
  
  /**
   * Get execution history for a workflow
   * 
   * @param tenantId - Tenant ID
   * @param workflowId - Workflow ID
   * @param limit - Maximum number of executions to return (default: 10)
   * @returns Array of workflow execution records
   */
  async getExecutionHistory(
    tenantId: string,
    workflowId: string,
    limit: number = 10
  ): Promise<any[]> {
    return await db.select()
      .from(workflowExecutions)
      .where(and(
        eq(workflowExecutions.tenantId, tenantId),
        eq(workflowExecutions.workflowId, workflowId)
      ))
      .orderBy(desc(workflowExecutions.startedAt))
      .limit(limit);
  }
  
  /**
   * Stop all scheduled workflows
   * 
   * Useful for graceful shutdown or testing cleanup
   */
  stopAll(): void {
    this.scheduledWorkflows.forEach(scheduled => {
      scheduled.task.stop();
    });
    this.scheduledWorkflows.clear();
    console.log('[WorkflowScheduler] All scheduled workflows stopped');
  }
}

// Singleton instance
export const workflowScheduler = new WorkflowScheduler();
