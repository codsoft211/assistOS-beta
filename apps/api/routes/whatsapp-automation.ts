/**
 * WhatsApp Automation Client Management Routes (Authenticated)
 * Handles CRUD operations for WhatsApp automation client configuration
 */

import { Router } from "express";
import { db } from "../db";
import { whatsappAutomationClients, clients } from "../../../shared/schema";
import { eq, and, desc, isNotNull, ne, sql } from "drizzle-orm";
import logger from "../logger";
import { z } from "zod";

const router = Router();

// Helper function to normalize phone numbers (remove +, spaces, keep only digits)
function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Remove all non-numeric characters
  const normalized = phone.replace(/\D/g, "");
  return normalized.length > 0 ? normalized : null;
}

// Validation schemas
const createAutomationClientSchema = z.object({
  phoneNumber: z.string().min(1, "Phone number is required"),
  name: z.string().optional(),
  autoReplyEnabled: z.boolean().optional().default(false),
  requiresApproval: z.boolean().optional().default(true),
  notes: z.string().optional(),
});

const updateAutomationClientSchema = z.object({
  phoneNumber: z.string().optional(),
  name: z.string().optional(),
  isActive: z.boolean().optional(),
  autoReplyEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/whatsapp/automation/clients
 * List all automation clients for the current tenant
 */
router.get("/clients", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    logger.info(
      { tenantId: req.user.activeTenantId },
      "[WhatsApp Automation] Listing automation clients",
    );

    const clients = await db.query.whatsappAutomationClients.findMany({
      where: eq(whatsappAutomationClients.tenantId, req.user.activeTenantId),
      orderBy: [desc(whatsappAutomationClients.createdAt)],
    });

    logger.info(
      { count: clients.length },
      "[WhatsApp Automation] Found automation clients",
    );

    res.json({ clients });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Automation] List error");
    res.status(500).json({ error: "Failed to list automation clients" });
  }
});

/**
 * POST /api/whatsapp/automation/clients
 * Create a new automation client
 */
router.post("/clients", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const validationResult = createAutomationClientSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        phoneNumber: data.phoneNumber,
      },
      "[WhatsApp Automation] Creating automation client",
    );

    // Check if client already exists for this tenant and phone number
    const existing = await db.query.whatsappAutomationClients.findFirst({
      where: and(
        eq(whatsappAutomationClients.tenantId, req.user.activeTenantId),
        eq(whatsappAutomationClients.phoneNumber, data.phoneNumber),
      ),
    });

    if (existing) {
      return res.status(400).json({
        error: "Client already exists",
        message: "This phone number is already configured for automation",
      });
    }

    // Create the automation client
    const [client] = await db
      .insert(whatsappAutomationClients)
      .values({
        tenantId: req.user.activeTenantId,
        phoneNumber: data.phoneNumber,
        name: data.name,
        autoReplyEnabled: data.autoReplyEnabled,
        requiresApproval: data.requiresApproval,
        notes: data.notes,
        isActive: true,
        createdBy: req.user.id,
      })
      .returning();

    logger.info(
      { clientId: client.id },
      "[WhatsApp Automation] Automation client created successfully",
    );

    res.status(201).json({ client });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Automation] Create error");
    res.status(500).json({ error: "Failed to create automation client" });
  }
});

/**
 * PATCH /api/whatsapp/automation/clients/:id
 * Update an automation client
 */
router.patch("/clients/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { id } = req.params;

    const validationResult = updateAutomationClientSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        clientId: id,
      },
      "[WhatsApp Automation] Updating automation client",
    );

    // Verify ownership
    const existingClient = await db.query.whatsappAutomationClients.findFirst({
      where: and(
        eq(whatsappAutomationClients.id, id),
        eq(whatsappAutomationClients.tenantId, req.user.activeTenantId),
      ),
    });

    if (!existingClient) {
      return res.status(404).json({ error: "Automation client not found" });
    }

    // Update the client
    const [updatedClient] = await db
      .update(whatsappAutomationClients)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappAutomationClients.id, id),
          eq(whatsappAutomationClients.tenantId, req.user.activeTenantId),
        ),
      )
      .returning();

    logger.info(
      { clientId: id },
      "[WhatsApp Automation] Automation client updated successfully",
    );

    res.json({ client: updatedClient });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Automation] Update error");
    res.status(500).json({ error: "Failed to update automation client" });
  }
});

/**
 * DELETE /api/whatsapp/automation/clients/:id
 * Delete an automation client
 */
router.delete("/clients/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { id } = req.params;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        clientId: id,
      },
      "[WhatsApp Automation] Deleting automation client",
    );

    // Verify ownership before deletion
    const existingClient = await db.query.whatsappAutomationClients.findFirst({
      where: and(
        eq(whatsappAutomationClients.id, id),
        eq(whatsappAutomationClients.tenantId, req.user.activeTenantId),
      ),
    });

    if (!existingClient) {
      return res.status(404).json({ error: "Automation client not found" });
    }

    // Delete the client
    await db
      .delete(whatsappAutomationClients)
      .where(
        and(
          eq(whatsappAutomationClients.id, id),
          eq(whatsappAutomationClients.tenantId, req.user.activeTenantId),
        ),
      );

    logger.info(
      { clientId: id },
      "[WhatsApp Automation] Automation client deleted successfully",
    );

    res.json({ success: true, message: "Automation client deleted" });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Automation] Delete error");
    res.status(500).json({ error: "Failed to delete automation client" });
  }
});

/**
 * POST /api/whatsapp/automation/clients/bulk-from-crm
 * Bulk import clients from CRM clients table
 */
router.post("/clients/bulk-from-crm", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    logger.info(
      { tenantId: req.user.activeTenantId },
      "[WhatsApp Automation] Starting bulk import from CRM",
    );

    // Retrieve all clients with phone numbers for the tenant
    const crmClients = await db
      .select({
        id: clients.id,
        name: clients.name,
        phone: clients.phone,
      })
      .from(clients)
      .where(
        and(
          eq(clients.tenantId, req.user.activeTenantId),
          isNotNull(clients.phone),
          ne(clients.phone, ""),
        ),
      );

    if (crmClients.length === 0) {
      return res.json({
        added: 0,
        skipped: 0,
        total: 0,
        message: "No clients with phone numbers found in CRM",
      });
    }

    // Get existing automation clients to check for duplicates
    const existingAutomationClients = await db
      .select({
        phoneNumber: whatsappAutomationClients.phoneNumber,
      })
      .from(whatsappAutomationClients)
      .where(eq(whatsappAutomationClients.tenantId, req.user.activeTenantId));

    const existingPhoneNumbers = new Set(
      existingAutomationClients.map((c) => c.phoneNumber),
    );

    // Process and prepare clients for insertion
    const clientsToInsert: Array<{
      tenantId: string;
      phoneNumber: string;
      name: string | null;
      isActive: boolean;
      requiresApproval: boolean;
      autoReplyEnabled: boolean;
      createdBy: string;
    }> = [];

    let skipped = 0;

    for (const crmClient of crmClients) {
      const normalizedPhone = normalizePhoneNumber(crmClient.phone);

      // Skip if phone number is invalid or already exists
      if (!normalizedPhone) {
        skipped++;
        continue;
      }

      if (existingPhoneNumbers.has(normalizedPhone)) {
        skipped++;
        continue;
      }

      clientsToInsert.push({
        tenantId: req.user.activeTenantId,
        phoneNumber: normalizedPhone,
        name: crmClient.name || null,
        isActive: true,
        requiresApproval: true,
        autoReplyEnabled: false,
        createdBy: req.user.id,
      });

      // Add to existing set to avoid duplicates within the same batch
      existingPhoneNumbers.add(normalizedPhone);
    }

    if (clientsToInsert.length === 0) {
      return res.json({
        added: 0,
        skipped: skipped,
        total: crmClients.length,
        message: "All clients are already configured or have invalid phone numbers",
      });
    }

    // Bulk insert new automation clients
    await db.insert(whatsappAutomationClients).values(clientsToInsert);

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        added: clientsToInsert.length,
        skipped: skipped,
        total: crmClients.length,
      },
      "[WhatsApp Automation] Bulk import completed",
    );

    res.json({
      added: clientsToInsert.length,
      skipped: skipped,
      total: crmClients.length,
      message: `Successfully added ${clientsToInsert.length} client(s), skipped ${skipped} duplicate(s)`,
    });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Automation] Bulk import error");
    res.status(500).json({ error: "Failed to import clients from CRM" });
  }
});

export default router;
