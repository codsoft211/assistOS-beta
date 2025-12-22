// User Connector Credentials Management - USER-LEVEL
// Routes for users to self-service connect their personal accounts
// Accessible via /api/user/connectors (any authenticated user)

import { Router } from "express";
import { db } from "../db";
import { 
  userConnectorCredentials, 
  tenantConnectorConfigs,
  insertUserConnectorCredentialSchema 
} from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { connectorRegistry } from "../../../packages/connectors/base/connector-registry";
import { z } from "zod";

const router = Router();

// ============================================================================
// GET /api/user/connectors - List user's connector credentials
// ============================================================================
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const credentials = await db.select().from(userConnectorCredentials)
      .where(and(
        eq(userConnectorCredentials.tenantId, tenantId),
        eq(userConnectorCredentials.userId, userId)
      ));

    res.json(credentials);
  } catch (error: any) {
    console.error("[User Connectors] Error listing credentials:", error);
    res.status(500).json({ 
      error: "Failed to list connector credentials",
      details: error.message 
    });
  }
});

// ============================================================================
// GET /api/user/connectors/available - List available connectors with status
// ============================================================================
router.get("/available", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get tenant-level configs (what Admin has configured)
    const tenantConfigs = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.tenantId, tenantId),
        eq(tenantConnectorConfigs.isEnabled, true)
      ));

    // Get user's credentials (what they've already connected)
    const userCreds = await db.select().from(userConnectorCredentials)
      .where(and(
        eq(userConnectorCredentials.tenantId, tenantId),
        eq(userConnectorCredentials.userId, userId)
      ));

    // Build response with status indicators
    const available = tenantConfigs.map(config => {
      const userCred = userCreds.find(c => c.connectorType === config.connectorType);
      const metadata = getConnectorMetadata(config.connectorType);

      return {
        connectorType: config.connectorType,
        ...metadata,
        status: userCred 
          ? (userCred.isConnected ? 'connected' : 'disconnected')
          : 'available',
        userCredentialId: userCred?.id || null,
        connectedAt: userCred?.connectedAt || null,
        lastUsedAt: userCred?.lastUsedAt || null,
      };
    });

    res.json(available);
  } catch (error: any) {
    console.error("[User Connectors] Error listing available connectors:", error);
    res.status(500).json({ 
      error: "Failed to list available connectors",
      details: error.message 
    });
  }
});

// Helper: Get connector metadata for user-facing info
function getConnectorMetadata(type: string) {
  const metadata: Record<string, any> = {
    'google-document-ai': {
      name: 'Google Document AI',
      description: 'OCR avançado para documentos fiscais portugueses',
      category: 'document-processing',
      requiresOAuth: false,
      userMessage: 'Configure as suas credenciais do Google Cloud'
    },
    'toc-online': {
      name: 'TOC Online',
      description: 'Plataforma de contabilidade certificada portuguesa',
      category: 'accounting',
      requiresOAuth: false,
      userMessage: 'Introduza a sua chave API do TOC Online'
    },
    'moloni': {
      name: 'Moloni',
      description: 'Sistema de faturação português',
      category: 'invoicing',
      requiresOAuth: true,
      userMessage: 'Conecte a sua conta Moloni via OAuth'
    },
    'sap-business-one': {
      name: 'SAP Business One',
      description: 'Sistema ERP internacional',
      category: 'erp',
      requiresOAuth: false,
      userMessage: 'Configure as suas credenciais SAP'
    },
    'primavera': {
      name: 'Primavera ERP',
      description: 'Sistema ERP português',
      category: 'erp',
      requiresOAuth: true,
      userMessage: 'Conecte a sua conta Primavera via OAuth'
    },
    'sibs-open-banking': {
      name: 'SIBS Open Banking',
      description: 'Integração bancária portuguesa (PSD2)',
      category: 'banking',
      requiresOAuth: true,
      userMessage: 'Conecte a sua conta bancária via SIBS'
    }
  };

  return metadata[type] || {
    name: type,
    description: `Connector for ${type}`,
    category: 'other',
    requiresOAuth: false,
    userMessage: 'Configure as suas credenciais'
  };
}

// ============================================================================
// GET /api/user/connectors/:id - Get specific user credential
// ============================================================================
router.get("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const id = parseInt(req.params.id);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid credential ID" });
    }

    const [credential] = await db.select().from(userConnectorCredentials)
      .where(and(
        eq(userConnectorCredentials.id, id),
        eq(userConnectorCredentials.tenantId, tenantId),
        eq(userConnectorCredentials.userId, userId)
      ))
      .limit(1);

    if (!credential) {
      return res.status(404).json({ error: "Connector credential not found" });
    }

    res.json(credential);
  } catch (error: any) {
    console.error("[User Connectors] Error fetching credential:", error);
    res.status(500).json({ 
      error: "Failed to fetch connector credential",
      details: error.message 
    });
  }
});

// ============================================================================
// POST /api/user/connectors - Connect user to a connector
// ============================================================================
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { connectorType, userCredentials } = req.body;

    // Verify tenant has this connector configured
    const [tenantConfig] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.tenantId, tenantId),
        eq(tenantConnectorConfigs.connectorType, connectorType),
        eq(tenantConnectorConfigs.isEnabled, true)
      ))
      .limit(1);

    if (!tenantConfig) {
      return res.status(400).json({ 
        error: "Connector not available",
        message: "Este conector não está configurado para a sua empresa. Contacte o administrador." 
      });
    }

    const validatedData = insertUserConnectorCredentialSchema.parse({
      tenantId,
      userId,
      connectorType,
      userCredentials,
      isConnected: true,
      connectedAt: new Date(),
    });

    const [created] = await db.insert(userConnectorCredentials)
      .values(validatedData)
      .returning();

    console.log(`[User Connectors] User ${userId} connected to ${connectorType}`);
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
        error: "You are already connected to this connector",
        message: "Já está conectado a este conector. Atualize as credenciais existentes." 
      });
    }

    console.error("[User Connectors] Error connecting:", error);
    res.status(500).json({ 
      error: "Failed to connect to connector",
      details: error.message 
    });
  }
});

// ============================================================================
// PUT /api/user/connectors/:id - Update user credentials
// ============================================================================
router.put("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const id = parseInt(req.params.id);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid credential ID" });
    }

    const [existing] = await db.select().from(userConnectorCredentials)
      .where(and(
        eq(userConnectorCredentials.id, id),
        eq(userConnectorCredentials.tenantId, tenantId),
        eq(userConnectorCredentials.userId, userId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Connector credential not found" });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (req.body.userCredentials) {
      updateData.userCredentials = req.body.userCredentials;
    }

    if (req.body.isConnected !== undefined) {
      updateData.isConnected = req.body.isConnected;
    }

    const [updated] = await db.update(userConnectorCredentials)
      .set(updateData)
      .where(eq(userConnectorCredentials.id, id))
      .returning();

    console.log(`[User Connectors] User ${userId} updated ${updated.connectorType} credentials`);
    res.json(updated);
  } catch (error: any) {
    console.error("[User Connectors] Error updating credentials:", error);
    res.status(500).json({ 
      error: "Failed to update connector credentials",
      details: error.message 
    });
  }
});

// ============================================================================
// DELETE /api/user/connectors/:id - Disconnect from connector
// ============================================================================
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const id = parseInt(req.params.id);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid credential ID" });
    }

    const [existing] = await db.select().from(userConnectorCredentials)
      .where(and(
        eq(userConnectorCredentials.id, id),
        eq(userConnectorCredentials.tenantId, tenantId),
        eq(userConnectorCredentials.userId, userId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Connector credential not found" });
    }

    await db.delete(userConnectorCredentials)
      .where(eq(userConnectorCredentials.id, id));

    console.log(`[User Connectors] User ${userId} disconnected from ${existing.connectorType}`);
    res.status(204).send();
  } catch (error: any) {
    console.error("[User Connectors] Error disconnecting:", error);
    res.status(500).json({ 
      error: "Failed to disconnect from connector",
      details: error.message 
    });
  }
});

// ============================================================================
// POST /api/user/connectors/:id/test - Test user connection
// ============================================================================
router.post("/:id/test", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const id = parseInt(req.params.id);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid credential ID" });
    }

    // Get user credential
    const [userCred] = await db.select().from(userConnectorCredentials)
      .where(and(
        eq(userConnectorCredentials.id, id),
        eq(userConnectorCredentials.tenantId, tenantId),
        eq(userConnectorCredentials.userId, userId)
      ))
      .limit(1);

    if (!userCred) {
      return res.status(404).json({ error: "Connector credential not found" });
    }

    // Get tenant config for company credentials
    const [tenantConfig] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.tenantId, tenantId),
        eq(tenantConnectorConfigs.connectorType, userCred.connectorType)
      ))
      .limit(1);

    if (!tenantConfig) {
      return res.status(400).json({ 
        error: "Tenant connector not configured" 
      });
    }

    const connector = connectorRegistry.get(userCred.connectorType as any);
    if (!connector) {
      return res.status(400).json({ 
        error: `Connector type '${userCred.connectorType}' not found in registry` 
      });
    }

    let success = false;
    let message = "";
    let errorMsg: string | undefined;

    try {
      // Configure with both tenant and user credentials
      const companyCredentials = (tenantConfig.companyCredentials as Record<string, any>) || {};
      const userCredentials = (userCred.userCredentials as Record<string, any>) || {};
      const combinedConfig = {
        ...companyCredentials,
        ...userCredentials
      };
      
      await connector.configure(combinedConfig as any, { 
        tenantId, 
        userId,
        connectorId: userCred.id.toString()
      });
      success = await connector.testConnection();
      message = success ? "Conexão bem-sucedida" : "Falha na conexão";
      
      // Update lastUsedAt on successful test
      if (success) {
        await db.update(userConnectorCredentials)
          .set({ lastUsedAt: new Date() })
          .where(eq(userConnectorCredentials.id, id));
      }
    } catch (err: any) {
      success = false;
      message = "Erro ao testar conexão";
      errorMsg = err.message || String(err);
    }

    console.log(`[User Connectors] Test connection ${userCred.connectorType} for user ${userId}: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    res.json({ 
      success, 
      message, 
      error: errorMsg 
    });
  } catch (error: any) {
    console.error("[User Connectors] Error testing connection:", error);
    res.status(500).json({ 
      error: "Failed to test connection",
      details: error.message 
    });
  }
});

export default router;
