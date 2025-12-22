import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../config/redis';
import { SandboxPromotionService } from '../../api/services/sandbox-promotion.service';
import { PromotionEventsService } from '../../api/services/promotion-events.service';
import type { PromotionManifest } from '../../api/types/promotion.types';

const promotionService = new SandboxPromotionService();
const eventsService = new PromotionEventsService();

/**
 * Process promotion job
 * 
 * Executes the promotion workflow asynchronously.
 * 
 * @param job - BullMQ job with promotion manifest
 */
export async function processPromotion(job: Job<PromotionManifest>) {
  const { tenantId, environment } = job.data;
  
  console.log(`[Promotion Job ${job.id}] Starting promotion for tenant ${tenantId}`);
  
  try {
    // Execute promotion
    const result = await promotionService.promote(job.data);
    
    // Fire post-promotion hook
    await eventsService.afterPromotion(result);
    
    console.log(`[Promotion Job ${job.id}] Completed - ${result.promotedCount} records promoted`);
    
    return result;
    
  } catch (error) {
    console.error(`[Promotion Job ${job.id}] Failed:`, error);
    throw error;
  }
}

// Initialize worker only if Redis is available
checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    // Dynamic imports to avoid circular dependencies
    const { addToDeadLetterQueue } = await import('../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../utils/job-monitoring');
    const { defaultJobOptions } = await import('../config/redis');
    
    const worker = new Worker('promotion', processPromotion, {
      connection: redisConnection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute
      },
    });
    
    // Job Lifecycle Events with Enhanced Monitoring
    
    worker.on('active', (job) => {
      logJobStarted(job);
    });
    
    worker.on('completed', (job) => {
      logJobCompleted(job);
    });
    
    worker.on('failed', async (job, error) => {
      logJobFailed(job, error, 'promotion');
      
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
          tenantId: job.data.tenantId,
          environment: job.data.environment,
          userId: job.data.createdBy,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
        });
        
        console.log(`[Promotion Worker] 📦 Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
      }
    });
    
    worker.on('stalled', (jobId) => {
      console.warn(`[Promotion Worker] ⚠️  Job ${jobId} stalled`);
    });
    
    worker.on('error', (error) => {
      console.error('[Promotion Worker] Worker error:', error);
    });
    
    console.log('[Promotion Worker] ✅ Worker initialized with DLQ and enhanced monitoring');
  } else {
    console.warn('[Promotion Worker] ⚠️  Redis unavailable - worker disabled');
  }
});
