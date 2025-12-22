// AssistBuild Connector Configuration Tools
// Tools for tenant-level connector configuration via AssistBuild agent

import { db } from "../../../apps/api/db";
import { tenantConnectorConfigs, importRuns, erpFieldMappings, insertTenantConnectorConfigSchema } from "../../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { connectorRegistry } from "../../../packages/connectors/base/connector-registry";
import { processConnectorImport } from "../../../apps/api/services/connector-import-service";
import { nanoid } from "nanoid";

interface ConnectorFieldMapping {
  sourceField: string;
  targetField: string;
  transform?: string;
  defaultValue?: string;
}

/**
 * Connector Tools for AssistBuild
 * These tools allow AssistBuild to configure tenant-level connectors
 */
export const connectorTools = [
  {
    type: "function" as const,
    function: {
      name: "list_available_connectors",
      description: "Lista todos os conectores disponíveis para integração (Google Document AI, TOC Online, Moloni, SAP Business One, Primavera, SIBS). Use esta tool para mostrar ao Admin quais integrações estão disponíveis.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filtrar por categoria (opcional): 'document-processing', 'accounting', 'invoicing', 'erp', 'banking'",
            enum: ["document-processing", "accounting", "invoicing", "erp", "banking"]
          }
        }
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "configure_tenant_connector",
      description: "Configura um conector a nível de empresa (tenant-level). Esta operação requer credenciais da empresa (API keys, OAuth client credentials). Use depois de obter as credenciais do Admin.",
      parameters: {
        type: "object",
        properties: {
          connectorType: {
            type: "string",
            description: "Tipo de conector",
            enum: [
              "google-document-ai",
              "toc-online",
              "moloni",
              "sap-business-one",
              "primavera",
              "sibs-open-banking"
            ]
          },
          companyCredentials: {
            type: "object",
            description: "Credenciais da empresa para o conector. Estrutura varia por tipo de conector.",
            properties: {
              name: {
                type: "string",
                description: "Nome amigável para esta configuração (ex: 'Conta Moloni Principal')"
              }
            },
            required: ["name"]
          },
          isEnabled: {
            type: "boolean",
            description: "Se o conector está ativo (default: true)"
          }
        },
        required: ["connectorType", "companyCredentials"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "test_connector_connection",
      description: "Testa a conexão de um conector já configurado. Use para verificar se as credenciais estão corretas.",
      parameters: {
        type: "object",
        properties: {
          connectorId: {
            type: "number",
            description: "ID do conector configurado"
          }
        },
        required: ["connectorId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_tenant_connectors",
      description: "Lista todos os conectores configurados para o tenant atual. Use para verificar quais integrações já estão ativas.",
      parameters: {
        type: "object",
        properties: {
          includeDisabled: {
            type: "boolean",
            description: "Incluir conectores desativados (default: false)"
          }
        }
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_tenant_connector",
      description: "Atualiza credenciais ou configuração de um conector existente.",
      parameters: {
        type: "object",
        properties: {
          connectorId: {
            type: "number",
            description: "ID do conector a atualizar"
          },
          companyCredentials: {
            type: "object",
            description: "Novas credenciais da empresa (campos variam por tipo)"
          },
          isEnabled: {
            type: "boolean",
            description: "Ativar/desativar o conector"
          }
        },
        required: ["connectorId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_tenant_connector",
      description: "Remove a configuração de um conector. CUIDADO: Isto também desconecta todos os users que usam este conector.",
      parameters: {
        type: "object",
        properties: {
          connectorId: {
            type: "number",
            description: "ID do conector a remover"
          },
          confirm: {
            type: "boolean",
            description: "Confirmação de remoção (deve ser true)"
          }
        },
        required: ["connectorId", "confirm"],
      },
    },
  },
  // ============ IMPORT TOOLS (AssistBuild) ============
  {
    type: "function" as const,
    function: {
      name: "import_from_connector",
      description: "Importa dados de um conector externo (TOC Online, Moloni, etc.) para o AssistOS. Use para importar clientes, produtos, serviços ou faturas. Exemplo: 'importa os clientes do TOC Online' ou 'quero importar os produtos e serviços do Moloni'.",
      parameters: {
        type: "object",
        properties: {
          connectorId: {
            type: "number",
            description: "ID do conector de onde importar (use get_tenant_connectors para listar)"
          },
          entityTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ["customers", "products", "services", "invoices", "payments", "taxes", "contacts"]
            },
            description: "Tipos de entidade a importar: customers (clientes), products (produtos), services (serviços), invoices (faturas)"
          },
          skipDuplicates: {
            type: "boolean",
            description: "Ignorar registos que já existem no AssistOS (default: true)"
          },
          updateExisting: {
            type: "boolean",
            description: "Atualizar registos existentes com dados novos (default: false)"
          },
          dryRun: {
            type: "boolean",
            description: "Simular importação sem guardar dados (default: false)"
          }
        },
        required: ["connectorId", "entityTypes"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "configure_field_mapping",
      description: "Configura o mapeamento de campos entre o sistema externo e o AssistOS. Use para definir como campos do TOC Online/Moloni correspondem aos campos do AssistOS. Exemplo: 'mapeia o campo tax_number do TOC para NIF no AssistOS'.",
      parameters: {
        type: "object",
        properties: {
          connectorId: {
            type: "number",
            description: "ID do conector"
          },
          entityType: {
            type: "string",
            enum: ["customers", "products", "services", "invoices"],
            description: "Tipo de entidade para o mapeamento"
          },
          mappings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sourceField: {
                  type: "string",
                  description: "Nome do campo no sistema externo"
                },
                targetField: {
                  type: "string",
                  description: "Nome do campo no AssistOS"
                },
                transform: {
                  type: "string",
                  enum: ["none", "uppercase", "lowercase", "trim", "parse_date", "parse_number"],
                  description: "Transformação a aplicar (opcional)"
                },
                defaultValue: {
                  type: "string",
                  description: "Valor por defeito se campo vazio (opcional)"
                }
              },
              required: ["sourceField", "targetField"]
            },
            description: "Lista de mapeamentos de campos"
          }
        },
        required: ["connectorId", "entityType", "mappings"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_import_history",
      description: "Lista o histórico de importações realizadas. Use para ver importações passadas, seu estado, e quantos registos foram importados. Exemplo: 'mostra as últimas importações' ou 'qual foi o resultado da última importação do TOC?'.",
      parameters: {
        type: "object",
        properties: {
          connectorId: {
            type: "number",
            description: "Filtrar por conector específico (opcional)"
          },
          status: {
            type: "string",
            enum: ["pending", "running", "completed", "partial", "failed"],
            description: "Filtrar por estado (opcional)"
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 10)"
          }
        }
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_field_mappings",
      description: "Obtém os mapeamentos de campos configurados para um conector e tipo de entidade. Use para ver como os campos estão mapeados atualmente.",
      parameters: {
        type: "object",
        properties: {
          connectorId: {
            type: "number",
            description: "ID do conector"
          },
          entityType: {
            type: "string",
            enum: ["customers", "products", "services", "invoices"],
            description: "Tipo de entidade (opcional - se omitido, retorna todos)"
          }
        },
        required: ["connectorId"],
      },
    },
  },
];

/**
 * Execute connector configuration tool
 */
export async function executeConnectorTool(
  name: string,
  args: any,
  context: { tenantId: string; userId: string; environment?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const environment = context.environment || "development";

  switch (name) {
    case "list_available_connectors": {
      const availableConnectors = connectorRegistry.listAvailable();
      
      let connectors = availableConnectors.map(conn => getConnectorMetadata(conn.type));
      
      // Filter by category if provided
      if (args.category) {
        connectors = connectors.filter(c => c.category === args.category);
      }
      
      return {
        success: true,
        connectors,
        message: `Encontrados ${connectors.length} conectores disponíveis`
      };
    }

    case "configure_tenant_connector": {
      try {
        const validatedData = insertTenantConnectorConfigSchema.parse({
          tenantId,
          environment,
          connectorType: args.connectorType,
          companyCredentials: args.companyCredentials,
          isEnabled: args.isEnabled ?? true,
          enabledBy: userId,
        });

        const [created] = await db.insert(tenantConnectorConfigs)
          .values(validatedData)
          .returning();

        return {
          success: true,
          connector: created,
          message: `Conector ${args.connectorType} configurado com sucesso! Os users podem agora conectar as suas contas pessoais em Settings.`
        };
      } catch (error: any) {
        if (error.code === '23505') {
          return {
            success: false,
            error: "Este conector já está configurado para a empresa",
            message: "Use 'update_tenant_connector' para atualizar as credenciais."
          };
        }
        throw error;
      }
    }

    case "test_connector_connection": {
      const [config] = await db.select().from(tenantConnectorConfigs)
        .where(and(
          eq(tenantConnectorConfigs.id, args.connectorId),
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.environment, environment)
        ))
        .limit(1);

      if (!config) {
        return {
          success: false,
          error: "Conector não encontrado",
          message: "Verifique o ID do conector."
        };
      }

      const connector = connectorRegistry.get(config.connectorType as any);
      if (!connector) {
        return {
          success: false,
          error: `Tipo de conector '${config.connectorType}' não encontrado no registry`
        };
      }

      try {
        await connector.configure(config.companyCredentials as any, { tenantId, userId, connectorId: String(config.id) });
        const success = await connector.testConnection();
        
        return {
          success,
          message: success 
            ? "✅ Conexão testada com sucesso! O conector está funcional."
            : "❌ Falha ao testar conexão. Verifique as credenciais.",
          connector: {
            type: config.connectorType,
            name: (config.companyCredentials as any).name
          }
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          message: "Erro ao testar conexão. Verifique as credenciais fornecidas."
        };
      }
    }

    case "get_tenant_connectors": {
      let query = db.select().from(tenantConnectorConfigs)
        .where(and(
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.environment, environment)
        ));

      const configs = await query;

      const filtered = args.includeDisabled 
        ? configs 
        : configs.filter(c => c.isEnabled);

      return {
        success: true,
        connectors: filtered.map(c => ({
          id: c.id,
          type: c.connectorType,
          name: (c.companyCredentials as any).name,
          isEnabled: c.isEnabled,
          configuredAt: c.createdAt,
          lastUpdated: c.updatedAt
        })),
        message: `${filtered.length} conector(es) configurado(s)`
      };
    }

    case "update_tenant_connector": {
      const [existing] = await db.select().from(tenantConnectorConfigs)
        .where(and(
          eq(tenantConnectorConfigs.id, args.connectorId),
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.environment, environment)
        ))
        .limit(1);

      if (!existing) {
        return {
          success: false,
          error: "Conector não encontrado"
        };
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (args.companyCredentials) {
        updateData.companyCredentials = args.companyCredentials;
      }

      if (args.isEnabled !== undefined) {
        updateData.isEnabled = args.isEnabled;
      }

      const [updated] = await db.update(tenantConnectorConfigs)
        .set(updateData)
        .where(eq(tenantConnectorConfigs.id, args.connectorId))
        .returning();

      return {
        success: true,
        connector: updated,
        message: "Conector atualizado com sucesso!"
      };
    }

    case "remove_tenant_connector": {
      if (!args.confirm) {
        return {
          success: false,
          error: "Confirmação necessária",
          message: "Para remover um conector, passe 'confirm: true'."
        };
      }

      const [existing] = await db.select().from(tenantConnectorConfigs)
        .where(and(
          eq(tenantConnectorConfigs.id, args.connectorId),
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.environment, environment)
        ))
        .limit(1);

      if (!existing) {
        return {
          success: false,
          error: "Conector não encontrado"
        };
      }

      await db.delete(tenantConnectorConfigs)
        .where(and(
          eq(tenantConnectorConfigs.id, args.connectorId),
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.environment, environment)
        ));

      return {
        success: true,
        message: `Conector ${existing.connectorType} removido. Todos os users foram desconectados.`
      };
    }

    // ============ IMPORT TOOLS ============
    case "import_from_connector": {
      const config = await db.query.tenantConnectorConfigs.findFirst({
        where: and(
          eq(tenantConnectorConfigs.id, args.connectorId),
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.environment, environment)
        ),
      });

      if (!config) {
        return {
          success: false,
          error: "Conector não encontrado",
          message: "Use 'get_tenant_connectors' para ver os conectores disponíveis."
        };
      }

      if (!config.isEnabled) {
        return {
          success: false,
          error: "Conector está desativado",
          message: "Ative o conector primeiro com 'update_tenant_connector'."
        };
      }

      const entityTypes = args.entityTypes || ["customers"];
      const preferences = {
        skipDuplicates: args.skipDuplicates ?? true,
        updateExisting: args.updateExisting ?? false,
        dryRun: args.dryRun ?? false,
      };

      const importRunId = nanoid();

      const [importRun] = await db.insert(importRuns).values({
        id: importRunId,
        tenantId,
        environment,
        connectorConfigId: args.connectorId,
        connectorType: config.connectorType,
        entityTypes,
        status: "running",
        preferences,
        startedBy: userId,
        startedAt: new Date(),
        progressMessage: "A iniciar importação via AssistBuild...",
        progressPercent: 0,
      }).returning();

      processConnectorImport({
        importRunId,
        tenantId,
        environment,
        connectorType: config.connectorType,
        connectorConfigId: args.connectorId,
        entityTypes,
        preferences,
      }).catch(err => {
        console.error(`[Import Tool] Background import ${importRunId} failed:`, err);
      });

      const entityLabels = entityTypes.map((t: string) => getEntityLabel(t)).join(", ");

      return {
        success: true,
        importId: importRunId,
        connector: {
          id: config.id,
          type: config.connectorType,
          name: (config.companyCredentials as any)?.name
        },
        entityTypes,
        preferences,
        message: `Importação iniciada! A importar ${entityLabels} do ${config.connectorType}. Use 'list_import_history' para acompanhar o progresso.`
      };
    }

    case "configure_field_mapping": {
      const config = await db.query.tenantConnectorConfigs.findFirst({
        where: and(
          eq(tenantConnectorConfigs.id, args.connectorId),
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.environment, environment)
        ),
      });

      if (!config) {
        return {
          success: false,
          error: "Conector não encontrado"
        };
      }

      const erpConnectionId = `${tenantId}-${environment}-${args.connectorId}`;

      await db.delete(erpFieldMappings)
        .where(and(
          eq(erpFieldMappings.erpConnectionId, erpConnectionId),
          eq(erpFieldMappings.entityType, args.entityType)
        ));

      const mappingRecords = args.mappings.map((m: ConnectorFieldMapping) => ({
        id: nanoid(),
        erpConnectionId,
        entityType: args.entityType,
        ourField: m.targetField,
        erpField: m.sourceField,
        source: config.connectorType,
        dataType: "string",
        isRequired: false,
        transformation: m.transform || null,
        isValidated: false,
      }));

      if (mappingRecords.length > 0) {
        await db.insert(erpFieldMappings).values(mappingRecords);
      }

      return {
        success: true,
        connectorId: args.connectorId,
        entityType: args.entityType,
        fieldCount: args.mappings.length,
        message: `Mapeamento configurado! ${args.mappings.length} campos para ${getEntityLabel(args.entityType)}.`
      };
    }

    case "list_import_history": {
      let conditions: any[] = [
        eq(importRuns.tenantId, tenantId),
        eq(importRuns.environment, environment)
      ];

      if (args.connectorId) {
        conditions.push(eq(importRuns.connectorConfigId, args.connectorId));
      }

      if (args.status) {
        conditions.push(eq(importRuns.status, args.status));
      }

      const runs = await db.select().from(importRuns)
        .where(and(...conditions))
        .orderBy(desc(importRuns.createdAt))
        .limit(args.limit || 10);

      if (runs.length === 0) {
        return {
          success: true,
          imports: [],
          message: "Nenhuma importação encontrada."
        };
      }

      return {
        success: true,
        imports: runs.map(run => ({
          id: run.id,
          connector: run.connectorType,
          status: run.status,
          entityTypes: run.entityTypes,
          total: run.totalItems || 0,
          success: run.successItems || 0,
          failed: run.failedItems || 0,
          skipped: run.skippedItems || 0,
          progress: run.progressPercent || 0,
          message: run.progressMessage,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
        })),
        message: `${runs.length} importação(ões) encontrada(s).`
      };
    }

    case "get_field_mappings": {
      const config = await db.query.tenantConnectorConfigs.findFirst({
        where: and(
          eq(tenantConnectorConfigs.id, args.connectorId),
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.environment, environment)
        ),
      });

      if (!config) {
        return {
          success: false,
          error: "Conector não encontrado"
        };
      }

      const erpConnectionId = `${tenantId}-${environment}-${args.connectorId}`;

      let conditions: any[] = [eq(erpFieldMappings.erpConnectionId, erpConnectionId)];
      if (args.entityType) {
        conditions.push(eq(erpFieldMappings.entityType, args.entityType));
      }

      const dbMappings = await db.select().from(erpFieldMappings)
        .where(and(...conditions))
        .orderBy(erpFieldMappings.entityType);

      if (dbMappings.length === 0) {
        if (args.entityType) {
          return {
            success: true,
            entityType: args.entityType,
            mappings: [],
            message: "Nenhum mapeamento personalizado. O sistema usa mapeamentos padrão.",
            defaultMappings: getDefaultMappings(config.connectorType, args.entityType)
          };
        }
        return {
          success: true,
          mappings: {},
          message: "Nenhum mapeamento configurado. O sistema usa mapeamentos padrão.",
          defaultMappings: getDefaultMappings(config.connectorType)
        };
      }

      const storedMappings: Record<string, any[]> = {};
      for (const m of dbMappings) {
        if (!storedMappings[m.entityType]) {
          storedMappings[m.entityType] = [];
        }
        storedMappings[m.entityType].push({
          sourceField: m.erpField,
          targetField: m.ourField,
          transform: m.transformation,
        });
      }

      if (args.entityType) {
        const entityMappings = storedMappings[args.entityType] || [];
        return {
          success: true,
          entityType: args.entityType,
          mappings: entityMappings,
          message: `${entityMappings.length} mapeamento(s) configurado(s) para ${getEntityLabel(args.entityType)}.`
        };
      }

      const entityTypes = Object.keys(storedMappings);
      return {
        success: true,
        mappings: storedMappings,
        entityTypes,
        message: `Mapeamentos configurados para: ${entityTypes.map(t => getEntityLabel(t)).join(", ")}.`
      };
    }

    default:
      throw new Error(`Unknown connector tool: ${name}`);
  }
}

function getEntityLabel(entityType: string): string {
  const labels: Record<string, string> = {
    customers: "Clientes",
    products: "Produtos",
    services: "Serviços",
    invoices: "Faturas",
    payments: "Pagamentos",
    taxes: "Impostos",
    contacts: "Contactos",
  };
  return labels[entityType] || entityType;
}

function getDefaultMappings(connectorType: string, entityType?: string): Record<string, any[]> {
  const tocOnlineMappings: Record<string, any[]> = {
    customers: [
      { sourceField: "attributes.name", targetField: "name" },
      { sourceField: "attributes.tax_number", targetField: "nif" },
      { sourceField: "attributes.email", targetField: "email" },
      { sourceField: "attributes.phone", targetField: "phone" },
      { sourceField: "attributes.address", targetField: "address" },
      { sourceField: "attributes.city", targetField: "city" },
      { sourceField: "attributes.postal_code", targetField: "postalCode" },
    ],
    products: [
      { sourceField: "attributes.name", targetField: "name" },
      { sourceField: "attributes.code", targetField: "code" },
      { sourceField: "attributes.description", targetField: "description" },
      { sourceField: "attributes.unit_price", targetField: "price" },
      { sourceField: "attributes.tax_rate", targetField: "taxRate" },
    ],
    services: [
      { sourceField: "attributes.name", targetField: "name" },
      { sourceField: "attributes.code", targetField: "code" },
      { sourceField: "attributes.description", targetField: "description" },
      { sourceField: "attributes.unit_price", targetField: "price" },
      { sourceField: "attributes.tax_rate", targetField: "taxRate" },
    ],
  };

  if (connectorType === "toc-online") {
    if (entityType) {
      return { [entityType]: tocOnlineMappings[entityType] || [] };
    }
    return tocOnlineMappings;
  }

  return {};
}

// Helper: Get connector metadata
function getConnectorMetadata(type: string) {
  const metadata: Record<string, any> = {
    'google-document-ai': {
      type,
      name: 'Google Document AI',
      description: 'Advanced OCR for Portuguese fiscal documents (invoices, receipts, credit notes)',
      category: 'document-processing',
      requiresOAuth: false,
      requiredFields: [
        { name: 'projectId', description: 'Google Cloud Project ID', type: 'string' },
        { name: 'location', description: 'Processor location (eu, us)', type: 'string', default: 'eu' },
        { name: 'processorId', description: 'Document AI Processor ID', type: 'string' },
        { name: 'credentials', description: 'Service Account JSON credentials', type: 'object' }
      ]
    },
    'toc-online': {
      type,
      name: 'TOC Online',
      description: 'Portuguese certified accounting platform integration',
      category: 'accounting',
      requiresOAuth: false,
      requiredFields: [
        { name: 'apiKey', description: 'TOC Online API key', type: 'string' },
        { name: 'environment', description: 'Environment (production, sandbox)', type: 'string', default: 'production' }
      ]
    },
    'moloni': {
      type,
      name: 'Moloni',
      description: 'Portuguese invoicing/billing system with OAuth 2.0',
      category: 'invoicing',
      requiresOAuth: true,
      requiredFields: [
        { name: 'clientId', description: 'Moloni OAuth Client ID', type: 'string' },
        { name: 'clientSecret', description: 'Moloni OAuth Client Secret', type: 'string' }
      ]
    },
    'sap-business-one': {
      type,
      name: 'SAP Business One',
      description: 'International ERP system via Service Layer REST API',
      category: 'erp',
      requiresOAuth: false,
      requiredFields: [
        { name: 'serviceLayerUrl', description: 'SAP Service Layer URL', type: 'string' },
        { name: 'companyDB', description: 'Company database name', type: 'string' },
        { name: 'username', description: 'SAP username', type: 'string' },
        { name: 'password', description: 'SAP password', type: 'string' }
      ]
    },
    'primavera': {
      type,
      name: 'Primavera ERP',
      description: 'Portuguese ERP system with OAuth 2.0',
      category: 'erp',
      requiresOAuth: true,
      requiredFields: [
        { name: 'clientId', description: 'Primavera OAuth Client ID', type: 'string' },
        { name: 'clientSecret', description: 'Primavera OAuth Client Secret', type: 'string' },
        { name: 'subscriptionKey', description: 'API subscription key', type: 'string' },
        { name: 'company', description: 'Company code', type: 'string' },
        { name: 'instance', description: 'Instance name', type: 'string' }
      ]
    },
    'sibs-open-banking': {
      type,
      name: 'SIBS Open Banking',
      description: 'Portuguese banking integration (Berlin Group PSD2 compliant)',
      category: 'banking',
      requiresOAuth: true,
      requiredFields: [
        { name: 'clientId', description: 'SIBS OAuth Client ID', type: 'string' },
        { name: 'clientSecret', description: 'SIBS OAuth Client Secret', type: 'string' },
        { name: 'tppId', description: 'Third Party Provider ID', type: 'string' }
      ],
      status: 'paused',
      statusMessage: 'Conector pausado, necessita refinamento'
    }
  };

  return metadata[type] || {
    type,
    name: type,
    description: `Connector for ${type}`,
    category: 'other',
    requiresOAuth: false,
    requiredFields: []
  };
}
