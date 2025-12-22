/**
 * DigestService
 * Creates daily/weekly notification summaries
 * 
 * Features:
 * - Group notifications by category
 * - Send consolidated email digests
 * - Respect user preferences for digest frequency
 * - Timezone-aware scheduling
 */

import { db } from '../../../apps/api/db';
import { notifications, users, tenants } from '../../../shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { notificationPreferencesService } from './NotificationPreferencesService';
import { templateService } from './TemplateService';
import nodemailer from 'nodemailer';
import logger from '../../../apps/api/logger';

interface DigestGroup {
  category: string;
  count: number;
  notifications: any[];
}

export class DigestService {
  /**
   * Create and send daily digests for all users who have it enabled
   */
  async createDailyDigests(tenantId?: string, environment: string = 'production'): Promise<void> {
    try {
      logger.info('[DigestService] Starting daily digest creation...');

      // Get all tenants if not specified
      const tenantIds = tenantId ? [tenantId] : await this.getAllTenantIds();

      for (const tid of tenantIds) {
        // Get users with daily digest enabled
        const userIds = await notificationPreferencesService.getUsersWithDigest(
          tid,
          environment,
          'daily'
        );

        logger.info(`[DigestService] Creating daily digests for ${userIds.length} users in tenant ${tid}`);

        // Create digest for each user
        for (const userId of userIds) {
          await this.createDailyDigest(userId, tid, environment);
        }
      }

      logger.info('[DigestService] Daily digest creation completed');
    } catch (error: any) {
      logger.error('[DigestService] Error creating daily digests:', error);
    }
  }

  /**
   * Create and send weekly digests for all users who have it enabled
   */
  async createWeeklyDigests(tenantId?: string, environment: string = 'production'): Promise<void> {
    try {
      logger.info('[DigestService] Starting weekly digest creation...');

      // Get all tenants if not specified
      const tenantIds = tenantId ? [tenantId] : await this.getAllTenantIds();

      for (const tid of tenantIds) {
        // Get users with weekly digest enabled
        const userIds = await notificationPreferencesService.getUsersWithDigest(
          tid,
          environment,
          'weekly'
        );

        logger.info(`[DigestService] Creating weekly digests for ${userIds.length} users in tenant ${tid}`);

        // Create digest for each user
        for (const userId of userIds) {
          await this.createWeeklyDigest(userId, tid, environment);
        }
      }

      logger.info('[DigestService] Weekly digest creation completed');
    } catch (error: any) {
      logger.error('[DigestService] Error creating weekly digests:', error);
    }
  }

  /**
   * Create daily digest for a single user
   */
  async createDailyDigest(
    userId: string,
    tenantId: string,
    environment: string
  ): Promise<void> {
    try {
      // Get notifications from last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const userNotifications = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.tenantId, tenantId),
          eq(notifications.environment, environment),
          gte(notifications.createdAt, oneDayAgo)
        ))
        .orderBy(desc(notifications.createdAt));

      if (userNotifications.length === 0) {
        logger.info(`[DigestService] No notifications for user ${userId}, skipping daily digest`);
        return;
      }

      // Group notifications
      const groups = await this.groupNotifications(userNotifications);

      // Send digest email
      await this.sendDigestEmail(userId, tenantId, environment, 'daily', groups, {
        date: new Date().toLocaleDateString(),
        totalCount: userNotifications.length,
      });

      logger.info(`[DigestService] Daily digest sent to user ${userId}`);
    } catch (error: any) {
      logger.error(`[DigestService] Error creating daily digest for user ${userId}:`, error);
    }
  }

  /**
   * Create weekly digest for a single user
   */
  async createWeeklyDigest(
    userId: string,
    tenantId: string,
    environment: string
  ): Promise<void> {
    try {
      // Get notifications from last 7 days
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const userNotifications = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.tenantId, tenantId),
          eq(notifications.environment, environment),
          gte(notifications.createdAt, oneWeekAgo)
        ))
        .orderBy(desc(notifications.createdAt));

      if (userNotifications.length === 0) {
        logger.info(`[DigestService] No notifications for user ${userId}, skipping weekly digest`);
        return;
      }

      // Group notifications
      const groups = await this.groupNotifications(userNotifications);

      // Calculate stats
      const urgentCount = userNotifications.filter(n => 
        n.metadata?.priority === 'urgent' || n.metadata?.priority === 'high'
      ).length;
      const unreadCount = userNotifications.filter(n => !n.read).length;

      // Send digest email
      await this.sendDigestEmail(userId, tenantId, environment, 'weekly', groups, {
        weekStart: oneWeekAgo.toLocaleDateString(),
        weekEnd: new Date().toLocaleDateString(),
        totalCount: userNotifications.length,
        urgentCount,
        unreadCount,
      });

      logger.info(`[DigestService] Weekly digest sent to user ${userId}`);
    } catch (error: any) {
      logger.error(`[DigestService] Error creating weekly digest for user ${userId}:`, error);
    }
  }

  /**
   * Group notifications by type/category
   */
  private async groupNotifications(notificationsList: any[]): Promise<DigestGroup[]> {
    const groups: Record<string, DigestGroup> = {};

    for (const notification of notificationsList) {
      const category = notification.type || 'general';

      if (!groups[category]) {
        groups[category] = {
          category,
          count: 0,
          notifications: [],
        };
      }

      groups[category].count++;
      groups[category].notifications.push(notification);
    }

    return Object.values(groups);
  }

  /**
   * Send digest email to user
   */
  private async sendDigestEmail(
    userId: string,
    tenantId: string,
    environment: string,
    digestType: 'daily' | 'weekly',
    groups: DigestGroup[],
    stats: any
  ): Promise<void> {
    try {
      // Get user info
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user || !user.email) {
        logger.warn(`[DigestService] User ${userId} not found or has no email`);
        return;
      }

      // Get tenant info
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      // Render email template
      const templateData = {
        userName: `${user.firstName} ${user.lastName}`,
        tenantName: tenant?.name || 'AssistOS',
        groups,
        dashboardLink: `${process.env.APP_URL || 'http://localhost:5000'}/notifications`,
        unsubscribeLink: `${process.env.APP_URL || 'http://localhost:5000'}/settings/notifications`,
        ...stats,
      };

      const templateName = digestType === 'daily' ? 'daily_digest' : 'weekly_digest';
      const htmlContent = await templateService.render(templateName, 'email', templateData);

      // Configure SMTP transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // Send email
      const subject = digestType === 'daily' 
        ? `Daily Summary - ${stats.totalCount} notifications`
        : `Weekly Summary - ${stats.totalCount} notifications`;

      await transporter.sendMail({
        from: process.env.SMTP_USER || 'noreply@assistos.app',
        to: user.email,
        subject,
        html: htmlContent,
      });

      logger.info(`[DigestService] Digest email sent to ${user.email}`);
    } catch (error: any) {
      logger.error('[DigestService] Error sending digest email:', error);
      throw error;
    }
  }

  /**
   * Get all tenant IDs
   */
  private async getAllTenantIds(): Promise<string[]> {
    try {
      const allTenants = await db.select().from(tenants);
      return allTenants.map(t => t.id);
    } catch (error: any) {
      logger.error('[DigestService] Error getting tenant IDs:', error);
      return [];
    }
  }
}

export const digestService = new DigestService();
