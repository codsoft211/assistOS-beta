import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../../config/redis';
import { db } from '../../../api/db';
import { connectorChangeEvents } from '../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { BaseJobPayload } from '../../../api/services/context.service';
import { scopedFilter } from '../../../api/utils/environment-query.utils';

interface ProcessEventJobData extends BaseJobPayload {
  // BaseJobPayload includes: tenantId, environment, userId
  eventId: number;
  connectorType: string;
  eventType: string;
  entityType: string;
  entityId?: string;
}

async function processConnectorEvent(job: Job<ProcessEventJobData>) {
  const { eventId, tenantId, environment, connectorType, eventType, entityType } = job.data;
  
  console.log(
    `[Connector Sync Worker] Processing event ${eventId}: ${eventType} ${entityType} for tenant ${tenantId}`
  );

  try {
    // Fetch full event from database with environment filtering
    const [event] = await db
      .select()
      .from(connectorChangeEvents)
      .where(and(
        eq(connectorChangeEvents.id, eventId),
        scopedFilter(connectorChangeEvents, tenantId, environment)
      ));

    if (!event) {
      throw new Error(`Event ${eventId} not found in database for tenant ${tenantId} in ${environment}`);
    }

    // TODO: Route to appropriate connector sync handler based on connectorType
    // For now, just mark as processed
    await db
      .update(connectorChangeEvents)
      .set({
        status: 'processed',
        processedAt: new Date(),
      })
      .where(and(
        eq(connectorChangeEvents.id, eventId),
        scopedFilter(connectorChangeEvents, tenantId, environment)
      ));

    console.log(`[Connector Sync Worker] ✅ Event ${eventId} processed successfully`);
    
    return { success: true, eventId };
  } catch (error) {
    console.error(`[Connector Sync Worker] ❌ Failed to process event ${eventId}:`, error);
    
    // Update retry count and error message
    await db
      .update(connectorChangeEvents)
      .set({
        status: 'failed',
        retryCount: job.attemptsMade,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(and(
        eq(connectorChangeEvents.id, eventId),
        scopedFilter(connectorChangeEvents, tenantId, environment)
      ));
    
    throw error;
  }
}

checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    // Dynamic imports to avoid circular dependencies
    const { addToDeadLetterQueue } = await import('../../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../../utils/job-monitoring');
    const { defaultJobOptions } = await import('../../config/redis');
    
    const worker = new Worker<ProcessEventJobData>(
      'connector-sync',
      processConnectorEvent,
      {
        connection: redisConnection,
        concurrency: 5,
        limiter: {
          max: 20, // Max 20 connector events per minute
          duration: 60000,
        },
      }
    );

    // Job Lifecycle Events with Enhanced Monitoring
    
    worker.on('active', (job) => {
      logJobStarted(job);
    });

    worker.on('completed', (job) => {
      logJobCompleted(job);
    });

    worker.on('failed', async (job, error) => {
      logJobFailed(job, error, 'connector-sync');
      
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
          userId: job.data.userId,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
        });
        
        console.log(`[Connector Sync Worker] 📦 Job ${job.id} moved to DLQ - Event ${job.data.eventId} permanently failed`);
      }
    });

    worker.on('stalled', (jobId) => {
      console.warn(`[Connector Sync Worker] ⚠️  Job ${jobId} stalled`);
    });

    worker.on('error', (error) => {
      console.error('[Connector Sync Worker] Worker error:', error);
    });

    console.log('[Connector Sync Worker] ✅ Worker started with DLQ and enhanced monitoring');
  } else {
    console.warn('[Connector Sync Worker] ⚠️  Redis unavailable - worker disabled');
  }
});
