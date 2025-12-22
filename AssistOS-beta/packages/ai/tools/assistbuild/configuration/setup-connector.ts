import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { apiIntegrations, documentIntegrations, tenantStorageProviders, providerCredentials } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { encryptCredentials, serializeEncryptedData } from '../../../../../packages/document-management/utils/encryption';
import { z } from 'zod';
import { insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

const inputSchema = z.object({
  connectorType: z.enum(['api', 'document', 'storage']),
  name: z.string().min(1),
  config: z.record(z.any()).optional(),
  credentials: z.record(z.string()).optional(),
  metadata: z.object({
    integrationType: z.string().optional(),
    authType: z.string().optional(),
    baseUrl: z.string().optional(),
    endpoint: z.string().optional(),
    providerType: z.string().optional(),
  }).optional(),
});

export class SetupConnectorTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'setup_connector',
    category: 'configuration',
    description: 'Configures external integration/connector (OAuth, API keys, webhooks)',
    parameters: [
      { name: 'connectorType', type: 'string', description: 'Connector type: api, document, storage', required: true },
      { name: 'name', type: 'string', description: 'Connector name', required: true },
      { name: 'config', type: 'object', description: 'Connector configuration', required: false },
      { name: 'credentials', type: 'object', description: 'Credentials (will be encrypted)', required: false },
      { name: 'metadata', type: 'object', description: 'Type-specific metadata', required: false }
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant-wide connector setup - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: any, context: ToolExecutionContext): Promise<any> {
    try {
      const validated = inputSchema.parse(input);

      let connectorId: string;
      let connectorData: any;

      if (validated.connectorType === 'api') {
        let credentialId: string | null = null;
        
        // Create credential entry in providerCredentials table (same pattern as storage connectors)
        if (validated.credentials) {
          const encrypted = encryptCredentials(validated.credentials, context.tenantId);
          
          const [cred] = await db.insert(providerCredentials).values({
            tenantId: context.tenantId,
            providerType: 'api',
            encryptedData: serializeEncryptedData(encrypted),
            encryptionKeyId: encrypted.keyId,
            isValid: true,
            createdBy: context.userId,
          }).returning();
          
          credentialId = cred.id;
        }

        // Create API integration entry with link to credentials
        const [result] = await db.insert(apiIntegrations).values({
          tenantId: context.tenantId,
          integrationKey: validated.name.toLowerCase().replace(/\s+/g, '_'),
          integrationName: validated.name,
          baseUrl: validated.metadata?.baseUrl || '',
          authType: validated.metadata?.authType || 'bearer',
          authConfig: validated.config,
          endpoints: [],
          secretKeys: validated.credentials ? Object.keys(validated.credentials) : [],
          isActive: true,
          environment: context.environment,
          credentialId,
          createdBy: context.userId,
        }).returning();

        connectorId = result.id;
        connectorData = result;

        // Audit log reflecting both credential and integration creation (tenant schema)
        await insertIntoTenantTable(
          context.tenantId,
          'audit_log',
          {
            tenant_id: context.tenantId,
            actor_user_id: context.userId,
            action: 'connector_created',
            metadata: JSON.stringify({ 
              connectorId, 
              type: 'api', 
              name: validated.name,
              credentialId,
              hasCredentials: !!credentialId
            })
          }
        );

      } else if (validated.connectorType === 'document') {
        let encryptedCreds = null;
        if (validated.credentials) {
          const encrypted = encryptCredentials(validated.credentials, context.tenantId);
          encryptedCreds = serializeEncryptedData(encrypted);
        }

        const [result] = await db.insert(documentIntegrations).values({
          tenantId: context.tenantId,
          name: validated.name,
          integrationType: validated.metadata?.integrationType || 'generic',
          endpoint: validated.metadata?.endpoint,
          credentials: encryptedCreds,
          config: validated.config,
          isActive: true,
          createdBy: context.userId,
        }).returning();

        connectorId = result.id;
        connectorData = result;

        await insertIntoTenantTable(
          context.tenantId,
          'audit_log',
          {
            tenant_id: context.tenantId,
            actor_user_id: context.userId,
            action: 'connector_created',
            metadata: JSON.stringify({ connectorId, type: 'document', name: validated.name })
          }
        );

      } else {
        let credentialId: string | null = null;
        
        if (validated.credentials) {
          const encrypted = encryptCredentials(validated.credentials, context.tenantId);
          
          const [cred] = await db.insert(providerCredentials).values({
            tenantId: context.tenantId,
            providerType: (validated.metadata?.providerType || 'local') as any,
            encryptedData: serializeEncryptedData(encrypted),
            encryptionKeyId: encrypted.keyId,
            isValid: true,
            createdBy: context.userId,
          }).returning();
          
          credentialId = cred.id;
        }

        const [result] = await db.insert(tenantStorageProviders).values({
          tenantId: context.tenantId,
          providerType: (validated.metadata?.providerType || 'local') as any,
          providerName: validated.name,
          isDefault: false,
          isActive: true,
          config: validated.config,
          capabilities: {
            supportsVersioning: false,
            supportsWebhooks: false,
            supportsDeltaSync: false,
          },
          credentialId,
          createdBy: context.userId,
        }).returning();

        connectorId = result.id;
        connectorData = result;

        await insertIntoTenantTable(
          context.tenantId,
          'audit_log',
          {
            tenant_id: context.tenantId,
            actor_user_id: context.userId,
            action: 'connector_created',
            metadata: JSON.stringify({ connectorId, type: 'storage', name: validated.name })
          }
        );
      }

      return {
        success: true,
        connector: {
          id: connectorId,
          type: validated.connectorType,
          name: validated.name,
          isActive: true,
          hasCredentials: !!validated.credentials,
          createdAt: new Date(),
        },
        message: `${validated.connectorType} connector "${validated.name}" configured successfully`
      };

    } catch (error) {
      console.error('[SetupConnectorTool] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to setup connector'
      };
    }
  }
}
