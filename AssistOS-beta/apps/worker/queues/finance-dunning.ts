import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions, checkRedisConnection } from '../config/redis';

let financeDunningQueue: Queue | null = null;

checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    financeDunningQueue = new Queue('finance-dunning', {
      connection: redisConnection,
      defaultJobOptions,
    });
    
    financeDunningQueue.on('error', (error) => {
      console.error('[Finance Dunning Queue] Error:', error);
    });
    
    console.log('[Finance Dunning Queue] ✅ Queue initialized');
  } else {
    console.warn('[Finance Dunning Queue] ⚠️  Redis unavailable - job queue disabled');
  }
});

export { financeDunningQueue };
