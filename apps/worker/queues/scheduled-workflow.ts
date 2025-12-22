/**
 * Scheduled Workflow Queue
 * 
 * Handles scheduled workflow executions using BullMQ repeatable jobs.
 * Supports:
 * - Cron expressions (e.g., "0 9 * * *" for daily at 9 AM)
 * - Interval-based (e.g., every 1 hour)
 * - One-time scheduled execution
 */

import { Queue, Job } from 'bullmq';
import { redisConnection, defaultJobOptions, checkRedisConnection } from '../config/redis.js';
import logger from '../../api/logger.js';
import { pool } from '../db.js';
import { enqueueWorkflowExecution } from './workflow-execution.js';
import { v4 as uuidv4 } from 'uuid';

export interface ScheduledWorkflowJobData {
  scheduledWorkflowId: string;
  workflowId: string;
  tenantId: string;
  userId: string;
  scheduleType: 'interval' | 'cron' | 'once';
  scheduleConfig: {
    interval?: string;
    cronExpression?: string;
    runAt?: string;
    timezone?: string;
  };
}

let scheduledWorkflowQueue: Queue<ScheduledWorkflowJobData> | null = null;

logger.info('[Scheduled Workflow Queue] 🚀 Initializing...');

// Initialize queue if Redis is available
checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    scheduledWorkflowQueue = new Queue<ScheduledWorkflowJobData>('scheduled-workflows', {
      connection: redisConnection,
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 500,
          age: 604800, // 7 days
        },
        removeOnFail: {
          count: 1000,
          age: 2592000, // 30 days
        },
      },
    });
    
    scheduledWorkflowQueue.on('error', (error) => {
      logger.error({ error }, '[Scheduled Workflow Queue] Error');
    });
    
    logger.info('[Scheduled Workflow Queue] ✅ Queue initialized successfully');
  } else {
    logger.warn('[Scheduled Workflow Queue] ⚠️  Redis unavailable');
  }
}).catch((error) => {
  logger.error({ error }, '[Scheduled Workflow Queue] ❌ Failed to initialize');
});

/**
 * Convert interval string to milliseconds
 * Supports: 30s, 5m, 1h, 1d
 */
function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid interval format: ${interval}. Use format like 30s, 5m, 1h, 1d`);
  }
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Schedule a workflow for repeated execution
 */
export async function scheduleWorkflow(
  data: ScheduledWorkflowJobData
): Promise<{ jobId: string; nextRunAt: Date }> {
  // Wait for queue initialization
  const maxWaitTime = 5000;
  const startTime = Date.now();
  
  while (!scheduledWorkflowQueue && Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (!scheduledWorkflowQueue) {
    throw new Error('Scheduled workflow queue is not available. Redis connection may be down.');
  }

  const jobId = `scheduled-${data.scheduledWorkflowId}`;
  
  let repeatOptions: any = {};
  let delay: number | undefined;
  
  switch (data.scheduleType) {
    case 'cron':
      if (!data.scheduleConfig.cronExpression) {
        throw new Error('Cron expression is required for cron schedule type');
      }
      repeatOptions = {
        pattern: data.scheduleConfig.cronExpression,
        tz: data.scheduleConfig.timezone || 'UTC',
      };
      break;
      
    case 'interval':
      if (!data.scheduleConfig.interval) {
        throw new Error('Interval is required for interval schedule type');
      }
      repeatOptions = {
        every: parseInterval(data.scheduleConfig.interval),
      };
      break;
      
    case 'once':
      if (!data.scheduleConfig.runAt) {
        throw new Error('runAt is required for once schedule type');
      }
      const runAtDate = new Date(data.scheduleConfig.runAt);
      delay = runAtDate.getTime() - Date.now();
      if (delay < 0) {
        throw new Error('runAt must be in the future');
      }
      break;
      
    default:
      throw new Error(`Unknown schedule type: ${data.scheduleType}`);
  }

  // Add job to queue
  if (data.scheduleType === 'once') {
    await scheduledWorkflowQueue.add('run-scheduled-workflow', data, {
      jobId,
      delay,
    });
  } else {
    await scheduledWorkflowQueue.add('run-scheduled-workflow', data, {
      jobId,
      repeat: repeatOptions,
    });
  }

  // Calculate next run time
  let nextRunAt: Date;
  if (data.scheduleType === 'once') {
    nextRunAt = new Date(data.scheduleConfig.runAt!);
  } else if (data.scheduleType === 'interval') {
    nextRunAt = new Date(Date.now() + parseInterval(data.scheduleConfig.interval!));
  } else {
    // For cron, approximate next run (actual time depends on cron parser)
    nextRunAt = new Date(Date.now() + 60000); // Placeholder
  }

  // Update scheduled_workflows table
  try {
    await pool.query(`
      UPDATE invoice_workflow_schema.scheduled_workflows
      SET next_run_at = $1, status = 'active', updated_at = NOW()
      WHERE id = $2
    `, [nextRunAt, data.scheduledWorkflowId]);
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      '[Scheduled Workflow Queue] Failed to update scheduled_workflows table'
    );
  }

  logger.info(
    { 
      jobId,
      workflowId: data.workflowId,
      scheduleType: data.scheduleType,
      nextRunAt: nextRunAt.toISOString(),
    },
    '[Scheduled Workflow Queue] ✅ Workflow scheduled'
  );

  return { jobId, nextRunAt };
}

/**
 * Remove a scheduled workflow
 */
export async function unscheduleWorkflow(scheduledWorkflowId: string): Promise<void> {
  if (!scheduledWorkflowQueue) {
    throw new Error('Queue not available');
  }

  const jobId = `scheduled-${scheduledWorkflowId}`;
  
  // Remove repeatable job
  const repeatableJobs = await scheduledWorkflowQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id === jobId || job.key.includes(scheduledWorkflowId)) {
      await scheduledWorkflowQueue.removeRepeatableByKey(job.key);
    }
  }
  
  // Also try to remove non-repeatable job
  const job = await scheduledWorkflowQueue.getJob(jobId);
  if (job) {
    await job.remove();
  }

  // Update database
  try {
    await pool.query(`
      UPDATE invoice_workflow_schema.scheduled_workflows
      SET status = 'paused', updated_at = NOW()
      WHERE id = $1
    `, [scheduledWorkflowId]);
  } catch (error) {
    logger.warn({ error: (error as Error).message }, '[Scheduled Workflow Queue] DB update failed');
  }

  logger.info(
    { scheduledWorkflowId },
    '[Scheduled Workflow Queue] Workflow unscheduled'
  );
}

/**
 * Get all active scheduled workflows
 */
export async function getActiveScheduledWorkflows(): Promise<any[]> {
  if (!scheduledWorkflowQueue) {
    return [];
  }

  const repeatableJobs = await scheduledWorkflowQueue.getRepeatableJobs();
  return repeatableJobs.map(job => ({
    id: job.id,
    key: job.key,
    name: job.name,
    next: job.next ? new Date(job.next) : null,
    pattern: job.pattern,
    every: job.every,
  }));
}

/**
 * Process scheduled workflow job - triggers actual workflow execution
 */
export async function processScheduledWorkflowJob(job: Job<ScheduledWorkflowJobData>): Promise<void> {
  const { scheduledWorkflowId, workflowId, tenantId, userId, scheduleType, scheduleConfig } = job.data;

  logger.info(
    { 
      jobId: job.id,
      scheduledWorkflowId,
      workflowId,
      tenantId,
      scheduleType,
    },
    '[Scheduled Workflow Processor] Processing scheduled workflow'
  );

  try {
    // Create a new execution
    const executionId = uuidv4();
    
    // Enqueue the actual workflow execution
    await enqueueWorkflowExecution({
      workflowId,
      executionId,
      tenantId,
      userId,
      environment: 'sandbox', // Default to sandbox for scheduled jobs
      triggerData: {
        scheduledWorkflowId,
        scheduleType,
        triggeredAt: new Date().toISOString(),
        jobId: job.id,
      },
    });

    // Update run count and last_run_at
    try {
      await pool.query(`
        UPDATE invoice_workflow_schema.scheduled_workflows
        SET 
          run_count = run_count + 1,
          last_run_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [scheduledWorkflowId]);
    } catch (dbError) {
      logger.warn(
        { error: (dbError as Error).message },
        '[Scheduled Workflow Processor] Failed to update run count'
      );
    }

    logger.info(
      { 
        jobId: job.id,
        executionId,
        workflowId,
      },
      '[Scheduled Workflow Processor] ✅ Workflow execution enqueued'
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(
      { error: errorMessage, jobId: job.id, scheduledWorkflowId },
      '[Scheduled Workflow Processor] ❌ Failed to process scheduled workflow'
    );
    
    throw error;
  }
}

export { scheduledWorkflowQueue };
