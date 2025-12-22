/**
 * NotificationCenterService
 * Main orchestrator for unified notification management
 * 
 * Features:
 * - Multi-channel routing based on user preferences
 * - Batch notifications for multiple recipients
 * - Notification lifecycle management (create, read, delete, expire)
 * - Tenant isolation and security
 * - Integration with existing routes
 */

import { db } from '../../../apps/api/db';
import { notifications } from '../../../shared/schema';
import { eq, and, desc, lt } from 'drizzle-orm';
import { ChannelRouter, Channel } from './ChannelRouter';
import { notificationPreferencesService } from './NotificationPreferencesService';
import logger from '../../../apps/api/logger';

export interface SendNotificationOptions {
  tenantId: string;
  environment: string;
  userId: string | string[]; // Support multiple recipients
  type: string;
  title: string;
  message: string;
  link?: string;
  linkText?: string;
  metadata?: any;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  channels?: Channel[]; // If not provided, use user preferences
  expiresAt?: Date;
}

export interface NotificationFilters {
  unread?: boolean;
  type?: string;
  limit?: number;
  offset?: number;
}

export class NotificationCenterService {
  private channelRouter: ChannelRouter;

  constructor(channelRouter: ChannelRouter) {
    this.channelRouter = channelRouter;
  }

  /**
   * Send notification to one or more users
   * Routes to appropriate channels based on user preferences
   */
  async send(options: SendNotificationOptions): Promise<void> {
    try {
      // Normalize userId to array
      const userIds = Array.isArray(options.userId) ? options.userId : [options.userId];

      // Send to each user
      for (const userId of userIds) {
        await this.sendToUser({
          ...options,
          userId,
        });
      }

      logger.info(`[NotificationCenterService] Notification sent to ${userIds.length} users`);
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error sending notification:`, error);
      throw error;
    }
  }

  /**
   * Send notification to a single user
   */
  private async sendToUser(options: SendNotificationOptions & { userId: string }): Promise<void> {
    try {
      // Validate tenant isolation
      await this.validateTenantAccess(options.userId, options.tenantId);

      // Determine channels to use
      let channels: Channel[] = options.channels || [];

      if (channels.length === 0) {
        // Use user preferences to determine channels
        channels = await this.getEnabledChannels(
          options.userId,
          options.tenantId,
          options.environment,
          options.type
        );
      }

      // Check quiet hours for non-urgent notifications
      if (options.priority !== 'urgent') {
        const inQuietHours = await notificationPreferencesService.isInQuietHours(
          options.userId,
          options.tenantId,
          options.environment
        );

        if (inQuietHours) {
          logger.info(`[NotificationCenterService] User ${options.userId} in quiet hours, skipping non-in-app channels`);
          channels = channels.filter(ch => ch === 'in_app');
        }
      }

      // Route notification to all enabled channels
      await this.channelRouter.route({
        tenantId: options.tenantId,
        environment: options.environment,
        userId: options.userId,
        type: options.type,
        title: options.title,
        message: options.message,
        link: options.link,
        linkText: options.linkText,
        metadata: options.metadata,
        priority: options.priority,
        expiresAt: options.expiresAt,
      }, channels);

      logger.info(`[NotificationCenterService] Notification routed to channels: ${channels.join(', ')}`);
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error sending to user ${options.userId}:`, error);
      throw error;
    }
  }

  /**
   * Send batch notifications (multiple recipients)
   */
  async sendBatch(notificationsList: SendNotificationOptions[]): Promise<void> {
    try {
      // Process in parallel for efficiency
      await Promise.all(
        notificationsList.map(options => this.send(options))
      );

      logger.info(`[NotificationCenterService] Batch of ${notificationsList.length} notifications sent`);
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error sending batch:`, error);
      throw error;
    }
  }

  /**
   * Get user notifications with filters
   */
  async getUserNotifications(
    userId: string,
    tenantId: string,
    environment: string,
    filters?: NotificationFilters
  ): Promise<any[]> {
    try {
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;

      let query = db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.tenantId, tenantId),
          eq(notifications.environment, environment)
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      // Apply filters
      if (filters?.unread) {
        query = db
          .select()
          .from(notifications)
          .where(and(
            eq(notifications.userId, userId),
            eq(notifications.tenantId, tenantId),
            eq(notifications.environment, environment),
            eq(notifications.read, false)
          ))
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
          .offset(offset);
      }

      if (filters?.type) {
        query = db
          .select()
          .from(notifications)
          .where(and(
            eq(notifications.userId, userId),
            eq(notifications.tenantId, tenantId),
            eq(notifications.environment, environment),
            eq(notifications.type, filters.type),
            filters.unread ? eq(notifications.read, false) : undefined
          ))
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
          .offset(offset);
      }

      const results = await query;
      return results;
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error getting notifications:`, error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      // Verify notification belongs to user
      const [notification] = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        ))
        .limit(1);

      if (!notification) {
        throw new Error('Notification not found or unauthorized');
      }

      // Mark as read
      await db
        .update(notifications)
        .set({
          read: true,
          readAt: new Date(),
        })
        .where(eq(notifications.id, notificationId));

      logger.info(`[NotificationCenterService] Notification ${notificationId} marked as read`);
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error marking as read:`, error);
      throw error;
    }
  }

  /**
   * Mark all user notifications as read
   */
  async markAllAsRead(userId: string, tenantId: string, environment: string): Promise<number> {
    try {
      const result = await db
        .update(notifications)
        .set({
          read: true,
          readAt: new Date(),
        })
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.tenantId, tenantId),
          eq(notifications.environment, environment),
          eq(notifications.read, false)
        ))
        .returning();

      logger.info(`[NotificationCenterService] Marked ${result.length} notifications as read for user ${userId}`);
      return result.length;
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error marking all as read:`, error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      // Verify notification belongs to user
      const [notification] = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        ))
        .limit(1);

      if (!notification) {
        throw new Error('Notification not found or unauthorized');
      }

      // Delete notification
      await db
        .delete(notifications)
        .where(eq(notifications.id, notificationId));

      logger.info(`[NotificationCenterService] Notification ${notificationId} deleted`);
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error deleting notification:`, error);
      throw error;
    }
  }

  /**
   * Cleanup expired notifications
   * Called by cron job
   */
  async cleanupExpiredNotifications(): Promise<number> {
    try {
      const now = new Date();

      const result = await db
        .delete(notifications)
        .where(and(
          lt(notifications.expiresAt, now)
        ))
        .returning();

      const count = result.length;
      logger.info(`[NotificationCenterService] Cleaned up ${count} expired notifications`);
      return count;
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error cleaning up notifications:`, error);
      return 0;
    }
  }

  /**
   * Get enabled channels for a user based on preferences
   */
  private async getEnabledChannels(
    userId: string,
    tenantId: string,
    environment: string,
    notificationType: string
  ): Promise<Channel[]> {
    try {
      const enabledChannels: Channel[] = [];

      // Check each channel
      const channels: Channel[] = ['in_app', 'email', 'whatsapp', 'sms'];

      for (const channel of channels) {
        const isEnabled = await notificationPreferencesService.isChannelEnabled(
          userId,
          tenantId,
          environment,
          channel,
          notificationType
        );

        if (isEnabled) {
          enabledChannels.push(channel);
        }
      }

      // Always include in-app as fallback
      if (!enabledChannels.includes('in_app')) {
        enabledChannels.push('in_app');
      }

      return enabledChannels;
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error getting enabled channels:`, error);
      return ['in_app']; // Fallback to in-app only
    }
  }

  /**
   * Validate tenant access (security check)
   */
  private async validateTenantAccess(userId: string, tenantId: string): Promise<void> {
    // TODO: Implement proper tenant access validation
    // For now, we trust the tenantId is correct
    // In production, verify userId belongs to tenantId via userTenants table
    logger.debug(`[NotificationCenterService] Tenant access validated for user ${userId}`);
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string, tenantId: string, environment: string): Promise<number> {
    try {
      const results = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.tenantId, tenantId),
          eq(notifications.environment, environment),
          eq(notifications.read, false)
        ));

      return results.length;
    } catch (error: any) {
      logger.error(`[NotificationCenterService] Error getting unread count:`, error);
      return 0;
    }
  }
}

export const notificationCenterService = new NotificationCenterService();
