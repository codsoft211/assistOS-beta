import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../../config/redis';
import { db } from '../../db';
import { dunningRuns, tenants } from '../../../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { BaseJobPayload } from '../../../api/services/context.service';

interface DunningAutomationJobData extends BaseJobPayload {
}

export async function processDunningAutomation(job: Job<DunningAutomationJobData>) {
  const { environment } = job.data;

  try {
    await job.log('[Dunning Automation] Starting dunning automation job');

    const activeTenants = await db.query.tenants.findMany({
      where: eq(tenants.status, 'active'),
    });

    await job.log(`[Dunning Automation] Found ${activeTenants.length} active tenants`);

    let totalProcessed = 0;
    let totalSent = 0;
    let totalFailed = 0;

    for (const tenant of activeTenants) {
      await job.updateProgress((totalProcessed / activeTenants.length) * 100);

      try {
        const now = new Date();

        const pendingRuns = await db
          .select()
          .from(dunningRuns)
          .where(and(
            eq(dunningRuns.tenantId, tenant.id),
            eq(dunningRuns.environment, environment),
            eq(dunningRuns.status, 'pending'),
            sql`(${dunningRuns.metadata}->>'nextReminderAt')::timestamp <= ${now.toISOString()}`
          ));

        await job.log(`[Dunning Automation] Tenant ${tenant.id}: Found ${pendingRuns.length} pending dunning runs`);

        for (const run of pendingRuns) {
          try {
            const apiUrl = process.env.API_BASE_URL || 'http://localhost:5000';
            const response = await fetch(`${apiUrl}/api/financeiro/ar/dunning/${run.id}/send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-tenant-id': tenant.id,
                'x-environment': environment,
              },
            });

            if (response.ok) {
              await db
                .update(dunningRuns)
                .set({
                  status: 'sent',
                  sentAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(dunningRuns.id, run.id));

              totalSent++;
              await job.log(`[Dunning Automation] ✅ Sent dunning run ${run.id}`);
            } else {
              const errorText = await response.text();
              throw new Error(`API returned ${response.status}: ${errorText}`);
            }
          } catch (error: any) {
            await job.log(`[Dunning Automation] ❌ Failed to send dunning run ${run.id}: ${error.message}`);
            
            const attempts = (run.metadata as any)?.attempts || 0;
            if (attempts >= 2) {
              await db
                .update(dunningRuns)
                .set({
                  status: 'failed',
                  outcome: 'max_retries_exceeded',
                  metadata: {
                    ...(run.metadata as any || {}),
                    attempts: attempts + 1,
                    lastError: error.message,
                  },
                  updatedAt: new Date(),
                })
                .where(eq(dunningRuns.id, run.id));
              
              totalFailed++;
              await job.log(`[Dunning Automation] ⚠️ Marked dunning run ${run.id} as failed after 3 attempts`);
            } else {
              await db
                .update(dunningRuns)
                .set({
                  metadata: {
                    ...(run.metadata as any || {}),
                    attempts: attempts + 1,
                    lastError: error.message,
                  },
                  updatedAt: new Date(),
                })
                .where(eq(dunningRuns.id, run.id));
            }
          }

          totalProcessed++;
        }
      } catch (error: any) {
        await job.log(`[Dunning Automation] Error processing tenant ${tenant.id}: ${error.message}`);
        console.error(`[Dunning Automation] Error processing tenant ${tenant.id}:`, error);
      }
    }

    await job.log(`[Dunning Automation] ✅ Completed: ${totalSent} sent, ${totalFailed} failed out of ${totalProcessed} processed`);

    return { 
      success: true, 
      tenantsProcessed: activeTenants.length,
      totalProcessed,
      totalSent,
      totalFailed,
    };
  } catch (error) {
    console.error('[Dunning Automation] Error:', error);
    throw error;
  }
}

let dunningAutomationWorker: Worker | null = null;

checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    const { addToDeadLetterQueue } = await import('../../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../../utils/job-monitoring');
    const { defaultJobOptions } = await import('../../config/redis');
    
    dunningAutomationWorker = new Worker<DunningAutomationJobData>(
      'finance-dunning',
      processDunningAutomation,
      { 
        connection: redisConnection,
        concurrency: 1,
      }
    );

    dunningAutomationWorker.on('active', (job) => {
      logJobStarted(job);
    });

    dunningAutomationWorker.on('completed', (job) => {
      logJobCompleted(job);
    });

    dunningAutomationWorker.on('failed', async (job, error) => {
      logJobFailed(job, error, 'finance-dunning');
      
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
        
        console.log(`[Dunning Automation Worker] 📦 Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
      }
    });

    dunningAutomationWorker.on('stalled', (jobId) => {
      console.warn(`[Dunning Automation Worker] ⚠️  Job ${jobId} stalled`);
    });

    dunningAutomationWorker.on('error', (error) => {
      console.error('[Dunning Automation Worker] Worker error:', error);
    });

    console.log('[Dunning Automation Worker] ✅ Worker initialized with DLQ and enhanced monitoring');
  } else {
    console.warn('[Dunning Automation Worker] ⚠️  Redis unavailable - worker disabled');
  }
});

export { dunningAutomationWorker };
