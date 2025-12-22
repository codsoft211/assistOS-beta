/**
 * Redis-based Event Bus for Cross-Process Communication
 * 
 * Allows events to be emitted from worker process and received by API server process.
 * Uses Redis Pub/Sub to bridge in-memory EventEmitters across processes.
 */

import Redis from 'ioredis';
import { logger } from '../logger';
import { realtimeEvents } from './event-emitter';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Separate Redis clients for pub and sub (required by ioredis)
const publisher = new Redis(REDIS_URL);
const subscriber = new Redis(REDIS_URL);

// Add connection event handlers for debugging
publisher.on('connect', () => {
  console.log('[Redis Event Bridge] Publisher connected to Redis');
});

publisher.on('error', (err) => {
  console.error('[Redis Event Bridge] Publisher Redis error:', err);
});

subscriber.on('connect', () => {
  console.log('[Redis Event Bridge] Subscriber connected to Redis');
});

subscriber.on('error', (err) => {
  console.error('[Redis Event Bridge] Subscriber Redis error:', err);
});

const REDIS_CHANNEL = 'assistos:realtime:events';

/**
 * Subscribe to Redis Pub/Sub and forward events to local EventEmitter
 * This runs in the API server process
 */
export function startRedisEventBridge() {
  console.log(`[Redis Event Bridge] Initializing... (Redis URL: ${REDIS_URL})`);
  
  subscriber.subscribe(REDIS_CHANNEL, (err) => {
    if (err) {
      console.error(`[Redis Event Bridge] ❌ Failed to subscribe to Redis channel:`, err);
      logger.error({ msg: 'Failed to subscribe to Redis channel', err, channel: REDIS_CHANNEL });
      return;
    }
    console.log(`[Redis Event Bridge] ✅ Redis event bridge started - subscribed to channel: ${REDIS_CHANNEL}`);
    logger.info({ msg: '✅ Redis event bridge started', channel: REDIS_CHANNEL });
  });

  subscriber.on('message', (channel, message) => {
    try {
      const { event, tenantId, data } = JSON.parse(message);
      
      logger.info({
        msg: '📥 Redis event received - forwarding to local EventEmitter',
        channel,
        event,
        tenantId,
      });

      // Log detailed info for AI_RESPONSE_COMPLETED events
      if (event === 'ai.response.completed') {
        console.log(`[Redis Event Bridge] 📥 Received AI_RESPONSE_COMPLETED event:`, {
          tenantId,
          conversationId: data.conversationId,
          messageId: data.messageId,
          clientName: data.clientName,
          isAutomationNotification: data.isAutomationNotification,
          isNewNotification: data.isNewNotification,
        });
      }

      // Forward to local EventEmitter (which has SSE connections)
      realtimeEvents.emitForTenant(event, tenantId, data);
      
      if (event === 'ai.response.completed') {
        console.log(`[Redis Event Bridge] ✅ Forwarded AI_RESPONSE_COMPLETED to EventEmitter for tenant: ${tenantId}`);
      }
    } catch (err) {
      logger.error({ msg: 'Failed to parse Redis message', err, message });
    }
  });

  subscriber.on('error', (err) => {
    logger.error({ msg: 'Redis subscriber error', err });
  });
}

/**
 * Publish event to Redis (for cross-process communication)
 * This can be called from worker process
 */
export async function publishRealtimeEvent(
  event: string,
  tenantId: string,
  data: any
): Promise<void> {
  try {
    const message = JSON.stringify({ event, tenantId, data });
    await publisher.publish(REDIS_CHANNEL, message);
    
    logger.info({
      msg: '📤 Event published to Redis',
      event,
      tenantId,
      channel: REDIS_CHANNEL,
    });
    
    // Log detailed info for AI_RESPONSE_COMPLETED events
    if (event === 'ai.response.completed') {
      console.log(`[Redis Event Bridge] 📤 Published AI_RESPONSE_COMPLETED event to Redis:`, {
        tenantId,
        conversationId: data.conversationId,
        messageId: data.messageId,
        clientName: data.clientName,
        isAutomationNotification: data.isAutomationNotification,
        isNewNotification: data.isNewNotification,
        channel: REDIS_CHANNEL,
      });
    }
  } catch (err) {
    logger.error({ msg: 'Failed to publish event to Redis', err, event, tenantId });
    console.error(`[Redis Event Bridge] ❌ Failed to publish event:`, { event, tenantId, error: err });
  }
}

/**
 * Emit event both locally AND to Redis (for maximum compatibility)
 * Use this when you're not sure if you're in same process or different process
 */
export async function emitRealtimeEvent(
  event: string,
  tenantId: string,
  data: any
): Promise<void> {
  // Emit locally (in case we're in same process)
  realtimeEvents.emitForTenant(event, tenantId, data);
  
  // Also publish to Redis (for cross-process)
  await publishRealtimeEvent(event, tenantId, data);
}

// Cleanup on shutdown
process.on('SIGTERM', () => {
  subscriber.quit();
  publisher.quit();
});
