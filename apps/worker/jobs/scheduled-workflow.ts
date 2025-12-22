/**
 * Scheduled Workflow Job Processor
 * 
 * Worker that processes scheduled workflow jobs.
 * When a scheduled job triggers, this worker enqueues the actual workflow execution.
 */

import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../config/redis.js';
import logger from '../../api/logger.js';
import { 
  ScheduledWorkflowJobData, 
  processScheduledWorkflowJob 
} from '../queues/scheduled-workflow.js';

let scheduledWorkflowWorker: Worker<ScheduledWorkflowJobData> | null = null;

/**
 * Process a scheduled workflow job
 */
async function processJob(job: Job<ScheduledWorkflowJobData>) {
  logger.info(
    { 
      jobId: job.id,
      scheduledWorkflowId: job.data.scheduledWorkflowId,
      workflowId: job.data.workflowId, 
      scheduleType: job.data.scheduleType,
    },
    '[Scheduled Workflow Worker] 🕐 Processing scheduled job'
  );

  try {
    await processScheduledWorkflowJob(job);
    
    logger.info(
      { jobId: job.id, workflowId: job.data.workflowId },
      '[Scheduled Workflow Worker] ✅ Scheduled job processed'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(
      { error: errorMessage, jobId: job.id },
      '[Scheduled Workflow Worker] ❌ Failed to process scheduled job'
    );
    
    throw error;
  }
}

/**
 * Initialize the scheduled workflow worker
 */
async function initializeWorker() {
  const isRedisAvailable = await checkRedisConnection();
  
  if (!isRedisAvailable) {
    logger.warn('[Scheduled Workflow Worker] ⚠️  Redis unavailable - worker not started');
    return;
  }

  scheduledWorkflowWorker = new Worker<ScheduledWorkflowJobData>(
    'scheduled-workflows',
    processJob,
    {
      connection: redisConnection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // Max 10 jobs per second
      },
    }
  );

  scheduledWorkflowWorker.on('ready', () => {
    logger.info('[Scheduled Workflow Worker] ✅ Worker ready and listening for jobs');
  });

  scheduledWorkflowWorker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, workflowId: job.data.workflowId },
      '[Scheduled Workflow Worker] Job completed'
    );
  });

  scheduledWorkflowWorker.on('failed', (job, error) => {
    logger.error(
      { 
        jobId: job?.id, 
        workflowId: job?.data.workflowId,
        error: error.message 
      },
      '[Scheduled Workflow Worker] Job failed'
    );
  });

  scheduledWorkflowWorker.on('error', (error) => {
    logger.error({ error }, '[Scheduled Workflow Worker] Worker error');
  });

  logger.info('[Scheduled Workflow Worker] 🚀 Worker initialized');
}

// Initialize worker
initializeWorker().catch((error) => {
  logger.error({ error }, '[Scheduled Workflow Worker] Failed to initialize worker');
});

export { scheduledWorkflowWorker };
