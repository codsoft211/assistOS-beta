// CDC Event Dispatcher
// Publishes change events to BullMQ for async processing

import type { Queue } from 'bullmq';
import type { CDCEventRecord } from './types';
import { EventEmitter } from 'events';

// Event types for real-time consumers
export const CDC_EVENTS = {
  EVENT_PUBLISHED: 'cdc:event:published',
  EVENT_PROCESSED: 'cdc:event:processed',
  EVENT_FAILED: 'cdc:event:failed',
} as const;

// Global event emitter for CDC events
export const cdcEventEmitter = new EventEmitter();

/**
 * Dispatch CDC event to BullMQ queue
 */
export async function dispatchToQueue(
  queue: Queue | null,
  event: CDCEventRecord
): Promise<void> {
  if (!queue) {
    console.warn('[CDC Dispatcher] Queue not available, skipping dispatch');
    return;
  }

  try {
    await queue.add(
      'process-connector-event',
      {
        eventId: event.id,
        tenantId: event.tenantId,
        connectorType: event.connectorType,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
      },
      {
        priority: 1,
        jobId: `cdc-event-${event.id}`,
        removeOnComplete: 100,
        removeOnFail: 500,
      }
    );

    console.log(`[CDC Dispatcher] Event ${event.id} dispatched to queue`);
    
    // Emit real-time event
    cdcEventEmitter.emit(CDC_EVENTS.EVENT_PUBLISHED, event);
  } catch (error) {
    console.error('[CDC Dispatcher] Failed to dispatch event:', error);
    throw error;
  }
}

/**
 * Dispatch batch of events to queue
 */
export async function dispatchBatchToQueue(
  queue: Queue | null,
  events: CDCEventRecord[]
): Promise<void> {
  if (!queue) {
    console.warn('[CDC Dispatcher] Queue not available, skipping batch dispatch');
    return;
  }

  try {
    const jobs = events.map(event => ({
      name: 'process-connector-event',
      data: {
        eventId: event.id,
        tenantId: event.tenantId,
        connectorType: event.connectorType,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
      },
      opts: {
        priority: 1,
        jobId: `cdc-event-${event.id}`,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }));

    await queue.addBulk(jobs);

    console.log(`[CDC Dispatcher] Batch of ${events.length} events dispatched to queue`);
    
    // Emit real-time events
    events.forEach(event => {
      cdcEventEmitter.emit(CDC_EVENTS.EVENT_PUBLISHED, event);
    });
  } catch (error) {
    console.error('[CDC Dispatcher] Failed to dispatch batch:', error);
    throw error;
  }
}
