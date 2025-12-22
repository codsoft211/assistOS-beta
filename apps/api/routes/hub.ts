// Migrated from AssistOS legacy - Phase 4.6
// Module marketplace/management routes

import { Router } from "express";
import { db } from "../db";
import { moduleTemplates, modules } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { quotaMiddleware } from "../middleware/quota.middleware";
import { RollbackSnapshots } from "../middleware/rollback-snapshot.middleware";
import { seedFinanceiroDefaultPages } from "../services/module-page.service";

const router = Router();

/**
 * GET /api/hub/templates
 * List available module templates from marketplace
 * Query params: ?category=financial&search=invoice
 */
router.get("/templates", async (req, res) => {
  try {
    const { category, search } = req.query;

    // Query module templates
    let query = db.select().from(moduleTemplates).where(eq(moduleTemplates.isActive, true));

    // TODO: Add category filter if provided
    // TODO: Add search filter if provided
    // TODO: Include module features and capabilities

    const templates = await query;

    res.json({
      templates,
      total: templates.length,
    });
  } catch (error: any) {
    console.error("[Hub API] Error listing templates:", error);
    res.status(500).json({ 
      error: "Failed to list templates",
      details: error.message 
    });
  }
});

/**
 * GET /api/hub/templates/:slug
 * Get module template details
 */
router.get("/templates/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const [template] = await db
      .select()
      .from(moduleTemplates)
      .where(and(
        eq(moduleTemplates.slug, slug),
        eq(moduleTemplates.isActive, true)
      ))
      .limit(1);

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    // TODO: Include template screenshots, documentation
    // TODO: Include installation requirements
    // TODO: Include user reviews/ratings if available

    res.json(template);
  } catch (error: any) {
    console.error("[Hub API] Error fetching template:", error);
    res.status(500).json({ 
      error: "Failed to fetch template",
      details: error.message 
    });
  }
});

/**
 * GET /api/hub/installed
 * List installed modules for current tenant
 */
router.get("/installed", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const installedModules = await db
      .select()
      .from(modules)
      .where(eq(modules.tenantId, tenantId));

    res.json({
      modules: installedModules,
      total: installedModules.length,
    });
  } catch (error: any) {
    console.error("[Hub API] Error listing installed modules:", error);
    res.status(500).json({ 
      error: "Failed to list installed modules",
      details: error.message 
    });
  }
});

/**
 * POST /api/hub/install
 * Install a module from template
 * 
 * GAP #5: Enforces module quota limits via quotaMiddleware
 * GAP #6: Auto-snapshot before module installation
 */
router.post("/install", quotaMiddleware('modules'), RollbackSnapshots.moduleInstallation, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { templateSlug, customName, customSettings } = req.body;

    // Fetch template
    const [template] = await db
      .select()
      .from(moduleTemplates)
      .where(and(
        eq(moduleTemplates.slug, templateSlug),
        eq(moduleTemplates.isActive, true)
      ))
      .limit(1);

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Check if module already installed
    const existing = await db
      .select()
      .from(modules)
      .where(and(
        eq(modules.tenantId, tenantId),
        eq(modules.slug, templateSlug)
      ))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: "Module already installed" });
    }

    // TODO: Check user has permission to install modules
    // TODO: Validate module dependencies
    // TODO: Run module installation script (create entities, seed data, etc.)

    const [module] = await db
      .insert(modules)
      .values({
        tenantId,
        templateId: template.id,
        name: customName || template.name,
        slug: templateSlug,
        customSettings: customSettings || {},
        isActive: true,
      })
      .returning();

    // TODO: Create module interface configuration
    // TODO: Initialize module-specific data
    // TODO: Create audit log entry

    res.status(201).json({
      success: true,
      module,
      message: "Module installed successfully (basic installation - full setup pending)"
    });
  } catch (error: any) {
    console.error("[Hub API] Error installing module:", error);
    res.status(500).json({ 
      error: "Failed to install module",
      details: error.message 
    });
  }
});

/**
 * POST /api/hub/uninstall/:slug
 * Uninstall a module
 */
router.post("/uninstall/:slug", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { slug } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Check user has permission to uninstall modules
    // TODO: Check if module has data (warn user)
    // TODO: Run module uninstallation script
    // TODO: Delete module record or mark as inactive

    const deleted = await db
      .delete(modules)
      .where(and(
        eq(modules.tenantId, tenantId),
        eq(modules.slug, slug)
      ))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: "Module not found" });
    }

    // TODO: Create audit log entry

    res.json({
      success: true,
      message: "Module uninstalled successfully (basic uninstall - data cleanup pending)"
    });
  } catch (error: any) {
    console.error("[Hub API] Error uninstalling module:", error);
    res.status(500).json({ 
      error: "Failed to uninstall module",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/hub/modules/:slug/settings
 * Update module settings
 */
router.patch("/modules/:slug/settings", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { slug } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { customSettings } = req.body;

    // TODO: Check user has permission to configure modules
    // TODO: Validate settings against module schema

    const [updated] = await db
      .update(modules)
      .set({
        customSettings,
        updatedAt: new Date(),
      })
      .where(and(
        eq(modules.tenantId, tenantId),
        eq(modules.slug, slug)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Module not found" });
    }

    res.json({
      success: true,
      module: updated,
    });
  } catch (error: any) {
    console.error("[Hub API] Error updating module settings:", error);
    res.status(500).json({ 
      error: "Failed to update module settings",
      details: error.message 
    });
  }
});

/**
 * POST /api/hub/modules/:slug/toggle
 * Enable/disable a module
 */
router.post("/modules/:slug/toggle", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { slug } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { isActive } = req.body;

    // TODO: Check user has permission to toggle modules

    const [updated] = await db
      .update(modules)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(and(
        eq(modules.tenantId, tenantId),
        eq(modules.slug, slug)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Module not found" });
    }

    // Auto-seed default pages for financeiro module when activated
    if (slug === 'financeiro' && isActive === true) {
      try {
        const pagesCreated = await seedFinanceiroDefaultPages(
          tenantId,
          updated.environment || 'production'
        );
        console.log(`[Hub API] Auto-seeded ${pagesCreated} Financeiro pages for tenant ${tenantId}`);
      } catch (error) {
        console.error('[Hub API] Failed to auto-seed Financeiro pages:', error);
        // Don't fail the whole toggle operation, just log the error
      }
    }

    res.json({
      success: true,
      module: updated,
    });
  } catch (error: any) {
    console.error("[Hub API] Error toggling module:", error);
    res.status(500).json({ 
      error: "Failed to toggle module",
      details: error.message 
    });
  }
});

export default router;
