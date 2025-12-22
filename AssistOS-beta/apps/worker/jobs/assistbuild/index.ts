import { Worker } from 'bullmq';
import { redisConnection, checkRedisConnection, defaultJobOptions } from '../../config/redis';
import { TestProcessor } from './test-processor';
import { GenerateCodeProcessor } from './generate-code-processor';
import { SandboxTestProcessor } from './sandbox-test-processor';
import { JobProcessorBase } from './base';
import { addToDeadLetterQueue } from '../../queues/dlq';
import { logJobStarted, logJobCompleted, logJobFailed, logJobStalled } from '../../utils/job-monitoring';

// Map of job type -> processor instance
const processors: Map<string, JobProcessorBase<any, any>> = new Map();

// Register processors
processors.set('test_job', new TestProcessor());
processors.set('generate_code', new GenerateCodeProcessor());
processors.set('sandbox_test', new SandboxTestProcessor());

console.log(`[AssistBuild Worker] Registered ${processors.size} processor(s)`);

// Only create worker if Redis is available
let assistbuildWorker: Worker | null = null;

checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    assistbuildWorker = new Worker(
      'assistbuild',
      async (job) => {
        const { type } = job.data;
        const processor = processors.get(type);
        
        if (!processor) {
          const availableTypes = Array.from(processors.keys()).join(', ');
          throw new Error(
            `No processor found for job type: ${type}. Available types: ${availableTypes}`
          );
        }
        
        return await processor.process(job);
      },
      {
        connection: redisConnection,
        concurrency: 5,
        lockDuration: 600000, // 10 minutes - max job execution time
        limiter: {
          max: 20, // Max 20 jobs per minute
          duration: 60000,
        },
      }
    );

    // Job Lifecycle Events with Enhanced Monitoring
    
    assistbuildWorker.on('active', (job) => {
      logJobStarted(job);
    });

    assistbuildWorker.on('completed', (job) => {
      logJobCompleted(job);
    });

    assistbuildWorker.on('failed', async (job, error) => {
      logJobFailed(job, error, 'assistbuild');
      
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
        
        console.log(`[AssistBuild Worker] 📦 Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
      }
    });

    assistbuildWorker.on('stalled', (jobId) => {
      console.warn(`[AssistBuild Worker] ⚠️  Job ${jobId} stalled`);
    });

    assistbuildWorker.on('error', (error) => {
      console.error('[AssistBuild Worker] Worker error:', error);
    });

    console.log('[AssistBuild Worker] ✅ Worker initialized with DLQ and enhanced monitoring');
  } else {
    console.warn('[AssistBuild Worker] ⚠️  Redis unavailable - worker disabled');
  }
});

export { assistbuildWorker };

// Export function to register more processors
export function registerProcessor(processor: JobProcessorBase<any, any>) {
  processors.set(processor.jobType, processor);
  console.log(`[AssistBuild Worker] Registered processor: ${processor.jobType}`);
}
