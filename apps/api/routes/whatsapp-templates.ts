/**
 * WhatsApp Templates Routes (Authenticated)
 * Handles template management and synchronization
 */

import { Router } from "express";
import { db } from "../db";
import { whatsappTemplates, whatsappAccounts } from "../../../shared/schema";
import { eq, and, desc, sql, or, like, ilike, ne } from "drizzle-orm";
import logger from "../logger";
import { whatsappTemplateSyncService } from "../services/whatsapp-template-sync.service";

const router = Router();

/**
 * GET /api/whatsapp/templates
 * List WhatsApp templates for the current tenant with filters
 */
router.get("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    
    const accountId = req.query.accountId as string;
    const status = req.query.status as string;
    const language = req.query.language as string;
    const search = req.query.search as string;

    logger.info({
      tenantId: req.user.activeTenantId,
      page,
      limit,
      accountId,
      status,
      language,
      search,
    }, "[WhatsApp Templates] Listing templates");

    // Check if account is web-connector (doesn't support templates)
    if (accountId) {
      const account = await db.query.whatsappAccounts.findFirst({
        where: and(
          eq(whatsappAccounts.id, accountId),
          eq(whatsappAccounts.tenantId, req.user.activeTenantId)
        ),
      });

      if (account?.connectionType === 'web-connector') {
        logger.info({ accountId }, "[WhatsApp Templates] Web-connector account - returning empty templates");
        return res.json({
          templates: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
          message: "Templates are not available for WhatsApp Web accounts. Templates are only supported via WhatsApp Business Cloud API.",
        });
      }
    }

    // Build where clause
    const whereConditions: any[] = [
      eq(whatsappTemplates.tenantId, req.user.activeTenantId),
      ne(whatsappTemplates.status, 'DELETED'), // Exclude soft-deleted templates
    ];

    if (accountId) {
      whereConditions.push(eq(whatsappTemplates.accountId, accountId));
    }

    if (status) {
      whereConditions.push(eq(whatsappTemplates.status, status));
    }

    if (language) {
      whereConditions.push(eq(whatsappTemplates.language, language));
    }

    if (search) {
      whereConditions.push(
        or(
          ilike(whatsappTemplates.name, `%${search}%`),
          sql`${whatsappTemplates.category} ILIKE ${`%${search}%`}`
        )
      );
    }

    const whereClause = and(...whereConditions);

    const templates = await db.query.whatsappTemplates.findMany({
      where: whereClause,
      orderBy: [desc(whatsappTemplates.createdAt)],
      limit,
      offset,
      with: {
        account: {
          columns: {
            id: true,
            phoneNumber: true,
            displayName: true,
          },
        },
        createdByUser: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(whatsappTemplates)
      .where(whereClause);

    const totalCount = Number(total[0]?.count || 0);

    logger.info({ count: templates.length, total: totalCount }, "[WhatsApp Templates] Found templates");

    res.json({
      templates,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Templates] List error");
    res.status(500).json({ error: "Failed to list WhatsApp templates" });
  }
});

/**
 * GET /api/whatsapp/templates/:id
 * Get a single WhatsApp template with full details
 */
router.get("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const templateId = req.params.id;

    logger.info({
      tenantId: req.user.activeTenantId,
      templateId,
    }, "[WhatsApp Templates] Getting template details");

    const template = await db.query.whatsappTemplates.findFirst({
      where: and(
        eq(whatsappTemplates.id, templateId),
        eq(whatsappTemplates.tenantId, req.user.activeTenantId)
      ),
      with: {
        account: {
          columns: {
            id: true,
            phoneNumber: true,
            displayName: true,
            businessAccountId: true,
          },
        },
        createdByUser: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    logger.info({ templateId, name: template.name }, "[WhatsApp Templates] Found template");

    res.json({ template });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Templates] Get template error");
    res.status(500).json({ error: "Failed to get template" });
  }
});

/**
 * POST /api/whatsapp/templates/sync
 * Trigger template synchronization for a WhatsApp account
 */
router.post("/sync", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    logger.info({
      tenantId: req.user.activeTenantId,
      accountId,
      userId: req.user.id,
    }, "[WhatsApp Templates] Starting sync");

    // Verify account belongs to tenant
    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.tenantId, req.user.activeTenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: "WhatsApp account not found" });
    }

    // Trigger sync
    const syncSummary = await whatsappTemplateSyncService.syncTemplates(
      accountId,
      req.user.activeTenantId
    );

    logger.info({ syncSummary }, "[WhatsApp Templates] Sync completed");

    if (syncSummary.success) {
      res.json({
        success: true,
        message: "Templates synchronized successfully",
        summary: syncSummary,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Template sync completed with errors",
        summary: syncSummary,
      });
    }
  } catch (error: any) {
    logger.error({ error }, "[WhatsApp Templates] Sync error");
    res.status(500).json({ 
      error: "Failed to sync templates",
      details: error.message,
    });
  }
});

/**
 * DELETE /api/whatsapp/templates/:id
 * Soft delete a WhatsApp template
 */
router.delete("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const templateId = req.params.id;

    logger.info({
      tenantId: req.user.activeTenantId,
      templateId,
      userId: req.user.id,
    }, "[WhatsApp Templates] Deleting template");

    // Verify template belongs to tenant
    const template = await db.query.whatsappTemplates.findFirst({
      where: and(
        eq(whatsappTemplates.id, templateId),
        eq(whatsappTemplates.tenantId, req.user.activeTenantId)
      ),
    });

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Soft delete by updating status
    await db
      .update(whatsappTemplates)
      .set({
        status: 'DELETED',
        updatedAt: new Date(),
      })
      .where(eq(whatsappTemplates.id, templateId));

    logger.info({ templateId, name: template.name }, "[WhatsApp Templates] Template deleted");

    res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Templates] Delete error");
    res.status(500).json({ error: "Failed to delete template" });
  }
});

export default router;
