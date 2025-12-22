// Migrated from AssistOS legacy - Phase 4.2
// Source: /tmp/assistos-legacy/server/routes/environment.ts
// Handles sandbox ↔ production environment switching

import { Router } from "express";
import { 
  getUserPermissions, 
  switchEnvironment, 
  getCurrentEnvironment,
  type Environment 
} from "../permissions";
import { SandboxPromotionService } from "../services/sandbox-promotion.service";
import { tenantMiddleware } from "../middleware/tenant-middleware";
import { z } from "zod";
import { ENVIRONMENTS } from "../../../shared/types/environment";

const router = Router();
const promotionService = new SandboxPromotionService();

// Zod schema for promotion manifest validation
const promotionManifestSchema = z.object({
  tenantId: z.string(),
  environment: z.enum(['sandbox', 'production']),
  entities: z.array(z.object({
    tableName: z.string(),
    recordIds: z.array(z.string()),
  })),
  createdAt: z.string().or(z.date()).transform(v => typeof v === 'string' ? new Date(v) : v),
  createdBy: z.string().optional(),
});

/**
 * GET /api/environment/permissions
 * Get current user's permissions and environment info
 */
router.get("/permissions", async (req, res) => {
  console.log("[Environment API] /permissions called, session:", {
    userId: (req as any).session?.userId,
    tenantId: (req as any).session?.activeTenantId,
    hasSession: !!(req as any).session
  });

  // Disable caching to ensure fresh data
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // Use req.session.userId instead of req.user (like /api/auth/me does)
  const userId = (req as any).session?.userId;
  let tenantId = (req as any).session?.activeTenantId;

  if (!userId) {
    console.log("[Environment API] No userId in session, returning 401");
    return res.status(401).json({ error: "Not authenticated" });
  }

  // If no activeTenantId, try to get first tenant from user
  if (!tenantId) {
    try {
      const { db } = await import("../db");
      const { userTenants } = await import("../../../shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const userTenant = await db.query.userTenants.findFirst({
        where: eq(userTenants.userId, userId),
      });
      
      if (userTenant) {
        tenantId = userTenant.tenantId;
        (req as any).session.activeTenantId = tenantId; // Set it in session
      } else {
        return res.status(404).json({ error: "No tenant found for user" });
      }
    } catch (err) {
      console.error("[Environment API] Error finding user tenant:", err);
      return res.status(500).json({ error: "Failed to find tenant" });
    }
  }

  if (!tenantId) {
    return res.status(404).json({ error: "No tenant found" });
  }

  try {
    const permissions = await getUserPermissions(userId, tenantId);
    
    if (!permissions) {
      console.error("[Environment API] No permissions found for user:", userId, "tenant:", tenantId);
      return res.status(404).json({ error: "User not found in tenant" });
    }

    const environment = await getCurrentEnvironment(userId, tenantId);
    const canAccessSandbox = ['owner', 'admin', 'config'].includes(permissions.role);

    const response = {
      ...permissions,
      activeEnvironment: environment,
      environment: environment, // Add 'environment' field for compatibility
      canSwitchEnvironment: canAccessSandbox, // Can switch if can access sandbox
      canAccessSandbox,
    };

    console.log("[Environment API] Returning permissions:", JSON.stringify(response));
    res.json(response);
  } catch (error) {
    console.error("[Environment API] Error getting permissions:", error);
    res.status(500).json({ error: "Failed to get permissions" });
  }
});

/**
 * GET /api/environment/current
 * Get current active environment
 */
router.get("/current", async (req, res) => {
  // Use req.session.userId instead of req.user (like /api/auth/me does)
  const userId = (req as any).session?.userId;
  const tenantId = (req as any).session?.activeTenantId;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const environment = await getCurrentEnvironment(userId, tenantId);
    res.json({ environment });
  } catch (error) {
    console.error("[Environment API] Error getting current environment:", error);
    res.status(500).json({ error: "Failed to get current environment" });
  }
});

/**
 * POST /api/environment/switch
 * Switch between sandbox and production
 * Body: { environment: 'sandbox' | 'production' }
 */
router.post("/switch", async (req, res) => {
  // Use req.session.userId instead of req.user (like /api/auth/me does)
  const userId = (req as any).session?.userId;
  const tenantId = (req as any).session?.activeTenantId;
  const { environment } = req.body;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!environment || (environment !== "sandbox" && environment !== "production")) {
    return res.status(400).json({ 
      error: "Invalid environment. Must be 'sandbox' or 'production'" 
    });
  }

  try {
    const result = await switchEnvironment(userId, tenantId, environment as Environment);
    
    if (!result.success) {
      return res.status(403).json({ error: result.error });
    }

    res.json({ 
      success: true, 
      environment,
      message: `Switched to ${environment} mode successfully` 
    });
  } catch (error) {
    console.error("[Environment API] Error switching environment:", error);
    res.status(500).json({ error: "Failed to switch environment" });
  }
});

/**
 * POST /api/environment/publish
 * Publish ALL modules from sandbox to production
 * Simple one-click promotion for modules only (not data)
 */
router.post("/publish", async (req, res) => {
  const userId = (req as any).session?.userId;
  const tenantId = (req as any).session?.activeTenantId;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    // Get user's permissions
    const permissions = await getUserPermissions(userId, tenantId);
    const currentEnv = await getCurrentEnvironment(userId, tenantId);

    // Only owners/admins can publish
    if (!['owner', 'admin'].includes(permissions.role)) {
      return res.status(403).json({ 
        error: "Only tenant owners and admins can publish to production" 
      });
    }

    // Can only publish FROM sandbox
    if (currentEnv !== 'sandbox') {
      return res.status(400).json({ 
        error: "Publishing is only available from sandbox environment",
        currentEnvironment: currentEnv
      });
    }

    const { sql } = await import("drizzle-orm");
    const { 
      selectFromTenantTable, 
      insertIntoTenantTable, 
      getTenantTableRef 
    } = await import("../utils/tenant-db-helper");
    const { db } = await import("../db");

    console.log(`[Environment API] 🚀 Publishing from sandbox to production for tenant: ${tenantId}`);

    // Get all sandbox modules (tenant-scoped table)
    const sandboxModules = await selectFromTenantTable<{
      id: string;
      module_id: string;
      tenant_id: string;
      is_active: boolean;
      environment: string;
      config: any;
    }>(
      tenantId,
      'tenant_modules',
      sql`environment = 'sandbox'`
    );

    console.log(`[Environment API] Found ${sandboxModules.length} modules in sandbox`);

    // Delete existing production modules (tenant-scoped)
    const tableRef = await getTenantTableRef(tenantId, 'tenant_modules');
    await db.execute(sql`
      DELETE FROM ${tableRef} WHERE environment = 'production'
    `);

    // Copy sandbox modules to production
    for (const module of sandboxModules) {
      await insertIntoTenantTable(tenantId, 'tenant_modules', {
        module_id: module.module_id,
        tenant_id: tenantId,
        is_active: module.is_active,
        environment: 'production',
        config: module.config,
        installed_at: new Date(),
        installed_by: userId,
      });
    }

    const productionModules = sandboxModules.map(module => ({
      moduleId: module.module_id,
      isActive: module.is_active,
    }));

    console.log(`[Environment API] ✅ Successfully published ${productionModules.length} modules to production`);

    res.json({
      success: true,
      modulesPublished: productionModules.length,
      modules: productionModules,
      message: `Successfully published ${productionModules.length} module(s) to production`,
    });
  } catch (error: any) {
    console.error('[Environment API] Error publishing to production:', error);
    res.status(500).json({ 
      error: 'Failed to publish to production',
      message: error.message 
    });
  }
});

/**
 * POST /api/environment/:tenantId/promote
 * Promote records from sandbox to production
 * Body: { environment, entities: [{ tableName, recordIds }], createdBy }
 */
router.post("/:tenantId/promote", tenantMiddleware, async (req, res) => {
  const { tenantId } = req.params;
  
  // Validate user is authenticated
  const userId = (req as any).session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  // Validate user has access to tenant
  if ((req as any).tenantId !== tenantId) {
    return res.status(403).json({ error: "Access denied to tenant" });
  }
  
  // Validate user has permission to promote (only owner, admin, config)
  const userRole = (req as any).userRole;
  if (!['owner', 'admin', 'config'].includes(userRole)) {
    return res.status(403).json({ 
      error: "Insufficient permissions. Only owners, admins, and configurators can promote data." 
    });
  }
  
  // Validate request body
  const parseResult = promotionManifestSchema.safeParse({
    ...req.body,
    tenantId,
    createdBy: userId,
  });
  
  if (!parseResult.success) {
    return res.status(400).json({ 
      error: "Invalid promotion manifest",
      details: parseResult.error.format(),
    });
  }
  
  const manifest = parseResult.data;
  
  // Validate environment is sandbox
  if (manifest.environment !== ENVIRONMENTS.SANDBOX) {
    return res.status(400).json({
      error: "Invalid source environment. Only sandbox records can be promoted.",
    });
  }
  
  try {
    const result = await promotionService.promote(manifest);
    
    if (result.success) {
      res.json({
        message: `Successfully promoted ${result.promotedCount} record(s) to production`,
        ...result,
      });
    } else {
      res.status(500).json({
        message: "Promotion failed",
        ...result,
      });
    }
  } catch (error) {
    console.error("[Environment API] Error during promotion:", error);
    res.status(500).json({ 
      error: "Promotion failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
