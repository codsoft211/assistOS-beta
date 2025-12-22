/**
 * AgentScheduler - Manages scheduled and on-demand agent executions
 * 
 * Features:
 * - Execute agents on-demand
 * - Schedule agents with cron expressions
 * - Track executions in agentRuns table
 * - Integrate with ActionRegistry
 */

import * as cron from 'node-cron';
import { actionRegistry } from './ActionRegistry';
import type { ExecutionContext } from './types';
import { db } from '../../apps/api/db';
import { agentRuns } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

interface ScheduledAgent {
  id: string;
  tenantId: string;
  agentId: string;
  agentType: 'specialized' | 'custom' | 'library';
  schedule: string;
  input: any;
  task: cron.ScheduledTask;
}

export class AgentScheduler {
  private scheduledAgents: Map<string, ScheduledAgent> = new Map();
  
  /**
   * Execute an agent immediately (on-demand)
   */
  async executeNow(
    tenantId: string,
    agentId: string,
    agentType: 'specialized' | 'custom' | 'library',
    input: any
  ): Promise<string> {
    const context: ExecutionContext = {
      tenantId,
      userId: undefined,
      workflowId: undefined,
      executionId: undefined
    };
    
    const result = await actionRegistry.execute('run_agent', {
      agentId,
      agentType,
      input
    }, context);
    
    if (!result.success) {
      throw new Error(result.error || 'Agent execution failed');
    }
    
    return result.output?.runId;
  }
  
  /**
   * Schedule an agent to run periodically
   * 
   * @param id - Unique identifier for this schedule
   * @param tenantId - Tenant ID
   * @param agentId - Agent ID
   * @param agentType - Type of agent
   * @param schedule - Cron expression (e.g., '0 9 * * *' for daily at 9am)
   * @param input - Input data for the agent
   */
  scheduleAgent(
    id: string,
    tenantId: string,
    agentId: string,
    agentType: 'specialized' | 'custom' | 'library',
    schedule: string,
    input: any
  ): void {
    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }
    
    // Create scheduled task
    const task = cron.schedule(schedule, async () => {
      try {
        console.log(`[AgentScheduler] Executing scheduled agent: ${id}`);
        await this.executeNow(tenantId, agentId, agentType, input);
      } catch (error) {
        console.error(`[AgentScheduler] Error executing scheduled agent ${id}:`, error);
      }
    });
    
    // Store schedule
    this.scheduledAgents.set(id, {
      id,
      tenantId,
      agentId,
      agentType,
      schedule,
      input,
      task
    });
    
    console.log(`[AgentScheduler] Agent scheduled: ${id} (${schedule})`);
  }
  
  /**
   * Unschedule an agent
   */
  unscheduleAgent(id: string): boolean {
    const scheduled = this.scheduledAgents.get(id);
    if (!scheduled) {
      return false;
    }
    
    scheduled.task.stop();
    this.scheduledAgents.delete(id);
    
    console.log(`[AgentScheduler] Agent unscheduled: ${id}`);
    return true;
  }
  
  /**
   * List all scheduled agents
   */
  listScheduled(): Array<{
    id: string;
    tenantId: string;
    agentId: string;
    agentType: string;
    schedule: string;
  }> {
    return Array.from(this.scheduledAgents.values()).map(({ id, tenantId, agentId, agentType, schedule }) => ({
      id,
      tenantId,
      agentId,
      agentType,
      schedule
    }));
  }
  
  /**
   * Get execution history for an agent
   */
  async getExecutionHistory(
    tenantId: string,
    agentId: string,
    limit: number = 10
  ): Promise<any[]> {
    return await db.select()
      .from(agentRuns)
      .where(and(
        eq(agentRuns.tenantId, tenantId),
        eq(agentRuns.agentId, agentId)
      ))
      .orderBy(desc(agentRuns.startedAt))
      .limit(limit);
  }
  
  /**
   * Stop all scheduled agents
   */
  stopAll(): void {
    this.scheduledAgents.forEach(scheduled => {
      scheduled.task.stop();
    });
    this.scheduledAgents.clear();
    console.log('[AgentScheduler] All scheduled agents stopped');
  }
}

// Singleton instance
export const agentScheduler = new AgentScheduler();
