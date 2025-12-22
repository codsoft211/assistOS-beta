// Migrated from AssistOS legacy - Phase 4.6
// Admin functions routes (platform administration, tenant management)

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { tenants, users, userTenants, auditLog } from "../../../shared/schema";
import { eq, count, desc, gte, and } from "drizzle-orm";
import { requirePlatformAdmin } from "../middleware/auth.middleware";
import adminDocumentationRoutes from "./admin-documentation";
import { BackfillOrchestrator } from "../services/backfill-orchestrator.service";
import { deleteSupabaseAuthUser } from "../services/auth.service";

const router = Router();

// Apply platform admin middleware to all routes
router.use(requirePlatformAdmin);

/**
 * GET /api/admin/stats
 * Get platform statistics (admin only)
 */
router.get("/stats", async (req, res) => {
  try {
    // Get total counts
    const [{ value: totalTenants }] = await db.select({ value: count() }).from(tenants);
    const [{ value: totalUsers }] = await db.select({ value: count() }).from(users);

    // Calculate active users (logged in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [{ value: activeUsers }] = await db
      .select({ value: count() })
      .from(users)
      .where(and(
        gte(users.lastLogin, thirtyDaysAgo),
        eq(users.isActive, true)
      ));

    // Calculate new tenants this month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const [{ value: newTenantsThisMonth }] = await db
      .select({ value: count() })
      .from(tenants)
      .where(gte(tenants.createdAt, firstDayOfMonth));

    res.json({
      totalTenants,
      totalUsers,
      activeUsers,
      newTenantsThisMonth,
    });
  } catch (error: any) {
    console.error("[Admin API] Error fetching stats:", error);
    res.status(500).json({ 
      error: "Failed to fetch stats",
      details: error.message 
    });
  }
});

/**
 * GET /api/admin/tenants
 * List all tenants (admin only)
 */
router.get("/tenants", async (req, res) => {
  try {
    const allTenants = await db
      .select()
      .from(tenants)
      .orderBy(desc(tenants.createdAt));

    // TODO: Include user count per tenant
    // TODO: Include storage usage per tenant
    // TODO: Include last activity timestamp

    res.json({
      tenants: allTenants,
      total: allTenants.length,
    });
  } catch (error: any) {
    console.error("[Admin API] Error listing tenants:", error);
    res.status(500).json({ 
      error: "Failed to list tenants",
      details: error.message 
    });
  }
});

/**
 * GET /api/admin/users
 * List all users across all tenants (admin only)
 */
router.get("/users", async (req, res) => {
  try {
    const allUsers = await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));

    // TODO: Include tenant associations
    // TODO: Include last login timestamp
    // TODO: Include activity metrics

    res.json({
      users: allUsers,
      total: allUsers.length,
    });
  } catch (error: any) {
    console.error("[Admin API] Error listing users:", error);
    res.status(500).json({ 
      error: "Failed to list users",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/admin/tenants/:id/status
 * Update tenant status (activate, suspend, delete)
 */
router.patch("/tenants/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "suspended", "deleted"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const [tenant] = await db
      .update(tenants)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // TODO: If suspending, notify tenant users
    // TODO: If deleting, schedule data cleanup
    // TODO: Create admin audit log entry

    res.json({
      success: true,
      tenant,
    });
  } catch (error: any) {
    console.error("[Admin API] Error updating tenant status:", error);
    res.status(500).json({ 
      error: "Failed to update tenant status",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Update user status (activate, deactivate)
 */
router.patch("/users/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const [user] = await db
      .update(users)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // TODO: If deactivating, end all user sessions
    // TODO: Notify user of account status change
    // TODO: Create admin audit log entry

    res.json({
      success: true,
      user,
    });
  } catch (error: any) {
    console.error("[Admin API] Error updating user status:", error);
    res.status(500).json({ 
      error: "Failed to update user status",
      details: error.message 
    });
  }
});

/**
 * GET /api/admin/audit-log
 * View platform-wide audit log
 */
router.get("/audit-log", async (req, res) => {
  try {
    const { limit = 100, offset = 0, tenantId, userId, action } = req.query;

    // TODO: Build query with filters
    // TODO: Support filtering by tenant, user, action, date range

    const logs = await db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    const [{ value: total }] = await db.select({ value: count() }).from(auditLog);

    res.json({
      logs,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error("[Admin API] Error fetching audit log:", error);
    res.status(500).json({ 
      error: "Failed to fetch audit log",
      details: error.message 
    });
  }
});

/**
 * POST /api/admin/impersonate/:userId
 * Impersonate a user (for support purposes)
 */
router.post("/impersonate/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUserId = (req as any).user?.id;

    // TODO: Validate user exists
    // TODO: Create impersonation session
    // TODO: Log impersonation action
    // TODO: Return session token or redirect

    res.json({
      success: false,
      message: "User impersonation not yet implemented - session management pending"
    });
  } catch (error: any) {
    console.error("[Admin API] Error impersonating user:", error);
    res.status(500).json({ 
      error: "Failed to impersonate user",
      details: error.message 
    });
  }
});

/**
 * GET /api/admin/system-health
 * Get system health metrics
 */
router.get("/system-health", async (req, res) => {
  try {
    // TODO: Check database connection
    // TODO: Check Redis connection (if used)
    // TODO: Check disk space
    // TODO: Check API response times
    // TODO: Check error rates

    res.json({
      status: "healthy",
      database: "connected",
      redis: "not_configured",
      diskSpace: "unknown",
      message: "System health monitoring not yet fully implemented"
    });
  } catch (error: any) {
    console.error("[Admin API] Error checking system health:", error);
    res.status(500).json({ 
      error: "Failed to check system health",
      details: error.message 
    });
  }
});

/**
 * POST /api/admin/cleanup-test-data
 * 
 * DEVELOPMENT-ONLY endpoint for cleaning up test data.
 * Requires platform admin privileges (enforced by requirePlatformAdmin middleware).
 * 
 * This endpoint is used by Playwright tests to clean up test users and tenants
 * after test execution. It provides privileged cleanup that bypasses normal
 * tenant-level access controls.
 * 
 * Body: {
 *   users?: string[],   // User IDs to delete
 *   tenants?: string[]  // Tenant IDs to delete
 * }
 * 
 * Returns: {
 *   usersDeleted: number,
 *   tenantsDeleted: number,
 *   errors: string[]
 * }
 */
router.post("/cleanup-test-data", async (req: Request, res: Response) => {
  try {
    // CRITICAL: Only allow in development environment
    // Production database should never be cleaned up via API
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ 
        error: 'Cleanup endpoint not available in production',
        message: 'This endpoint is only available in development and test environments'
      });
    }
    
    const { users: userIds = [], tenants: tenantIds = [] } = req.body;
    
    const results = {
      usersDeleted: 0,
      tenantsDeleted: 0,
      errors: [] as string[],
    };
    
    // Delete tenants first (cascades to user_tenants, environments if properly configured)
    for (const tenantId of tenantIds) {
      try {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
        results.tenantsDeleted++;
        console.log(`[Cleanup] Deleted tenant: ${tenantId}`);
      } catch (error: any) {
        const errorMsg = `Failed to delete tenant ${tenantId}: ${error.message}`;
        results.errors.push(errorMsg);
        console.error(`[Cleanup] ${errorMsg}`);
      }
    }
    
    // Delete users (cascades to user_tenants)
    for (const userId of userIds) {
      try {
        await db.delete(users).where(eq(users.id, userId));
        // Also delete from Supabase auth schema
        await deleteSupabaseAuthUser(userId);
        results.usersDeleted++;
        console.log(`[Cleanup] Deleted user: ${userId}`);
      } catch (error: any) {
        const errorMsg = `Failed to delete user ${userId}: ${error.message}`;
        results.errors.push(errorMsg);
        console.error(`[Cleanup] ${errorMsg}`);
      }
    }
    
    console.log('[Cleanup] Results:', results);
    res.json(results);
  } catch (error: any) {
    console.error('[Cleanup] Error cleaning up test data:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup test data',
      details: error.message 
    });
  }
});

/**
 * POST /api/admin/backfill/start
 * Start environment column backfill for all 143 tables
 */
router.post("/backfill/start", async (req, res) => {
  try {
    const orchestrator = new BackfillOrchestrator();
    const result = await orchestrator.startBackfill();

    res.json(result);
  } catch (error: any) {
    console.error("[Admin API] Error starting backfill:", error);
    res.status(500).json({ 
      error: "Failed to start backfill",
      details: error.message 
    });
  }
});

/**
 * GET /api/admin/backfill/status
 * Get current status of environment backfill jobs
 */
router.get("/backfill/status", async (req, res) => {
  try {
    const orchestrator = new BackfillOrchestrator();
    const status = await orchestrator.getBackfillStatus();

    res.json(status);
  } catch (error: any) {
    console.error("[Admin API] Error getting backfill status:", error);
    res.status(500).json({ 
      error: "Failed to get backfill status",
      details: error.message 
    });
  }
});

/**
 * GET /api/admin/backfill/failed
 * Get list of failed backfill jobs
 */
router.get("/backfill/failed", async (req, res) => {
  try {
    const orchestrator = new BackfillOrchestrator();
    const failedJobs = await orchestrator.getFailedJobs();

    res.json({
      failed: failedJobs,
      count: failedJobs.length,
    });
  } catch (error: any) {
    console.error("[Admin API] Error getting failed jobs:", error);
    res.status(500).json({ 
      error: "Failed to get failed jobs",
      details: error.message 
    });
  }
});

/**
 * POST /api/admin/backfill/retry
 * Retry all failed backfill jobs
 */
router.post("/backfill/retry", async (req, res) => {
  try {
    const orchestrator = new BackfillOrchestrator();
    const result = await orchestrator.retryFailedJobs();

    res.json(result);
  } catch (error: any) {
    console.error("[Admin API] Error retrying failed jobs:", error);
    res.status(500).json({ 
      error: "Failed to retry failed jobs",
      details: error.message 
    });
  }
});

/**
 * GET /api/admin/backfill/tables
 * Get list of all tables to be backfilled
 */
router.get("/backfill/tables", async (req, res) => {
  try {
    const orchestrator = new BackfillOrchestrator();
    const tables = orchestrator.getTableList();

    res.json({
      tables,
      total: tables.length,
    });
  } catch (error: any) {
    console.error("[Admin API] Error getting table list:", error);
    res.status(500).json({ 
      error: "Failed to get table list",
      details: error.message 
    });
  }
});

/**
 * /api/admin/documentation/*
 * Module documentation routes (serves README.md files as HTML)
 */
router.use("/documentation", adminDocumentationRoutes);

export default router;
