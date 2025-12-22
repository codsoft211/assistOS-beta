import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions, checkRedisConnection } from '../config/redis';

let connectorSyncQueue: Queue | null = null;

checkRedisConnection().then((isAvailable) => {
  if (isAvailable) {
    connectorSyncQueue = new Queue('connector-sync', {
      connection: redisConnection,
      defaultJobOptions,
    });
    
    connectorSyncQueue.on('error', (error) => {
      console.error('[Connector Sync Queue] Error:', error);
    });
    
    console.log('[Connector Sync Queue] ✅ Queue initialized');
  } else {
    console.warn('[Connector Sync Queue] ⚠️  Redis unavailable - CDC queue disabled');
  }
});

export { connectorSyncQueue };
