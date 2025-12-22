import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions, checkRedisConnection } from '../config/redis';

let patternAggregationQueue: Queue | null = null;

checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    patternAggregationQueue = new Queue('pattern-aggregation', {
      connection: redisConnection,
      defaultJobOptions,
    });
    
    patternAggregationQueue.on('error', (error) => {
      console.error('[Pattern Aggregation Queue] Error:', error);
    });
    
    console.log('[Pattern Aggregation Queue] ✅ Queue initialized');
  } else {
    console.warn('[Pattern Aggregation Queue] ⚠️  Redis unavailable - job queue disabled');
  }
});

export { patternAggregationQueue };
