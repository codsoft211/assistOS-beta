/**
 * WhatsApp Accounts Management Routes (Authenticated)
 * Handles CRUD operations for WhatsApp Business API accounts
 */

import { Router } from "express";
import { db } from "../db";
import { whatsappAccounts } from "../../../shared/schema";
import { eq, and, desc, ne } from "drizzle-orm";
import logger from "../logger";
import { z } from "zod";
import { whatsappTemplateSyncService } from "../services/whatsapp-template-sync.service";
import axios from "axios";

const router = Router();

// Validation schemas
const createAccountSchema = z.object({
  phoneNumber: z.string().min(1, "Phone number is required"),
  phoneNumberId: z.string().min(1, "Phone number ID is required"),
  businessAccountId: z.string().min(1, "Business account ID is required"),
  accessToken: z.string().min(1, "Access token is required"),
  webhookVerifyToken: z.string().min(1, "Webhook verify token is required"),
  displayName: z.string().optional(),
  isPrimary: z.boolean().optional().default(false),
});

const updateAccountSchema = z.object({
  phoneNumber: z.string().optional(),
  phoneNumberId: z.string().optional(),
  businessAccountId: z.string().optional(),
  accessToken: z.string().optional(),
  webhookVerifyToken: z.string().optional(),
  displayName: z.string().optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/whatsapp/accounts
 * List WhatsApp accounts for the current tenant
 */
router.get("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    logger.info(
      { tenantId: req.user.activeTenantId, env: process.env.NODE_ENV },
      "[WhatsApp Accounts] Listing accounts",
    );

    const accounts = await db.query.whatsappAccounts.findMany({
      where: eq(whatsappAccounts.tenantId, req.user.activeTenantId),
      orderBy: [desc(whatsappAccounts.createdAt)],
      columns: {
        id: true,
        phoneNumber: true,
        phoneNumberId: true,
        businessAccountId: true,
        displayName: true,
        connectionType: true, // CRITICAL: Include connectionType for web-connector filtering
        isActive: true,
        isPrimary: true,
        verificationStatus: true,
        qualityRating: true,
        messagingLimit: true,
        lastUsedAt: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        // SECURITY: Explicitly exclude sensitive fields
        accessToken: false,
        webhookVerifyToken: false,
        webhookUrl: false,
      },
    });

    logger.info(
      { 
        count: accounts.length,
        accountIds: accounts.map(a => a.id).slice(0, 5),
        connectionTypes: accounts.map(a => (a as any).connectionType),
      },
      "[WhatsApp Accounts] Found accounts",
    );

    res.json({ accounts });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Accounts] List error");
    res.status(500).json({ error: "Failed to list WhatsApp accounts" });
  }
});

/**
 * POST /api/whatsapp/accounts
 * Create a new WhatsApp account
 */
router.post("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const validationResult = createAccountSchema.safeParse(req.body);

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
      "[WhatsApp Accounts] Creating account",
    );

    // If isPrimary is true, unset other primary accounts
    if (data.isPrimary) {
      await db
        .update(whatsappAccounts)
        .set({ isPrimary: false })
        .where(eq(whatsappAccounts.tenantId, req.user.activeTenantId));
    }

    // Create the account
    const [account] = await db
      .insert(whatsappAccounts)
      .values({
        tenantId: req.user.activeTenantId,
        userId: req.user.id,
        phoneNumber: data.phoneNumber,
        phoneNumberId: data.phoneNumberId,
        businessAccountId: data.businessAccountId,
        accessToken: data.accessToken,
        webhookVerifyToken: data.webhookVerifyToken,
        displayName: data.displayName || data.phoneNumber,
        isPrimary: data.isPrimary,
        isActive: true,
        verificationStatus: "unverified",
      })
      .returning();

    logger.info(
      { accountId: account.id },
      "[WhatsApp Accounts] Account created",
    );

    // Return account without sensitive fields
    const { accessToken, webhookVerifyToken, webhookUrl, ...safeAccount } =
      account;

    res.status(201).json({ account: safeAccount });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Accounts] Create error");
    res.status(500).json({ error: "Failed to create WhatsApp account" });
  }
});

/**
 * PATCH /api/whatsapp/accounts/:id
 * Update a WhatsApp account
 */
router.patch("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = req.params.id;

    const validationResult = updateAccountSchema.safeParse(req.body);

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
        accountId,
      },
      "[WhatsApp Accounts] Updating account",
    );

    // Verify account belongs to tenant
    const existingAccount = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.tenantId, req.user.activeTenantId),
      ),
    });

    if (!existingAccount) {
      return res.status(404).json({ error: "Account not found" });
    }

    // If isPrimary is true, unset other primary accounts
    if (data.isPrimary) {
      await db
        .update(whatsappAccounts)
        .set({ isPrimary: false })
        .where(
          and(
            eq(whatsappAccounts.tenantId, req.user.activeTenantId),
            ne(whatsappAccounts.id, accountId),
          ),
        );
    }

    // Update the account
    const [updatedAccount] = await db
      .update(whatsappAccounts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappAccounts.id, accountId),
          eq(whatsappAccounts.tenantId, req.user.activeTenantId),
        ),
      )
      .returning();

    logger.info({ accountId }, "[WhatsApp Accounts] Account updated");

    // Return account without sensitive fields
    const { accessToken, webhookVerifyToken, webhookUrl, ...safeAccount } =
      updatedAccount;

    res.json({ account: safeAccount });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Accounts] Update error");
    res.status(500).json({ error: "Failed to update WhatsApp account" });
  }
});

/**
 * DELETE /api/whatsapp/accounts/:id
 * Delete a WhatsApp account (hard delete)
 */
router.delete("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = req.params.id;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        accountId,
      },
      "[WhatsApp Accounts] Deleting account",
    );

    // Verify account belongs to tenant
    const existingAccount = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.tenantId, req.user.activeTenantId),
      ),
    });

    if (!existingAccount) {
      return res.status(404).json({ error: "Account not found" });
    }

    // For web-connector accounts, destroy the session in the worker first
    if (existingAccount.connectionType === "web-connector") {
      const workerUrl = process.env.WORKER_URL || "http://localhost:3001";
      try {
        logger.info(
          { accountId },
          "[WhatsApp Accounts] Destroying web-connector session in worker",
        );
        await axios.post(`${workerUrl}/whatsapp-web/disconnect`, { accountId });
        logger.info(
          { accountId },
          "[WhatsApp Accounts] Web-connector session destroyed",
        );
      } catch (error: any) {
        // Log error but continue with deletion - session cleanup is best effort
        logger.warn(
          { accountId, error: error.message },
          "[WhatsApp Accounts] Failed to destroy session in worker, continuing with deletion",
        );
      }
    }

    // Hard delete: actually delete the account from the database
    // Database cascade will automatically delete related whatsappWebSessions
    await db
      .delete(whatsappAccounts)
      .where(
        and(
          eq(whatsappAccounts.id, accountId),
          eq(whatsappAccounts.tenantId, req.user.activeTenantId),
        ),
      );

    logger.info(
      { accountId },
      "[WhatsApp Accounts] Account deleted successfully",
    );

    res.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Accounts] Delete error");
    res.status(500).json({ error: "Failed to delete WhatsApp account" });
  }
});

/**
 * POST /api/whatsapp/accounts/:id/sync-templates
 * Sync templates for a specific account
 */
router.post("/:id/sync-templates", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = req.params.id;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        accountId,
      },
      "[WhatsApp Accounts] Syncing templates",
    );

    // Verify account belongs to tenant
    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.tenantId, req.user.activeTenantId),
      ),
    });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (!account.isActive) {
      return res.status(400).json({ error: "Account is not active" });
    }

    // Sync templates
    const result = await whatsappTemplateSyncService.syncTemplates(
      accountId,
      req.user.activeTenantId,
    );

    logger.info(
      {
        accountId,
        result,
      },
      "[WhatsApp Accounts] Templates synced",
    );

    res.json({
      ...result,
      success: true,
      message: "Templates synced successfully",
    });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Accounts] Sync templates error");
    res.status(500).json({ error: "Failed to sync templates" });
  }
});

export default router;
