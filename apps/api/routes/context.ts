// Migrated from AssistOS legacy - Phase 4.1
// Source: /tmp/assistos-legacy/server/routes/context.ts

import { Router } from "express";
import { ContextService } from "../services/context.service";
import { db } from "../db";
import { tenants, userTenants } from "../../../shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { realtimeEvents } from "../services/event-emitter";
import { REALTIME_CHANNELS } from "../../../shared/realtime";

const router = Router();
const contextService = new ContextService();

// GET /api/context/session - Carrega contexto completo
router.get("/session", async (req, res) => {
  try {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const context = await contextService.getSession(userId, tenantId);
    res.json(context);
  } catch (error) {
    console.error("[Context API] Error getting session:", error);
    res.status(500).json({ error: "Failed to load context" });
  }
});

// PATCH /api/context/profile - Atualiza perfil
router.patch("/profile", async (req, res) => {
  try {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const updates = req.body;
    const result = await contextService.updateProfile(userId, tenantId, updates);
    res.json({ success: true, profile: result[0] });
  } catch (error) {
    console.error("[Context API] Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// PATCH /api/context/business - Atualiza contexto empresa
router.patch("/business", async (req, res) => {
  try {
    const tenantId = req.session.activeTenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const updates = req.body;
    const result = await contextService.updateBusiness(tenantId, updates);

    // Emit SSE event for real-time tenant updates (Phase 4.3)
    try {
      realtimeEvents.emitForTenant(REALTIME_CHANNELS.SETTINGS_TENANT_UPDATED, tenantId, {
        tenantId,
        tenant: result[0],
      });
    } catch (error) {
      console.error("Failed to emit SSE event for tenant update:", error);
      // Continue - don't fail HTTP request
    }

    res.json({ success: true, context: result[0] });
  } catch (error) {
    console.error("[Context API] Error updating business:", error);
    res.status(500).json({ error: "Failed to update business context" });
  }
});

// QUARANTINED: Insights, handoff, feedback, analyze endpoints disabled
// These depend on memoryService and patternExtractor which may need migration
// TODO: Re-enable after full memory/pattern system is migrated

// POST /api/context/insights - Adiciona insight
// router.post("/insights", async (req, res) => {
//   ...
// });

// POST /api/context/handoff - Regista handoff
// router.post("/handoff", async (req, res) => {
//   ...
// });

// POST /api/context/feedback - Salva feedback do utilizador
// router.post("/feedback", async (req, res) => {
//   ...
// });

// POST /api/context/analyze - Trigger análise manual de patterns
// router.post("/analyze", async (req, res) => {
//   ...
// });

// GET /api/context - Return current tenant context for authenticated user
router.get("/", async (req, res) => {
  try {
    const userId = req.session.userId;
    const activeTenantId = req.session.activeTenantId;

    if (!userId || !activeTenantId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, activeTenantId))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        tier: tenant.tier,
        country: tenant.country,
        currency: tenant.currency,
        timezone: tenant.timezone,
        fiscalYearStart: tenant.fiscalYearStart,
        accountingStandard: tenant.accountingStandard,
        logo: tenant.logo,
        status: tenant.status,
      },
      user: {
        id: userId,
        activeTenantId: activeTenantId,
      }
    });
  } catch (error) {
    console.error("[Context API] Error getting context:", error);
    res.status(500).json({ error: "Failed to load context" });
  }
});

// GET /api/tenants/list - Return all tenants the user has access to
// ✅ UPDATED: Uses tenantService.getUserTenants() which handles cross-tenant queries
router.get("/tenants/list", async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Default to production environment (activeEnvironment not in session yet)
    const activeEnvironment = 'production';

    // Use tenantService.getUserTenants() which handles cross-tenant schema queries
    const { getUserTenants } = await import('../services/tenant.service');
    const userTenantsList = await getUserTenants(userId, activeEnvironment);

    // Get full tenant details to include tier, country, currency, timezone
    const tenantIds = userTenantsList.map(t => t.id);
    const fullTenantDetails = await db
      .select()
      .from(tenants)
      .where(inArray(tenants.id, tenantIds));
    
    const tenantDetailsMap = new Map(fullTenantDetails.map(t => [t.id, t]));
    
    // Map to expected format (getUserTenants returns TenantWithRole[])
    const tenantsList = userTenantsList.map(t => {
      const tenantDetails = tenantDetailsMap.get(t.id);
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        tier: tenantDetails?.tier || 'default',
        role: t.role,
        joinedAt: t.joinedAt || t.createdAt, // Use createdAt as fallback
        country: tenantDetails?.country || 'PT',
        currency: tenantDetails?.currency || 'EUR',
        timezone: tenantDetails?.timezone || 'Europe/Lisbon',
        status: t.status,
      };
    });

    res.json({
      tenants: tenantsList
    });
  } catch (error) {
    console.error("[Context API] Error getting tenants list:", error);
    res.status(500).json({ error: "Failed to load tenants" });
  }
});

export default router;
