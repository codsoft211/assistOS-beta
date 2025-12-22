import { Job, Queue } from 'bullmq';
import { Sentry } from '../sentry';

/**
 * Job Monitoring Utilities
 * 
 * Provides structured logging and monitoring helpers for BullMQ workers
 * with consistent format and rich context for observability.
 */

export interface JobContext {
  jobId: string | undefined;
  jobName: string | undefined;
  queueName: string;
  tenantId?: string;
  environment?: string;
  userId?: string;
  attemptsMade: number;
  timestamp?: number;
}

export interface JobMetrics {
  duration: number;
  startedAt: Date;
  finishedAt: Date;
  memoryUsed?: number;
}

/**
 * Extract job context for logging
 */
export function getJobContext(job: Job): JobContext {
  return {
    jobId: job.id,
    jobName: job.name,
    queueName: job.queueName,
    tenantId: job.data.tenantId,
    environment: job.data.environment,
    userId: job.data.userId,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
  };
}

/**
 * Calculate job metrics
 */
export function calculateJobMetrics(job: Job): JobMetrics | null {
  if (!job.processedOn || !job.finishedOn) {
    return null;
  }
  
  return {
    duration: job.finishedOn - job.processedOn,
    startedAt: new Date(job.processedOn),
    finishedAt: new Date(job.finishedOn),
    memoryUsed: process.memoryUsage().heapUsed,
  };
}

/**
 * Log job started with context
 */
export function logJobStarted(job: Job) {
  const context = getJobContext(job);
  console.log(
    `[${context.queueName}] ▶️  Job ${context.jobId} started`,
    {
      jobName: context.jobName,
      tenantId: context.tenantId,
      environment: context.environment,
      attempt: context.attemptsMade + 1,
    }
  );
}

/**
 * Log job completed with metrics
 */
export function logJobCompleted(job: Job) {
  const context = getJobContext(job);
  const metrics = calculateJobMetrics(job);
  
  console.log(
    `[${context.queueName}] ✅ Job ${context.jobId} completed`,
    {
      jobName: context.jobName,
      tenantId: context.tenantId,
      environment: context.environment,
      duration: metrics?.duration,
      attempts: context.attemptsMade + 1,
    }
  );
}

/**
 * Log job failed with error context
 */
export function logJobFailed(job: Job | undefined, error: Error, queueName: string) {
  if (!job) {
    console.error(`[${queueName}] ❌ Job failed (no job context):`, error.message);
    return;
  }
  
  const context = getJobContext(job);
  const metrics = calculateJobMetrics(job);
  
  console.error(
    `[${context.queueName}] ❌ Job ${context.jobId} failed`,
    {
      jobName: context.jobName,
      tenantId: context.tenantId,
      environment: context.environment,
      error: error.message,
      attemptsMade: context.attemptsMade,
      duration: metrics?.duration,
      stackTrace: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines
    }
  );
  
  // Send to Sentry with enriched context
  Sentry.captureException(error, {
    tags: {
      queue: context.queueName,
      jobId: context.jobId || 'unknown',
      jobName: context.jobName || 'unknown',
      tenantId: context.tenantId,
      environment: context.environment,
      attemptsMade: context.attemptsMade.toString(),
    },
    contexts: {
      job: {
        userId: context.userId,
        timestamp: context.timestamp,
        duration: metrics?.duration,
      },
    },
    extra: {
      jobData: job.data,
    },
  });
}

/**
 * Log job stalled (stuck in processing)
 */
export function logJobStalled(job: Job, queueName: string) {
  const context = getJobContext(job);
  
  console.warn(
    `[${queueName}] ⚠️  Job ${context.jobId} stalled`,
    {
      jobName: context.jobName,
      tenantId: context.tenantId,
      environment: context.environment,
      attemptsMade: context.attemptsMade,
    }
  );
  
  // Alert in Sentry for stalled jobs
  Sentry.captureMessage(`Job stalled: ${context.jobId}`, {
    level: 'warning',
    tags: {
      queue: queueName,
      jobId: context.jobId || 'unknown',
      jobName: context.jobName || 'unknown',
      tenantId: context.tenantId,
      environment: context.environment,
    },
    extra: {
      jobData: job.data,
      attemptsMade: context.attemptsMade,
    },
  });
}

/**
 * Log job progress (for long-running jobs)
 */
export async function logJobProgress(job: Job, progress: number, message?: string) {
  const context = getJobContext(job);
  
  console.log(
    `[${context.queueName}] 📊 Job ${context.jobId} progress: ${progress}%`,
    {
      jobName: context.jobName,
      tenantId: context.tenantId,
      message,
    }
  );
  
  await job.updateProgress(progress);
  if (message) {
    await job.log(message);
  }
}

/**
 * Get queue health metrics
 */
export async function getQueueHealth(queue: Queue) {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    
    return {
      queueName: queue.name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
      healthy: failed < 100 && waiting < 1000, // Simple health check
    };
  } catch (error) {
    console.error(`[${queue.name}] Failed to get queue health:`, error);
    return null;
  }
}

/**
 * Monitor queue depth and alert if threshold exceeded
 */
export async function checkQueueDepth(queue: Queue, threshold: number = 1000) {
  try {
    const waiting = await queue.getWaitingCount();
    
    if (waiting > threshold) {
      console.warn(
        `[${queue.name}] ⚠️  Queue depth exceeded threshold`,
        { waiting, threshold }
      );
      
      Sentry.captureMessage(`Queue depth exceeded: ${queue.name}`, {
        level: 'warning',
        tags: {
          queue: queue.name,
          waiting: waiting.toString(),
          threshold: threshold.toString(),
        },
      });
    }
    
    return waiting;
  } catch (error) {
    console.error(`[${queue.name}] Failed to check queue depth:`, error);
    return null;
  }
}

/**
 * Check for stalled jobs and alert
 */
export async function checkStalledJobs(queue: Queue) {
  try {
    const jobs = await queue.getJobs(['active']);
    const now = Date.now();
    const stalledThreshold = 10 * 60 * 1000; // 10 minutes
    
    const stalledJobs = jobs.filter(job => {
      return job.processedOn && (now - job.processedOn > stalledThreshold);
    });
    
    if (stalledJobs.length > 0) {
      console.warn(
        `[${queue.name}] ⚠️  Found ${stalledJobs.length} stalled jobs`,
        { jobIds: stalledJobs.map(j => j.id) }
      );
      
      Sentry.captureMessage(`Stalled jobs detected: ${queue.name}`, {
        level: 'warning',
        tags: {
          queue: queue.name,
          stalledCount: stalledJobs.length.toString(),
        },
        extra: {
          jobIds: stalledJobs.map(j => j.id),
        },
      });
    }
    
    return stalledJobs;
  } catch (error) {
    console.error(`[${queue.name}] Failed to check stalled jobs:`, error);
    return null;
  }
}

/**
 * Get average processing time for queue
 */
export async function getAverageProcessingTime(queue: Queue, sampleSize: number = 100) {
  try {
    const jobs = await queue.getJobs(['completed'], 0, sampleSize - 1);
    
    if (jobs.length === 0) {
      return null;
    }
    
    const durations = jobs
      .filter(job => job.processedOn && job.finishedOn)
      .map(job => job.finishedOn! - job.processedOn!);
    
    if (durations.length === 0) {
      return null;
    }
    
    const average = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    
    return {
      average,
      max,
      min,
      sampleSize: durations.length,
    };
  } catch (error) {
    console.error(`[${queue.name}] Failed to get average processing time:`, error);
    return null;
  }
}

/**
 * Comprehensive queue health check
 */
export async function performHealthCheck(queue: Queue) {
  console.log(`[${queue.name}] 🏥 Performing health check...`);
  
  const [health, avgTime, stalledJobs] = await Promise.all([
    getQueueHealth(queue),
    getAverageProcessingTime(queue),
    checkStalledJobs(queue),
  ]);
  
  const report = {
    queueName: queue.name,
    timestamp: new Date().toISOString(),
    metrics: health,
    averageProcessingTime: avgTime,
    stalledJobsCount: stalledJobs?.length || 0,
  };
  
  console.log(`[${queue.name}] 🏥 Health check complete`, report);
  
  return report;
}
