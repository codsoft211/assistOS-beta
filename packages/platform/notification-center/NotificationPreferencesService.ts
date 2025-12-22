/**
 * NotificationPreferencesService
 * Manages user notification channel preferences
 * 
 * Features:
 * - Get/update user preferences per tenant
 * - Check if channel is enabled for specific notification types
 * - Quiet hours enforcement
 * - Timezone-aware scheduling
 */

import { db } from '../../../apps/api/db';
import { notificationPreferences } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../../../apps/api/logger';

export type Channel = 'in_app' | 'email' | 'whatsapp' | 'sms';

export interface NotificationPreferences {
  userId: string;
  tenantId: string;
  channels: {
    in_app: { enabled: boolean; types: string[] };
    email: { enabled: boolean; types: string[]; digestFrequency?: 'daily' | 'weekly' | 'never' };
    whatsapp: { enabled: boolean; types: string[] };
    sms: { enabled: boolean; types: string[] };
  };
  quietHours?: { start: string; end: string };
  timezone?: string;
}

export class NotificationPreferencesService {
  /**
   * Get user notification preferences
   * Creates default preferences if none exist
   */
  async getPreferences(
    userId: string,
    tenantId: string,
    environment: string = 'production'
  ): Promise<NotificationPreferences> {
    try {
      // Try to fetch existing preferences
      const [existing] = await db
        .select()
        .from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.tenantId, tenantId),
          eq(notificationPreferences.environment, environment)
        ))
        .limit(1);

      if (existing) {
        return {
          userId: existing.userId,
          tenantId: existing.tenantId,
          ...existing.preferences,
        };
      }

      // Create default preferences
      const defaultPreferences: NotificationPreferences = {
        userId,
        tenantId,
        channels: {
          in_app: { enabled: true, types: [] }, // All types enabled by default
          email: { enabled: true, types: [], digestFrequency: 'never' },
          whatsapp: { enabled: false, types: [] },
          sms: { enabled: false, types: [] },
        },
      };

      await this.createPreferences(userId, tenantId, environment, defaultPreferences);

      return defaultPreferences;
    } catch (error: any) {
      logger.error(`[NotificationPreferencesService] Error getting preferences:`, error);
      throw error;
    }
  }

  /**
   * Create default preferences for a user
   */
  private async createPreferences(
    userId: string,
    tenantId: string,
    environment: string,
    preferences: NotificationPreferences
  ): Promise<void> {
    try {
      await db.insert(notificationPreferences).values({
        userId,
        tenantId,
        environment,
        preferences: {
          channels: preferences.channels,
          quietHours: preferences.quietHours,
          timezone: preferences.timezone,
        },
      });

      logger.info(`[NotificationPreferencesService] Created default preferences for user ${userId}`);
    } catch (error: any) {
      logger.error(`[NotificationPreferencesService] Error creating preferences:`, error);
      throw error;
    }
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(
    userId: string,
    tenantId: string,
    environment: string,
    updates: Partial<NotificationPreferences>
  ): Promise<void> {
    try {
      // Get current preferences
      const current = await this.getPreferences(userId, tenantId, environment);

      // Merge updates
      const updated: any = {
        channels: { ...current.channels, ...updates.channels },
        quietHours: updates.quietHours !== undefined ? updates.quietHours : current.quietHours,
        timezone: updates.timezone !== undefined ? updates.timezone : current.timezone,
      };

      // Update in database
      await db
        .update(notificationPreferences)
        .set({
          preferences: updated,
          updatedAt: new Date(),
        })
        .where(and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.tenantId, tenantId),
          eq(notificationPreferences.environment, environment)
        ));

      logger.info(`[NotificationPreferencesService] Updated preferences for user ${userId}`);
    } catch (error: any) {
      logger.error(`[NotificationPreferencesService] Error updating preferences:`, error);
      throw error;
    }
  }

  /**
   * Check if a specific channel is enabled for a notification type
   */
  async isChannelEnabled(
    userId: string,
    tenantId: string,
    environment: string,
    channel: Channel,
    notificationType: string
  ): Promise<boolean> {
    try {
      const prefs = await this.getPreferences(userId, tenantId, environment);
      const channelPrefs = prefs.channels[channel];

      if (!channelPrefs || !channelPrefs.enabled) {
        return false;
      }

      // If types array is empty, all types are enabled
      if (channelPrefs.types.length === 0) {
        return true;
      }

      // Check if this specific type is enabled
      return channelPrefs.types.includes(notificationType);
    } catch (error: any) {
      logger.error(`[NotificationPreferencesService] Error checking channel:`, error);
      return false; // Default to disabled on error
    }
  }

  /**
   * Check if we're currently in user's quiet hours
   */
  async isInQuietHours(
    userId: string,
    tenantId: string,
    environment: string
  ): Promise<boolean> {
    try {
      const prefs = await this.getPreferences(userId, tenantId, environment);

      if (!prefs.quietHours) {
        return false; // No quiet hours configured
      }

      const timezone = prefs.timezone || 'UTC';
      const now = new Date();
      
      // Get current time in user's timezone
      const userTime = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);

      const [currentHour, currentMinute] = userTime.split(':').map(Number);
      const currentMinutes = currentHour * 60 + currentMinute;

      // Parse quiet hours
      const [startHour, startMinute] = prefs.quietHours.start.split(':').map(Number);
      const [endHour, endMinute] = prefs.quietHours.end.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;

      // Check if current time falls within quiet hours
      if (startMinutes <= endMinutes) {
        // Normal case: quiet hours don't cross midnight (e.g., 22:00 - 23:00)
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        // Quiet hours cross midnight (e.g., 22:00 - 08:00)
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    } catch (error: any) {
      logger.error(`[NotificationPreferencesService] Error checking quiet hours:`, error);
      return false; // Default to not in quiet hours on error
    }
  }

  /**
   * Get users who have email digest enabled for a specific frequency
   */
  async getUsersWithDigest(
    tenantId: string,
    environment: string,
    frequency: 'daily' | 'weekly'
  ): Promise<string[]> {
    try {
      const allPreferences = await db
        .select()
        .from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.tenantId, tenantId),
          eq(notificationPreferences.environment, environment)
        ));

      const userIds: string[] = [];

      for (const pref of allPreferences) {
        const emailPrefs = pref.preferences?.channels?.email;
        if (emailPrefs?.enabled && emailPrefs.digestFrequency === frequency) {
          userIds.push(pref.userId);
        }
      }

      return userIds;
    } catch (error: any) {
      logger.error(`[NotificationPreferencesService] Error getting digest users:`, error);
      return [];
    }
  }
}

export const notificationPreferencesService = new NotificationPreferencesService();
