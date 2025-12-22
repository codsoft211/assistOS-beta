/**
 * Schedule Trigger Node Executor
 * 
 * Handles scheduled workflow triggers (cron, interval, once).
 * When a scheduled job runs, this executor is called to initialize the workflow context.
 * 
 * Input: Schedule metadata from the job queue
 * Output: Schedule context data for downstream nodes
 */

import type { AssistBuildNode } from '../../../../../shared/schema.js';
import logger from '../../../../api/logger.js';

interface ExecutionContext {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  variables: Record<string, any>;
  triggerData?: any;
}

interface ScheduleTriggerConfig {
  scheduleType: 'interval' | 'cron' | 'once';
  interval?: string;
  cronExpression?: string;
  runAt?: string;
  timezone?: string;
  label?: string;
}

export class ScheduleTriggerExecutor {
  async execute(
    node: AssistBuildNode,
    context: ExecutionContext
  ): Promise<{ success: boolean; output?: any; error?: string }> {
    const { executionId, triggerData } = context;
    const config = node.config as ScheduleTriggerConfig;

    logger.info(
      { 
        executionId, 
        nodeId: node.id, 
        nodeType: 'schedule_trigger',
        scheduleType: config.scheduleType,
        cronExpression: config.cronExpression,
        interval: config.interval
      },
      '[ScheduleTriggerExecutor] Executing scheduled trigger'
    );

    try {
      const now = new Date();
      
      const output = {
        triggeredAt: now.toISOString(),
        scheduleType: config.scheduleType,
        cronExpression: config.cronExpression,
        interval: config.interval,
        timezone: config.timezone || 'UTC',
        runData: triggerData || {},
        // Include schedule metadata for downstream nodes
        currentDate: now.toISOString().split('T')[0],
        currentTime: now.toISOString().split('T')[1].slice(0, 8),
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
        isBusinessHours: this.isBusinessHours(now),
      };

      // Store schedule data in context variables
      context.variables['schedule'] = output;
      context.variables['trigger'] = {
        ...output,
        type: 'schedule',
        data: triggerData || {},
      };

      logger.info(
        { 
          executionId, 
          nodeId: node.id, 
          triggeredAt: output.triggeredAt,
          scheduleType: output.scheduleType
        },
        '[ScheduleTriggerExecutor] ✅ Schedule trigger completed'
      );

      return {
        success: true,
        output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(
        { error: errorMessage, executionId, nodeId: node.id },
        '[ScheduleTriggerExecutor] ❌ Schedule trigger failed'
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if current time is within business hours (9 AM - 5 PM)
   */
  private isBusinessHours(date: Date): boolean {
    const hour = date.getHours();
    const day = date.getDay();
    
    // Not a weekend (0 = Sunday, 6 = Saturday)
    const isWeekday = day > 0 && day < 6;
    // Between 9 AM and 5 PM
    const isDuringWork = hour >= 9 && hour < 17;
    
    return isWeekday && isDuringWork;
  }
}
