import { Router } from "express";
import { db } from "../db";
import { userGmailAccounts, emailInbox } from "../../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { GmailSettingsService } from "../services/gmail-settings.service";
import { syncGmailAccount } from "../services/gmail-sync-helper";
import { GmailThreadsService } from "../services/gmail-threads.service";

const router = Router();

// GET /api/gmail/messages
// List emails from emailInbox table
router.get("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    console.log('[Gmail Messages] Listing emails for tenant:', req.user.activeTenantId, 'page:', page, 'limit:', limit);

    const emails = await db.query.emailInbox.findMany({
      where: eq(emailInbox.tenantId, req.user.activeTenantId),
      orderBy: [desc(emailInbox.receivedAt)],
      limit,
      offset,
    });

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailInbox)
      .where(eq(emailInbox.tenantId, req.user.activeTenantId));

    const totalCount = Number(total[0]?.count || 0);

    console.log('[Gmail Messages] Found', emails.length, 'emails, total:', totalCount);

    res.json({
      emails,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('[Gmail Messages] List error:', error);
    res.status(500).json({ error: "Failed to list emails" });
  }
});

// POST /api/gmail/messages/sync
// Sync new emails from Gmail API (FASE 3.5-3.6: Uses dynamic tenant settings)
router.post("/sync", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // FASE 3.5-3.6: Read tenant settings for dynamic configuration
    const settings = await GmailSettingsService.getSettings(req.user.activeTenantId);
    
    console.log('[Gmail Sync] Starting sync for tenant:', req.user.activeTenantId, 'user:', req.user.id);
    console.log('[Gmail Sync] Using dynamic settings:', { 
      autoSync: settings.autoSync, 
      filterPeriodHours: settings.filterPeriodHours 
    });

    // Get user's active Gmail accounts
    const gmailAccounts = await db.query.userGmailAccounts.findMany({
      where: and(
        eq(userGmailAccounts.userId, req.user.id),
        eq(userGmailAccounts.tenantId, req.user.activeTenantId),
        eq(userGmailAccounts.isActive, true)
      ),
    });

    if (gmailAccounts.length === 0) {
      console.log('[Gmail Sync] No Gmail accounts found for user');
      return res.status(400).json({ error: "No Gmail account connected. Please connect a Gmail account first." });
    }

    console.log('[Gmail Sync] Found', gmailAccounts.length, 'Gmail account(s)');

    let totalSynced = 0;
    const syncResults = [];

    // Get maxResults from query parameter
    const maxResults = parseInt(req.query.maxResults as string) || 100;

    // FASE 3.7: Use shared helper function for each account
    for (const account of gmailAccounts) {
      const result = await syncGmailAccount({
        tenantId: req.user.activeTenantId,
        userId: req.user.id,
        account,
        filterPeriodHours: settings.filterPeriodHours,
        maxResults,
      });

      totalSynced += result.synced;
      
      if (result.error) {
        syncResults.push({
          email: account.email,
          error: result.error,
        });
      } else {
        syncResults.push({
          email: account.email,
          synced: result.synced,
          total: result.total,
        });
      }
    }

    console.log('[Gmail Sync] Sync complete. Total synced:', totalSynced);

    res.json({
      success: true,
      totalSynced,
      accounts: syncResults,
    });
  } catch (error) {
    console.error('[Gmail Sync] Error:', error);
    res.status(500).json({ error: "Failed to sync emails" });
  }
});

// GET /api/gmail/threads/:threadId
// Get all messages in a thread
router.get("/threads/:threadId", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const messages = await GmailThreadsService.getThreadMessages(
      req.user.activeTenantId,
      req.params.threadId
    );

    res.json({ messages });
  } catch (error) {
    console.error('[Gmail Threads] Get messages error:', error);
    res.status(500).json({ error: "Failed to get thread messages" });
  }
});

// GET /api/gmail/threads/:threadId/summary
// Get thread summary (count, participants, etc)
router.get("/threads/:threadId/summary", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const summary = await GmailThreadsService.getThreadSummary(
      req.user.activeTenantId,
      req.params.threadId
    );

    if (!summary) {
      return res.status(404).json({ error: "Thread not found" });
    }

    res.json(summary);
  } catch (error) {
    console.error('[Gmail Threads] Get summary error:', error);
    res.status(500).json({ error: "Failed to get thread summary" });
  }
});

export default router;
