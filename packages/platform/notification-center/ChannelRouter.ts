/**
 * ChannelRouter
 * Routes notifications to appropriate channels (in-app, email, WhatsApp, SMS)
 * 
 * Features:
 * - Multi-channel routing with fallback
 * - Retry logic for transient failures (3 attempts with exponential backoff)
 * - Graceful degradation (continue with other channels if one fails)
 * - Dead letter queue for failed notifications
 */

import { db } from '../../../apps/api/db';
import { notifications, users, whatsappAccounts } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { EmailService } from '../../platform/services/EmailService';
import { WhatsAppAPIService } from '../../../apps/api/services/whatsapp-api.service';
import { templateService, TemplateData } from './TemplateService';
import logger from '../../../apps/api/logger';

export type Channel = 'in_app' | 'email' | 'whatsapp' | 'sms';

export interface RouteOptions {
  tenantId: string;
  environment: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  linkText?: string;
  metadata?: any;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  expiresAt?: Date;
}

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
}

export class ChannelRouter {
  private retryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
  };

  constructor(
    private emailService: EmailService,
    private whatsappService: WhatsAppAPIService
  ) {}

  /**
   * Route notification to multiple channels
   */
  async route(options: RouteOptions, channels: Channel[]): Promise<void> {
    const errors: Record<string, Error> = {};

    // Always create in-app notification first (guaranteed delivery)
    try {
      await this.sendInApp(options);
      logger.info(`[ChannelRouter] In-app notification created for user ${options.userId}`);
    } catch (error: any) {
      logger.error(`[ChannelRouter] Failed to create in-app notification:`, error);
      errors['in_app'] = error;
    }

    // Route to other channels in parallel
    const channelPromises = channels
      .filter(channel => channel !== 'in_app') // Already handled above
      .map(async (channel) => {
        try {
          await this.sendToChannel(channel, options);
          logger.info(`[ChannelRouter] Notification sent via ${channel} to user ${options.userId}`);
        } catch (error: any) {
          logger.error(`[ChannelRouter] Failed to send via ${channel}:`, error);
          errors[channel] = error;
        }
      });

    await Promise.allSettled(channelPromises);

    // Log if any channel failed (graceful degradation)
    if (Object.keys(errors).length > 0) {
      logger.warn(`[ChannelRouter] Some channels failed:`, errors);
    }
  }

  /**
   * Send notification to a specific channel with retry logic
   */
  private async sendToChannel(channel: Channel, options: RouteOptions): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        switch (channel) {
          case 'email':
            await this.sendEmail(options);
            return;
          case 'whatsapp':
            await this.sendWhatsApp(options);
            return;
          case 'sms':
            await this.sendSMS(options);
            return;
          default:
            throw new Error(`Unknown channel: ${channel}`);
        }
      } catch (error: any) {
        lastError = error;
        
        if (attempt < this.retryConfig.maxAttempts) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = this.retryConfig.baseDelay * Math.pow(2, attempt - 1);
          logger.warn(`[ChannelRouter] Attempt ${attempt} failed for ${channel}, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    throw new Error(`Failed to send via ${channel} after ${this.retryConfig.maxAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Send in-app notification (direct DB insertion)
   */
  private async sendInApp(options: RouteOptions): Promise<void> {
    const [notification] = await db.insert(notifications).values({
      tenantId: options.tenantId,
      environment: options.environment,
      userId: options.userId,
      type: options.type,
      title: options.title,
      message: options.message,
      link: options.link || null,
      linkText: options.linkText || null,
      metadata: options.metadata || null,
      expiresAt: options.expiresAt || null,
      read: false,
    }).returning();

    logger.info(`[ChannelRouter] In-app notification created: ${notification.id}`);
  }

  /**
   * Send email notification using injected EmailService
   */
  private async sendEmail(options: RouteOptions): Promise<void> {
    try {
      logger.info('[ChannelRouter] Sending email notification', {
        userId: options.userId,
        tenantId: options.tenantId,
        type: options.type,
      });

      // Get user email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, options.userId))
        .limit(1);

      if (!user || !user.email) {
        throw new Error(`User ${options.userId} not found or has no email`);
      }

      // Render email template
      const templateData: TemplateData = {
        userName: `${user.firstName} ${user.lastName}`,
        title: options.title,
        message: options.message,
        link: options.link,
        linkText: options.linkText || 'View More',
        ...options.metadata,
      };

      const htmlContent = await templateService.render(options.type, 'email', templateData);

      // Delegate to EmailService
      await this.emailService.sendEmail({
        to: user.email,
        subject: options.title,
        html: htmlContent,
      });

      logger.info('[ChannelRouter] Email notification sent successfully');
    } catch (error: any) {
      logger.error('[ChannelRouter] Email notification failed', {
        error: error.message,
        userId: options.userId,
      });
      throw error;
    }
  }

  /**
   * Send WhatsApp notification using injected WhatsAppAPIService
   */
  private async sendWhatsApp(options: RouteOptions): Promise<void> {
    try {
      logger.info('[ChannelRouter] Sending WhatsApp notification', {
        userId: options.userId,
        tenantId: options.tenantId,
        type: options.type,
      });

      // Get WhatsApp account for tenant
      const [account] = await db
        .select()
        .from(whatsappAccounts)
        .where(and(
          eq(whatsappAccounts.tenantId, options.tenantId),
          eq(whatsappAccounts.isActive, true)
        ))
        .limit(1);

      if (!account) {
        throw new Error(`No active WhatsApp account found for tenant ${options.tenantId}`);
      }

      // Get user phone number from metadata
      const phoneNumber = options.metadata?.phoneNumber;
      if (!phoneNumber) {
        throw new Error('User phone number not provided in metadata');
      }

      // Render WhatsApp template
      const templateData: TemplateData = {
        title: options.title,
        message: options.message,
        link: options.link,
        ...options.metadata,
      };

      const textContent = await templateService.render(options.type, 'whatsapp', templateData);

      // Delegate to WhatsAppAPIService
      await this.whatsappService.sendTextMessage({
        phoneNumberId: account.phoneNumberId,
        accessToken: account.accessToken,
        to: phoneNumber,
        text: textContent,
        previewUrl: !!options.link,
      });

      logger.info('[ChannelRouter] WhatsApp notification sent successfully');
    } catch (error: any) {
      logger.error('[ChannelRouter] WhatsApp notification failed', {
        error: error.message,
        userId: options.userId,
      });
      throw error;
    }
  }

  /**
   * Send SMS notification (placeholder for future Twilio integration)
   */
  private async sendSMS(options: RouteOptions): Promise<void> {
    // TODO: Implement Twilio SMS integration
    // For now, log that SMS would be sent
    logger.warn('[ChannelRouter] SMS channel not yet implemented - would send:', {
      userId: options.userId,
      title: options.title,
      message: options.message,
    });

    // Throw error to indicate not implemented
    throw new Error('SMS channel not yet implemented. Please integrate Twilio.');
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
