import { Router } from "express";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { db } from "../db";
import { userGmailAccounts } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { decryptCredentials, encryptCredentials, deserializeEncryptedData, serializeEncryptedData } from "../../../packages/document-management/utils/encryption";
import { google } from "googleapis";

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard to ALL routes
// Gmail accounts contain OAuth tokens - CRITICAL protection required
// ============================================================================
router.use(hardTenantGuard);

// GET /api/gmail/accounts - List user's Gmail accounts
router.get("/", async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accounts = await db.query.userGmailAccounts.findMany({
      where: and(
        eq(userGmailAccounts.userId, req.user.id),
        eq(userGmailAccounts.tenantId, req.user.activeTenantId)
      ),
      columns: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        isPrimary: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: (accounts, { desc }) => [desc(accounts.isPrimary), desc(accounts.createdAt)],
    });

    res.json({ accounts });
  } catch (error) {
    console.error('[Gmail Accounts] List error:', error);
    res.status(500).json({ error: "Failed to list accounts" });
  }
});

// DELETE /api/gmail/accounts/:id
router.delete("/:id", async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const account = await db.query.userGmailAccounts.findFirst({
      where: and(
        eq(userGmailAccounts.id, req.params.id),
        eq(userGmailAccounts.userId, req.user.id),
        eq(userGmailAccounts.tenantId, req.user.activeTenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    await db.delete(userGmailAccounts)
      .where(eq(userGmailAccounts.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('[Gmail Accounts] Delete error:', error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// POST /api/gmail/accounts/:id/set-primary
router.post("/:id/set-primary", async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Verify account belongs to user + tenant
    const account = await db.query.userGmailAccounts.findFirst({
      where: and(
        eq(userGmailAccounts.id, req.params.id),
        eq(userGmailAccounts.userId, req.user.id),
        eq(userGmailAccounts.tenantId, req.user.activeTenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Unset all primary for this user + tenant
    await db.update(userGmailAccounts)
      .set({ isPrimary: false })
      .where(and(
        eq(userGmailAccounts.userId, req.user.id),
        eq(userGmailAccounts.tenantId, req.user.activeTenantId)
      ));

    // Set this one as primary
    await db.update(userGmailAccounts)
      .set({ isPrimary: true })
      .where(eq(userGmailAccounts.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('[Gmail Accounts] Set primary error:', error);
    res.status(500).json({ error: "Failed to set primary account" });
  }
});

// POST /api/gmail/accounts/:id/refresh
router.post("/:id/refresh", async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const account = await db.query.userGmailAccounts.findFirst({
      where: and(
        eq(userGmailAccounts.id, req.params.id),
        eq(userGmailAccounts.userId, req.user.id),
        eq(userGmailAccounts.tenantId, req.user.activeTenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const encryptedData = deserializeEncryptedData(account.refreshToken);
    const decryptedData = decryptCredentials(encryptedData, account.tenantId);
    const refreshToken = decryptedData.token;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error("Failed to refresh token");
    }

    const encryptedAccessToken = serializeEncryptedData(
      encryptCredentials({ token: credentials.access_token }, account.tenantId)
    );
    const expiresAt = new Date(credentials.expiry_date || Date.now() + 3600 * 1000);

    await db.update(userGmailAccounts)
      .set({
        accessToken: encryptedAccessToken,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(userGmailAccounts.id, req.params.id));

    res.json({ success: true, expiresAt });
  } catch (error) {
    console.error('[Gmail Accounts] Refresh error:', error);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

export default router;
