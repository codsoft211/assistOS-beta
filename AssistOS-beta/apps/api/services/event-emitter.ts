// Migrated from AssistOS legacy - Phase 4.0
// Source: /tmp/assistos-legacy/server/event-emitter.ts

import { EventEmitter } from "events";
import { logger } from "../logger";

/**
 * GLOBAL EVENT EMITTER - Server-Side Event Bus
 * 
 * Centralizes all real-time events in the system.
 * Components emit events here, SSE endpoint listens and broadcasts to clients.
 * 
 * Events:
 * - message.created: { tenantId, conversationId, message }
 * - conversation.updated: { tenantId, conversationId, conversation }
 * - conversation.created: { tenantId, conversation }
 * - conversation.read: { tenantId, conversationId }
 */

class RealtimeEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0); // Unlimited listeners (one per SSE connection)
  }

  /**
   * Emit a real-time event to all connected clients for a tenant
   */
  emitForTenant(event: string, tenantId: string, data: any) {
    const eventKey = `${tenantId}:${event}`;
    const listenerCount = this.listenerCount(eventKey);
    
    logger.info({
      msg: "Real-time event emitted",
      tenantId,
      event,
      eventKey,
      listenerCount,
      dataKeys: Object.keys(data),
    });
    
    // Log detailed info for AI_RESPONSE_COMPLETED events
    if (event === 'ai.response.completed') {
      console.log(`[EventEmitter] 📡 Emitting AI_RESPONSE_COMPLETED event:`, {
        tenantId,
        eventKey,
        listenerCount,
        conversationId: data.conversationId,
        messageId: data.messageId,
        clientName: data.clientName,
        isAutomationNotification: data.isAutomationNotification,
        isNewNotification: data.isNewNotification,
      });
    }
    
    if (listenerCount === 0) {
      logger.warn({
        msg: "⚠️ No active listeners for event!",
        tenantId,
        event,
        eventKey,
        allEventNames: this.eventNames(),
      });
      
      if (event === 'ai.response.completed') {
        console.warn(`[EventEmitter] ⚠️ No active listeners for AI_RESPONSE_COMPLETED! Event will not reach any SSE connections.`);
      }
    }
    
    this.emit(eventKey, data);
    
    if (event === 'ai.response.completed') {
      console.log(`[EventEmitter] ✅ AI_RESPONSE_COMPLETED event emitted to ${listenerCount} listener(s)`);
    }
  }

  /**
   * Subscribe to events for a specific tenant
   */
  subscribeForTenant(event: string, tenantId: string, callback: (data: any) => void) {
    const eventKey = `${tenantId}:${event}`;
    this.on(eventKey, callback);
    
    logger.info({
      msg: "Subscribed to real-time event",
      tenantId,
      event,
      eventKey,
      listenerCount: this.listenerCount(eventKey),
    });
    
    return () => {
      this.off(eventKey, callback);
      logger.info({
        msg: "Unsubscribed from real-time event",
        tenantId,
        event,
        eventKey,
        listenerCount: this.listenerCount(eventKey),
      });
    };
  }
}

export const realtimeEvents = new RealtimeEventEmitter();
