// CDC Event Publisher Implementation
// Handles publishing change events to connector_change_events table

import { db } from "../../apps/api/db";
import { connectorChangeEvents } from "../../shared/schema";
import type { 
  IEventPublisher, 
  ChangeEventPayload, 
  CDCEventRecord,
  PublishOptions 
} from "./types";
import { dispatchToQueue, dispatchBatchToQueue } from "./dispatcher";

// Queue reference - lazy initialized or set by worker
let queueRef: any = null;
let queueInitialized = false;

export function setConnectorSyncQueue(queue: any) {
  queueRef = queue;
  queueInitialized = true;
  console.log('[CDC Publisher] Queue reference set');
}

// Lazy queue initialization for API process
async function ensureQueue() {
  if (queueInitialized) return queueRef;
  
  try {
    // Dynamic import to avoid circular dependencies and allow API process to create queue
    const { Queue } = await import('bullmq');
    const { getRedisConnection } = await import('../../apps/worker/config/redis');
    
    const connection = getRedisConnection();
    if (connection) {
      queueRef = new Queue('connector-sync', { connection });
      queueInitialized = true;
      console.log('[CDC Publisher] Queue lazy-initialized in API process');
    }
  } catch (error) {
    console.warn('[CDC Publisher] Could not initialize queue:', error);
  }
  
  return queueRef;
}

export class DatabaseEventPublisher implements IEventPublisher {
  
  /**
   * Publish a single change event
   */
  async publish(
    event: ChangeEventPayload, 
    options: PublishOptions = {}
  ): Promise<CDCEventRecord> {
    
    // Dedupe check if enabled
    if (options.dedupe && options.dedupeKey) {
      const existing = await this.checkDuplicate(
        event.tenantId,
        event.connectorType,
        options.dedupeKey
      );
      
      if (existing) {
        console.log(`[CDC Publisher] Duplicate event detected: ${options.dedupeKey}`);
        return existing;
      }
    }

    // Use transaction-aware db if provided, otherwise global db
    const dbClient = options.db || db;
    
    // Insert event into connector_change_events table
    const [record] = await dbClient
      .insert(connectorChangeEvents)
      .values({
        tenantId: event.tenantId,
        connectorType: event.connectorType,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        changedFields: event.changedFields,
        eventData: {
          ...event.eventData,
          source: event.source,
          metadata: {
            ...event.metadata,
            ...options.metadata,
          },
        },
        publishedAt: event.timestamp || new Date(),
        status: "pending",
        retryCount: 0,
      })
      .returning();

    console.log(`[CDC Publisher] Event published: ${event.eventType} ${event.entityType} (ID: ${record.id})`);
    
    // Ensure queue is available (lazy init if needed)
    const queue = await ensureQueue();
    
    // Dispatch to BullMQ queue for async processing
    try {
      await dispatchToQueue(queue, record);
    } catch (error) {
      console.error('[CDC Publisher] Failed to dispatch to queue:', error);
    }
    
    return record;
  }

  /**
   * Publish multiple change events in batch
   */
  async publishBatch(
    events: ChangeEventPayload[], 
    options: PublishOptions = {}
  ): Promise<CDCEventRecord[]> {
    
    if (events.length === 0) {
      return [];
    }

    // Use transaction-aware db if provided, otherwise global db
    const dbClient = options.db || db;
    
    // Map events to insert values
    const values = events.map(event => ({
      tenantId: event.tenantId,
      connectorType: event.connectorType,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      changedFields: event.changedFields,
      eventData: {
        ...event.eventData,
        source: event.source,
        metadata: {
          ...event.metadata,
          ...options.metadata,
        },
      },
      publishedAt: event.timestamp || new Date(),
      status: "pending" as const,
      retryCount: 0,
    }));

    // Batch insert
    const records = await dbClient
      .insert(connectorChangeEvents)
      .values(values)
      .returning();

    console.log(`[CDC Publisher] Batch published: ${records.length} events`);
    
    // Ensure queue is available (lazy init if needed)
    const queue = await ensureQueue();
    
    // Dispatch batch to BullMQ queue for async processing
    try {
      await dispatchBatchToQueue(queue, records);
    } catch (error) {
      console.error('[CDC Publisher] Failed to dispatch batch to queue:', error);
    }
    
    return records;
  }

  /**
   * Check for duplicate events (idempotency guard)
   */
  private async checkDuplicate(
    tenantId: string,
    connectorType: string,
    dedupeKey: string
  ): Promise<CDCEventRecord | null> {
    // For now, simple implementation
    // In production, could use dedupeKey in metadata and index it
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

let publisherInstance: IEventPublisher | null = null;

export function getEventPublisher(): IEventPublisher {
  if (!publisherInstance) {
    publisherInstance = new DatabaseEventPublisher();
  }
  return publisherInstance;
}
