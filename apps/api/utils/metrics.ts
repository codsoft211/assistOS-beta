/**
 * Metrics and Observability Utilities (Sprint 1 Gap 3)
 * 
 * Provides structured logging for latency and throughput metrics.
 * Integrates with Pino logger and AsyncLocalStorage for correlation tracking.
 * Optional Sentry APM integration for distributed tracing.
 */

import { logger } from '../logger.js';
import { getCorrelationId } from '../middleware/request-context.js';
import { Sentry } from '../sentry.js';

export interface MetricOptions {
  operation: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

/**
 * Measure async function execution time and log structured metrics
 * 
 * @example
 * ```typescript
 * const result = await measureAsync(
 *   () => generateEmbedding(text),
 *   {
 *     operation: 'embedding_generation',
 *     entityType: 'supplier',
 *     entityId: supplierId,
 *     metadata: { tenantId, environment }
 *   }
 * );
 * ```
 */
export async function measureAsync<T>(
  fn: () => Promise<T>,
  options: MetricOptions
): Promise<T> {
  const startTime = Date.now();
  const correlationId = getCorrelationId();
  
  // Create Sentry transaction for APM (optional)
  const transaction = Sentry.startTransaction({
    op: options.operation,
    name: `${options.operation}:${options.entityType || 'unknown'}`,
    tags: {
      correlationId,
      entityType: options.entityType,
      entityId: options.entityId,
      ...options.metadata,
    },
  });
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    // Log success metric
    logger.info({
      metric: `${options.operation}_latency_ms`,
      value: duration,
      correlationId,
      entityType: options.entityType,
      entityId: options.entityId,
      ...options.metadata,
    });
    
    // Finish Sentry transaction
    transaction.setStatus('ok');
    transaction.finish();
    
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // Log error metric
    logger.error({
      metric: `${options.operation}_error`,
      value: duration,
      correlationId,
      entityType: options.entityType,
      entityId: options.entityId,
      error: error.message,
      errorStack: error.stack,
      ...options.metadata,
    });
    
    // Mark Sentry transaction as error
    transaction.setStatus('internal_error');
    transaction.finish();
    
    throw error;
  }
}

/**
 * Log throughput metrics for batch operations
 * 
 * @example
 * ```typescript
 * const startTime = Date.now();
 * const count = await processBatch(items);
 * const duration = Date.now() - startTime;
 * logThroughput('batch_embedding_supplier', count, duration);
 * ```
 */
export function logThroughput(
  operation: string,
  count: number,
  duration: number
): void {
  const throughput = (count / duration) * 60000; // items/minute (60000ms = 1 minute)
  const correlationId = getCorrelationId();
  
  logger.info({
    metric: `${operation}_throughput_per_minute`,
    value: throughput,
    count,
    duration_ms: duration,
    correlationId,
  });
}

/**
 * Log a custom metric value
 * 
 * @example
 * ```typescript
 * logMetric('cache_hit_rate', 0.85, { cacheType: 'redis' });
 * ```
 */
export function logMetric(
  metricName: string,
  value: number,
  metadata?: Record<string, any>
): void {
  const correlationId = getCorrelationId();
  
  logger.info({
    metric: metricName,
    value,
    correlationId,
    ...metadata,
  });
}

/**
 * Simple timer for manual instrumentation
 * 
 * @example
 * ```typescript
 * const timer = startTimer();
 * await doWork();
 * timer.end('work_operation', { workType: 'heavy' });
 * ```
 */
export function startTimer() {
  const startTime = Date.now();
  
  return {
    end(operation: string, metadata?: Record<string, any>): number {
      const duration = Date.now() - startTime;
      const correlationId = getCorrelationId();
      
      logger.info({
        metric: `${operation}_latency_ms`,
        value: duration,
        correlationId,
        ...metadata,
      });
      
      return duration;
    },
  };
}
