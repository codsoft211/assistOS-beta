/**
 * Health Check Service
 * 
 * Verifica a saúde de todos os componentes críticos do sistema,
 * especialmente o fluxo completo de processamento de faturas.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { processorRegistry } from '../../../packages/document-processing/registry/ProcessorRegistry';
import { ModuleRegistryService } from '../../../packages/modules/base/module-registry.service';
import { checkRedisConnection } from '../../../apps/worker/config/redis';
import { getBackupStatus } from './backup-monitoring.service';
import * as Sentry from '@sentry/node';
import {
  SystemHealth,
  BasicHealth,
  HealthStatus,
  DatabaseHealth,
  RedisHealth,
  SecretHealth,
  ProcessorHealth,
  ModuleHealth,
  InvoiceFlowHealth,
  BackupHealth,
  QueueHealth,
} from '../types/health.types';

/**
 * Redis Latency Monitoring Configuration
 */
const LATENCY_WINDOW_SIZE = 100;
const latencySamples: number[] = [];

const REDIS_LATENCY_THRESHOLDS = {
  HEALTHY: 50,
  DEGRADED: 200,
  CRITICAL: 200,
};

/**
 * Calculate percentiles from latency samples
 */
function calculatePercentiles(samples: number[]): { p75: number; p95: number } {
  if (samples.length === 0) {
    return { p75: 0, p95: 0 };
  }
  
  const sorted = [...samples].sort((a, b) => a - b);
  const p75Index = Math.floor(sorted.length * 0.75);
  const p95Index = Math.floor(sorted.length * 0.95);
  
  return {
    p75: sorted[p75Index],
    p95: sorted[p95Index],
  };
}

/**
 * Determine Redis status based on p95 latency
 */
function getRedisStatus(p95Latency: number): 'healthy' | 'degraded' | 'unhealthy' {
  if (p95Latency < REDIS_LATENCY_THRESHOLDS.HEALTHY) {
    return 'healthy';
  } else if (p95Latency < REDIS_LATENCY_THRESHOLDS.CRITICAL) {
    return 'degraded';
  } else {
    return 'unhealthy';
  }
}

/**
 * Check database connectivity and performance
 */
export async function checkDatabase(): Promise<DatabaseHealth> {
  const startTime = Date.now();
  
  try {
    await db.execute(sql`SELECT 1`);
    const responseTimeMs = Date.now() - startTime;
    
    return {
      status: responseTimeMs < 100 ? 'healthy' : 'degraded',
      message: responseTimeMs < 100 
        ? 'Database connection healthy' 
        : `Database responding slowly (${responseTimeMs}ms)`,
      connected: true,
      responseTimeMs,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      connected: false,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check Redis connectivity and performance with latency monitoring
 */
export async function checkRedis(): Promise<RedisHealth> {
  const startTime = Date.now();
  
  try {
    const { default: Redis } = await import('ioredis');
    
    const client = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL)
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        });
    
    client.on('error', () => {});
    
    await client.ping();
    const latency = Date.now() - startTime;
    
    await client.quit();
    
    latencySamples.push(latency);
    if (latencySamples.length > LATENCY_WINDOW_SIZE) {
      latencySamples.shift();
    }
    
    const percentiles = calculatePercentiles(latencySamples);
    
    const status = getRedisStatus(percentiles.p95);
    
    if (status === 'unhealthy') {
      Sentry.captureException(
        new Error(`Redis latency critical: ${percentiles.p95}ms (p95) exceeds ${REDIS_LATENCY_THRESHOLDS.CRITICAL}ms threshold`),
        {
          level: 'error',
          tags: {
            service: 'redis',
            metric: 'latency',
            threshold: 'critical',
          },
          contexts: {
            redisMetrics: {
              currentLatency: latency,
              p75: percentiles.p75,
              p95: percentiles.p95,
              sampleCount: latencySamples.length,
            },
          },
        }
      );
    } else if (status === 'degraded') {
      Sentry.captureMessage(
        `Redis latency degraded: ${percentiles.p95}ms (p95) exceeds ${REDIS_LATENCY_THRESHOLDS.HEALTHY}ms threshold`,
        {
          level: 'warning',
          tags: {
            service: 'redis',
            metric: 'latency',
            threshold: 'warning',
          },
          contexts: {
            redisMetrics: {
              currentLatency: latency,
              p75: percentiles.p75,
              p95: percentiles.p95,
              sampleCount: latencySamples.length,
            },
          },
        }
      );
    }
    
    return {
      status,
      message: `Redis latency ${latency}ms (p75: ${percentiles.p75}ms, p95: ${percentiles.p95}ms)`,
      connected: true,
      responseTimeMs: latency,
      percentiles,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    Sentry.captureException(error, {
      level: 'error',
      tags: {
        service: 'redis',
        error_type: 'connection_failed',
      },
    });
    
    return {
      status: 'unhealthy',
      message: `Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      connected: false,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check if a secret is configured
 */
function checkSecret(secretName: string, envKey: string): SecretHealth {
  const value = process.env[envKey];
  const configured = !!value && value.trim().length > 0;
  
  return {
    status: configured ? 'healthy' : 'unhealthy',
    message: configured 
      ? `${secretName} configured` 
      : `${secretName} not configured (missing ${envKey})`,
    configured,
    secretName,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check all required secrets
 */
export async function checkSecrets() {
  return {
    openai: checkSecret('OpenAI API Key', 'OPENAI_API_KEY'),
    anthropic: checkSecret('Anthropic API Key', 'ANTHROPIC_API_KEY'),
    googleDocAI: checkSecret('Google Document AI', 'Google_Invoice_Parser'),
  };
}

/**
 * Check document processors availability
 */
export async function checkProcessors(): Promise<ProcessorHealth[]> {
  const processors = processorRegistry.getAll();
  const checks: ProcessorHealth[] = [];
  
  for (const processor of processors) {
    const statusResult = await processor.getStatus();
    
    checks.push({
      status: statusResult.available ? 'healthy' : 'unhealthy',
      message: statusResult.available 
        ? `${processor.name} available` 
        : statusResult.reason || `${processor.name} not available`,
      processorName: processor.name,
      available: statusResult.available,
      priority: processor.priority,
      timestamp: new Date().toISOString(),
    });
  }
  
  return checks.sort((a, b) => b.priority - a.priority);
}

/**
 * Check module registry
 */
export async function checkModules(): Promise<ModuleHealth[]> {
  const registeredModules = Array.from(ModuleRegistryService.moduleRegistry.keys());
  const criticalModules = ['financeiro', 'compras'];
  
  const checks: ModuleHealth[] = criticalModules.map(moduleId => {
    const registered = registeredModules.includes(moduleId);
    
    return {
      status: registered ? 'healthy' : 'unhealthy',
      message: registered 
        ? `Module ${moduleId} registered` 
        : `Module ${moduleId} NOT registered`,
      moduleId,
      registered,
      timestamp: new Date().toISOString(),
    };
  });
  
  return checks;
}

/**
 * Check invoice processing flow
 */
export async function checkInvoiceFlow(): Promise<InvoiceFlowHealth> {
  const steps = {
    upload: false,
    ocr: false,
    validation: false,
    supplierCreation: false,
    invoiceCreation: false,
  };
  
  const issues: string[] = [];
  
  // 1. Check upload capability (modules registered)
  const comprasModule = ModuleRegistryService.moduleRegistry.has('compras');
  steps.upload = comprasModule;
  if (!comprasModule) issues.push('Compras module not registered');
  
  // 2. Check OCR capability (at least one processor available)
  const processors = processorRegistry.getAll();
  const availableProcessors = await Promise.all(
    processors.map(async p => ({
      name: p.name,
      available: await p.isAvailable(),
    }))
  );
  const hasOCR = availableProcessors.some(p => p.available);
  steps.ocr = hasOCR;
  if (!hasOCR) issues.push('No OCR processor available');
  
  // 3. Check validation capability (database accessible)
  try {
    await db.execute(sql`SELECT 1`);
    steps.validation = true;
  } catch {
    issues.push('Database not accessible for validation');
  }
  
  // 4. Check supplier creation (sequence service + database)
  steps.supplierCreation = steps.validation && comprasModule;
  if (!steps.supplierCreation && comprasModule) {
    issues.push('Supplier creation depends on database');
  }
  
  // 5. Check invoice creation (all previous steps)
  steps.invoiceCreation = steps.upload && steps.ocr && steps.validation && steps.supplierCreation;
  if (!steps.invoiceCreation) {
    issues.push('Invoice creation requires all previous steps');
  }
  
  const allHealthy = Object.values(steps).every(s => s);
  
  return {
    status: allHealthy ? 'healthy' : issues.length > 2 ? 'unhealthy' : 'degraded',
    message: allHealthy 
      ? 'Invoice flow fully operational' 
      : `Invoice flow issues: ${issues.join(', ')}`,
    steps,
    details: {
      issues,
      availableProcessors: availableProcessors
        .filter(p => p.available)
        .map(p => p.name),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check backup monitoring status
 */
export async function checkBackup(): Promise<BackupHealth> {
  const backupStatus = await getBackupStatus();
  
  return {
    status: backupStatus.status === 'healthy' ? 'healthy' : 
            backupStatus.status === 'critical' ? 'unhealthy' : 'degraded',
    message: backupStatus.message,
    isConfigured: backupStatus.status !== 'critical',
    recommendedRetentionDays: 30,
    timestamp: backupStatus.timestamp,
  };
}

/**
 * Check queue monitoring status
 */
export async function checkQueues(): Promise<QueueHealth> {
  try {
    const { queueMonitorService } = await import('../../worker/services/queue-monitor.service');
    const snapshot = queueMonitorService.getLastSnapshot();
    
    if (!snapshot) {
      await queueMonitorService.collectMetrics();
      const newSnapshot = queueMonitorService.getLastSnapshot();
      
      if (!newSnapshot) {
        return {
          status: 'degraded',
          message: 'Queue metrics not available',
          queuesMonitored: 0,
          timestamp: new Date().toISOString(),
        };
      }
      
      return {
        status: newSnapshot.overallStatus === 'healthy' ? 'healthy' : 
                newSnapshot.overallStatus === 'degraded' ? 'degraded' : 'unhealthy',
        message: `${newSnapshot.queues.length} queues monitored`,
        queuesMonitored: newSnapshot.queues.length,
        queues: newSnapshot.queues.map(q => ({
          queueName: q.queueName,
          totalDepth: q.totalDepth,
          status: q.status,
          waiting: q.waiting,
          active: q.active,
          delayed: q.delayed,
        })),
        dlqDepth: newSnapshot.dlqDepth,
        timestamp: newSnapshot.timestamp.toISOString(),
      };
    }
    
    // Check if metrics are stale (>10 minutes old)
    const now = Date.now();
    const snapshotAge = now - snapshot.timestamp.getTime();
    const STALE_THRESHOLD = 10 * 60 * 1000; // 10 minutes
    
    if (snapshotAge > STALE_THRESHOLD) {
      return {
        status: 'degraded',
        message: `Queue metrics stale (last update ${Math.floor(snapshotAge / 1000 / 60)} minutes ago)`,
        queuesMonitored: snapshot.queues.length,
        queues: snapshot.queues.map(q => ({
          queueName: q.queueName,
          totalDepth: q.totalDepth,
          status: q.status,
          waiting: q.waiting,
          active: q.active,
          delayed: q.delayed,
        })),
        dlqDepth: snapshot.dlqDepth,
        timestamp: snapshot.timestamp.toISOString(),
        ageMinutes: Math.floor(snapshotAge / 1000 / 60),
      };
    }
    
    return {
      status: snapshot.overallStatus === 'healthy' ? 'healthy' : 
              snapshot.overallStatus === 'degraded' ? 'degraded' : 'unhealthy',
      message: `${snapshot.queues.length} queues monitored (last update ${Math.floor(snapshotAge / 1000)}s ago)`,
      queuesMonitored: snapshot.queues.length,
      queues: snapshot.queues.map(q => ({
        queueName: q.queueName,
        totalDepth: q.totalDepth,
        status: q.status,
        waiting: q.waiting,
        active: q.active,
        delayed: q.delayed,
      })),
      dlqDepth: snapshot.dlqDepth,
      timestamp: snapshot.timestamp.toISOString(),
      ageSeconds: Math.floor(snapshotAge / 1000),
    };
  } catch (error) {
    console.error('[Health] Failed to check queues:', error);
    return {
      status: 'unhealthy',
      message: `Queue health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      queuesMonitored: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get overall system health
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [database, redis, secrets, processors, modules, invoiceFlow, backup, queues] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkSecrets(),
    checkProcessors(),
    checkModules(),
    checkInvoiceFlow(),
    checkBackup(),
    checkQueues(),
  ]);
  
  const components = {
    database,
    redis,
    secrets,
    processors,
    modules,
    invoiceFlow,
    backup,
    queues,
  };
  
  // Determine overall status
  let overall: HealthStatus = 'healthy';
  
  // Check for critical failures (unhealthy)
  const hasUnhealthySecret = Object.values(secrets).some(s => s.status === 'unhealthy');
  const hasUnhealthyModule = modules.some(m => m.status === 'unhealthy');
  const hasUnhealthyProcessor = processors.some(p => p.status === 'unhealthy');
  
  if (database.status === 'unhealthy' || redis.status === 'unhealthy') {
    overall = 'unhealthy';
  } else if (hasUnhealthySecret) {
    // Missing secrets = unhealthy (critical for AI operations)
    overall = 'unhealthy';
  } else if (hasUnhealthyModule) {
    // Missing critical modules = unhealthy
    overall = 'unhealthy';
  } else if (invoiceFlow.status === 'unhealthy') {
    overall = 'unhealthy';
  } else if (backup.status === 'unhealthy') {
    overall = 'unhealthy';
  } else if (queues.status === 'unhealthy') {
    overall = 'unhealthy';
  } else if (
    database.status === 'degraded' ||
    redis.status === 'degraded' ||
    invoiceFlow.status === 'degraded' ||
    backup.status === 'degraded' ||
    queues.status === 'degraded' ||
    hasUnhealthyProcessor
  ) {
    // Degraded database, Redis, invoice flow, backup, queues, or missing processors = degraded
    overall = 'degraded';
  }
  
  return {
    overall,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    components,
  };
}

/**
 * Get basic health (fast endpoint)
 */
export async function getBasicHealth(): Promise<BasicHealth> {
  try {
    await db.execute(sql`SELECT 1`);
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'System operational',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      message: `Database unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
