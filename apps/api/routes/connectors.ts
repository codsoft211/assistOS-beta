// Connector Configuration Management - BACKWARD COMPATIBILITY SHIM
// NOTE: This provides backward compatibility during CDC architecture transition
// Maps old API format to new tenant_connector_configs table
// Task 10 will implement full tenant-level + user-level route separation

import { Router } from "express";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { db } from "../db";
import { tenantConnectorConfigs, insertTenantConnectorConfigSchema } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { connectorRegistry } from "../../../packages/connectors/base/connector-registry";
import { z } from "zod";

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard to ALL routes
// Connectors contain API credentials - CRITICAL protection required
// ============================================================================
router.use(hardTenantGuard);

// Helper: Map new CDC schema to old API format
function mapToLegacyFormat(config: any) {
  return {
    id: config.id,
    tenantId: config.tenantId,
    connectorType: config.connectorType,
    name: config.companyCredentials?.name || config.connectorType,
    config: config.companyCredentials || {},
    isActive: config.isEnabled,
    lastSyncAt: null,
    lastTestAt: null,
    lastTestStatus: null,
    lastTestError: null,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

// ============================================================================
// GET /api/connectors - List all connector configs
// ============================================================================
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const type = req.query.type as string | undefined;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let query = db.select().from(tenantConnectorConfigs)
      .where(eq(tenantConnectorConfigs.tenantId, tenantId));

    if (type) {
      query = db.select().from(tenantConnectorConfigs)
        .where(and(
          eq(tenantConnectorConfigs.tenantId, tenantId),
          eq(tenantConnectorConfigs.connectorType, type)
        ));
    }

    const configs = await query;
    res.json(configs.map(mapToLegacyFormat));
  } catch (error: any) {
    console.error("[Connectors API] Error listing connectors:", error);
    res.status(500).json({ 
      error: "Failed to list connectors",
      details: error.message 
    });
  }
});

// ============================================================================
// GET /api/connectors/:id - Get specific connector config
// ============================================================================
router.get("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const id = parseInt(req.params.id);

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid connector ID" });
    }

    const [config] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, id),
        eq(tenantConnectorConfigs.tenantId, tenantId)
      ))
      .limit(1);

    if (!config) {
      return res.status(404).json({ error: "Connector config not found" });
    }

    res.json(mapToLegacyFormat(config));
  } catch (error: any) {
    console.error("[Connectors API] Error fetching connector:", error);
    res.status(500).json({ 
      error: "Failed to fetch connector",
      details: error.message 
    });
  }
});

// ============================================================================
// POST /api/connectors - Create new connector config
// ============================================================================
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Map old format to new CDC schema
    const validatedData = insertTenantConnectorConfigSchema.parse({
      tenantId,
      connectorType: req.body.connectorType,
      companyCredentials: {
        name: req.body.name,
        ...req.body.config
      },
      isEnabled: req.body.isActive ?? true,
      enabledBy: userId,
    });

    const [created] = await db.insert(tenantConnectorConfigs)
      .values(validatedData)
      .returning();

    res.status(201).json(mapToLegacyFormat(created));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors 
      });
    }
    
    if (error.code === '23505') {
      return res.status(400).json({ 
        error: "A connector of this type already exists for your tenant" 
      });
    }

    console.error("[Connectors API] Error creating connector:", error);
    res.status(500).json({ 
      error: "Failed to create connector",
      details: error.message 
    });
  }
});

// ============================================================================
// PUT /api/connectors/:id - Update connector config
// ============================================================================
router.put("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const id = parseInt(req.params.id);

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid connector ID" });
    }

    const [existing] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, id),
        eq(tenantConnectorConfigs.tenantId, tenantId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Connector config not found" });
    }

    // Merge updates into companyCredentials
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (req.body.name || req.body.config) {
      updateData.companyCredentials = {
        ...(existing.companyCredentials as any),
        ...(req.body.name && { name: req.body.name }),
        ...(req.body.config && req.body.config),
      };
    }

    if (req.body.isActive !== undefined) {
      updateData.isEnabled = req.body.isActive;
    }

    const [updated] = await db.update(tenantConnectorConfigs)
      .set(updateData)
      .where(eq(tenantConnectorConfigs.id, id))
      .returning();

    res.json(mapToLegacyFormat(updated));
  } catch (error: any) {
    console.error("[Connectors API] Error updating connector:", error);
    res.status(500).json({ 
      error: "Failed to update connector",
      details: error.message 
    });
  }
});

// ============================================================================
// DELETE /api/connectors/:id - Delete connector config
// ============================================================================
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const id = parseInt(req.params.id);

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid connector ID" });
    }

    const [existing] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, id),
        eq(tenantConnectorConfigs.tenantId, tenantId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Connector config not found" });
    }

    await db.delete(tenantConnectorConfigs)
      .where(eq(tenantConnectorConfigs.id, id));

    res.status(204).send();
  } catch (error: any) {
    console.error("[Connectors API] Error deleting connector:", error);
    res.status(500).json({ 
      error: "Failed to delete connector",
      details: error.message 
    });
  }
});

// ============================================================================
// POST /api/connectors/:id/test - Test connector connection
// ============================================================================
router.post("/:id/test", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const id = parseInt(req.params.id);

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid connector ID" });
    }

    const [config] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, id),
        eq(tenantConnectorConfigs.tenantId, tenantId)
      ))
      .limit(1);

    if (!config) {
      return res.status(404).json({ error: "Connector config not found" });
    }

    const connector = connectorRegistry.get(config.connectorType as any);
    if (!connector) {
      return res.status(400).json({ 
        error: `Connector type '${config.connectorType}' not found in registry` 
      });
    }

    let success = false;
    let message = "";
    let errorMsg: string | undefined;

    try {
      await connector.configure(config.companyCredentials as any, { tenantId });
      success = await connector.testConnection();
      message = success ? "Connection successful" : "Connection failed";
    } catch (err: any) {
      success = false;
      message = "Connection test failed";
      errorMsg = err.message || String(err);
    }

    res.json({ 
      success, 
      message, 
      error: errorMsg 
    });
  } catch (error: any) {
    console.error("[Connectors API] Error testing connector:", error);
    res.status(500).json({ 
      error: "Failed to test connector",
      details: error.message 
    });
  }
});

// ============================================================================
// POST /api/connectors/:id/sync - Sync connector data
// ============================================================================
router.post("/:id/sync", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const id = parseInt(req.params.id);

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid connector ID" });
    }

    const [config] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, id),
        eq(tenantConnectorConfigs.tenantId, tenantId)
      ))
      .limit(1);

    if (!config) {
      return res.status(404).json({ error: "Connector config not found" });
    }

    const connector = connectorRegistry.get(config.connectorType as any);
    if (!connector) {
      return res.status(400).json({ 
        error: `Connector type '${config.connectorType}' not found in registry` 
      });
    }

    await connector.configure(config.companyCredentials as any, { tenantId });
    const syncResult = await connector.sync();

    res.json(syncResult);
  } catch (error: any) {
    console.error("[Connectors API] Error syncing connector:", error);
    res.status(500).json({ 
      error: "Failed to sync connector",
      details: error.message 
    });
  }
});

export default router;
