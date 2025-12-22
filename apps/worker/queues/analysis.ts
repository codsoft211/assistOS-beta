/**
 * Analysis Queue with Multi-Tenancy Support
 * 
 * This module provides BullMQ queues for pattern analysis jobs with optional tenant isolation.
 * 
 * **Platform-level queue (default):**
 * - Queue name: 'analyze-patterns'
 * - Used for cross-tenant pattern aggregation
 * - No tenant isolation
 * 
 * **Tenant-specific queues:**
 * - Queue name: 'tenant:{tenantId}:queue:analyze-patterns'
 * - Each tenant gets isolated pattern analysis
 * - Prevents cross-tenant data leakage
 * 
 * @example
 * ```typescript
 * // Platform-level queue (backward compatible)
 * import { analysisQueue } from './queues/analysis';
 * if (analysisQueue) {
 *   await analysisQueue.add('analyze-patterns', jobData);
 * }
 * 
 * // Tenant-specific queue
 * import { createTenantAnalysisQueue } from './queues/analysis';
 * const tenantQueue = await createTenantAnalysisQueue('tenant-123');
 * if (tenantQueue) {
 *   await tenantQueue.add('analyze-patterns', jobData);
 * }
 * ```
 * 
 * @module analysis-queue
 */

import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions, checkRedisConnection } from '../config/redis';
import { getNamespacedQueueName } from '../../shared/utils/redis-namespace';

/**
 * Platform-level analysis queue (no tenant isolation)
 * This is the default queue for backward compatibility
 */
let analysisQueue: Queue | null = null;

/**
 * Cache of tenant-specific queues
 * Key: tenantId, Value: Queue instance
 */
const tenantQueues = new Map<string, Queue>();

checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    analysisQueue = new Queue('analyze-patterns', {
      connection: redisConnection,
      defaultJobOptions,
    });
    
    analysisQueue.on('error', (error) => {
      console.error('[Analysis Queue] Error:', error);
    });
    
    console.log('[Analysis Queue] ✅ Queue initialized');
  } else {
    console.warn('[Analysis Queue] ⚠️  Redis unavailable - job queue disabled');
  }
});

/**
 * Creates or retrieves a tenant-specific analysis queue
 * 
 * Queues are cached per tenant to avoid creating multiple instances.
 * Each tenant gets an isolated queue with the naming pattern:
 * `tenant:{tenantId}:queue:analyze-patterns`
 * 
 * @param tenantId - The tenant identifier (UUID or slug)
 * @returns Promise<Queue | null> - The tenant queue or null if Redis unavailable
 * 
 * @example
 * ```typescript
 * // Create tenant-specific queue
 * const queue = await createTenantAnalysisQueue('tenant-123');
 * if (queue) {
 *   await queue.add('analyze-patterns', {
 *     dataSource: 'user-interactions',
 *     timeRange: { start: '2025-01-01', end: '2025-01-31' }
 *   });
 * }
 * 
 * // Queue is cached, subsequent calls return the same instance
 * const sameQueue = await createTenantAnalysisQueue('tenant-123');
 * ```
 */
export async function createTenantAnalysisQueue(tenantId: string): Promise<Queue | null> {
  if (!tenantId) {
    throw new Error('tenantId is required for tenant-specific queue');
  }

  // Return cached queue if exists
  if (tenantQueues.has(tenantId)) {
    return tenantQueues.get(tenantId)!;
  }

  // Check if Redis is available
  const isAvailable = await checkRedisConnection();
  if (!isAvailable) {
    console.warn(`[Analysis Queue:${tenantId}] ⚠️  Redis unavailable - job queue disabled`);
    return null;
  }

  // Create namespaced queue name
  const queueName = getNamespacedQueueName(tenantId, 'analyze-patterns');
  
  // Create new queue
  const queue = new Queue(queueName, {
    connection: redisConnection,
    defaultJobOptions,
  });

  queue.on('error', (error) => {
    console.error(`[Analysis Queue:${tenantId}] Error:`, error);
  });

  // Cache the queue
  tenantQueues.set(tenantId, queue);
  
  console.log(`[Analysis Queue:${tenantId}] ✅ Queue initialized with name: ${queueName}`);
  
  return queue;
}

/**
 * Gets a queue for the specified tenant, or the platform queue if no tenantId provided
 * 
 * This is a convenience function that handles both tenant-specific and platform-level queues.
 * 
 * @param tenantId - Optional tenant identifier
 * @returns Promise<Queue | null> - The appropriate queue or null if unavailable
 * 
 * @example
 * ```typescript
 * // Get platform queue
 * const platformQueue = await getAnalysisQueue();
 * 
 * // Get tenant queue
 * const tenantQueue = await getAnalysisQueue('tenant-123');
 * ```
 */
export async function getAnalysisQueue(tenantId?: string): Promise<Queue | null> {
  if (tenantId) {
    return createTenantAnalysisQueue(tenantId);
  }
  return analysisQueue;
}

/**
 * Closes a tenant-specific queue and removes it from cache
 * Use this when a tenant is deleted or you need to cleanup resources
 * 
 * @param tenantId - The tenant identifier
 * @returns Promise<void>
 * 
 * @example
 * ```typescript
 * await closeTenantAnalysisQueue('tenant-123');
 * ```
 */
export async function closeTenantAnalysisQueue(tenantId: string): Promise<void> {
  const queue = tenantQueues.get(tenantId);
  if (queue) {
    await queue.close();
    tenantQueues.delete(tenantId);
    console.log(`[Analysis Queue:${tenantId}] ✅ Queue closed and removed from cache`);
  }
}

export { analysisQueue };
