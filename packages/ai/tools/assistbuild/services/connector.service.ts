import { db } from '../../../../../apps/api/db';
import { apiIntegrations, documentIntegrations, tenantStorageProviders } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';

export interface ConnectorDTO {
  id: string;
  type: 'api' | 'document' | 'storage';
  name: string;
  status: 'active' | 'inactive' | 'error';
  lastSync: Date | null;
  isActive: boolean;
  hasCredentials: boolean;
  linkedModules?: string[];
  metadata?: Record<string, any>;
}

export interface ConnectorSummary {
  connectors: {
    api: ConnectorDTO[];
    document: ConnectorDTO[];
    storage: ConnectorDTO[];
  };
  counts: {
    total: number;
    active: number;
    inactive: number;
    byType: {
      api: number;
      document: number;
      storage: number;
    };
  };
}

export class ConnectorService {
  async getAllConnectors(tenantId: string): Promise<ConnectorSummary> {
    try {
      const [apiConnectors, documentConnectors, storageConnectors] = await Promise.all([
        db.select().from(apiIntegrations).where(eq(apiIntegrations.tenantId, tenantId)),
        db.select().from(documentIntegrations).where(eq(documentIntegrations.tenantId, tenantId)),
        db.select().from(tenantStorageProviders).where(eq(tenantStorageProviders.tenantId, tenantId))
      ]);

      const apiDTOs: ConnectorDTO[] = apiConnectors.map(conn => ({
        id: conn.id,
        type: 'api' as const,
        name: conn.integrationName,
        status: conn.isActive ? 'active' : 'inactive',
        lastSync: null,
        isActive: conn.isActive ?? false,
        hasCredentials: !!(conn.authConfig || conn.secretKeys),
        metadata: {
          integrationKey: conn.integrationKey,
          authType: conn.authType,
          baseUrl: conn.baseUrl,
          environment: conn.environment
        }
      }));

      const documentDTOs: ConnectorDTO[] = documentConnectors.map(conn => ({
        id: conn.id,
        type: 'document' as const,
        name: conn.name,
        status: conn.isActive ? 'active' : 'inactive',
        lastSync: conn.lastSync,
        isActive: conn.isActive,
        hasCredentials: !!conn.credentials,
        metadata: {
          integrationType: conn.integrationType,
          endpoint: conn.endpoint
        }
      }));

      const storageDTOs: ConnectorDTO[] = storageConnectors.map(conn => ({
        id: conn.id,
        type: 'storage' as const,
        name: conn.providerName,
        status: conn.isActive ? 'active' : 'inactive',
        lastSync: conn.lastSyncAt,
        isActive: conn.isActive,
        hasCredentials: !!conn.credentialId,
        metadata: {
          providerType: conn.providerType,
          isDefault: conn.isDefault,
          lastSyncStatus: conn.lastSyncStatus
        }
      }));

      const allConnectors = [...apiDTOs, ...documentDTOs, ...storageDTOs];
      const activeCount = allConnectors.filter(c => c.isActive).length;
      const inactiveCount = allConnectors.filter(c => !c.isActive).length;

      return {
        connectors: {
          api: apiDTOs,
          document: documentDTOs,
          storage: storageDTOs
        },
        counts: {
          total: allConnectors.length,
          active: activeCount,
          inactive: inactiveCount,
          byType: {
            api: apiDTOs.length,
            document: documentDTOs.length,
            storage: storageDTOs.length
          }
        }
      };
    } catch (error) {
      console.error('[ConnectorService] Error fetching connectors:', error);
      throw new Error('Failed to fetch connectors');
    }
  }

  async getConnectorById(connectorId: string, type: 'api' | 'document' | 'storage'): Promise<ConnectorDTO | null> {
    try {
      if (type === 'api') {
        const [connector] = await db.select().from(apiIntegrations).where(eq(apiIntegrations.id, connectorId)).limit(1);
        if (!connector) return null;
        return {
          id: connector.id,
          type: 'api',
          name: connector.integrationName,
          status: connector.isActive ? 'active' : 'inactive',
          lastSync: null,
          isActive: connector.isActive ?? false,
          hasCredentials: !!(connector.authConfig || connector.secretKeys),
          metadata: {
            integrationKey: connector.integrationKey,
            authType: connector.authType,
            baseUrl: connector.baseUrl
          }
        };
      } else if (type === 'document') {
        const [connector] = await db.select().from(documentIntegrations).where(eq(documentIntegrations.id, connectorId)).limit(1);
        if (!connector) return null;
        return {
          id: connector.id,
          type: 'document',
          name: connector.name,
          status: connector.isActive ? 'active' : 'inactive',
          lastSync: connector.lastSync,
          isActive: connector.isActive,
          hasCredentials: !!connector.credentials,
          metadata: {
            integrationType: connector.integrationType
          }
        };
      } else {
        const [connector] = await db.select().from(tenantStorageProviders).where(eq(tenantStorageProviders.id, connectorId)).limit(1);
        if (!connector) return null;
        return {
          id: connector.id,
          type: 'storage',
          name: connector.providerName,
          status: connector.isActive ? 'active' : 'inactive',
          lastSync: connector.lastSyncAt,
          isActive: connector.isActive,
          hasCredentials: !!connector.credentialId,
          metadata: {
            providerType: connector.providerType
          }
        };
      }
    } catch (error) {
      console.error('[ConnectorService] Error fetching connector by ID:', error);
      return null;
    }
  }
}

export const connectorService = new ConnectorService();
