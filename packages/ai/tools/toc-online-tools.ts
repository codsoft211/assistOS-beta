// AssistME TOC Online Action Tools
// Tools for performing actions in TOC Online via conversational interface

import { db } from "../../../apps/api/db";
import { 
  tenantConnectorConfigs, 
  invoices, 
  invoiceLines,
  clients
} from "../../../shared/schema";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import { TOCOnlineConnector, type TOCOnlineConfig } from "../../../packages/connectors/toc-online";

export const tocOnlineTools = [
  {
    type: "function" as const,
    function: {
      name: "sync_invoice_to_toc",
      description: "Envia uma fatura do AssistOS para o TOC Online. Cria a fatura no sistema de contabilidade certificado. Exemplo: 'envia a fatura 2024/001 para o TOC' ou 'sincroniza esta fatura com o TOC Online'.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: {
            type: "string",
            description: "ID da fatura no AssistOS"
          },
          invoiceNumber: {
            type: "string",
            description: "Número da fatura (alternativa ao ID)"
          },
          createCustomerIfMissing: {
            type: "boolean",
            description: "Criar cliente no TOC se não existir (default: true)"
          }
        }
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sync_client_to_toc",
      description: "Sincroniza um cliente do AssistOS com o TOC Online. Cria ou atualiza o cliente no sistema de contabilidade. Exemplo: 'sincroniza o cliente XPTO com o TOC' ou 'envia este cliente para o TOC Online'.",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "ID do cliente no AssistOS"
          },
          clientName: {
            type: "string",
            description: "Nome do cliente (alternativa ao ID)"
          },
          updateIfExists: {
            type: "boolean",
            description: "Atualizar cliente se já existir no TOC (default: false)"
          }
        }
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_toc_sync_status",
      description: "Verifica o estado de sincronização de uma entidade com o TOC Online. Mostra se a entidade está sincronizada e quando foi a última sincronização. Exemplo: 'a fatura 2024/001 está no TOC?' ou 'verifica a sincronização do cliente XPTO'.",
      parameters: {
        type: "object",
        properties: {
          entityType: {
            type: "string",
            enum: ["invoice", "client", "product"],
            description: "Tipo de entidade a verificar"
          },
          entityId: {
            type: "string",
            description: "ID da entidade no AssistOS"
          },
          entityReference: {
            type: "string",
            description: "Referência da entidade (número da fatura, nome do cliente, etc.)"
          }
        },
        required: ["entityType"]
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_toc_sync_pending",
      description: "Lista entidades que precisam ser sincronizadas com o TOC Online. Mostra faturas, clientes ou produtos que ainda não foram enviados. Exemplo: 'quais faturas faltam sincronizar?' ou 'o que ainda não está no TOC?'.",
      parameters: {
        type: "object",
        properties: {
          entityType: {
            type: "string",
            enum: ["invoices", "clients", "products", "all"],
            description: "Tipo de entidade (opcional, default: all)"
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 20)"
          }
        }
      },
    },
  },
];

async function getTOCConnector(tenantId: string, environment: string): Promise<{ connector: TOCOnlineConnector; config: any } | null> {
  const config = await db.query.tenantConnectorConfigs.findFirst({
    where: and(
      eq(tenantConnectorConfigs.tenantId, tenantId),
      eq(tenantConnectorConfigs.environment, environment),
      eq(tenantConnectorConfigs.connectorType, "toc-online"),
      eq(tenantConnectorConfigs.isEnabled, true)
    ),
  });

  if (!config) {
    return null;
  }

  const credentials = config.companyCredentials as Record<string, any>;
  const connector = new TOCOnlineConnector();

  const tocConfig: TOCOnlineConfig = {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    oauthUrl: credentials.oauthUrl,
    apiUrl: credentials.apiUrl,
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    tokenExpiresAt: credentials.tokenExpiresAt,
  };

  await connector.configure(tocConfig, {
    tenantId,
    userId: "system",
    connectorId: String(config.id),
  });

  return { connector, config };
}

export async function executeTOCOnlineTool(
  name: string,
  args: any,
  context: { tenantId: string; userId: string; environment?: string }
): Promise<any> {
  const { tenantId } = context;
  const environment = context.environment || "development";

  switch (name) {
    case "sync_invoice_to_toc": {
      const tocResult = await getTOCConnector(tenantId, environment);
      
      if (!tocResult) {
        return {
          success: false,
          error: "TOC Online não configurado",
          message: "Configure primeiro o conector TOC Online nas definições da empresa."
        };
      }

      const { connector } = tocResult;
      
      const status = await connector.getStatus();
      if (status.status !== "active") {
        return {
          success: false,
          error: "TOC Online não conectado",
          message: "Complete o fluxo OAuth do TOC Online primeiro."
        };
      }

      let invoice;
      if (args.invoiceId) {
        invoice = await db.query.invoices.findFirst({
          where: and(
            eq(invoices.id, args.invoiceId),
            eq(invoices.tenantId, tenantId),
            eq(invoices.environment, environment)
          ),
        });
      } else if (args.invoiceNumber) {
        invoice = await db.query.invoices.findFirst({
          where: and(
            eq(invoices.invoiceNumber, args.invoiceNumber),
            eq(invoices.tenantId, tenantId),
            eq(invoices.environment, environment)
          ),
        });
      }

      if (!invoice) {
        return {
          success: false,
          error: "Fatura não encontrada",
          message: "Verifique o ID ou número da fatura."
        };
      }

      const lines = await db.select().from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoice.id));

      const client = invoice.clientId 
        ? await db.query.clients.findFirst({
            where: and(
              eq(clients.id, invoice.clientId),
              eq(clients.tenantId, tenantId),
              eq(clients.environment, environment)
            ),
          })
        : null;

      const tocInvoiceData = {
        type: "invoices" as const,
        attributes: {
          date: invoice.issueDate?.toISOString().split("T")[0],
          due_date: invoice.dueDate?.toISOString().split("T")[0],
          customer_id: client?.toconlineCustomerId || undefined,
          notes: invoice.notes || undefined,
          lines: lines.map(line => ({
            description: line.description,
            quantity: Number(line.quantity),
            unit_price: Number(line.unitPrice),
            tax_rate: Number(line.taxRate) || 23,
          })),
        },
      };

      try {
        const result = await (connector as any).createInvoice?.(tocInvoiceData);

        if (result) {
          await db.update(invoices)
            .set({
              toconlineDocumentId: result.id,
              toconlineSyncedAt: new Date(),
              metadata: {
                ...(invoice.metadata as any || {}),
                tocOnline: {
                  id: result.id,
                  number: result.attributes?.number,
                  syncedAt: new Date().toISOString(),
                }
              }
            })
            .where(eq(invoices.id, invoice.id));

          return {
            success: true,
            tocInvoiceId: result.id,
            tocInvoiceNumber: result.attributes?.number,
            message: `Fatura ${invoice.invoiceNumber} sincronizada com sucesso! Número TOC: ${result.attributes?.number || result.id}`
          };
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          message: `Erro ao sincronizar fatura: ${error.message}`
        };
      }

      return {
        success: false,
        error: "Método createInvoice não disponível",
        message: "O conector TOC Online não suporta criação de faturas neste momento."
      };
    }

    case "sync_client_to_toc": {
      const tocResult = await getTOCConnector(tenantId, environment);
      
      if (!tocResult) {
        return {
          success: false,
          error: "TOC Online não configurado",
          message: "Configure primeiro o conector TOC Online nas definições da empresa."
        };
      }

      const { connector } = tocResult;
      
      const status = await connector.getStatus();
      if (status.status !== "active") {
        return {
          success: false,
          error: "TOC Online não conectado",
          message: "Complete o fluxo OAuth do TOC Online primeiro."
        };
      }

      let client;
      if (args.clientId) {
        client = await db.query.clients.findFirst({
          where: and(
            eq(clients.id, args.clientId),
            eq(clients.tenantId, tenantId),
            eq(clients.environment, environment)
          ),
        });
      } else if (args.clientName) {
        client = await db.query.clients.findFirst({
          where: and(
            eq(clients.name, args.clientName),
            eq(clients.tenantId, tenantId),
            eq(clients.environment, environment)
          ),
        });
      }

      if (!client) {
        return {
          success: false,
          error: "Cliente não encontrado",
          message: "Verifique o ID ou nome do cliente."
        };
      }

      if (client.toconlineCustomerId && !args.updateIfExists) {
        return {
          success: true,
          alreadySynced: true,
          tocCustomerId: client.toconlineCustomerId,
          message: `Cliente ${client.name} já está sincronizado com o TOC Online (ID: ${client.toconlineCustomerId}).`
        };
      }

      try {
        const existingCustomers = await connector.getCustomers();
        const existingCustomer = client.nif 
          ? existingCustomers.find(c => c.attributes.tax_number === client.nif)
          : existingCustomers.find(c => c.attributes.name === client.name);

        if (existingCustomer) {
          await db.update(clients)
            .set({
              toconlineCustomerId: existingCustomer.id,
              toconlineSyncedAt: new Date(),
            })
            .where(eq(clients.id, client.id));

          return {
            success: true,
            linkedToExisting: true,
            tocCustomerId: existingCustomer.id,
            message: `Cliente ${client.name} linkado ao registo existente no TOC Online (ID: ${existingCustomer.id}).`
          };
        }

        return {
          success: false,
          error: "Criação de clientes não implementada",
          message: "O TOC Online ainda não suporta criação de clientes via API. Use o portal TOC Online para criar o cliente manualmente.",
          suggestedAction: "Crie o cliente no TOC Online e depois importe-o para o AssistOS."
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          message: `Erro ao sincronizar cliente: ${error.message}`
        };
      }
    }

    case "check_toc_sync_status": {
      const tocResult = await getTOCConnector(tenantId, environment);
      
      if (!tocResult) {
        return {
          success: false,
          error: "TOC Online não configurado",
          message: "Configure primeiro o conector TOC Online."
        };
      }

      const { entityType, entityId, entityReference } = args;

      if (entityType === "invoice") {
        let invoice;
        if (entityId) {
          invoice = await db.query.invoices.findFirst({
            where: and(
              eq(invoices.id, entityId),
              eq(invoices.tenantId, tenantId),
              eq(invoices.environment, environment)
            ),
          });
        } else if (entityReference) {
          invoice = await db.query.invoices.findFirst({
            where: and(
              eq(invoices.invoiceNumber, entityReference),
              eq(invoices.tenantId, tenantId),
              eq(invoices.environment, environment)
            ),
          });
        }

        if (!invoice) {
          return {
            success: false,
            error: "Fatura não encontrada"
          };
        }

        const isSynced = !!invoice.toconlineDocumentId;
        return {
          success: true,
          entityType: "invoice",
          entityId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          isSynced,
          tocId: invoice.toconlineDocumentId,
          lastSyncAt: invoice.toconlineSyncedAt,
          message: isSynced 
            ? `Fatura ${invoice.invoiceNumber} está sincronizada com TOC Online (ID: ${invoice.toconlineDocumentId})`
            : `Fatura ${invoice.invoiceNumber} NÃO está sincronizada com TOC Online`
        };
      }

      if (entityType === "client") {
        let client;
        if (entityId) {
          client = await db.query.clients.findFirst({
            where: and(
              eq(clients.id, entityId),
              eq(clients.tenantId, tenantId),
              eq(clients.environment, environment)
            ),
          });
        } else if (entityReference) {
          client = await db.query.clients.findFirst({
            where: and(
              eq(clients.name, entityReference),
              eq(clients.tenantId, tenantId),
              eq(clients.environment, environment)
            ),
          });
        }

        if (!client) {
          return {
            success: false,
            error: "Cliente não encontrado"
          };
        }

        const isSynced = !!client.toconlineCustomerId;
        return {
          success: true,
          entityType: "client",
          entityId: client.id,
          clientName: client.name,
          isSynced,
          tocId: client.toconlineCustomerId,
          lastSyncAt: client.toconlineSyncedAt,
          message: isSynced 
            ? `Cliente ${client.name} está sincronizado com TOC Online (ID: ${client.toconlineCustomerId})`
            : `Cliente ${client.name} NÃO está sincronizado com TOC Online`
        };
      }

      return {
        success: false,
        error: "Tipo de entidade não suportado",
        message: "Use 'invoice' ou 'client' como entityType."
      };
    }

    case "list_toc_sync_pending": {
      const tocResult = await getTOCConnector(tenantId, environment);
      
      if (!tocResult) {
        return {
          success: false,
          error: "TOC Online não configurado"
        };
      }

      const entityType = args.entityType || "all";
      const limit = args.limit || 20;
      const pending: any = {};

      if (entityType === "all" || entityType === "invoices") {
        const unsyncedInvoices = await db.select({
          id: invoices.id,
          number: invoices.invoiceNumber,
          clientName: invoices.clientName,
          total: invoices.totalAmount,
          date: invoices.issueDate,
        }).from(invoices)
          .where(and(
            eq(invoices.tenantId, tenantId),
            eq(invoices.environment, environment),
            isNull(invoices.toconlineDocumentId)
          ))
          .orderBy(desc(invoices.issueDate))
          .limit(limit);

        pending.invoices = {
          count: unsyncedInvoices.length,
          items: unsyncedInvoices.map(inv => ({
            id: inv.id,
            number: inv.number,
            client: inv.clientName,
            total: inv.total,
            date: inv.date,
          }))
        };
      }

      if (entityType === "all" || entityType === "clients") {
        const unsyncedClients = await db.select({
          id: clients.id,
          name: clients.name,
          nif: clients.nif,
          email: clients.email,
        }).from(clients)
          .where(and(
            eq(clients.tenantId, tenantId),
            eq(clients.environment, environment),
            isNull(clients.toconlineCustomerId)
          ))
          .limit(limit);

        pending.clients = {
          count: unsyncedClients.length,
          items: unsyncedClients.map(c => ({
            id: c.id,
            name: c.name,
            nif: c.nif,
            email: c.email,
          }))
        };
      }

      const totalPending = Object.values(pending).reduce(
        (sum: number, p: any) => sum + (p?.count || 0), 
        0
      );

      return {
        success: true,
        pending,
        totalPending,
        message: totalPending > 0 
          ? `${totalPending} entidade(s) por sincronizar com TOC Online`
          : "Todas as entidades estão sincronizadas!"
      };
    }

    default:
      throw new Error(`Unknown TOC Online tool: ${name}`);
  }
}
