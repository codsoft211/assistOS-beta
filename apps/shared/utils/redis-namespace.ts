/**
 * Redis Namespace Utility for Multi-Tenancy Isolation
 * 
 * This module provides functions to namespace Redis keys and queues for tenant isolation,
 * preventing cross-tenant data leakage in a multi-tenant architecture.
 * 
 * **Namespace Pattern:**
 * - Tenant-scoped keys: `tenant:{tenantId}:{resource}`
 * - Tenant-scoped queues: `tenant:{tenantId}:queue:{queueBaseName}`
 * - Platform-level resources: Use constants exported from this module (no tenant prefix)
 * 
 * **Migration Path for Existing Keys:**
 * 
 * When migrating from non-namespaced to namespaced keys:
 * 
 * 1. **Dual-write phase:** Write to both old and new keys
 *    ```typescript
 *    // Write to both keys during migration
 *    await redis.set('user:123', data);
 *    await redis.set(getNamespacedKey(tenantId, 'user:123'), data);
 *    ```
 * 
 * 2. **Dual-read phase:** Read from new key first, fallback to old
 *    ```typescript
 *    let data = await redis.get(getNamespacedKey(tenantId, 'user:123'));
 *    if (!data) {
 *      data = await redis.get('user:123'); // Fallback to legacy
 *    }
 *    ```
 * 
 * 3. **Background migration:** Copy old keys to namespaced keys
 *    ```typescript
 *    const keys = await redis.keys('user:*');
 *    for (const key of keys) {
 *      const value = await redis.get(key);
 *      await redis.set(getNamespacedKey(tenantId, key), value);
 *    }
 *    ```
 * 
 * 4. **Cleanup phase:** Remove old keys after verification
 * 
 * @module redis-namespace
 */

/**
 * Platform-level cache prefixes (no tenant isolation needed)
 * These resources are shared across all tenants
 */
export const PLATFORM_KEYS = {
  /** Rate limiting buckets */
  RATE_LIMIT: 'platform:ratelimit',
  
  /** System-wide configuration cache */
  SYSTEM_CONFIG: 'platform:config',
  
  /** Platform health metrics */
  HEALTH_METRICS: 'platform:health',
  
  /** Global feature flags */
  FEATURE_FLAGS: 'platform:features',
  
  /** Platform-wide analytics */
  ANALYTICS: 'platform:analytics',
} as const;

/**
 * Platform-level queue names (no tenant isolation needed)
 * These queues process system-wide jobs
 */
export const PLATFORM_QUEUES = {
  /** System maintenance jobs */
  MAINTENANCE: 'platform:queue:maintenance',
  
  /** Cross-tenant pattern aggregation */
  PATTERN_AGGREGATION: 'platform:queue:pattern-aggregation',
  
  /** System monitoring and alerting */
  MONITORING: 'platform:queue:monitoring',
  
  /** Platform-wide backfill operations */
  BACKFILL: 'platform:queue:backfill',
} as const;

/**
 * Generates a namespaced Redis key for tenant isolation
 * 
 * @param tenantId - The tenant identifier (UUID or slug)
 * @param key - The base key name (e.g., 'cache:user:123', 'session:abc')
 * @returns Namespaced key in format: `tenant:{tenantId}:{key}`
 * 
 * @example
 * ```typescript
 * // Cache user data
 * const cacheKey = getNamespacedKey('tenant-123', 'cache:user:456');
 * // Returns: 'tenant:tenant-123:cache:user:456'
 * await redis.set(cacheKey, userData);
 * 
 * // Session storage
 * const sessionKey = getNamespacedKey('tenant-123', 'session:xyz');
 * // Returns: 'tenant:tenant-123:session:xyz'
 * await redis.set(sessionKey, sessionData, 'EX', 3600);
 * ```
 */
export function getNamespacedKey(tenantId: string, key: string): string {
  if (!tenantId) {
    throw new Error('tenantId is required for namespaced keys');
  }
  
  if (!key) {
    throw new Error('key is required');
  }
  
  return `tenant:${tenantId}:${key}`;
}

/**
 * Generates a namespaced queue name for tenant-specific job queues
 * 
 * @param tenantId - The tenant identifier (UUID or slug)
 * @param queueBaseName - The base queue name (e.g., 'assistbuild', 'analysis')
 * @returns Namespaced queue name in format: `tenant:{tenantId}:queue:{queueBaseName}`
 * 
 * @example
 * ```typescript
 * // Create tenant-specific assistbuild queue
 * const queueName = getNamespacedQueueName('tenant-123', 'assistbuild');
 * // Returns: 'tenant:tenant-123:queue:assistbuild'
 * const queue = new Queue(queueName, { connection: redisConnection });
 * 
 * // Create tenant-specific analysis queue
 * const analysisQueueName = getNamespacedQueueName('tenant-123', 'analysis');
 * // Returns: 'tenant:tenant-123:queue:analysis'
 * ```
 */
export function getNamespacedQueueName(tenantId: string, queueBaseName: string): string {
  if (!tenantId) {
    throw new Error('tenantId is required for namespaced queues');
  }
  
  if (!queueBaseName) {
    throw new Error('queueBaseName is required');
  }
  
  return `tenant:${tenantId}:queue:${queueBaseName}`;
}

/**
 * Extracts the tenant ID from a namespaced key
 * Useful for logging, debugging, and key migration
 * 
 * @param namespacedKey - A namespaced key (e.g., 'tenant:123:cache:user')
 * @returns The tenant ID or null if not a namespaced key
 * 
 * @example
 * ```typescript
 * const tenantId = extractTenantId('tenant:tenant-123:cache:user:456');
 * // Returns: 'tenant-123'
 * 
 * const noTenant = extractTenantId('cache:user:456');
 * // Returns: null (not a namespaced key)
 * ```
 */
export function extractTenantId(namespacedKey: string): string | null {
  const match = namespacedKey.match(/^tenant:([^:]+):/);
  return match ? match[1] : null;
}

/**
 * Checks if a key is tenant-namespaced
 * 
 * @param key - The key to check
 * @returns True if the key follows the tenant namespace pattern
 * 
 * @example
 * ```typescript
 * isTenantKey('tenant:123:cache:user'); // true
 * isTenantKey('platform:ratelimit'); // false
 * isTenantKey('cache:user'); // false
 * ```
 */
export function isTenantKey(key: string): boolean {
  return /^tenant:[^:]+:/.test(key);
}

/**
 * Gets all keys for a specific tenant
 * WARNING: Use with caution in production - KEYS command can be slow
 * 
 * @param tenantId - The tenant identifier
 * @param pattern - Optional pattern to match (e.g., 'cache:*')
 * @returns Pattern to use with Redis KEYS or SCAN command
 * 
 * @example
 * ```typescript
 * // Get all keys for a tenant
 * const pattern = getTenantKeyPattern('tenant-123');
 * // Returns: 'tenant:tenant-123:*'
 * const keys = await redis.keys(pattern);
 * 
 * // Get only cache keys for a tenant
 * const cachePattern = getTenantKeyPattern('tenant-123', 'cache:*');
 * // Returns: 'tenant:tenant-123:cache:*'
 * ```
 */
export function getTenantKeyPattern(tenantId: string, pattern: string = '*'): string {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }
  
  return `tenant:${tenantId}:${pattern}`;
}
