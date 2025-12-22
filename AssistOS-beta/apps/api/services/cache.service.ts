// Migrated from AssistOS legacy - Phase 2
interface CacheEntry {
  data: any;
  expiresAt: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry> = new Map();
  
  set(key: string, value: any, ttlSeconds: number = 1800) {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
  
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  delete(key: string) {
    this.cache.delete(key);
  }
  
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
  
  // Cleanup expired entries every 5 minutes
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      Array.from(this.cache.entries()).forEach(([key, entry]) => {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      });
    }, 5 * 60 * 1000);
  }
}

export const cache = new SimpleCache();
cache.startCleanup();
