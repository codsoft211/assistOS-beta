import type {
  ConnectorType,
  ConnectorCapability,
  ConnectorContext,
  ConnectorConfig,
  SyncOptions,
  SyncResult,
  ConnectorStatusResponse,
  CredentialType,
} from './types';

export interface IConnector {
  type: ConnectorType;
  name: string;
  description: string;
  capabilities: ConnectorCapability[];
  authType: CredentialType;
  
  configure(config: ConnectorConfig, context: ConnectorContext): Promise<void>;
  
  testConnection(): Promise<boolean>;
  
  disconnect(): Promise<void>;
  
  sync(options?: SyncOptions): Promise<SyncResult>;
  
  getStatus(): Promise<ConnectorStatusResponse>;
}
