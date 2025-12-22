import { Worker, Job, Queue } from 'bullmq';
import { redisConnection, checkRedisConnection, defaultJobOptions } from '../config/redis';
import { db } from '../db';
import { sql } from 'drizzle-orm';

interface BackfillJobData {
  tableName: string;
  batchSize: number;
  offset?: number;
}

export async function processBackfillJob(job: Job<BackfillJobData>) {
  const { tableName, batchSize } = job.data;

  try {
    await job.log(`Backfilling table ${tableName} - batch size ${batchSize}`);

    const result = await db.execute(sql.raw(`
      UPDATE ${tableName}
      SET environment = 'production'
      WHERE ctid IN (
        SELECT ctid
        FROM ${tableName}
        WHERE environment IS NULL
        LIMIT ${batchSize}
      )
    `));

    const rowsAffected = result.rowCount || 0;

    await job.log(`Updated ${rowsAffected} rows in ${tableName}`);

    if (rowsAffected === batchSize) {
      await job.log(`Full batch processed, enqueueing next batch for ${tableName}`);
      const queue = new Queue<BackfillJobData>('backfill-environment', {
        connection: redisConnection,
      });
      
      await queue.add(
        'backfill-table',
        {
          tableName,
          batchSize,
        },
        defaultJobOptions
      );
    } else {
      await job.log(`Table ${tableName} backfill complete - ${rowsAffected} rows in final batch`);
    }

    return {
      success: true,
      rowsAffected,
      tableName,
      hasMore: rowsAffected === batchSize,
    };
  } catch (error) {
    console.error(`[BackfillEnvironment] Error processing ${tableName}:`, error);
    await job.log(`ERROR: ${(error as Error).message}`);
    throw error;
  }
}

let backfillEnvironmentWorker: Worker | null = null;

checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    // Dynamic imports to avoid circular dependencies
    const { addToDeadLetterQueue } = await import('../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../utils/job-monitoring');
    
    backfillEnvironmentWorker = new Worker<BackfillJobData>(
      'backfill-environment',
      processBackfillJob,
      {
        connection: redisConnection,
        concurrency: 2,
        ...defaultJobOptions,
      }
    );

    // Job Lifecycle Events with Enhanced Monitoring
    
    backfillEnvironmentWorker.on('active', (job) => {
      logJobStarted(job);
    });

    backfillEnvironmentWorker.on('completed', (job) => {
      logJobCompleted(job);
      console.log(`[Backfill Worker] ✅ Table ${job.data.tableName} batch completed`);
    });

    backfillEnvironmentWorker.on('failed', async (job, error) => {
      logJobFailed(job, error, 'backfill-environment');
      
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
          tenantId: undefined,
          environment: undefined,
          userId: undefined,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
        });
        
        console.log(`[Backfill Worker] 📦 Job ${job.id} moved to DLQ - Table ${job.data.tableName} backfill permanently failed`);
      }
    });

    backfillEnvironmentWorker.on('stalled', (jobId) => {
      console.warn(`[Backfill Worker] ⚠️  Job ${jobId} stalled`);
    });

    backfillEnvironmentWorker.on('error', (error) => {
      console.error('[Backfill Worker] Worker error:', error);
    });

    console.log('[Backfill Worker] ✅ Worker initialized with DLQ and enhanced monitoring');
  } else {
    console.warn('[Backfill Worker] ⚠️  Redis unavailable - worker disabled');
  }
});

export { backfillEnvironmentWorker };
