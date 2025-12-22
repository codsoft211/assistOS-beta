// Admin Connector Configuration Management - TENANT-LEVEL
// Routes for Admin/AssistBuild to configure company-wide connector credentials
// Accessible via /api/admin/connectors (requires Admin permissions)

import { Router } from "express";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { db } from "../db";
import { tenantConnectorConfigs, insertTenantConnectorConfigSchema } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { connectorRegistry } from "../../../packages/connectors/base/connector-registry";
import { z } from "zod";

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard FIRST
// Admin connectors contain tenant-level API credentials - CRITICAL protection
// ============================================================================
router.use(hardTenantGuard);

// Middleware: Require Admin permissions (placeholder - implement real RBAC later)
function requireAdmin(req: any, res: any, next: any) {
  const user = req.user;
  
  // TODO: Implement real RBAC check
  // For now, just check if user exists
  if (!user) {
    return res.status(403).json({ 
      error: "Admin access required",
      message: "Apenas administradores podem configurar conectores a nível de empresa" 
    });
  }
  
  next();
}

router.use(requireAdmin);

// ============================================================================
// GET /api/admin/connectors - List all tenant-level connector configs
// ============================================================================
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const configs = await db.select().from(tenantConnectorConfigs)
      .where(eq(tenantConnectorConfigs.tenantId, tenantId));

    const enrichedConfigs = configs.map(config => {
      const credentials = config.companyCredentials as Record<string, any> || {};
      const isAuthorized = !!(credentials.accessToken && credentials.refreshToken);
      const connectedAt = credentials.connectedAt || null;
      
      return {
        ...config,
        isAuthorized,
        connectedAt,
      };
    });

    res.json(enrichedConfigs);
  } catch (error: any) {
    console.error("[Admin Connectors] Error listing connectors:", error);
    res.status(500).json({ 
      error: "Failed to list connectors",
      details: error.message 
    });
  }
});

// ============================================================================
// GET /api/admin/connectors/available - List available connector types
// ============================================================================
router.get("/available", async (req, res) => {
  try {
    // Get all connector metadata from registry
    const availableConnectors = connectorRegistry.listAvailable();
    
    const connectors = availableConnectors.map(metadata => {
      const additionalMetadata = getConnectorMetadata(metadata.type);
      return {
        type: metadata.type,
        name: metadata.name,
        description: metadata.description,
        capabilities: metadata.capabilities,
        authType: metadata.authType,
        isAvailable: metadata.isAvailable,
        ...additionalMetadata
      };
    });

    res.json(connectors);
  } catch (error: any) {
    console.error("[Admin Connectors] Error listing available connectors:", error);
    res.status(500).json({ 
      error: "Failed to list available connectors",
      details: error.message 
    });
  }
});

// Helper: Get connector metadata
// Note: google-document-ai is NOT a tenant connector - it's a platform service
function getConnectorMetadata(type: string) {
  const metadata: Record<string, any> = {
    'toc-online': {
      name: 'TOC Online',
      description: 'Plataforma de contabilidade certificada portuguesa',
      category: 'accounting',
      requiresOAuth: true,
      configFields: ['clientId', 'clientSecret', 'oauthUrl', 'apiUrl'],
      oauthEndpoint: '/api/oauth/toc-online/authorize',
      defaultValues: {
        oauthUrl: 'https://oauth.toconline.pt',
        apiUrl: 'https://api.v1.toconline.com',
      },
    },
    'moloni': {
      name: 'Moloni',
      description: 'Portuguese invoicing/billing system',
      category: 'invoicing',
      requiresOAuth: true,
      configFields: ['clientId', 'clientSecret']
    },
    'sap-business-one': {
      name: 'SAP Business One',
      description: 'International ERP system',
      category: 'erp',
      requiresOAuth: false,
      configFields: ['serviceLayerUrl', 'companyDB', 'username', 'password']
    },
    'primavera': {
      name: 'Primavera ERP',
      description: 'Portuguese ERP system',
      category: 'erp',
      requiresOAuth: true,
      configFields: ['clientId', 'clientSecret', 'subscriptionKey', 'company', 'instance']
    },
    'sibs-open-banking': {
      name: 'SIBS Open Banking',
      description: 'Portuguese banking integration (PSD2)',
      category: 'banking',
      requiresOAuth: true,
      configFields: ['clientId', 'clientSecret', 'tppId']
    }
  };

  return metadata[type] || {
    name: type,
    description: `Connector for ${type}`,
    category: 'other',
    requiresOAuth: false,
    configFields: []
  };
}

// ============================================================================
// GET /api/admin/connectors/:id - Get specific connector config
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

    res.json(config);
  } catch (error: any) {
    console.error("[Admin Connectors] Error fetching connector:", error);
    res.status(500).json({ 
      error: "Failed to fetch connector",
      details: error.message 
    });
  }
});

// ============================================================================
// POST /api/admin/connectors - Create tenant-level connector config
// ============================================================================
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validatedData = insertTenantConnectorConfigSchema.parse({
      tenantId,
      connectorType: req.body.connectorType,
      companyCredentials: req.body.companyCredentials,
      isEnabled: req.body.isEnabled ?? true,
      enabledBy: userId,
    });

    const [created] = await db.insert(tenantConnectorConfigs)
      .values(validatedData)
      .returning();

    console.log(`[Admin Connectors] Created tenant-level config for ${created.connectorType}`);
    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors 
      });
    }
    
    if (error.code === '23505') {
      return res.status(400).json({ 
        error: "A connector of this type already exists for your tenant",
        message: "Este conector já está configurado para a sua empresa" 
      });
    }

    console.error("[Admin Connectors] Error creating connector:", error);
    res.status(500).json({ 
      error: "Failed to create connector",
      details: error.message 
    });
  }
});

// ============================================================================
// PUT /api/admin/connectors/:id - Update tenant-level connector config
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

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (req.body.companyCredentials) {
      updateData.companyCredentials = req.body.companyCredentials;
    }

    if (req.body.isEnabled !== undefined) {
      updateData.isEnabled = req.body.isEnabled;
    }

    const [updated] = await db.update(tenantConnectorConfigs)
      .set(updateData)
      .where(eq(tenantConnectorConfigs.id, id))
      .returning();

    console.log(`[Admin Connectors] Updated tenant-level config for ${updated.connectorType}`);
    res.json(updated);
  } catch (error: any) {
    console.error("[Admin Connectors] Error updating connector:", error);
    res.status(500).json({ 
      error: "Failed to update connector",
      details: error.message 
    });
  }
});

// ============================================================================
// DELETE /api/admin/connectors/:id - Delete tenant-level connector config
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

    console.log(`[Admin Connectors] Deleted tenant-level config for ${existing.connectorType}`);
    res.status(204).send();
  } catch (error: any) {
    console.error("[Admin Connectors] Error deleting connector:", error);
    res.status(500).json({ 
      error: "Failed to delete connector",
      details: error.message 
    });
  }
});

// ============================================================================
// POST /api/admin/connectors/:id/test - Test tenant-level connection
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
      const userId = (req as any).user?.id || 'admin';
      await connector.configure(config.companyCredentials as any, { 
        tenantId, 
        userId,
        connectorId: config.id.toString()
      });
      success = await connector.testConnection();
      message = success ? "Conexão bem-sucedida" : "Falha na conexão";
    } catch (err: any) {
      success = false;
      message = "Erro ao testar conexão";
      errorMsg = err.message || String(err);
    }

    console.log(`[Admin Connectors] Test connection ${config.connectorType}: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    res.json({ 
      success, 
      message, 
      error: errorMsg 
    });
  } catch (error: any) {
    console.error("[Admin Connectors] Error testing connector:", error);
    res.status(500).json({ 
      error: "Failed to test connector",
      details: error.message 
    });
  }
});

export default router;
