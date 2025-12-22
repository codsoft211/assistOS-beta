import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../../config/redis';
import { db } from '../../db';
import { tenants } from '../../../../shared/schema';
import { eq } from 'drizzle-orm';
import type { BaseJobPayload } from '../../../api/services/context.service';
import Redis from 'ioredis';

interface KpiCacheJobData extends BaseJobPayload {
}

let redisClient: Redis | null = null;

async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    if (process.env.REDIS_URL) {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
    } else {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
    }
  }
  return redisClient;
}

export async function processKpiCache(job: Job<KpiCacheJobData>) {
  const { environment } = job.data;

  try {
    await job.log('[KPI Cache] Starting dashboard KPI caching job');

    const activeTenants = await db.query.tenants.findMany({
      where: eq(tenants.status, 'active'),
    });

    await job.log(`[KPI Cache] Found ${activeTenants.length} active tenants`);

    const redis = await getRedisClient();
    let totalProcessed = 0;
    let totalCached = 0;
    let totalFailed = 0;

    for (const tenant of activeTenants) {
      await job.updateProgress((totalProcessed / activeTenants.length) * 100);

      try {
        const apiUrl = process.env.API_BASE_URL || 'http://localhost:5000';
        
        const dashboardResponse = await fetch(`${apiUrl}/api/dashboard`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenant.id,
          },
        });

        if (!dashboardResponse.ok) {
          throw new Error(`Dashboard API returned ${dashboardResponse.status}`);
        }

        const dashboardData = await dashboardResponse.json();

        const forecastResponse = await fetch(`${apiUrl}/api/financeiro/treasury/forecast?days=90`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenant.id,
          },
        });

        let forecastData = null;
        if (forecastResponse.ok) {
          forecastData = await forecastResponse.json();
        }

        const cacheData = {
          dashboard: dashboardData,
          forecast: forecastData,
          cachedAt: new Date().toISOString(),
          environment,
        };

        const cacheKey = `dashboard:${tenant.id}:${environment}:cache`;
        await redis.setex(cacheKey, 3600, JSON.stringify(cacheData));

        totalCached++;
        await job.log(`[KPI Cache] ✅ Tenant ${tenant.id}: Cached dashboard data (TTL: 1h)`);
      } catch (error: any) {
        totalFailed++;
        await job.log(`[KPI Cache] ❌ Tenant ${tenant.id}: ${error.message}`);
        console.error(`[KPI Cache] Error processing tenant ${tenant.id}:`, error);
      }

      totalProcessed++;
    }

    await job.log(`[KPI Cache] ✅ Completed: ${totalCached} cached, ${totalFailed} failed out of ${totalProcessed} tenants`);

    return { 
      success: true, 
      tenantsProcessed: totalProcessed,
      cached: totalCached,
      failed: totalFailed,
    };
  } catch (error) {
    console.error('[KPI Cache] Error:', error);
    throw error;
  }
}

let kpiCacheWorker: Worker | null = null;

checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    const { addToDeadLetterQueue } = await import('../../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../../utils/job-monitoring');
    const { defaultJobOptions } = await import('../../config/redis');
    
    kpiCacheWorker = new Worker<KpiCacheJobData>(
      'analysis',
      async (job: Job) => {
        if (job.name === 'kpi-cache') {
          return processKpiCache(job);
        }
        return { skipped: true };
      },
      { 
        connection: redisConnection,
        concurrency: 2,
      }
    );

    kpiCacheWorker.on('active', (job) => {
      if (job.name === 'kpi-cache') {
        logJobStarted(job);
      }
    });

    kpiCacheWorker.on('completed', (job) => {
      if (job.name === 'kpi-cache') {
        logJobCompleted(job);
      }
    });

    kpiCacheWorker.on('failed', async (job, error) => {
      if (job && job.name === 'kpi-cache') {
        logJobFailed(job, error, 'kpi-cache');
        
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
          
          console.log(`[KPI Cache Worker] 📦 Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
        }
      }
    });

    kpiCacheWorker.on('stalled', (jobId) => {
      console.warn(`[KPI Cache Worker] ⚠️  Job ${jobId} stalled`);
    });

    kpiCacheWorker.on('error', (error) => {
      console.error('[KPI Cache Worker] Worker error:', error);
    });

    console.log('[KPI Cache Worker] ✅ Worker initialized (using analysis queue) with DLQ and enhanced monitoring');
  } else {
    console.warn('[KPI Cache Worker] ⚠️  Redis unavailable - worker disabled');
  }
});

export { kpiCacheWorker };
