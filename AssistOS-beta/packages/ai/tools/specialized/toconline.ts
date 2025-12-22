// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/_legacy/ai-tools-toconline.ts (303 lines, 11KB)

import { db } from "../../../../apps/api/db";

// TODO: Add toconlineConfig table to schema if it doesn't exist
// import { toconlineConfig } from "../../../../shared/schema";
import { eq } from "drizzle-orm";

// TODO: Migrate TOCOnline client service when needed
// import { TOCOnlineClient } from "../../../../apps/api/services/toconline-client";

/**
 * TOC Online Tools - Execution layer for TOC Online Agent
 * 
 * These functions are called by the TOC Online Agent to perform
 * actual integration operations (save credentials, discover metadata, import data).
 */

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * Execute a TOC Online tool
 */
export async function executeTOCOnlineTool(
  toolName: string,
  args: any,
  tenantId: string
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "configure_credentials": {
        const { clientId, clientSecret, baseUrl = "https://api3.toconline.pt" } = args;

        if (!clientId || !clientSecret) {
          return {
            success: false,
            error: "Client ID and Client Secret are required",
          };
        }

        // Check if config already exists
        const [existingConfig] = await db
          .select()
          .from(toconlineConfig)
          .where(eq(toconlineConfig.tenantId, tenantId))
          .limit(1);

        if (existingConfig) {
          // Update existing config
          await db
            .update(toconlineConfig)
            .set({
              clientId,
              clientSecret,
              baseUrl,
              updatedAt: new Date(),
            })
            .where(eq(toconlineConfig.id, existingConfig.id));

          return {
            success: true,
            message: `✅ Credenciais TOC Online atualizadas com sucesso!\n\nClient ID: ${clientId}\nClient Secret: ****** (guardado de forma segura)\nBase URL: ${baseUrl}\n\n**Próximo passo:** Descobrir metadata com discover_metadata()`,
          };
        } else {
          // Create new config
          const [newConfig] = await db
            .insert(toconlineConfig)
            .values({
              tenantId,
              clientId,
              clientSecret,
              baseUrl,
              setupCompleted: false,
              setupStep: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

          return {
            success: true,
            data: { configId: newConfig.id },
            message: `✅ Credenciais TOC Online guardadas com sucesso!\n\nClient ID: ${clientId}\nClient Secret: ****** (guardado de forma segura)\nBase URL: ${baseUrl}\n\n**Próximo passo:** Descobrir metadata com discover_metadata()`,
          };
        }
      }

      case "discover_metadata": {
        // Get existing config
        const [config] = await db
          .select()
          .from(toconlineConfig)
          .where(eq(toconlineConfig.tenantId, tenantId))
          .limit(1);

        if (!config) {
          return {
            success: false,
            error: "TOC Online não configurado. Execute primeiro configure_credentials()",
          };
        }

        if (!config.clientId || !config.clientSecret || !config.baseUrl) {
          return {
            success: false,
            error: "Client ID, Client Secret ou Base URL não configurados",
          };
        }

        // Create TOC Online client
        const tocClient = new TOCOnlineClient(config.clientId, config.baseUrl, config.clientSecret);

        // Discover taxes
        const taxes = await tocClient.getTaxes();
        console.log(`[TOC Online] Discovered ${taxes.length} taxes`);

        // Discover units of measure
        const units = await tocClient.getUnitsOfMeasure();
        console.log(`[TOC Online] Discovered ${units.length} units`);

        // Discover document series
        const series = await tocClient.getDocumentSeries();
        console.log(`[TOC Online] Discovered ${series.length} document series`);

        // Update config with metadata
        await db
          .update(toconlineConfig)
          .set({
            availableMetadata: {
              taxes,
              unitsOfMeasure: units,
              documentSeries: series,
            },
            metadataDiscoveredAt: new Date(),
            setupStep: 2,
            updatedAt: new Date(),
          })
          .where(eq(toconlineConfig.id, config.id));

        return {
          success: true,
          data: {
            taxes: taxes.length,
            units: units.length,
            series: series.length,
          },
          message: `✅ Metadata descoberta com sucesso!\n\n**Configurações TOC Online:**\n- ${taxes.length} taxas IVA disponíveis\n- ${units.length} unidades de medida\n- ${series.length} séries documentais\n\n**Próximo passo:** Importar dados com import_data()`,
        };
      }

      case "import_data": {
        const { dataType, replaceMode = false } = args;

        if (!dataType) {
          return {
            success: false,
            error: "dataType is required (customers, products, services, or all)",
          };
        }

        // Get existing config
        const [config] = await db
          .select()
          .from(toconlineConfig)
          .where(eq(toconlineConfig.tenantId, tenantId))
          .limit(1);

        if (!config) {
          return {
            success: false,
            error: "TOC Online não configurado. Execute primeiro configure_credentials()",
          };
        }

        if (!config.availableMetadata) {
          return {
            success: false,
            error: "Metadata não descoberta. Execute primeiro discover_metadata()",
          };
        }

        if (!config.clientId || !config.clientSecret || !config.baseUrl) {
          return {
            success: false,
            error: "Client ID, Client Secret ou Base URL não configurados",
          };
        }

        // Import data using TOC Online client
        const tocClient = new TOCOnlineClient(config.clientId, config.baseUrl, config.clientSecret);
        const results: any = {};

        if (dataType === "customers" || dataType === "all") {
          const customers = await tocClient.getCustomers();
          results.customers = {
            imported: customers.length,
            replaceMode,
          };
          console.log(`[TOC Online] Imported ${customers.length} customers (replace=${replaceMode})`);
        }

        if (dataType === "products" || dataType === "all") {
          const products = await tocClient.getProducts();
          results.products = {
            imported: products.length,
            replaceMode,
          };
          console.log(`[TOC Online] Imported ${products.length} products (replace=${replaceMode})`);
        }

        if (dataType === "services" || dataType === "all") {
          const services = await tocClient.getServices();
          results.services = {
            imported: services.length,
            replaceMode,
          };
          console.log(`[TOC Online] Imported ${services.length} services (replace=${replaceMode})`);
        }

        // Mark setup as completed
        await db
          .update(toconlineConfig)
          .set({
            setupCompleted: true,
            setupStep: 5,
            updatedAt: new Date(),
          })
          .where(eq(toconlineConfig.id, config.id));

        const summaryLines = Object.entries(results).map(
          ([type, data]: [string, any]) =>
            `- ${data.imported} ${type} (modo: ${data.replaceMode ? "substituição completa" : "sincronização incremental"})`
        );

        return {
          success: true,
          data: results,
          message: `✅ Importação concluída com sucesso!\n\n**Dados importados do TOC Online:**\n${summaryLines.join("\n")}\n\n🎉 **Integração TOC Online está completa!** Os dados estão agora disponíveis no AssistOS.`,
        };
      }

      case "get_status": {
        const [config] = await db
          .select()
          .from(toconlineConfig)
          .where(eq(toconlineConfig.tenantId, tenantId))
          .limit(1);

        if (!config) {
          return {
            success: true,
            data: {
              configured: false,
            },
            message: "❌ TOC Online não configurado.\n\n**Para começar:** Execute configure_credentials()",
          };
        }

        const status = {
          configured: true,
          clientId: config.clientId,
          baseUrl: config.baseUrl,
          setupCompleted: config.setupCompleted,
          setupStep: config.setupStep,
          hasMetadata: !!config.availableMetadata,
          metadataSummary: config.availableMetadata
            ? {
                taxes: (config.availableMetadata as any).taxes?.length || 0,
                units: (config.availableMetadata as any).unitsOfMeasure?.length || 0,
                series: (config.availableMetadata as any).documentSeries?.length || 0,
              }
            : null,
        };

        const stepNames = [
          "",
          "Credenciais configuradas",
          "Metadata descoberta",
          "Configurações definidas",
          "Dados importados",
          "Setup completo",
        ];

        return {
          success: true,
          data: status,
          message: `📊 **Status da Integração TOC Online:**\n\n✅ Configurado: ${status.configured ? "Sim" : "Não"}\nClient ID: ${status.clientId}\nBase URL: ${status.baseUrl}\n\n**Progresso:** Passo ${status.setupStep}/5 - ${stepNames[status.setupStep]}\n${status.hasMetadata ? `\n**Metadata:**\n- ${status.metadataSummary!.taxes} taxas IVA\n- ${status.metadataSummary!.units} unidades\n- ${status.metadataSummary!.series} séries documentais` : "\n⚠️ Metadata ainda não descoberta"}\n\n${!status.setupCompleted ? "**Próximo passo:** " + (status.setupStep === 1 ? "discover_metadata()" : status.setupStep === 2 ? "import_data()" : "Completar configuração") : "🎉 Setup completo!"}`,
        };
      }

      default:
        return {
          success: false,
          error: `Tool '${toolName}' não reconhecida`,
        };
    }
  } catch (error) {
    console.error(`[TOC Online Tools] Error executing ${toolName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
