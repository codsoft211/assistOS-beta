import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../config/redis';
import { db } from '../db';
import { userTenants, detectedPatterns } from '../../../shared/schema';
import { patternDetector } from '../../../packages/ai/services/pattern-detector';
import { sql, eq } from 'drizzle-orm';
import type { BaseJobPayload } from '../../api/services/context.service';

interface AnalyzePatternsJobData extends BaseJobPayload {
  // BaseJobPayload includes: tenantId, environment, userId
  // No additional fields needed for this job
}

export async function processAnalyzePatternsJob(job: Job<AnalyzePatternsJobData>) {
  const { tenantId, environment, userId } = job.data;

  try {
    if (userId) {
      await analyzeUserPatterns(tenantId, userId, environment, job);
      return { success: true, usersAnalyzed: 1 };
    }

    const tenantUserRelations = await db.query.userTenants.findMany({
      where: eq(userTenants.tenantId, tenantId),
    });

    let analyzed = 0;
    for (const userRelation of tenantUserRelations) {
      await job.updateProgress((analyzed / tenantUserRelations.length) * 100);
      await analyzeUserPatterns(tenantId, userRelation.userId, environment, job);
      analyzed++;
    }

    return { success: true, usersAnalyzed: analyzed };
  } catch (error) {
    console.error('[PatternAnalysis] Erro:', error);
    throw error;
  }
}

async function analyzeUserPatterns(tenantId: string, userId: string, environment: string, job: Job) {
  await job.log(`Analisando patterns para user ${userId}`);

  const patterns = await patternDetector.detectPatterns(tenantId, userId);

  await job.log(`Detectados ${patterns.length} patterns`);

  for (const pattern of patterns) {
    await db.insert(detectedPatterns).values({
      id: pattern.id,
      tenantId,
      environment,
      userId,
      type: pattern.type,
      sequence: pattern.sequence,
      occurrences: pattern.occurrences,
      confidence: pattern.confidence,
      suggestedWorkflow: pattern.suggestedWorkflow,
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
    }).onConflictDoUpdate({
      target: detectedPatterns.id,
      set: {
        occurrences: sql`EXCLUDED.occurrences`,
        confidence: sql`EXCLUDED.confidence`,
        lastSeen: sql`EXCLUDED.last_seen`,
        updatedAt: sql`NOW()`,
      }
    });
  }
}

let analyzePatternsWorker: Worker | null = null;

checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    // Dynamic imports to avoid circular dependencies
    const { addToDeadLetterQueue } = await import('../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../utils/job-monitoring');
    const { defaultJobOptions } = await import('../config/redis');
    
    analyzePatternsWorker = new Worker<AnalyzePatternsJobData>(
      'analyze-patterns',
      processAnalyzePatternsJob,
      { 
        connection: redisConnection,
        concurrency: 3,
        limiter: {
          max: 10, // Max 10 pattern analysis jobs per minute
          duration: 60000,
        },
      }
    );

    // Job Lifecycle Events with Enhanced Monitoring
    
    analyzePatternsWorker.on('active', (job) => {
      logJobStarted(job);
    });

    analyzePatternsWorker.on('completed', (job) => {
      logJobCompleted(job);
    });

    analyzePatternsWorker.on('failed', async (job, error) => {
      logJobFailed(job, error, 'analyze-patterns');
      
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
        
        console.log(`[Pattern Analysis Worker] 📦 Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
      }
    });

    analyzePatternsWorker.on('stalled', (jobId) => {
      console.warn(`[Pattern Analysis Worker] ⚠️  Job ${jobId} stalled`);
    });

    analyzePatternsWorker.on('error', (error) => {
      console.error('[Pattern Analysis Worker] Worker error:', error);
    });

    console.log('[Pattern Analysis Worker] ✅ Worker initialized with DLQ and enhanced monitoring');
  } else {
    console.warn('[Pattern Analysis Worker] ⚠️  Redis unavailable - worker disabled');
  }
});

export { analyzePatternsWorker };
