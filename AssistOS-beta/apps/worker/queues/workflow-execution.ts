/**
 * AssistBuild Workflow Execution Queue
 * 
 * SEPARATE queue for workflow executions (distinct from code generation)
 * Queue name: 'assistbuild-workflows' (separate from 'assistbuild' code gen queue)
 * 
 * This queue handles:
 * - Workflow execution jobs (Phase 1: manual_trigger + crud_record nodes)
 * - DAG traversal and node execution
 * - Retry logic for failed workflows
 * - Tenant isolation
 */

import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions, checkRedisConnection } from '../config/redis.js';
import logger from '../../api/logger.js';

export interface WorkflowExecutionJobData {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  triggerData?: any;
  environment: 'sandbox' | 'production';
}

let workflowExecutionQueue: Queue<WorkflowExecutionJobData> | null = null;

logger.info('[Workflow Execution Queue] 🚀 Initializing...');

// Initialize queue if Redis is available
checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    workflowExecutionQueue = new Queue<WorkflowExecutionJobData>('assistbuild-workflows', {
      connection: redisConnection,
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: {
          count: 1000,
          age: 86400, // Keep for 24 hours
        },
        removeOnFail: {
          count: 5000,
          age: 604800, // Keep failures for 7 days
        },
      },
    });
    
    workflowExecutionQueue.on('error', (error) => {
      logger.error({ error }, '[Workflow Execution Queue] Error');
    });
    
    logger.info('[Workflow Execution Queue] ✅ Queue initialized successfully');
  } else {
    logger.warn('[Workflow Execution Queue] ⚠️  Redis unavailable - workflow execution disabled');
  }
}).catch((error) => {
  logger.error({ error }, '[Workflow Execution Queue] ❌ Failed to initialize');
});

/**
 * Add a workflow execution job to the queue
 * Waits for queue initialization if needed
 */
export async function enqueueWorkflowExecution(
  data: WorkflowExecutionJobData,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
  }
): Promise<void> {
  // Wait for queue initialization (max 5 seconds)
  const maxWaitTime = 5000;
  const startTime = Date.now();
  
  while (!workflowExecutionQueue && Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (!workflowExecutionQueue) {
    throw new Error('Workflow execution queue is not available. Redis connection may be down.');
  }

  const jobId = options?.jobId || `workflow-${data.executionId}`;
  
  await workflowExecutionQueue.add('execute-workflow', data, {
    jobId,
    priority: options?.priority,
    delay: options?.delay,
  });

  logger.info(
    { 
      jobId, 
      workflowId: data.workflowId, 
      executionId: data.executionId,
      tenantId: data.tenantId 
    }, 
    '[Workflow Execution Queue] Job enqueued'
  );
}

/**
 * Get queue statistics
 */
export async function getWorkflowQueueStats() {
  if (!workflowExecutionQueue) {
    return null;
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    workflowExecutionQueue.getWaitingCount(),
    workflowExecutionQueue.getActiveCount(),
    workflowExecutionQueue.getCompletedCount(),
    workflowExecutionQueue.getFailedCount(),
    workflowExecutionQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Clean old jobs from the queue
 */
export async function cleanWorkflowQueue(olderThan: number = 86400000) {
  if (!workflowExecutionQueue) {
    return;
  }

  await workflowExecutionQueue.clean(olderThan, 1000, 'completed');
  await workflowExecutionQueue.clean(olderThan * 7, 5000, 'failed'); // Keep failures longer
  
  logger.info('[Workflow Execution Queue] Cleaned old jobs');
}

export { workflowExecutionQueue };
