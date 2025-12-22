// Migrated from AssistOS legacy - Phase 4.4
// Dashboard metrics, KPIs, and recent activity routes

import { Router } from "express";
import { db } from "../db";
import { conversations, messages, notifications } from "../../../shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";

const router = Router();

/**
 * GET /api/dashboard
 * Get dashboard overview with KPIs and recent activity
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Implement actual KPI calculations when services are migrated
    // TODO: Add financial metrics (revenue, expenses, cash flow)
    // TODO: Add sales metrics (leads, conversions, orders)
    // TODO: Add task metrics (pending, completed, overdue)
    // TODO: Add inventory metrics (low stock, incoming, outgoing)

    // Get recent conversations (stub implementation)
    const recentConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.tenantId, tenantId))
      .orderBy(desc(conversations.updatedAt))
      .limit(5);

    // Get unread notifications count
    const [{ value: unreadCount }] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      ));

    // Stub KPIs (TODO: Replace with actual calculations)
    const kpis = {
      revenue: {
        current: 0,
        previous: 0,
        change: 0,
      },
      activeProjects: {
        current: 0,
        previous: 0,
        change: 0,
      },
      pendingTasks: {
        current: 0,
        previous: 0,
        change: 0,
      },
      customerSatisfaction: {
        current: 0,
        previous: 0,
        change: 0,
      },
    };

    res.json({
      kpis,
      recentActivity: recentConversations,
      unreadNotifications: unreadCount,
      alerts: [], // TODO: Implement alerts based on business rules
    });
  } catch (error: any) {
    console.error("[Dashboard API] Error fetching dashboard:", error);
    res.status(500).json({ 
      error: "Failed to fetch dashboard",
      details: error.message 
    });
  }
});

/**
 * GET /api/dashboard/widgets
 * Get dashboard widgets configuration
 */
router.get("/widgets", async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch user's dashboard widget preferences from user.preferences.dashboardWidgets
    // TODO: Return widget data based on enabled widgets

    res.json({
      widgets: [],
      layout: null,
      message: "Widget configuration not yet implemented"
    });
  } catch (error: any) {
    console.error("[Dashboard API] Error fetching widgets:", error);
    res.status(500).json({ 
      error: "Failed to fetch widgets",
      details: error.message 
    });
  }
});

/**
 * POST /api/dashboard/widgets
 * Update dashboard widgets configuration
 */
router.post("/widgets", async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { widgets, layout } = req.body;

    // TODO: Update user.preferences.dashboardWidgets and dashboardLayout
    // TODO: Validate widget configuration

    res.json({
      success: true,
      message: "Widget configuration updated (stub)"
    });
  } catch (error: any) {
    console.error("[Dashboard API] Error updating widgets:", error);
    res.status(500).json({ 
      error: "Failed to update widgets",
      details: error.message 
    });
  }
});

export default router;
