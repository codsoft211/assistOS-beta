import { Queue } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../config/redis';
import { Sentry } from '../sentry';

/**
 * Dead Letter Queue (DLQ) for permanently failed jobs
 * 
 * When a job exhausts all retry attempts, it's moved to this queue for:
 * - Manual inspection and debugging
 * - Alerting on critical failures
 * - Audit trail of system issues
 * - Potential manual retry after fixes
 */

export interface DLQJobData {
  originalQueue: string;
  jobId: string | undefined;
  jobName: string | undefined;
  jobData: any;
  error: string;
  stackTrace?: string;
  failedAt: Date;
  attemptsMade: number;
  tenantId?: string;
  environment?: string;
  userId?: string;
  processedOn?: number;
  finishedOn?: number;
  duration?: number;
}

let dlqQueue: Queue<DLQJobData> | null = null;

// Only create DLQ if Redis is available
checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    dlqQueue = new Queue<DLQJobData>('dead-letter-queue', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: {
          count: 1000, // Keep more DLQ jobs for analysis
          age: 7 * 24 * 3600, // 7 days
        },
        removeOnFail: false, // Never auto-remove DLQ jobs
      },
    });
    
    dlqQueue.on('error', (error) => {
      console.error('[DLQ] Queue error:', error);
      Sentry.captureException(error, {
        tags: { queue: 'dead-letter-queue' },
      });
    });
    
    console.log('[DLQ] ✅ Dead Letter Queue initialized');
  } else {
    console.warn('[DLQ] ⚠️  Redis unavailable - DLQ disabled');
  }
});

/**
 * Add a failed job to the DLQ
 * 
 * @param jobData - Failed job context and error information
 * @returns Promise with DLQ job or null if DLQ unavailable
 */
export async function addToDeadLetterQueue(jobData: DLQJobData): Promise<void> {
  if (!dlqQueue) {
    console.warn('[DLQ] Queue not available, cannot add failed job:', jobData.jobId);
    return;
  }
  
  try {
    await dlqQueue.add('failed-job', jobData, {
      priority: getSeverityPriority(jobData),
    });
    
    console.log(`[DLQ] ✅ Added job ${jobData.jobId} from ${jobData.originalQueue} to DLQ`);
    
    // Send Sentry alert for critical failures
    Sentry.captureException(new Error(jobData.error), {
      tags: {
        queue: jobData.originalQueue,
        jobId: jobData.jobId || 'unknown',
        jobName: jobData.jobName || 'unknown',
        tenantId: jobData.tenantId,
        environment: jobData.environment,
      },
      contexts: {
        job: {
          attemptsMade: jobData.attemptsMade,
          duration: jobData.duration,
          failedAt: jobData.failedAt.toISOString(),
        },
      },
      extra: {
        jobData: jobData.jobData,
        stackTrace: jobData.stackTrace,
      },
    });
  } catch (error) {
    console.error('[DLQ] Failed to add job to DLQ:', error);
    Sentry.captureException(error, {
      tags: { operation: 'dlq-add' },
      extra: { failedJob: jobData },
    });
  }
}

/**
 * Get priority based on failure severity
 * Higher priority (lower number) = more critical
 */
function getSeverityPriority(jobData: DLQJobData): number {
  // Critical queues get higher priority
  const criticalQueues = ['apply-migration', 'promotion', 'connector-sync'];
  if (criticalQueues.includes(jobData.originalQueue)) {
    return 1; // High priority
  }
  
  // Jobs that took a long time before failing
  if (jobData.duration && jobData.duration > 60000) {
    return 2; // Medium-high priority
  }
  
  return 3; // Normal priority
}

/**
 * Get DLQ queue metrics
 */
export async function getDLQMetrics() {
  if (!dlqQueue) {
    return null;
  }
  
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      dlqQueue.getWaitingCount(),
      dlqQueue.getActiveCount(),
      dlqQueue.getCompletedCount(),
      dlqQueue.getFailedCount(),
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  } catch (error) {
    console.error('[DLQ] Failed to get metrics:', error);
    return null;
  }
}

/**
 * Get failed jobs grouped by queue
 */
export async function getDLQJobsByQueue() {
  if (!dlqQueue) {
    return null;
  }
  
  try {
    const jobs = await dlqQueue.getJobs(['waiting', 'completed']);
    
    const jobsByQueue: Record<string, number> = {};
    for (const job of jobs) {
      const queueName = job.data.originalQueue;
      jobsByQueue[queueName] = (jobsByQueue[queueName] || 0) + 1;
    }
    
    return jobsByQueue;
  } catch (error) {
    console.error('[DLQ] Failed to get jobs by queue:', error);
    return null;
  }
}

export { dlqQueue };
