// CDC Event Types and Schemas
// Change Data Capture event definitions for cross-connector sync

import { z } from "zod";

// ============================================================================
// Event Types
// ============================================================================

export type ChangeEventType = 
  | "created"
  | "updated"
  | "deleted"
  | "restored";

export type EntityType =
  | "customer"
  | "supplier"
  | "invoice"
  | "payment"
  | "product"
  | "order"
  | "document"
  | "contact";

export type ConnectorType =
  | "google-document-ai"
  | "toc-online"
  | "moloni"
  | "sap-business-one"
  | "primavera"
  | "sibs-open-banking";

// ============================================================================
// Event Payload Schema
// ============================================================================

export const changeEventPayloadSchema = z.object({
  tenantId: z.string(),
  connectorType: z.string(),
  eventType: z.enum(["created", "updated", "deleted", "restored"]),
  entityType: z.string(),
  entityId: z.string().optional(),
  
  changedFields: z.array(z.string()).optional(),
  eventData: z.record(z.any()),
  
  source: z.string().optional(),
  timestamp: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export type ChangeEventPayload = z.infer<typeof changeEventPayloadSchema>;

// ============================================================================
// Event Record (matches connector_change_events table)
// ============================================================================

export interface CDCEventRecord {
  id: number;
  tenantId: string;
  connectorType: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  changedFields?: any;
  eventData: any;
  publishedAt: Date;
  processedAt?: Date | null;
  retryCount: number;
  status: string;
  errorMessage?: string | null;
  createdAt: Date;
}

// ============================================================================
// Publisher Options
// ============================================================================

export interface PublishOptions {
  priority?: number;
  dedupe?: boolean;
  dedupeKey?: string;
  db?: any; // Database client/transaction
  metadata?: Record<string, any>;
}

// ============================================================================
// Event Publisher Interface
// ============================================================================

export interface IEventPublisher {
  publish(event: ChangeEventPayload, options?: PublishOptions): Promise<CDCEventRecord>;
  publishBatch(events: ChangeEventPayload[], options?: PublishOptions): Promise<CDCEventRecord[]>;
}

// ============================================================================
// Sync Status
// ============================================================================

export type SyncStatus = 
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "paused";

export interface SyncMetrics {
  lastFullSync?: Date;
  lastIncrementalSync?: Date;
  syncStatus: SyncStatus;
  itemsSynced: number;
  itemsFailed: number;
  lastError?: string;
  lastErrorAt?: Date;
  nextScheduledSync?: Date;
}
