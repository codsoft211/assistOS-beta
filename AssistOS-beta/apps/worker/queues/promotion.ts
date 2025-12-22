import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions, checkRedisConnection } from '../config/redis';

let promotionQueue: Queue | null = null;

// Only create queue if Redis is available
checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    promotionQueue = new Queue('promotion', {
      connection: redisConnection,
      defaultJobOptions,
    });
    
    promotionQueue.on('error', (error) => {
      console.error('[Promotion Queue] Error:', error);
    });
    
    console.log('[Promotion Queue] ✅ Queue initialized');
  } else {
    console.warn('[Promotion Queue] ⚠️  Redis unavailable - promotion queue disabled');
  }
});

export { promotionQueue };
