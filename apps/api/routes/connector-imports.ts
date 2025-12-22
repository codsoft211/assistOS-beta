import { Router } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { importRuns, importItems, tenantConnectorConfigs } from "@shared/schema";
import { getImportQueue } from "../workers/import-worker";
import { processConnectorImport } from "../services/connector-import-service";

const router = Router();

const startImportSchema = z.object({
  connectorConfigId: z.number(),
  entityTypes: z.array(z.enum([
    "customers",
    "products",
    "services",
    "invoices",
    "payments",
    "taxes",
    "contacts"
  ])).min(1, "At least one entity type is required"),
  preferences: z.object({
    skipDuplicates: z.boolean().default(true),
    updateExisting: z.boolean().default(false),
    dryRun: z.boolean().default(false),
  }).optional(),
});

router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "production";
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = startImportSchema.parse(req.body);

    const connectorConfig = await db.query.tenantConnectorConfigs.findFirst({
      where: and(
        eq(tenantConnectorConfigs.id, body.connectorConfigId),
        eq(tenantConnectorConfigs.tenantId, tenantId),
        eq(tenantConnectorConfigs.environment, environment)
      ),
    });

    if (!connectorConfig) {
      return res.status(404).json({ error: "Connector configuration not found" });
    }

    if (!connectorConfig.isEnabled) {
      return res.status(400).json({ error: "Connector is not enabled" });
    }

    const [importRun] = await db.insert(importRuns).values({
      tenantId,
      environment,
      connectorConfigId: body.connectorConfigId,
      connectorType: connectorConfig.connectorType,
      entityTypes: body.entityTypes,
      status: "pending",
      preferences: body.preferences || { skipDuplicates: true, updateExisting: false },
      startedBy: userId,
    }).returning();

    const importQueue = getImportQueue();
    if (importQueue) {
      await importQueue.add("connector-import", {
        importRunId: importRun.id,
        tenantId,
        environment,
        connectorType: connectorConfig.connectorType,
        connectorConfigId: body.connectorConfigId,
        entityTypes: body.entityTypes,
        preferences: body.preferences,
      }, {
        jobId: importRun.id,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      });

      console.log(`[Connector Imports] Created import job ${importRun.id} for ${connectorConfig.connectorType}`);
    } else {
      await db.update(importRuns)
        .set({ 
          status: "running",
          startedAt: new Date(),
          progressMessage: "A processar importação...",
        })
        .where(eq(importRuns.id, importRun.id));

      processImportSync(importRun.id, tenantId, environment, connectorConfig.connectorType, body.connectorConfigId, body.entityTypes, body.preferences);
    }

    res.status(201).json({
      id: importRun.id,
      status: importRun.status,
      connectorType: connectorConfig.connectorType,
      entityTypes: body.entityTypes,
      streamUrl: `/api/connector-imports/${importRun.id}/stream`,
    });
  } catch (error: any) {
    console.error("[Connector Imports] Create error:", error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }

    res.status(500).json({ error: "Failed to start import" });
  }
});

router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "production";

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const runs = await db.query.importRuns.findMany({
      where: and(
        eq(importRuns.tenantId, tenantId),
        eq(importRuns.environment, environment)
      ),
      orderBy: [desc(importRuns.createdAt)],
      limit: 50,
    });

    res.json({
      imports: runs.map(run => ({
        id: run.id,
        connectorType: run.connectorType,
        status: run.status,
        entityTypes: run.entityTypes,
        totalItems: run.totalItems,
        processedItems: run.processedItems,
        successItems: run.successItems,
        failedItems: run.failedItems,
        progressPercent: run.progressPercent,
        progressMessage: run.progressMessage,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
      })),
      total: runs.length,
    });
  } catch (error) {
    console.error("[Connector Imports] List error:", error);
    res.status(500).json({ error: "Failed to list imports" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "production";

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const run = await db.query.importRuns.findFirst({
      where: and(
        eq(importRuns.id, id),
        eq(importRuns.tenantId, tenantId),
        eq(importRuns.environment, environment)
      ),
    });

    if (!run) {
      return res.status(404).json({ error: "Import run not found" });
    }

    const items = await db.query.importItems.findMany({
      where: eq(importItems.importRunId, id),
      limit: 100,
    });

    res.json({
      id: run.id,
      connectorType: run.connectorType,
      status: run.status,
      entityTypes: run.entityTypes,
      totalItems: run.totalItems,
      processedItems: run.processedItems,
      successItems: run.successItems,
      failedItems: run.failedItems,
      skippedItems: run.skippedItems,
      progressPercent: run.progressPercent,
      progressMessage: run.progressMessage,
      errorLog: run.errorLog,
      preferences: run.preferences,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      items: items.map(item => ({
        id: item.id,
        entityType: item.entityType,
        externalId: item.externalId,
        status: item.status,
        localEntityType: item.localEntityType,
        localEntityId: item.localEntityId,
        errorMessage: item.errorMessage,
        importedAt: item.importedAt,
      })),
    });
  } catch (error) {
    console.error("[Connector Imports] Get error:", error);
    res.status(500).json({ error: "Failed to get import details" });
  }
});

router.get("/:id/stream", async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "production";

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const run = await db.query.importRuns.findFirst({
      where: and(
        eq(importRuns.id, id),
        eq(importRuns.tenantId, tenantId),
        eq(importRuns.environment, environment)
      ),
    });

    if (!run) {
      return res.status(404).json({ error: "Import run not found" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({
      status: run.status,
      progress: run.progressPercent,
      message: run.progressMessage,
      totalItems: run.totalItems,
      processedItems: run.processedItems,
      successItems: run.successItems,
      failedItems: run.failedItems,
    })}\n\n`);

    const intervalId = setInterval(async () => {
      try {
        const updatedRun = await db.query.importRuns.findFirst({
          where: eq(importRuns.id, id),
        });

        if (!updatedRun) {
          clearInterval(intervalId);
          res.end();
          return;
        }

        res.write(`data: ${JSON.stringify({
          status: updatedRun.status,
          progress: updatedRun.progressPercent,
          message: updatedRun.progressMessage,
          totalItems: updatedRun.totalItems,
          processedItems: updatedRun.processedItems,
          successItems: updatedRun.successItems,
          failedItems: updatedRun.failedItems,
          errorLog: updatedRun.errorLog,
        })}\n\n`);

        if (["completed", "failed", "cancelled", "partial"].includes(updatedRun.status)) {
          clearInterval(intervalId);
          res.write("data: [DONE]\n\n");
          res.end();
        }
      } catch (error) {
        console.error("[Connector Imports] Stream poll error:", error);
        clearInterval(intervalId);
        res.end();
      }
    }, 1000);

    req.on("close", () => {
      clearInterval(intervalId);
      console.log(`[Connector Imports] Client disconnected from stream ${id}`);
    });
  } catch (error) {
    console.error("[Connector Imports] Stream error:", error);
    res.status(500).json({ error: "Failed to start stream" });
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "production";

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const run = await db.query.importRuns.findFirst({
      where: and(
        eq(importRuns.id, id),
        eq(importRuns.tenantId, tenantId),
        eq(importRuns.environment, environment)
      ),
    });

    if (!run) {
      return res.status(404).json({ error: "Import run not found" });
    }

    if (!["pending", "running"].includes(run.status)) {
      return res.status(400).json({ error: `Cannot cancel import with status: ${run.status}` });
    }

    const importQueue = getImportQueue();
    if (importQueue) {
      const job = await importQueue.getJob(id);
      if (job) {
        await job.remove();
      }
    }

    await db.update(importRuns)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        progressMessage: "Importação cancelada pelo utilizador",
      })
      .where(eq(importRuns.id, id));

    console.log(`[Connector Imports] Cancelled import ${id}`);

    res.json({ success: true });
  } catch (error) {
    console.error("[Connector Imports] Cancel error:", error);
    res.status(500).json({ error: "Failed to cancel import" });
  }
});

async function processImportSync(
  importRunId: string,
  tenantId: string,
  environment: string,
  connectorType: string,
  connectorConfigId: number,
  entityTypes: string[],
  preferences?: any
) {
  try {
    console.log(`[Connector Imports] Starting sync import ${importRunId}`);
    
    await processConnectorImport({
      importRunId,
      tenantId,
      environment,
      connectorType,
      connectorConfigId,
      entityTypes,
      preferences,
    });
  } catch (error) {
    console.error(`[Connector Imports] Sync import error:`, error);
    
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

export default router;
