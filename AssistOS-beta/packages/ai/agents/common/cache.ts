/**
 * Shared Caching Service for AI Agents
 * 
 * Provides in-memory caching with TTL support
 * Used by Trivial mode for instant responses
 */

import type { CacheEntry } from '../assistme/types';
import { HybridMode } from '../assistme/types';

export class CacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_TTL = 3600; // 1 hour in seconds
  private readonly MAX_CACHE_SIZE = 10000; // Max entries

  /**
   * Generate cache key for a query
   */
  generateKey(tenantId: string, userId: string, query: string): string {
    const normalized = query.trim().toLowerCase();
    return `${tenantId}:${userId}:${this.hashString(normalized)}`;
  }

  /**
   * Check if cached response exists and is valid
   */
  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    const now = new Date();
    const age = (now.getTime() - entry.timestamp.getTime()) / 1000;

    if (age > entry.ttl_seconds) {
      this.cache.delete(key);
      return null;
    }

    console.log(`[Cache] HIT for key ${key.substring(0, 30)}... (age: ${age.toFixed(0)}s)`);
    return entry.value;
  }

  /**
   * Store response in cache
   */
  async set(
    key: string,
    value: string,
    options?: {
      mode?: HybridMode;
      ttl?: number;
      tenantId?: string;
    }
  ): Promise<void> {
    // Enforce max cache size (LRU-like eviction)
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const entry: CacheEntry = {
      key,
      value,
      mode: options?.mode || HybridMode.TRIVIAL,
      timestamp: new Date(),
      ttl_seconds: options?.ttl || this.DEFAULT_TTL,
      tenantId: options?.tenantId || 'unknown'
    };

    this.cache.set(key, entry);
    console.log(`[Cache] SET for key ${key.substring(0, 30)}... (TTL: ${entry.ttl_seconds}s)`);
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(key: string): Promise<void> {
    this.cache.delete(key);
    console.log(`[Cache] INVALIDATED ${key.substring(0, 30)}...`);
  }

  /**
   * Invalidate all cache entries for a tenant
   */
  async invalidateTenant(tenantId: string): Promise<number> {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tenantId === tenantId) {
        this.cache.delete(key);
        count++;
      }
    }

    console.log(`[Cache] INVALIDATED ${count} entries for tenant ${tenantId}`);
    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; age: number; mode: HybridMode }>;
  } {
    const now = new Date();
    const entries: Array<{ key: string; age: number; mode: HybridMode }> = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = (now.getTime() - entry.timestamp.getTime()) / 1000;
      entries.push({
        key: key.substring(0, 40),
        age: Math.round(age),
        mode: entry.mode
      });
    }

    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: 0, // TODO: Track hits/misses
      entries: entries.slice(0, 50) // Return latest 50
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[Cache] CLEARED ${size} entries`);
  }

  /**
   * Simple string hash function (DJB2)
   */
  private hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  /**
   * Cleanup expired entries (run periodically)
   */
  cleanup(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = (now.getTime() - entry.timestamp.getTime()) / 1000;
      if (age > entry.ttl_seconds) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[Cache] CLEANUP removed ${removed} expired entries`);
    }

    return removed;
  }
}

export const cacheService = new CacheService();

// Run cleanup every 5 minutes
setInterval(() => cacheService.cleanup(), 5 * 60 * 1000);
