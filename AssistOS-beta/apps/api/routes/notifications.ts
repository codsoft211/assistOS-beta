// Migrated from AssistOS legacy - Phase 4.2
// Source: /tmp/assistos-legacy/server/routes/notifications.ts
// Handles notification CRUD, mark as read, preferences
// Integrated with NotificationCenterService (Layer 4 Platform Service)

import { Router } from "express";
import { db } from "../db";
import { notifications } from "../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { notificationCenterService } from "../../../packages/platform/notification-center/index.js";
import { notificationPreferencesService } from "../../../packages/platform/notification-center/index.js";

const router = Router();

/**
 * GET /api/notifications
 * List user notifications with filters
 * Query params: ?unread=true&limit=50&offset=0
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Parse query params
    const unread = req.query.unread === 'true';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query
    let query = db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.environment, environment)
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply unread filter if specified
    if (unread) {
      query = db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.userId, userId),
          eq(notifications.environment, environment),
          eq(notifications.read, false)
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);
    }

    const items = await query;

    // Get total count
    const countQuery = unread 
      ? db
          .select()
          .from(notifications)
          .where(and(
            eq(notifications.tenantId, tenantId),
            eq(notifications.userId, userId),
            eq(notifications.environment, environment),
            eq(notifications.read, false)
          ))
      : db
          .select()
          .from(notifications)
          .where(and(
            eq(notifications.tenantId, tenantId),
            eq(notifications.userId, userId),
            eq(notifications.environment, environment)
          ));

    const allItems = await countQuery;
    const total = allItems.length;

    res.json({
      notifications: items,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[Notifications API] Error fetching notifications:", error);
    res.status(500).json({ 
      error: "Failed to fetch notifications",
      details: error.message 
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for current user
 */
router.get("/unread-count", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const count = await notificationCenterService.getUnreadCount(userId, tenantId, environment);
    res.json({ count });
  } catch (error: any) {
    console.error("[Notifications API] Error getting unread count:", error);
    res.status(500).json({ 
      error: "Failed to get unread count",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 */
router.patch("/:id/read", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Use NotificationCenterService
    await notificationCenterService.markAsRead(id, userId);

    // Fetch updated notification
    const [notification] = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.environment, environment)
      ))
      .limit(1);

    res.json({ notification });
  } catch (error: any) {
    console.error("[Notifications API] Error marking as read:", error);
    res.status(500).json({ 
      error: "Failed to mark notification as read",
      details: error.message 
    });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all user notifications as read
 */
router.post("/mark-all-read", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Use NotificationCenterService
    const count = await notificationCenterService.markAllAsRead(userId, tenantId, environment);

    res.json({ count });
  } catch (error: any) {
    console.error("[Notifications API] Error marking all as read:", error);
    res.status(500).json({ 
      error: "Failed to mark all notifications as read",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Use NotificationCenterService
    await notificationCenterService.deleteNotification(id, userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Notifications API] Error deleting notification:", error);
    res.status(500).json({ 
      error: "Failed to delete notification",
      details: error.message 
    });
  }
});

/**
 * POST /api/notifications
 * Create and send notification with multi-channel support
 * Body: { userId, type, title, message, link?, linkText?, metadata?, priority?, channels? }
 */
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const currentUserId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !currentUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate request body
    const schema = z.object({
      userId: z.union([z.string(), z.array(z.string())]), // Support single or multiple recipients
      type: z.string(),
      title: z.string(),
      message: z.string(),
      link: z.string().optional(),
      linkText: z.string().optional(),
      metadata: z.any().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      channels: z.array(z.enum(['in_app', 'email', 'whatsapp', 'sms'])).optional(),
      expiresAt: z.string().datetime().optional(),
    });

    const data = schema.parse(req.body);

    // Use NotificationCenterService for multi-channel routing
    await notificationCenterService.send({
      tenantId,
      environment,
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link,
      linkText: data.linkText,
      metadata: data.metadata,
      priority: data.priority,
      channels: data.channels,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    res.status(201).json({ 
      success: true,
      message: 'Notification sent successfully'
    });
  } catch (error: any) {
    console.error("[Notifications API] Error creating notification:", error);
    res.status(400).json({ 
      error: "Failed to create notification",
      details: error.message 
    });
  }
});

/**
 * GET /api/notifications/preferences
 * Get user notification preferences
 */
router.get("/preferences", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const preferences = await notificationPreferencesService.getPreferences(userId, tenantId, environment);
    res.json(preferences);
  } catch (error: any) {
    console.error("[Notifications API] Error fetching preferences:", error);
    res.status(500).json({ 
      error: "Failed to fetch preferences",
      details: error.message 
    });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update user notification preferences
 */
router.put("/preferences", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      channels: z.object({
        in_app: z.object({ enabled: z.boolean(), types: z.array(z.string()) }).optional(),
        email: z.object({ 
          enabled: z.boolean(), 
          types: z.array(z.string()),
          digestFrequency: z.enum(['daily', 'weekly', 'never']).optional()
        }).optional(),
        whatsapp: z.object({ enabled: z.boolean(), types: z.array(z.string()) }).optional(),
        sms: z.object({ enabled: z.boolean(), types: z.array(z.string()) }).optional(),
      }).optional(),
      quietHours: z.object({
        start: z.string(),
        end: z.string(),
      }).optional(),
      timezone: z.string().optional(),
    });

    const updates = schema.parse(req.body);

    await notificationPreferencesService.updatePreferences(userId, tenantId, environment, updates);

    const updatedPreferences = await notificationPreferencesService.getPreferences(userId, tenantId, environment);
    res.json(updatedPreferences);
  } catch (error: any) {
    console.error("[Notifications API] Error updating preferences:", error);
    res.status(400).json({ 
      error: "Failed to update preferences",
      details: error.message 
    });
  }
});

/**
 * GET /api/notifications/:id
 * Get a single notification by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const [notification] = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.environment, environment)
      ))
      .limit(1);

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(notification);
  } catch (error: any) {
    console.error("[Notifications API] Error fetching notification:", error);
    res.status(500).json({ 
      error: "Failed to fetch notification",
      details: error.message 
    });
  }
});

export default router;
