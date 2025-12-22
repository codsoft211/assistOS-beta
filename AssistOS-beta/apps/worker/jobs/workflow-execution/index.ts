/**
 * AssistBuild Workflow Execution Worker
 * 
 * Processes workflow execution jobs from the 'assistbuild-workflows' queue
 * Separate from code generation workers
 */

import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../../config/redis.js';
import logger from '../../../api/logger.js';
import type { WorkflowExecutionJobData } from '../../queues/workflow-execution.js';
import { ExecutionEngine } from './execution-engine.js';

let workflowExecutionWorker: Worker<WorkflowExecutionJobData> | null = null;

/**
 * Process a workflow execution job
 */
async function processWorkflowExecution(job: Job<WorkflowExecutionJobData>) {
  const { workflowId, executionId, tenantId, userId, triggerData, environment } = job.data;

  logger.info(
    { 
      jobId: job.id,
      workflowId, 
      executionId, 
      tenantId,
      environment 
    },
    '[Workflow Execution Worker] 🚀 Starting workflow execution'
  );

  try {
    // Initialize execution engine
    const engine = new ExecutionEngine();

    // Execute workflow
    await engine.execute({
      workflowId,
      executionId,
      tenantId,
      userId,
      environment,
      triggerData,
      variables: {}, // Initialize empty variables for node outputs
    });

    logger.info(
      { jobId: job.id, workflowId, executionId },
      '[Workflow Execution Worker] ✅ Workflow execution completed'
    );

    return {
      success: true,
      executionId,
    };
  } catch (error) {
    logger.error(
      { 
        error, 
        jobId: job.id,
        workflowId, 
        executionId 
      },
      '[Workflow Execution Worker] ❌ Workflow execution failed'
    );
    throw error;
  }
}

// Initialize worker if Redis is available
checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    workflowExecutionWorker = new Worker<WorkflowExecutionJobData>(
      'assistbuild-workflows',
      processWorkflowExecution,
      {
        connection: redisConnection,
        concurrency: 5, // Process up to 5 workflows concurrently
        limiter: {
          max: 10, // Max 10 jobs
          duration: 1000, // per second
        },
      }
    );

    workflowExecutionWorker.on('completed', (job) => {
      logger.info(
        { 
          jobId: job.id,
          workflowId: job.data.workflowId,
          executionId: job.data.executionId
        },
        '[Workflow Execution Worker] ✅ Job completed'
      );
    });

    workflowExecutionWorker.on('failed', (job, error) => {
      logger.error(
        { 
          jobId: job?.id,
          workflowId: job?.data.workflowId,
          executionId: job?.data.executionId,
          error
        },
        '[Workflow Execution Worker] ❌ Job failed'
      );
    });

    workflowExecutionWorker.on('error', (error) => {
      logger.error({ error }, '[Workflow Execution Worker] Worker error');
    });

    logger.info('[Workflow Execution Worker] ✅ Worker initialized successfully');
  } else {
    logger.warn('[Workflow Execution Worker] ⚠️  Redis unavailable - worker disabled');
  }
}).catch((error) => {
  logger.error({ error }, '[Workflow Execution Worker] ❌ Failed to initialize');
});

export { workflowExecutionWorker };
