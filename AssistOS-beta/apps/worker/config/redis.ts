import { ConnectionOptions } from 'bullmq';
import { default as Redis } from 'ioredis';

// Redis connection options for BullMQ
// Supports both REDIS_URL (Upstash format) and separate REDIS_HOST/PORT
export function getRedisConnection(): ConnectionOptions {
  if (process.env.REDIS_URL) {
    // Upstash/Cloud Redis with connection string
    // Return ioredis instance that BullMQ can use
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  
  // Local Redis with separate host/port
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export const redisConnection: ConnectionOptions = getRedisConnection();

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    count: 100,
    age: 24 * 3600,
  },
  removeOnFail: {
    count: 500,
  },
};

// Check Redis availability
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const { default: Redis } = await import('ioredis');
    
    // Create client from connection string or full options object
    const client = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL)
      : new Redis(redisConnection); // Use full connection options
    
    // Suppress error events during connection check
    client.on('error', () => {});
    
    const result = await client.ping();
    await client.quit();
    
    console.log('[Redis] ✅ Connection successful!');
    return result === 'PONG';
  } catch (error) {
    console.warn('[Redis] ❌ Connection unavailable:', (error as Error).message);
    return false;
  }
}
