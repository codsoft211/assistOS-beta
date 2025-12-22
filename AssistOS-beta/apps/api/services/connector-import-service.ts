import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { importRuns, importItems, tenantConnectorConfigs, clients, products } from "@shared/schema";
import { TOCOnlineConnector, type TOCOnlineConfig } from "../../../packages/connectors/toc-online";

interface ImportJobData {
  importRunId: string;
  tenantId: string;
  environment: string;
  connectorType: string;
  connectorConfigId: number;
  entityTypes: string[];
  preferences?: {
    skipDuplicates?: boolean;
    updateExisting?: boolean;
    dryRun?: boolean;
  };
}

interface ImportProgress {
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  skippedItems: number;
}

export async function processConnectorImport(data: ImportJobData): Promise<void> {
  const { importRunId, tenantId, environment, connectorType, connectorConfigId, entityTypes, preferences } = data;

  console.log(`[Import Service] Starting import ${importRunId} for ${connectorType}`);

  await db.update(importRuns)
    .set({
      status: "running",
      startedAt: new Date(),
      progressMessage: "A iniciar importação...",
      progressPercent: 0,
    })
    .where(eq(importRuns.id, importRunId));

  const progress: ImportProgress = {
    totalItems: 0,
    processedItems: 0,
    successItems: 0,
    failedItems: 0,
    skippedItems: 0,
  };

  const errorLog: Array<{ entityType: string; externalId: string; error: string; timestamp: string }> = [];

  try {
    const config = await db.query.tenantConnectorConfigs.findFirst({
      where: and(
        eq(tenantConnectorConfigs.id, connectorConfigId),
        eq(tenantConnectorConfigs.tenantId, tenantId)
      ),
    });

    if (!config) {
      throw new Error("Connector configuration not found");
    }

    const credentials = config.companyCredentials as Record<string, any>;

    if (connectorType === "toc-online") {
      await processTOCOnlineImport(
        importRunId,
        tenantId,
        environment,
        credentials,
        entityTypes,
        preferences,
        progress,
        errorLog
      );
    } else {
      throw new Error(`Unsupported connector type: ${connectorType}`);
    }

    const finalStatus = errorLog.length > 0 && progress.successItems > 0 ? "partial" : 
                        errorLog.length > 0 ? "failed" : "completed";

    await db.update(importRuns)
      .set({
        status: finalStatus,
        completedAt: new Date(),
        totalItems: progress.totalItems,
        processedItems: progress.processedItems,
        successItems: progress.successItems,
        failedItems: progress.failedItems,
        skippedItems: progress.skippedItems,
        progressPercent: 100,
        progressMessage: finalStatus === "completed" 
          ? `Importação concluída: ${progress.successItems} itens importados`
          : `Importação ${finalStatus === "partial" ? "parcial" : "falhou"}: ${progress.successItems} sucesso, ${progress.failedItems} erros`,
        errorLog: errorLog.length > 0 ? errorLog : null,
      })
      .where(eq(importRuns.id, importRunId));

    console.log(`[Import Service] Import ${importRunId} completed: ${progress.successItems} success, ${progress.failedItems} failed`);

  } catch (error) {
    console.error(`[Import Service] Import ${importRunId} failed:`, error);

    await db.update(importRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        progressMessage: `Erro: ${(error as Error).message}`,
        errorLog: [{
          entityType: "system",
          externalId: "import",
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        }],
      })
      .where(eq(importRuns.id, importRunId));
  }
}

async function processTOCOnlineImport(
  importRunId: string,
  tenantId: string,
  environment: string,
  credentials: Record<string, any>,
  entityTypes: string[],
  preferences: ImportJobData["preferences"],
  progress: ImportProgress,
  errorLog: Array<{ entityType: string; externalId: string; error: string; timestamp: string }>
): Promise<void> {
  const connector = new TOCOnlineConnector();
  
  const config: TOCOnlineConfig = {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    oauthUrl: credentials.oauthUrl,
    apiUrl: credentials.apiUrl,
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    tokenExpiresAt: credentials.tokenExpiresAt,
  };
  
  await connector.configure(config, {
    tenantId,
    userId: "system",
    connectorId: "toc-online",
  });

  const status = await connector.getStatus();
  if (status.status !== "active") {
    throw new Error(`TOC Online não está conectado: ${status.lastSyncError || "Token expirado"}`);
  }

  for (const entityType of entityTypes) {
    await updateProgress(importRunId, progress, `A importar ${getEntityLabel(entityType)}...`);

    try {
      switch (entityType) {
        case "customers":
          await importTOCCustomers(connector, importRunId, tenantId, environment, preferences, progress, errorLog);
          break;
        case "products":
          await importTOCProducts(connector, importRunId, tenantId, environment, preferences, progress, errorLog);
          break;
        case "services":
          await importTOCServices(connector, importRunId, tenantId, environment, preferences, progress, errorLog);
          break;
        default:
          console.log(`[Import Service] Entity type ${entityType} not yet implemented for TOC Online`);
      }
    } catch (error) {
      console.error(`[Import Service] Error importing ${entityType}:`, error);
      errorLog.push({
        entityType,
        externalId: "all",
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

async function importTOCCustomers(
  connector: TOCOnlineConnector,
  importRunId: string,
  tenantId: string,
  environment: string,
  preferences: ImportJobData["preferences"],
  progress: ImportProgress,
  errorLog: Array<{ entityType: string; externalId: string; error: string; timestamp: string }>
): Promise<void> {
  const customers = await connector.getCustomers();
  progress.totalItems += customers.length;

  await updateProgress(importRunId, progress, `A processar ${customers.length} clientes...`);

  for (const customer of customers) {
    try {
      const existingItem = await db.query.importItems.findFirst({
        where: and(
          eq(importItems.tenantId, tenantId),
          eq(importItems.environment, environment),
          eq(importItems.externalSource, "toc-online"),
          eq(importItems.externalId, customer.id)
        ),
      });

      if (existingItem && preferences?.skipDuplicates && !preferences?.updateExisting) {
        progress.skippedItems++;
        progress.processedItems++;
        continue;
      }

      const existingClient = customer.attributes.tax_number 
        ? await db.query.clients.findFirst({
            where: and(
              eq(clients.tenantId, tenantId),
              eq(clients.environment, environment),
              eq(clients.nif, customer.attributes.tax_number)
            ),
          })
        : null;

      if (existingClient && preferences?.skipDuplicates && !preferences?.updateExisting) {
        progress.skippedItems++;
        progress.processedItems++;
        
        await db.insert(importItems).values({
          tenantId,
          environment,
          importRunId,
          entityType: "customers",
          externalId: customer.id,
          externalSource: "toc-online",
          localEntityType: "clients",
          localEntityId: existingClient.id,
          status: "skipped",
          externalData: customer,
        }).onConflictDoNothing();
        
        continue;
      }

      const mappedClient = {
        name: customer.attributes.name || "Cliente sem nome",
        email: customer.attributes.email || null,
        phone: customer.attributes.phone || null,
        nif: customer.attributes.tax_number || null,
        address: customer.attributes.address || null,
        city: customer.attributes.city || null,
        postalCode: customer.attributes.postal_code || null,
        country: "Portugal",
        tenantId,
        environment,
        source: "toc-online",
        externalId: customer.id,
      };

      if (!preferences?.dryRun) {
        let clientId: string;

        if (existingClient && preferences?.updateExisting) {
          await db.update(clients)
            .set({
              ...mappedClient,
              updatedAt: new Date(),
            })
            .where(eq(clients.id, existingClient.id));
          clientId = existingClient.id;
        } else {
          const [newClient] = await db.insert(clients)
            .values(mappedClient as any)
            .returning();
          clientId = newClient.id;
        }

        await db.insert(importItems).values({
          tenantId,
          environment,
          importRunId,
          entityType: "customers",
          externalId: customer.id,
          externalSource: "toc-online",
          localEntityType: "clients",
          localEntityId: clientId,
          status: "imported",
          externalData: customer,
          mappedData: mappedClient,
          importedAt: new Date(),
        }).onConflictDoUpdate({
          target: [importItems.tenantId, importItems.environment, importItems.externalSource, importItems.externalId],
          set: {
            localEntityId: clientId,
            status: "imported",
            mappedData: mappedClient,
            importedAt: new Date(),
            lastSyncAt: new Date(),
          },
        });
      }

      progress.successItems++;
      progress.processedItems++;

    } catch (error) {
      progress.failedItems++;
      progress.processedItems++;
      errorLog.push({
        entityType: "customers",
        externalId: customer.id,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }

    if (progress.processedItems % 10 === 0) {
      await updateProgress(importRunId, progress, `Clientes: ${progress.processedItems}/${progress.totalItems}`);
    }
  }
}

async function importTOCProducts(
  connector: TOCOnlineConnector,
  importRunId: string,
  tenantId: string,
  environment: string,
  preferences: ImportJobData["preferences"],
  progress: ImportProgress,
  errorLog: Array<{ entityType: string; externalId: string; error: string; timestamp: string }>
): Promise<void> {
  const tocProducts = await connector.getProducts();
  progress.totalItems += tocProducts.length;

  await updateProgress(importRunId, progress, `A processar ${tocProducts.length} produtos...`);

  for (const product of tocProducts) {
    try {
      const existingProduct = await db.query.products.findFirst({
        where: and(
          eq(products.tenantId, tenantId),
          eq(products.environment, environment),
          eq(products.toconlineProductId, product.id)
        ),
      });

      if (existingProduct && preferences?.skipDuplicates && !preferences?.updateExisting) {
        progress.skippedItems++;
        progress.processedItems++;
        
        await db.insert(importItems).values({
          tenantId,
          environment,
          importRunId,
          entityType: "products",
          externalId: product.id,
          externalSource: "toc-online",
          localEntityType: "products",
          localEntityId: existingProduct.id,
          status: "skipped",
          externalData: product,
        }).onConflictDoNothing();
        
        continue;
      }

      const productCode = (product.attributes.code || `TOC-${product.id}`).trim();
      
      const mappedProduct = {
        tenantId,
        environment,
        code: productCode,
        name: (product.attributes.name || "Produto sem nome").trim(),
        description: product.attributes.description?.trim() || null,
        itemType: "SALE" as const,
        isSellable: true,
        isPurchasable: true,
        price: product.attributes.unit_price?.toString() || "0",
        taxProfileId: null,
        toconlineProductId: product.id,
        toconlineSyncedAt: new Date(),
        isActive: true,
        category: product.attributes.category?.trim() || null,
        metadata: product.attributes.tax_rate ? { tocTaxRate: product.attributes.tax_rate } : null,
      };

      if (!preferences?.dryRun) {
        let productId: string;

        if (existingProduct && preferences?.updateExisting) {
          await db.update(products)
            .set({
              ...mappedProduct,
              updatedAt: new Date(),
            })
            .where(eq(products.id, existingProduct.id));
          productId = existingProduct.id;
        } else if (!existingProduct) {
          const [newProduct] = await db.insert(products)
            .values(mappedProduct as any)
            .returning();
          productId = newProduct.id;
        } else {
          productId = existingProduct.id;
        }

        await db.insert(importItems).values({
          tenantId,
          environment,
          importRunId,
          entityType: "products",
          externalId: product.id,
          externalSource: "toc-online",
          localEntityType: "products",
          localEntityId: productId,
          status: "imported",
          externalData: product,
          mappedData: mappedProduct,
          importedAt: new Date(),
        }).onConflictDoUpdate({
          target: [importItems.tenantId, importItems.environment, importItems.externalSource, importItems.externalId],
          set: {
            localEntityId: productId,
            status: "imported",
            mappedData: mappedProduct,
            importedAt: new Date(),
            lastSyncAt: new Date(),
          },
        });
      }

      progress.successItems++;
      progress.processedItems++;

    } catch (error) {
      progress.failedItems++;
      progress.processedItems++;
      errorLog.push({
        entityType: "products",
        externalId: product.id,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }

    if (progress.processedItems % 10 === 0) {
      await updateProgress(importRunId, progress, `Produtos: ${progress.processedItems}/${progress.totalItems}`);
    }
  }
}

async function importTOCServices(
  connector: TOCOnlineConnector,
  importRunId: string,
  tenantId: string,
  environment: string,
  preferences: ImportJobData["preferences"],
  progress: ImportProgress,
  errorLog: Array<{ entityType: string; externalId: string; error: string; timestamp: string }>
): Promise<void> {
  const tocServices = await connector.getServices();
  progress.totalItems += tocServices.length;

  await updateProgress(importRunId, progress, `A processar ${tocServices.length} serviços...`);

  for (const service of tocServices) {
    try {
      const existingProduct = await db.query.products.findFirst({
        where: and(
          eq(products.tenantId, tenantId),
          eq(products.environment, environment),
          eq(products.toconlineProductId, service.id)
        ),
      });

      if (existingProduct && preferences?.skipDuplicates && !preferences?.updateExisting) {
        progress.skippedItems++;
        progress.processedItems++;
        
        await db.insert(importItems).values({
          tenantId,
          environment,
          importRunId,
          entityType: "services",
          externalId: service.id,
          externalSource: "toc-online",
          localEntityType: "products",
          localEntityId: existingProduct.id,
          status: "skipped",
          externalData: service,
        }).onConflictDoNothing();
        
        continue;
      }

      const serviceCode = (service.attributes.code || `SVC-${service.id}`).trim();
      
      const mappedService = {
        tenantId,
        environment,
        code: serviceCode,
        name: (service.attributes.name || "Serviço sem nome").trim(),
        description: service.attributes.description?.trim() || null,
        itemType: "SERVICE" as const,
        isSellable: true,
        isPurchasable: false,
        price: service.attributes.unit_price?.toString() || "0",
        taxProfileId: null,
        toconlineProductId: service.id,
        toconlineSyncedAt: new Date(),
        isActive: true,
        category: "Serviços",
        metadata: service.attributes.tax_rate ? { tocTaxRate: service.attributes.tax_rate } : null,
      };

      if (!preferences?.dryRun) {
        let productId: string;

        if (existingProduct && preferences?.updateExisting) {
          await db.update(products)
            .set({
              ...mappedService,
              updatedAt: new Date(),
            })
            .where(eq(products.id, existingProduct.id));
          productId = existingProduct.id;
        } else if (!existingProduct) {
          const [newProduct] = await db.insert(products)
            .values(mappedService as any)
            .returning();
          productId = newProduct.id;
        } else {
          productId = existingProduct.id;
        }

        await db.insert(importItems).values({
          tenantId,
          environment,
          importRunId,
          entityType: "services",
          externalId: service.id,
          externalSource: "toc-online",
          localEntityType: "products",
          localEntityId: productId,
          status: "imported",
          externalData: service,
          mappedData: mappedService,
          importedAt: new Date(),
        }).onConflictDoUpdate({
          target: [importItems.tenantId, importItems.environment, importItems.externalSource, importItems.externalId],
          set: {
            localEntityId: productId,
            status: "imported",
            mappedData: mappedService,
            importedAt: new Date(),
            lastSyncAt: new Date(),
          },
        });
      }

      progress.successItems++;
      progress.processedItems++;

    } catch (error) {
      progress.failedItems++;
      progress.processedItems++;
      errorLog.push({
        entityType: "services",
        externalId: service.id,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }

    if (progress.processedItems % 10 === 0) {
      await updateProgress(importRunId, progress, `Serviços: ${progress.processedItems}/${progress.totalItems}`);
    }
  }
}

async function updateProgress(
  importRunId: string,
  progress: ImportProgress,
  message: string
): Promise<void> {
  const percent = progress.totalItems > 0 
    ? Math.round((progress.processedItems / progress.totalItems) * 100)
    : 0;

  await db.update(importRuns)
    .set({
      totalItems: progress.totalItems,
      processedItems: progress.processedItems,
      successItems: progress.successItems,
      failedItems: progress.failedItems,
      skippedItems: progress.skippedItems,
      progressPercent: percent,
      progressMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(importRuns.id, importRunId));
}

function getEntityLabel(entityType: string): string {
  const labels: Record<string, string> = {
    customers: "clientes",
    products: "produtos",
    services: "serviços",
    invoices: "facturas",
    payments: "pagamentos",
    taxes: "impostos",
    contacts: "contactos",
  };
  return labels[entityType] || entityType;
}
