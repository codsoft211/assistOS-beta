// CDC Event Recorder API
// Simplified helper to record domain changes without coupling to publisher

import { getEventPublisher } from "./publisher";
import type { ChangeEventPayload, PublishOptions } from "./types";

/**
 * Record a single change event
 * 
 * Usage:
 * ```ts
 * await recordChange({
 *   tenantId: 'tenant-123',
 *   connectorType: 'moloni',
 *   eventType: 'created',
 *   entityType: 'invoice',
 *   entityId: 'INV-001',
 *   eventData: { ... },
 *   source: 'invoice-service'
 * });
 * ```
 */
export async function recordChange(
  event: ChangeEventPayload,
  options?: PublishOptions
) {
  const publisher = getEventPublisher();
  return await publisher.publish(event, options);
}

/**
 * Record multiple change events in batch
 * 
 * Usage:
 * ```ts
 * await recordChangeBatch([
 *   { tenantId, connectorType, eventType: 'created', entityType: 'customer', ... },
 *   { tenantId, connectorType, eventType: 'updated', entityType: 'invoice', ... },
 * ]);
 * ```
 */
export async function recordChangeBatch(
  events: ChangeEventPayload[],
  options?: PublishOptions
) {
  const publisher = getEventPublisher();
  return await publisher.publishBatch(events, options);
}
