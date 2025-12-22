/**
 * Tenant-Aware Redis Client Wrapper
 * 
 * This module provides a Redis client that automatically namespaces all keys
 * for tenant isolation. It wraps the ioredis client and transparently applies
 * tenant prefixes to all operations.
 * 
 * **Features:**
 * - Automatic key namespacing for all operations
 * - Full type safety with TypeScript
 * - Supports all common Redis operations
 * - Transparent to application code
 * - No performance overhead
 * 
 * **Usage Example:**
 * ```typescript
 * import { TenantRedisClient } from '@/shared/utils/redis-client';
 * 
 * // Create tenant-scoped client
 * const redis = new TenantRedisClient('tenant-123');
 * 
 * // All operations are automatically namespaced
 * await redis.set('user:456', JSON.stringify(userData)); 
 * // Actually sets: 'tenant:tenant-123:user:456'
 * 
 * const user = await redis.get('user:456');
 * // Actually gets: 'tenant:tenant-123:user:456'
 * 
 * // Cleanup
 * await redis.disconnect();
 * ```
 * 
 * @module redis-client
 */

import { default as Redis, RedisOptions } from 'ioredis';
import { getNamespacedKey, getTenantKeyPattern } from './redis-namespace';

/**
 * Configuration options for TenantRedisClient
 */
export interface TenantRedisClientOptions {
  /** Tenant identifier for key namespacing */
  tenantId: string;
  
  /** Redis connection URL (e.g., Upstash format) */
  connectionUrl?: string;
  
  /** Redis host (if not using connectionUrl) */
  host?: string;
  
  /** Redis port (if not using connectionUrl) */
  port?: number;
  
  /** Additional ioredis options */
  redisOptions?: RedisOptions;
}

/**
 * Tenant-aware Redis client that automatically namespaces all keys
 * 
 * This wrapper ensures complete tenant isolation by automatically prefixing
 * all keys with the tenant namespace pattern.
 * 
 * @example
 * ```typescript
 * // Initialize with connection URL (e.g., Upstash)
 * const client = new TenantRedisClient({
 *   tenantId: 'tenant-123',
 *   connectionUrl: process.env.REDIS_URL
 * });
 * 
 * // Or initialize with host/port
 * const client = new TenantRedisClient({
 *   tenantId: 'tenant-123',
 *   host: 'localhost',
 *   port: 6379
 * });
 * 
 * // Cache data (automatically namespaced)
 * await client.set('session:abc', sessionData, 'EX', 3600);
 * await client.get('session:abc');
 * 
 * // Hash operations
 * await client.hset('user:123', 'name', 'John');
 * await client.hget('user:123', 'name');
 * 
 * // List operations
 * await client.lpush('queue:tasks', 'task1');
 * await client.rpop('queue:tasks');
 * ```
 */
export class TenantRedisClient {
  private client: Redis;
  private tenantId: string;

  /**
   * Creates a new tenant-scoped Redis client
   * 
   * @param options - Configuration options including tenantId and connection details
   * @throws Error if tenantId is not provided
   */
  constructor(options: TenantRedisClientOptions) {
    if (!options.tenantId) {
      throw new Error('tenantId is required for TenantRedisClient');
    }

    this.tenantId = options.tenantId;

    // Create Redis client from connection URL or host/port
    if (options.connectionUrl) {
      this.client = new Redis(options.connectionUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...options.redisOptions,
      });
    } else {
      this.client = new Redis({
        host: options.host || process.env.REDIS_HOST || 'localhost',
        port: options.port || parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...options.redisOptions,
      });
    }

    // Handle connection errors
    this.client.on('error', (error) => {
      console.error(`[TenantRedis:${this.tenantId}] Error:`, error);
    });

    this.client.on('connect', () => {
      console.log(`[TenantRedis:${this.tenantId}] Connected`);
    });
  }

  /**
   * Namespace a key with tenant prefix
   */
  private namespaceKey(key: string): string {
    return getNamespacedKey(this.tenantId, key);
  }

  /**
   * Namespace multiple keys
   */
  private namespaceKeys(keys: string[]): string[] {
    return keys.map(key => this.namespaceKey(key));
  }

  // ==========================================
  // STRING OPERATIONS
  // ==========================================

  /**
   * Set a string value
   * 
   * @example
   * ```typescript
   * await redis.set('user:123', JSON.stringify(userData));
   * await redis.set('session:abc', token, 'EX', 3600); // With TTL
   * ```
   */
  async set(key: string, value: string | number | Buffer, ...args: any[]): Promise<'OK' | null> {
    return this.client.set(this.namespaceKey(key), value, ...args);
  }

  /**
   * Get a string value
   * 
   * @example
   * ```typescript
   * const userData = await redis.get('user:123');
   * ```
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(this.namespaceKey(key));
  }

  /**
   * Delete one or more keys
   * 
   * @example
   * ```typescript
   * await redis.del('user:123');
   * await redis.del('user:123', 'session:abc', 'cache:xyz');
   * ```
   */
  async del(...keys: string[]): Promise<number> {
    return this.client.del(...this.namespaceKeys(keys));
  }

  /**
   * Check if key exists
   * 
   * @example
   * ```typescript
   * const exists = await redis.exists('user:123');
   * ```
   */
  async exists(...keys: string[]): Promise<number> {
    return this.client.exists(...this.namespaceKeys(keys));
  }

  /**
   * Set key expiration in seconds
   * 
   * @example
   * ```typescript
   * await redis.expire('session:abc', 3600); // 1 hour
   * ```
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(this.namespaceKey(key), seconds);
  }

  /**
   * Get time to live in seconds
   * 
   * @example
   * ```typescript
   * const ttl = await redis.ttl('session:abc');
   * ```
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(this.namespaceKey(key));
  }

  /**
   * Increment a numeric value
   * 
   * @example
   * ```typescript
   * await redis.incr('counter:views');
   * ```
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(this.namespaceKey(key));
  }

  /**
   * Decrement a numeric value
   * 
   * @example
   * ```typescript
   * await redis.decr('counter:credits');
   * ```
   */
  async decr(key: string): Promise<number> {
    return this.client.decr(this.namespaceKey(key));
  }

  /**
   * Increment by a specific amount
   * 
   * @example
   * ```typescript
   * await redis.incrby('counter:views', 10);
   * ```
   */
  async incrby(key: string, increment: number): Promise<number> {
    return this.client.incrby(this.namespaceKey(key), increment);
  }

  // ==========================================
  // HASH OPERATIONS
  // ==========================================

  /**
   * Set hash field
   * 
   * @example
   * ```typescript
   * await redis.hset('user:123', 'name', 'John');
   * await redis.hset('user:123', { name: 'John', age: '30' });
   * ```
   */
  async hset(key: string, ...args: any[]): Promise<number> {
    return this.client.hset(this.namespaceKey(key), ...args);
  }

  /**
   * Get hash field value
   * 
   * @example
   * ```typescript
   * const name = await redis.hget('user:123', 'name');
   * ```
   */
  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(this.namespaceKey(key), field);
  }

  /**
   * Get all hash fields and values
   * 
   * @example
   * ```typescript
   * const user = await redis.hgetall('user:123');
   * // Returns: { name: 'John', age: '30' }
   * ```
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(this.namespaceKey(key));
  }

  /**
   * Delete hash fields
   * 
   * @example
   * ```typescript
   * await redis.hdel('user:123', 'tempField');
   * ```
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(this.namespaceKey(key), ...fields);
  }

  /**
   * Check if hash field exists
   * 
   * @example
   * ```typescript
   * const exists = await redis.hexists('user:123', 'name');
   * ```
   */
  async hexists(key: string, field: string): Promise<number> {
    return this.client.hexists(this.namespaceKey(key), field);
  }

  /**
   * Get all hash field names
   * 
   * @example
   * ```typescript
   * const fields = await redis.hkeys('user:123');
   * // Returns: ['name', 'age', 'email']
   * ```
   */
  async hkeys(key: string): Promise<string[]> {
    return this.client.hkeys(this.namespaceKey(key));
  }

  /**
   * Get all hash values
   * 
   * @example
   * ```typescript
   * const values = await redis.hvals('user:123');
   * // Returns: ['John', '30', 'john@example.com']
   * ```
   */
  async hvals(key: string): Promise<string[]> {
    return this.client.hvals(this.namespaceKey(key));
  }

  // ==========================================
  // LIST OPERATIONS
  // ==========================================

  /**
   * Push to the left (head) of list
   * 
   * @example
   * ```typescript
   * await redis.lpush('queue:tasks', 'task1', 'task2');
   * ```
   */
  async lpush(key: string, ...values: (string | number | Buffer)[]): Promise<number> {
    return this.client.lpush(this.namespaceKey(key), ...values);
  }

  /**
   * Push to the right (tail) of list
   * 
   * @example
   * ```typescript
   * await redis.rpush('queue:tasks', 'task1', 'task2');
   * ```
   */
  async rpush(key: string, ...values: (string | number | Buffer)[]): Promise<number> {
    return this.client.rpush(this.namespaceKey(key), ...values);
  }

  /**
   * Pop from the left (head) of list
   * 
   * @example
   * ```typescript
   * const task = await redis.lpop('queue:tasks');
   * ```
   */
  async lpop(key: string): Promise<string | null> {
    return this.client.lpop(this.namespaceKey(key));
  }

  /**
   * Pop from the right (tail) of list
   * 
   * @example
   * ```typescript
   * const task = await redis.rpop('queue:tasks');
   * ```
   */
  async rpop(key: string): Promise<string | null> {
    return this.client.rpop(this.namespaceKey(key));
  }

  /**
   * Get list length
   * 
   * @example
   * ```typescript
   * const length = await redis.llen('queue:tasks');
   * ```
   */
  async llen(key: string): Promise<number> {
    return this.client.llen(this.namespaceKey(key));
  }

  /**
   * Get list range
   * 
   * @example
   * ```typescript
   * const tasks = await redis.lrange('queue:tasks', 0, 9); // First 10 items
   * ```
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(this.namespaceKey(key), start, stop);
  }

  // ==========================================
  // SET OPERATIONS
  // ==========================================

  /**
   * Add members to a set
   * 
   * @example
   * ```typescript
   * await redis.sadd('tags:123', 'typescript', 'redis', 'nodejs');
   * ```
   */
  async sadd(key: string, ...members: (string | number | Buffer)[]): Promise<number> {
    return this.client.sadd(this.namespaceKey(key), ...members);
  }

  /**
   * Get all set members
   * 
   * @example
   * ```typescript
   * const tags = await redis.smembers('tags:123');
   * ```
   */
  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(this.namespaceKey(key));
  }

  /**
   * Remove members from a set
   * 
   * @example
   * ```typescript
   * await redis.srem('tags:123', 'oldtag');
   * ```
   */
  async srem(key: string, ...members: (string | number | Buffer)[]): Promise<number> {
    return this.client.srem(this.namespaceKey(key), ...members);
  }

  /**
   * Check if member exists in set
   * 
   * @example
   * ```typescript
   * const isMember = await redis.sismember('tags:123', 'typescript');
   * ```
   */
  async sismember(key: string, member: string | number | Buffer): Promise<number> {
    return this.client.sismember(this.namespaceKey(key), member);
  }

  /**
   * Get set cardinality (size)
   * 
   * @example
   * ```typescript
   * const count = await redis.scard('tags:123');
   * ```
   */
  async scard(key: string): Promise<number> {
    return this.client.scard(this.namespaceKey(key));
  }

  // ==========================================
  // SORTED SET OPERATIONS
  // ==========================================

  /**
   * Add members to sorted set with scores
   * 
   * @example
   * ```typescript
   * await redis.zadd('leaderboard', 100, 'player1', 200, 'player2');
   * ```
   */
  async zadd(key: string, ...args: (string | number)[]): Promise<number> {
    return this.client.zadd(this.namespaceKey(key), ...args);
  }

  /**
   * Get sorted set range by rank
   * 
   * @example
   * ```typescript
   * const top10 = await redis.zrange('leaderboard', 0, 9);
   * ```
   */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrange(this.namespaceKey(key), start, stop);
  }

  /**
   * Get sorted set reverse range by rank
   * 
   * @example
   * ```typescript
   * const top10 = await redis.zrevrange('leaderboard', 0, 9);
   * ```
   */
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrevrange(this.namespaceKey(key), start, stop);
  }

  /**
   * Get member score from sorted set
   * 
   * @example
   * ```typescript
   * const score = await redis.zscore('leaderboard', 'player1');
   * ```
   */
  async zscore(key: string, member: string): Promise<string | null> {
    return this.client.zscore(this.namespaceKey(key), member);
  }

  /**
   * Remove members from sorted set
   * 
   * @example
   * ```typescript
   * await redis.zrem('leaderboard', 'player1');
   * ```
   */
  async zrem(key: string, ...members: (string | number | Buffer)[]): Promise<number> {
    return this.client.zrem(this.namespaceKey(key), ...members);
  }

  // ==========================================
  // KEY SCANNING AND UTILITIES
  // ==========================================

  /**
   * Get all keys matching pattern
   * WARNING: Use with caution in production - can be slow with many keys
   * Consider using scan() instead for production use
   * 
   * **SECURITY: Tenant Isolation Guarantee**
   * This method ALWAYS enforces tenant-specific key filtering. Only keys belonging
   * to this tenant will be returned. Keys from other tenants and platform keys are
   * NEVER exposed.
   * 
   * @param pattern - Pattern to match (applied WITHIN tenant namespace, default: '*')
   * @returns Array of keys (without tenant prefix for transparency)
   * 
   * @example
   * ```typescript
   * // Get all tenant keys (CAUTION: Can be slow!)
   * const allKeys = await redis.keys('*');
   * 
   * // Get user-related keys
   * const userKeys = await redis.keys('user:*');
   * // Searches for: tenant:{tenantId}:user:*
   * 
   * // Get cache keys
   * const cacheKeys = await redis.keys('cache:*');
   * // Searches for: tenant:{tenantId}:cache:*
   * ```
   */
  async keys(pattern: string = '*'): Promise<string[]> {
    // SECURITY: Always enforce tenant-specific pattern
    const namespacedPattern = getTenantKeyPattern(this.tenantId, pattern);
    const keys = await this.client.keys(namespacedPattern);
    
    // SECURITY: Defense-in-depth filter
    // Only return keys that actually belong to this tenant
    // This protects against any Redis configuration issues or bugs
    const tenantPrefix = `tenant:${this.tenantId}:`;
    const filteredKeys = keys.filter(key => key.startsWith(tenantPrefix));
    
    // Strip namespace prefix from returned keys for transparency
    return filteredKeys.map(key => key.slice(tenantPrefix.length));
  }

  /**
   * Scan keys with cursor (production-safe alternative to keys())
   * 
   * **SECURITY: Tenant Isolation Guarantee**
   * This method ALWAYS enforces tenant-specific key filtering. Even if you don't provide
   * a MATCH pattern, only keys belonging to this tenant will be returned. Keys from other
   * tenants and platform keys are NEVER exposed.
   * 
   * @param cursor - The cursor from previous scan (use '0' or 0 to start new scan)
   * @param options - Optional scan configuration
   * @param options.MATCH - Pattern to match keys (applied WITHIN tenant namespace)
   * @param options.COUNT - Hint for number of keys to return per iteration
   * @returns Tuple of [newCursor, keys] where keys have tenant prefix stripped for transparency
   * 
   * @example
   * ```typescript
   * // Scan all tenant keys
   * let cursor = '0';
   * do {
   *   const [newCursor, keys] = await redis.scan(cursor);
   *   cursor = newCursor;
   *   // Process keys... (only this tenant's keys)
   * } while (cursor !== '0');
   * 
   * // Scan with pattern (pattern is applied INSIDE tenant namespace)
   * const [cursor, keys] = await redis.scan('0', { MATCH: 'user:*' });
   * // Searches for: tenant:{tenantId}:user:*
   * 
   * // Scan with count hint
   * const [cursor, keys] = await redis.scan('0', { COUNT: 100 });
   * ```
   */
  async scan(
    cursor: number | string, 
    options?: { MATCH?: string; COUNT?: number }
  ): Promise<[string, string[]]> {
    const tenantPrefix = `tenant:${this.tenantId}:`;
    
    // SECURITY: Always enforce tenant-specific MATCH pattern
    // User pattern is applied INSIDE tenant namespace, never outside
    const match = options?.MATCH 
      ? getTenantKeyPattern(this.tenantId, options.MATCH)
      : getTenantKeyPattern(this.tenantId, '*');
    
    // Execute scan with tenant-enforced pattern
    let result: [string, string[]];
    if (options?.COUNT) {
      result = await this.client.scan(cursor, 'MATCH', match, 'COUNT', options.COUNT);
    } else {
      result = await this.client.scan(cursor, 'MATCH', match);
    }
    
    const [newCursor, keys] = result;
    
    // SECURITY: Defense-in-depth filter
    // Only return keys that actually belong to this tenant
    // This protects against any Redis configuration issues or bugs
    const filteredKeys = keys.filter(key => key.startsWith(tenantPrefix));
    
    // Strip tenant prefix for transparency to caller
    const strippedKeys = filteredKeys.map(key => key.slice(tenantPrefix.length));
    
    return [newCursor, strippedKeys];
  }

  /**
   * Delete all keys for this tenant
   * WARNING: This is destructive! Use with extreme caution
   * 
   * @example
   * ```typescript
   * await redis.flushTenant(); // Deletes all tenant data
   * ```
   */
  async flushTenant(): Promise<number> {
    const pattern = getTenantKeyPattern(this.tenantId, '*');
    const keys = await this.client.keys(pattern);
    
    if (keys.length === 0) {
      return 0;
    }
    
    return this.client.del(...keys);
  }

  // ==========================================
  // CONNECTION MANAGEMENT
  // ==========================================

  /**
   * Ping Redis server
   * 
   * @example
   * ```typescript
   * const response = await redis.ping();
   * // Returns: 'PONG'
   * ```
   */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * Disconnect from Redis
   * 
   * @example
   * ```typescript
   * await redis.disconnect();
   * ```
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Get the underlying ioredis client (use with caution)
   * This bypasses tenant namespacing - use only when necessary
   * 
   * @example
   * ```typescript
   * const rawClient = redis.getRawClient();
   * // Use for operations that can't be namespaced
   * ```
   */
  getRawClient(): Redis {
    return this.client;
  }

  /**
   * Get the tenant ID for this client
   * 
   * @example
   * ```typescript
   * const tenantId = redis.getTenantId();
   * ```
   */
  getTenantId(): string {
    return this.tenantId;
  }
}

/**
 * Factory function to create a tenant-scoped Redis client
 * 
 * @example
 * ```typescript
 * import { createTenantRedisClient } from '@/shared/utils/redis-client';
 * 
 * const redis = createTenantRedisClient('tenant-123');
 * await redis.set('cache:data', value);
 * await redis.disconnect();
 * ```
 */
export function createTenantRedisClient(
  tenantId: string,
  connectionUrl?: string
): TenantRedisClient {
  return new TenantRedisClient({
    tenantId,
    connectionUrl: connectionUrl || process.env.REDIS_URL,
  });
}
