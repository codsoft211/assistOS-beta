import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../../config/redis';
import { db } from '../../db';
import { tenants, cashflowSnapshots } from '../../../../shared/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import type { BaseJobPayload } from '../../../api/services/context.service';

interface CashflowRefreshJobData extends BaseJobPayload {
}

export async function processCashflowRefresh(job: Job<CashflowRefreshJobData>) {
  const { environment } = job.data;

  try {
    await job.log('[Cashflow Refresh] Starting cashflow forecast refresh job');

    const activeTenants = await db.query.tenants.findMany({
      where: eq(tenants.status, 'active'),
    });

    await job.log(`[Cashflow Refresh] Found ${activeTenants.length} active tenants`);

    let totalProcessed = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (const tenant of activeTenants) {
      await job.updateProgress((totalProcessed / activeTenants.length) * 100);

      try {
        const apiUrl = process.env.API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/financeiro/treasury/forecast?days=90`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenant.id,
          },
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${await response.text()}`);
        }

        const forecastData = await response.json();
        const now = new Date();

        let totalInflow = 0;
        let totalOutflow = 0;

        if (forecastData.forecast && Array.isArray(forecastData.forecast)) {
          forecastData.forecast.forEach((day: any) => {
            totalInflow += day.inflows || 0;
            totalOutflow += day.outflows || 0;
          });
        }

        const netFlow = totalInflow - totalOutflow;

        await db.insert(cashflowSnapshots).values({
          tenantId: tenant.id,
          environment,
          snapshotDate: now,
          horizonDays: 90,
          inflow: totalInflow.toFixed(2),
          outflow: totalOutflow.toFixed(2),
          net: netFlow.toFixed(2),
          assumptions: {
            treasuryAssumptions: {
              currentBalance: forecastData.summary?.startingBalance || 0,
            }
          },
        });

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const deletedCount = await db
          .delete(cashflowSnapshots)
          .where(and(
            eq(cashflowSnapshots.tenantId, tenant.id),
            eq(cashflowSnapshots.environment, environment),
            lt(cashflowSnapshots.snapshotDate, ninetyDaysAgo)
          ));

        totalSuccessful++;
        await job.log(`[Cashflow Refresh] ✅ Tenant ${tenant.id}: Refreshed forecast (inflow: €${totalInflow.toFixed(2)}, outflow: €${totalOutflow.toFixed(2)})`);
      } catch (error: any) {
        totalFailed++;
        await job.log(`[Cashflow Refresh] ❌ Tenant ${tenant.id}: ${error.message}`);
        console.error(`[Cashflow Refresh] Error processing tenant ${tenant.id}:`, error);
      }

      totalProcessed++;
    }

    await job.log(`[Cashflow Refresh] ✅ Completed: ${totalSuccessful} successful, ${totalFailed} failed out of ${totalProcessed} tenants`);

    return { 
      success: true, 
      tenantsProcessed: totalProcessed,
      successful: totalSuccessful,
      failed: totalFailed,
    };
  } catch (error) {
    console.error('[Cashflow Refresh] Error:', error);
    throw error;
  }
}

let cashflowRefreshWorker: Worker | null = null;

checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    const { addToDeadLetterQueue } = await import('../../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../../utils/job-monitoring');
    const { defaultJobOptions } = await import('../../config/redis');
    
    cashflowRefreshWorker = new Worker<CashflowRefreshJobData>(
      'analysis',
      async (job: Job) => {
        if (job.name === 'cashflow-refresh') {
          return processCashflowRefresh(job);
        }
        return { skipped: true };
      },
      { 
        connection: redisConnection,
        concurrency: 2,
      }
    );

    cashflowRefreshWorker.on('active', (job) => {
      if (job.name === 'cashflow-refresh') {
        logJobStarted(job);
      }
    });

    cashflowRefreshWorker.on('completed', (job) => {
      if (job.name === 'cashflow-refresh') {
        logJobCompleted(job);
      }
    });

    cashflowRefreshWorker.on('failed', async (job, error) => {
      if (job && job.name === 'cashflow-refresh') {
        logJobFailed(job, error, 'cashflow-refresh');
        
        const maxAttempts = job?.opts?.attempts || defaultJobOptions.attempts || 3;
        if (job.attemptsMade >= maxAttempts) {
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
          
          console.log(`[Cashflow Refresh Worker] 📦 Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
        }
      }
    });

    cashflowRefreshWorker.on('stalled', (jobId) => {
      console.warn(`[Cashflow Refresh Worker] ⚠️  Job ${jobId} stalled`);
    });

    cashflowRefreshWorker.on('error', (error) => {
      console.error('[Cashflow Refresh Worker] Worker error:', error);
    });

    console.log('[Cashflow Refresh Worker] ✅ Worker initialized (using analysis queue) with DLQ and enhanced monitoring');
  } else {
    console.warn('[Cashflow Refresh Worker] ⚠️  Redis unavailable - worker disabled');
  }
});

export { cashflowRefreshWorker };
