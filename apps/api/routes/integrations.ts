// Migrated from AssistOS legacy - Phase 4.5
// Integration configuration routes (286 lines original)
// Manages integration instances (e.g., "Accounting Integration with Jasmin")

import { Router } from "express";
import { db } from "../db";
import { z } from "zod";

const router = Router();

// TODO: Import from schema when integrations table is defined
// TODO: Define integration types: accounting, communication, erp, crm, etc.
// TODO: Reference: packages/integrations/accounting, packages/integrations/communication, etc.

const createIntegrationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["accounting", "communication", "erp", "crm", "email", "storage", "analytics"]),
  provider: z.string().min(1, "Provider is required"), // e.g., "jasmin", "primavera", "gmail"
  connectorSlug: z.string().optional(), // Reference to connector if OAuth/API-based
  config: z.record(z.any()), // Integration-specific configuration
  isActive: z.boolean().default(true),
  syncEnabled: z.boolean().default(false),
  syncInterval: z.number().int().positive().optional(), // Minutes between syncs
});

const updateIntegrationSchema = createIntegrationSchema.partial();

/**
 * GET /api/integrations
 * List configured integrations for tenant
 * Query params: ?type=accounting&active=true
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { type, active } = req.query;

    // TODO: Query integrations table
    // TODO: Filter by type and active status
    // TODO: Include last sync status and timestamp
    // TODO: Include connector status if applicable

    res.json({
      integrations: [],
      message: "Integration listing not yet implemented - integrations table pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error listing integrations:", error);
    res.status(500).json({ 
      error: "Failed to list integrations",
      details: error.message 
    });
  }
});

/**
 * GET /api/integrations/:id
 * Get integration details
 */
router.get("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch integration by ID
    // TODO: Include sync history
    // TODO: Include field mappings
    // TODO: Include error logs

    res.status(404).json({
      error: "Integration not found",
      message: "Integrations table not yet migrated"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error fetching integration:", error);
    res.status(500).json({ 
      error: "Failed to fetch integration",
      details: error.message 
    });
  }
});

/**
 * POST /api/integrations
 * Create a new integration instance
 */
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const integrationData = createIntegrationSchema.parse(req.body);

    // TODO: Validate integration type and provider
    // TODO: Validate connector exists if connectorSlug provided
    // TODO: Test integration connection before creating
    // TODO: Create integration record
    // TODO: Initialize sync schedule if syncEnabled
    // TODO: Create audit log entry

    res.status(201).json({
      success: false,
      message: "Integration creation not yet implemented - integrations table pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error creating integration:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to create integration",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/integrations/:id
 * Update integration configuration
 */
router.patch("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const updates = updateIntegrationSchema.parse(req.body);

    // TODO: Fetch existing integration
    // TODO: Validate updates
    // TODO: Test connection if config changed
    // TODO: Update integration record
    // TODO: Update sync schedule if syncInterval changed
    // TODO: Create audit log entry

    res.json({
      success: false,
      message: "Integration update not yet implemented - integrations table pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error updating integration:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to update integration",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/integrations/:id
 * Delete integration
 */
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch existing integration
    // TODO: Stop sync schedule
    // TODO: Delete integration record
    // TODO: Optionally: disconnect associated connector
    // TODO: Create audit log entry

    res.json({
      success: false,
      message: "Integration deletion not yet implemented - integrations table pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error deleting integration:", error);
    res.status(500).json({ 
      error: "Failed to delete integration",
      details: error.message 
    });
  }
});

/**
 * POST /api/integrations/:id/test
 * Test integration connection
 */
router.post("/:id/test", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch integration
    // TODO: Load integration handler from packages/integrations/{type}
    // TODO: Test API connection
    // TODO: Return success/failure with details

    res.json({
      success: false,
      message: "Integration test not yet implemented - integration handlers pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error testing integration:", error);
    res.status(500).json({ 
      error: "Failed to test integration",
      details: error.message 
    });
  }
});

/**
 * POST /api/integrations/:id/sync
 * Trigger manual sync
 */
router.post("/:id/sync", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { direction } = req.body; // "pull", "push", or "bidirectional"

    // TODO: Fetch integration
    // TODO: Validate integration is active
    // TODO: Queue sync job (BullMQ)
    // TODO: Return job ID for status tracking
    // TODO: Reference: apps/worker for job processing

    res.json({
      success: false,
      message: "Manual sync not yet implemented - worker jobs pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error triggering sync:", error);
    res.status(500).json({ 
      error: "Failed to trigger sync",
      details: error.message 
    });
  }
});

/**
 * GET /api/integrations/:id/sync-history
 * Get sync history for integration
 */
router.get("/:id/sync-history", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { limit = 20, offset = 0 } = req.query;

    // TODO: Query sync_history table
    // TODO: Include: timestamp, status, records synced, errors
    // TODO: Support pagination

    res.json({
      history: [],
      total: 0,
      message: "Sync history not yet implemented - sync_history table pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error fetching sync history:", error);
    res.status(500).json({ 
      error: "Failed to fetch sync history",
      details: error.message 
    });
  }
});

/**
 * GET /api/integrations/:id/field-mappings
 * Get field mappings for integration
 */
router.get("/:id/field-mappings", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch integration field mappings
    // TODO: Map AssistOS fields to external system fields
    // TODO: Include transformation rules

    res.json({
      mappings: [],
      message: "Field mappings not yet implemented - integrations table pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error fetching field mappings:", error);
    res.status(500).json({ 
      error: "Failed to fetch field mappings",
      details: error.message 
    });
  }
});

/**
 * PUT /api/integrations/:id/field-mappings
 * Update field mappings
 */
router.put("/:id/field-mappings", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { mappings } = req.body;

    // TODO: Validate mapping schema
    // TODO: Update field mappings
    // TODO: Test mappings with sample data
    // TODO: Create audit log entry

    res.json({
      success: false,
      message: "Field mapping update not yet implemented - integrations table pending migration"
    });
  } catch (error: any) {
    console.error("[Integrations API] Error updating field mappings:", error);
    res.status(500).json({ 
      error: "Failed to update field mappings",
      details: error.message 
    });
  }
});

export default router;
