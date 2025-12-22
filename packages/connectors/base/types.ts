import type { IConnector } from './connector-interface';

// Note: google_document_ai exists as a type but is NOT a tenant connector - it's a platform service
// It should NEVER be registered in ConnectorRegistry or shown in UI
export type ConnectorType = 
  | 'google_document_ai'  // Platform service - DO NOT show in UI
  | 'open_banking' 
  | 'toc_online' 
  | 'moloni' 
  | 'sap_b1' 
  | 'primavera';

export type ConnectorConstructor = new () => IConnector;

export type ConnectorCapability = 
  | 'ocr' 
  | 'banking' 
  | 'accounting' 
  | 'invoicing' 
  | 'erp_sync';

export type ConnectorStatus = 'active' | 'paused' | 'error' | 'disabled';

export type SyncType = 'full' | 'incremental' | 'manual';

export type SyncStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type CredentialType = 'oauth2' | 'api_key' | 'basic_auth' | 'service_account';

export interface ConnectorContext {
  tenantId: string;
  userId: string;
  connectorId: string;
}

export interface ConnectorConfig {
  [key: string]: any;
}

export interface SyncOptions {
  syncType?: SyncType;
  batchSize?: number;
  filters?: Record<string, any>;
}

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsFailed: number;
  duration: number;
  errors?: Array<{ 
    record?: any; 
    error: string;
  }>;
}

export interface ConnectorMetadata {
  type: ConnectorType;
  name: string;
  description: string;
  capabilities: ConnectorCapability[];
  authType: CredentialType;
  version?: string;
  isAvailable: boolean;
}

export interface ConnectorStatusResponse {
  connectorId: string;
  status: ConnectorStatus;
  lastSyncAt?: Date;
  lastSyncStatus?: string;
  lastSyncError?: string;
  config?: ConnectorConfig;
  metadata?: Record<string, any>;
}
