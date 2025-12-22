import { Queue } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../../worker/config/redis.js';
import logger from '../logger.js';

let assistbuildQueue: Queue | null = null;

logger.info('[AssistBuild Queue] 🚀 Module loaded - checking Redis connection...');

// Only create queue if Redis is available
checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    assistbuildQueue = new Queue('assistbuild', {
      connection: redisConnection,
    });
    
    assistbuildQueue.on('error', (error) => {
      logger.error({ error }, '[AssistBuild Queue] Error (API)');
    });
    
    logger.info('[AssistBuild Queue] ✅ Queue initialized successfully (API)');
  } else {
    logger.warn('[AssistBuild Queue] ⚠️  Redis unavailable - job queue disabled (API)');
  }
}).catch((error) => {
  logger.error({ error }, '[AssistBuild Queue] ❌ Failed to check Redis connection');
});

export { assistbuildQueue };
