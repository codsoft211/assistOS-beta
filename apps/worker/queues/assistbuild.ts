/**
 * AssistBuild Queue with Multi-Tenancy Support
 * 
 * This module provides BullMQ queues for AssistBuild jobs with optional tenant isolation.
 * 
 * **Platform-level queue (default):**
 * - Queue name: 'assistbuild'
 * - Used for system-wide AssistBuild operations
 * - No tenant isolation
 * 
 * **Tenant-specific queues:**
 * - Queue name: 'tenant:{tenantId}:queue:assistbuild'
 * - Each tenant gets isolated job processing
 * - Prevents cross-tenant data leakage
 * 
 * @example
 * ```typescript
 * // Platform-level queue (backward compatible)
 * import { assistbuildQueue } from './queues/assistbuild';
 * if (assistbuildQueue) {
 *   await assistbuildQueue.add('generate-code', jobData);
 * }
 * 
 * // Tenant-specific queue
 * import { createTenantAssistBuildQueue } from './queues/assistbuild';
 * const tenantQueue = await createTenantAssistBuildQueue('tenant-123');
 * if (tenantQueue) {
 *   await tenantQueue.add('generate-code', jobData);
 * }
 * ```
 * 
 * @module assistbuild-queue
 */

import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions, checkRedisConnection } from '../config/redis';
import { getNamespacedQueueName } from '../../shared/utils/redis-namespace';

/**
 * Platform-level AssistBuild queue (no tenant isolation)
 * This is the default queue for backward compatibility
 */
let assistbuildQueue: Queue | null = null;

/**
 * Cache of tenant-specific queues
 * Key: tenantId, Value: Queue instance
 */
const tenantQueues = new Map<string, Queue>();

// Only create queue if Redis is available
checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    assistbuildQueue = new Queue('assistbuild', {
      connection: redisConnection,
      defaultJobOptions,
    });
    
    assistbuildQueue.on('error', (error) => {
      console.error('[AssistBuild Queue] Error:', error);
    });
    
    console.log('[AssistBuild Queue] ✅ Queue initialized');
  } else {
    console.warn('[AssistBuild Queue] ⚠️  Redis unavailable - job queue disabled');
  }
});

/**
 * Creates or retrieves a tenant-specific AssistBuild queue
 * 
 * Queues are cached per tenant to avoid creating multiple instances.
 * Each tenant gets an isolated queue with the naming pattern:
 * `tenant:{tenantId}:queue:assistbuild`
 * 
 * @param tenantId - The tenant identifier (UUID or slug)
 * @returns Promise<Queue | null> - The tenant queue or null if Redis unavailable
 * 
 * @example
 * ```typescript
 * // Create tenant-specific queue
 * const queue = await createTenantAssistBuildQueue('tenant-123');
 * if (queue) {
 *   await queue.add('generate-code', {
 *     blueprint: 'user-management',
 *     config: { ... }
 *   });
 * }
 * 
 * // Queue is cached, subsequent calls return the same instance
 * const sameQueue = await createTenantAssistBuildQueue('tenant-123');
 * ```
 */
export async function createTenantAssistBuildQueue(tenantId: string): Promise<Queue | null> {
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
    console.warn(`[AssistBuild Queue:${tenantId}] ⚠️  Redis unavailable - job queue disabled`);
    return null;
  }

  // Create namespaced queue name
  const queueName = getNamespacedQueueName(tenantId, 'assistbuild');
  
  // Create new queue
  const queue = new Queue(queueName, {
    connection: redisConnection,
    defaultJobOptions,
  });

  queue.on('error', (error) => {
    console.error(`[AssistBuild Queue:${tenantId}] Error:`, error);
  });

  // Cache the queue
  tenantQueues.set(tenantId, queue);
  
  console.log(`[AssistBuild Queue:${tenantId}] ✅ Queue initialized with name: ${queueName}`);
  
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
 * const platformQueue = await getAssistBuildQueue();
 * 
 * // Get tenant queue
 * const tenantQueue = await getAssistBuildQueue('tenant-123');
 * ```
 */
export async function getAssistBuildQueue(tenantId?: string): Promise<Queue | null> {
  if (tenantId) {
    return createTenantAssistBuildQueue(tenantId);
  }
  return assistbuildQueue;
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
 * await closeTenantAssistBuildQueue('tenant-123');
 * ```
 */
export async function closeTenantAssistBuildQueue(tenantId: string): Promise<void> {
  const queue = tenantQueues.get(tenantId);
  if (queue) {
    await queue.close();
    tenantQueues.delete(tenantId);
    console.log(`[AssistBuild Queue:${tenantId}] ✅ Queue closed and removed from cache`);
  }
}

export { assistbuildQueue };
