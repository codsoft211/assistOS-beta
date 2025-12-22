import { Worker } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../config/redis';
import { aggregateCrossTenantPatternsJob, type AggregateCrossTenantPatternsJobData } from './aggregate-cross-tenant-patterns.job';

let aggregateCrossTenantPatternsWorker: Worker | null = null;

checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    // Dynamic imports to avoid circular dependencies
    const { addToDeadLetterQueue } = await import('../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../utils/job-monitoring');
    const { defaultJobOptions } = await import('../config/redis');
    
    aggregateCrossTenantPatternsWorker = new Worker<AggregateCrossTenantPatternsJobData>(
      'pattern-aggregation',
      aggregateCrossTenantPatternsJob,
      { 
        connection: redisConnection,
        concurrency: 2,
      }
    );

    // Job Lifecycle Events with Enhanced Monitoring
    
    aggregateCrossTenantPatternsWorker.on('active', (job) => {
      logJobStarted(job);
    });

    aggregateCrossTenantPatternsWorker.on('completed', (job) => {
      logJobCompleted(job);
    });

    aggregateCrossTenantPatternsWorker.on('failed', async (job, error) => {
      logJobFailed(job, error, 'pattern-aggregation');
      
      // Move to DLQ if all retries exhausted
      const maxAttempts = job?.opts?.attempts || defaultJobOptions.attempts || 3;
      if (job && job.attemptsMade >= maxAttempts) {
        await addToDeadLetterQueue({
          originalQueue: job.queueName,
          jobId: job.id,
          jobName: job.name,
          jobData: job.data,
          error: error.message,
          stackTrace: error.stack,
          failedAt: new Date(),
          attemptsMade: job.attemptsMade,
          tenantId: job.data?.tenantId,
          environment: job.data?.environment,
          userId: job.data?.userId,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
        });
        
        console.log(`[Cross-Tenant Pattern Aggregation Worker] 📦 Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
      }
    });

    aggregateCrossTenantPatternsWorker.on('stalled', (jobId) => {
      console.warn(`[Cross-Tenant Pattern Aggregation Worker] ⚠️  Job ${jobId} stalled`);
    });

    aggregateCrossTenantPatternsWorker.on('error', (error) => {
      console.error('[Cross-Tenant Pattern Aggregation Worker] Worker error:', error);
    });

    console.log('[Cross-Tenant Pattern Aggregation Worker] ✅ Worker initialized with DLQ and enhanced monitoring');
  } else {
    console.warn('[Cross-Tenant Pattern Aggregation Worker] ⚠️  Redis unavailable - worker disabled');
  }
});

export { aggregateCrossTenantPatternsWorker };
