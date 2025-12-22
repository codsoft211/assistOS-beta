// Migrated from AssistOS legacy - Phase 4.6
// Module interface configuration routes (sidebar visibility, menu ordering)

import { Router } from "express";
import { db } from "../db";
import { moduleInterfaceConfig } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const updateInterfaceSchema = z.object({
  moduleSlug: z.string().min(1),
  menuId: z.string().min(1),
  isVisible: z.boolean(),
});

/**
 * GET /api/module-interface
 * Get module interface configuration for current tenant
 * Returns which modules are visible in sidebar, their order, etc.
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const configs = await db
      .select()
      .from(moduleInterfaceConfig)
      .where(eq(moduleInterfaceConfig.tenantId, tenantId));

    res.json({
      configs,
      total: configs.length,
    });
  } catch (error: any) {
    console.error("[Module Interface API] Error fetching configs:", error);
    res.status(500).json({ 
      error: "Failed to fetch module interface configs",
      details: error.message 
    });
  }
});

/**
 * GET /api/module-interface/:moduleSlug
 * Get interface configuration for specific module
 */
router.get("/:moduleSlug", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const { moduleSlug } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const configs = await db
      .select()
      .from(moduleInterfaceConfig)
      .where(and(
        eq(moduleInterfaceConfig.tenantId, tenantId),
        eq(moduleInterfaceConfig.moduleSlug, moduleSlug)
      ));

    res.json({
      configs,
    });
  } catch (error: any) {
    console.error("[Module Interface API] Error fetching module config:", error);
    res.status(500).json({ 
      error: "Failed to fetch module config",
      details: error.message 
    });
  }
});

/**
 * POST /api/module-interface
 * Create or update module interface configuration
 */
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const configData = updateInterfaceSchema.parse(req.body);

    // TODO: Check user has permission to configure module interface

    // Check if config already exists
    const [existing] = await db
      .select()
      .from(moduleInterfaceConfig)
      .where(and(
        eq(moduleInterfaceConfig.tenantId, tenantId),
        eq(moduleInterfaceConfig.moduleSlug, configData.moduleSlug),
        eq(moduleInterfaceConfig.menuId, configData.menuId)
      ))
      .limit(1);

    let result;

    if (existing) {
      // Update existing config
      [result] = await db
        .update(moduleInterfaceConfig)
        .set({
          isVisible: configData.isVisible,
          updatedAt: new Date(),
        })
        .where(eq(moduleInterfaceConfig.id, existing.id))
        .returning();
    } else {
      // Create new config
      [result] = await db
        .insert(moduleInterfaceConfig)
        .values({
          tenantId,
          moduleSlug: configData.moduleSlug,
          menuId: configData.menuId,
          isVisible: configData.isVisible,
        })
        .returning();
    }

    res.json({
      success: true,
      config: result,
    });
  } catch (error: any) {
    console.error("[Module Interface API] Error updating config:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to update config",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/module-interface/bulk
 * Bulk update module visibility (e.g., hide multiple modules at once)
 */
router.patch("/bulk", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { configs } = req.body; // Array of { moduleSlug, menuId, isVisible }

    // TODO: Check user has permission to configure module interface
    // TODO: Validate all configs
    // TODO: Batch update or insert configs

    res.json({
      success: false,
      message: "Bulk update not yet fully implemented"
    });
  } catch (error: any) {
    console.error("[Module Interface API] Error bulk updating:", error);
    res.status(500).json({ 
      error: "Failed to bulk update configs",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/module-interface/:id
 * Delete module interface configuration
 */
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Check user has permission to configure module interface

    const deleted = await db
      .delete(moduleInterfaceConfig)
      .where(and(
        eq(moduleInterfaceConfig.id, id),
        eq(moduleInterfaceConfig.tenantId, tenantId)
      ))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: "Config not found" });
    }

    res.json({
      success: true,
      message: "Config deleted successfully"
    });
  } catch (error: any) {
    console.error("[Module Interface API] Error deleting config:", error);
    res.status(500).json({ 
      error: "Failed to delete config",
      details: error.message 
    });
  }
});

export default router;
