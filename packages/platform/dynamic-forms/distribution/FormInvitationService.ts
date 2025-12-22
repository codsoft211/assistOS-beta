/**
 * Form Invitation Service
 * 
 * Handles distribution of forms via email and WhatsApp, tracking views,
 * starts, and submissions.
 * 
 * @example
 * ```typescript
 * const service = new FormInvitationService();
 * 
 * // Send form via email
 * const invitation = await service.sendInvitation({
 *   formId: 'form-123',
 *   recipient: {
 *     email: 'supplier@example.com',
 *     name: 'ACME Corp'
 *   },
 *   channel: 'email',
 *   context: {
 *     purchaseOrderId: 'PO-001'
 *   },
 *   sentBy: 'user-456'
 * });
 * 
 * // Track when recipient views form
 * await service.trackView(invitation.token);
 * ```
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../../../apps/api/db';
import {
  formInvitations,
  forms,
  SelectFormInvitation,
  SelectForm,
} from '../../../../shared/schema';
import { WhatsAppAPIService } from '../../../../apps/api/services/whatsapp-api.service';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class InvitationNotFoundError extends Error {
  constructor(token: string) {
    super(`Invitation not found: ${token}`);
    this.name = 'InvitationNotFoundError';
  }
}

export class FormNotPublishedError extends Error {
  constructor(formId: string) {
    super(`Form is not published: ${formId}`);
    this.name = 'FormNotPublishedError';
  }
}

export class InvalidChannelError extends Error {
  constructor(channel: string) {
    super(`Invalid channel: ${channel}. Must be 'email' or 'whatsapp'`);
    this.name = 'InvalidChannelError';
  }
}

export class MissingRecipientInfoError extends Error {
  constructor(channel: string, field: string) {
    super(`Missing required ${field} for ${channel} channel`);
    this.name = 'MissingRecipientInfoError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface RecipientInfo {
  email?: string;
  phone?: string;
  name?: string;
}

export interface InvitationContext {
  purchaseOrderId?: string;
  projectId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  customMessage?: string;
  metadata?: Record<string, any>;
}

export interface SendInvitationParams {
  formId: string;
  recipient: RecipientInfo;
  channel: 'email' | 'whatsapp';
  context?: InvitationContext;
  sentBy: string;
  environment?: string;
}

export interface InvitationStats {
  total: number;
  sent: number;
  delivered: number;
  viewed: number;
  started: number;
  submitted: number;
  failed: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Service
// ═══════════════════════════════════════════════════════════════════════════════

export class FormInvitationService {
  private whatsappService: WhatsAppAPIService;

  constructor() {
    this.whatsappService = new WhatsAppAPIService();
  }

  /**
   * Send a form invitation via email or WhatsApp
   * 
   * @param params - Invitation parameters
   * @returns Created invitation
   */
  async sendInvitation(params: SendInvitationParams): Promise<SelectFormInvitation> {
    try {
      console.log(`[FormInvitation] Sending invitation via ${params.channel}`);

      // Validate channel
      if (!['email', 'whatsapp'].includes(params.channel)) {
        throw new InvalidChannelError(params.channel);
      }

      // Validate recipient info based on channel
      if (params.channel === 'email' && !params.recipient.email) {
        throw new MissingRecipientInfoError('email', 'email address');
      }
      if (params.channel === 'whatsapp' && !params.recipient.phone) {
        throw new MissingRecipientInfoError('whatsapp', 'phone number');
      }

      // Get form and verify it's published
      const [form] = await db
        .select()
        .from(forms)
        .where(eq(forms.id, params.formId));

      if (!form) {
        throw new Error(`Form not found: ${params.formId}`);
      }

      if (form.status !== 'published') {
        throw new FormNotPublishedError(params.formId);
      }

      // Generate unique invitation token
      const token = crypto.randomBytes(32).toString('hex');

      // Create invitation record
      const [invitation] = await db.insert(formInvitations).values({
        formId: params.formId,
        formVersion: form.version,
        tenantId: form.tenantId,
        environment: params.environment || form.environment,
        recipientEmail: params.recipient.email,
        recipientPhone: params.recipient.phone,
        recipientName: params.recipient.name,
        channel: params.channel,
        token,
        contextData: params.context,
        sentBy: params.sentBy,
        status: 'pending',
      }).returning();

      // Send via appropriate channel
      try {
        if (params.channel === 'email') {
          await this.sendEmail(invitation, form, params.context);
        } else {
          await this.sendWhatsApp(invitation, form, params.context);
        }

        // Update status to sent
        await this.updateInvitationStatus(invitation.id, {
          status: 'sent',
          sentAt: new Date(),
        });

        console.log(`[FormInvitation] Invitation sent: ${invitation.id} (${params.channel})`);
      } catch (error: any) {
        console.error(`[FormInvitation] Failed to send via ${params.channel}:`, error);
        
        // Update status to failed
        await this.updateInvitationStatus(invitation.id, {
          status: 'failed',
          error: { message: error.message, stack: error.stack },
        });

        throw error;
      }

      return invitation;
    } catch (error: any) {
      console.error('[FormInvitation] Send invitation failed:', error);
      throw error;
    }
  }

  /**
   * Track when invitation is viewed
   * 
   * @param token - Invitation token
   */
  async trackView(token: string): Promise<void> {
    try {
      console.log(`[FormInvitation] Tracking view for token: ${token}`);

      const invitation = await this.getInvitationByToken(token);

      // Only track first view
      if (!invitation.viewedAt) {
        await this.updateInvitationStatus(invitation.id, {
          viewedAt: new Date(),
        });
      }

      console.log(`[FormInvitation] View tracked for invitation: ${invitation.id}`);
    } catch (error: any) {
      console.error('[FormInvitation] Track view failed:', error);
      throw error;
    }
  }

  /**
   * Track when user starts filling form
   * 
   * @param token - Invitation token
   */
  async trackStarted(token: string): Promise<void> {
    try {
      console.log(`[FormInvitation] Tracking started for token: ${token}`);

      const invitation = await this.getInvitationByToken(token);

      // Only track first start
      if (!invitation.startedAt) {
        await this.updateInvitationStatus(invitation.id, {
          startedAt: new Date(),
        });
      }

      console.log(`[FormInvitation] Started tracked for invitation: ${invitation.id}`);
    } catch (error: any) {
      console.error('[FormInvitation] Track started failed:', error);
      throw error;
    }
  }

  /**
   * Mark invitation as submitted
   * 
   * @param token - Invitation token
   * @param submissionId - Form submission ID
   */
  async markSubmitted(token: string, submissionId: string): Promise<void> {
    try {
      console.log(`[FormInvitation] Marking submitted for token: ${token}`);

      const invitation = await this.getInvitationByToken(token);

      await this.updateInvitationStatus(invitation.id, {
        status: 'submitted',
        submittedAt: new Date(),
        submissionId,
      });

      console.log(`[FormInvitation] Submission tracked for invitation: ${invitation.id}`);
    } catch (error: any) {
      console.error('[FormInvitation] Mark submitted failed:', error);
      throw error;
    }
  }

  /**
   * Send a reminder for pending invitation
   * 
   * @param invitationId - Invitation ID
   */
  async sendReminder(invitationId: string): Promise<void> {
    try {
      console.log(`[FormInvitation] Sending reminder for invitation: ${invitationId}`);

      const [invitation] = await db
        .select()
        .from(formInvitations)
        .where(eq(formInvitations.id, invitationId));

      if (!invitation) {
        throw new InvitationNotFoundError(invitationId);
      }

      // Don't send reminders for submitted forms
      if (invitation.status === 'submitted') {
        console.log(`[FormInvitation] Skipping reminder - already submitted`);
        return;
      }

      // Get form
      const [form] = await db
        .select()
        .from(forms)
        .where(eq(forms.id, invitation.formId));

      if (!form) {
        throw new Error(`Form not found: ${invitation.formId}`);
      }

      // Increment reminder count
      const reminderCount = (invitation.reminderCount || 0) + 1;

      // Send via appropriate channel
      if (invitation.channel === 'email') {
        await this.sendReminderEmail(invitation, form);
      } else {
        await this.sendReminderWhatsApp(invitation, form);
      }

      // Update reminder count and last reminder date
      await db
        .update(formInvitations)
        .set({
          reminderCount,
          lastReminderAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(formInvitations.id, invitationId));

      console.log(`[FormInvitation] Reminder sent (count: ${reminderCount})`);
    } catch (error: any) {
      console.error('[FormInvitation] Send reminder failed:', error);
      throw error;
    }
  }

  /**
   * Get invitation statistics for a form
   * 
   * @param formId - Form ID
   * @returns Statistics
   */
  async getFormStats(formId: string): Promise<InvitationStats> {
    try {
      const invitations = await db
        .select()
        .from(formInvitations)
        .where(eq(formInvitations.formId, formId));

      return {
        total: invitations.length,
        sent: invitations.filter(i => i.sentAt).length,
        delivered: invitations.filter(i => i.deliveredAt).length,
        viewed: invitations.filter(i => i.viewedAt).length,
        started: invitations.filter(i => i.startedAt).length,
        submitted: invitations.filter(i => i.submittedAt).length,
        failed: invitations.filter(i => i.status === 'failed').length,
      };
    } catch (error: any) {
      console.error('[FormInvitation] Get stats failed:', error);
      throw error;
    }
  }

  /**
   * List all invitations for a form
   * 
   * @param formId - Form ID
   * @param limit - Optional limit
   * @returns Array of invitations
   */
  async listInvitations(formId: string, limit?: number): Promise<SelectFormInvitation[]> {
    try {
      let query = db
        .select()
        .from(formInvitations)
        .where(eq(formInvitations.formId, formId))
        .orderBy(desc(formInvitations.createdAt))
        .$dynamic();

      if (limit) {
        query = query.limit(limit);
      }

      const invitations = await query;
      return invitations;
    } catch (error: any) {
      console.error('[FormInvitation] List invitations failed:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get invitation by token
   */
  private async getInvitationByToken(token: string): Promise<SelectFormInvitation> {
    const [invitation] = await db
      .select()
      .from(formInvitations)
      .where(eq(formInvitations.token, token));

    if (!invitation) {
      throw new InvitationNotFoundError(token);
    }

    return invitation;
  }

  /**
   * Update invitation status
   */
  private async updateInvitationStatus(
    invitationId: string,
    updates: Partial<SelectFormInvitation>
  ): Promise<void> {
    await db
      .update(formInvitations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(formInvitations.id, invitationId));
  }

  /**
   * Send invitation via email
   * 
   * Note: This is a placeholder. In production, integrate with existing email service
   * or implement nodemailer integration.
   */
  private async sendEmail(
    invitation: SelectFormInvitation,
    form: SelectForm,
    context?: InvitationContext
  ): Promise<void> {
    const formUrl = this.buildFormUrl(invitation.token);
    const recipientName = invitation.recipientName || 'there';

    console.log(`[FormInvitation] Sending email to: ${invitation.recipientEmail}`);
    console.log(`[FormInvitation] Form URL: ${formUrl}`);
    console.log(`[FormInvitation] Subject: You've been invited to fill out: ${form.name}`);
    console.log(`[FormInvitation] Message: ${context?.customMessage || 'Please fill out this form'}`);

    // TODO: Integrate with existing email service
    // Example:
    // await emailService.send({
    //   to: invitation.recipientEmail,
    //   subject: `You've been invited to fill out: ${form.name}`,
    //   template: 'form-invitation',
    //   data: {
    //     recipientName,
    //     formName: form.name,
    //     formDescription: form.description,
    //     formUrl,
    //     customMessage: context?.customMessage,
    //   }
    // });

    console.log('[FormInvitation] Email sending placeholder - implement email integration');
  }

  /**
   * Send invitation via WhatsApp
   */
  private async sendWhatsApp(
    invitation: SelectFormInvitation,
    form: SelectForm,
    context?: InvitationContext
  ): Promise<void> {
    const formUrl = this.buildFormUrl(invitation.token);
    const recipientName = invitation.recipientName || 'there';

    console.log(`[FormInvitation] Sending WhatsApp to: ${invitation.recipientPhone}`);

    // TODO: Get WhatsApp credentials from tenant settings
    // This requires integration with whatsapp_accounts table
    
    const message = context?.customMessage 
      ? `${context.customMessage}\n\n📋 ${form.name}\n${formUrl}`
      : `Hi ${recipientName}! You've been invited to fill out: ${form.name}\n\n${formUrl}`;

    console.log(`[FormInvitation] WhatsApp message: ${message}`);

    // TODO: Integrate with WhatsApp service
    // Example:
    // const account = await getWhatsAppAccountForTenant(invitation.tenantId);
    // await this.whatsappService.sendTextMessage({
    //   phoneNumberId: account.phoneNumberId,
    //   accessToken: account.accessToken,
    //   to: invitation.recipientPhone,
    //   text: message,
    // });

    console.log('[FormInvitation] WhatsApp sending placeholder - implement WhatsApp integration');
  }

  /**
   * Send reminder email
   */
  private async sendReminderEmail(
    invitation: SelectFormInvitation,
    form: SelectForm
  ): Promise<void> {
    const formUrl = this.buildFormUrl(invitation.token);

    console.log(`[FormInvitation] Sending reminder email to: ${invitation.recipientEmail}`);
    console.log(`[FormInvitation] Subject: Reminder: ${form.name}`);

    // TODO: Integrate with email service
    console.log('[FormInvitation] Reminder email placeholder - implement email integration');
  }

  /**
   * Send reminder WhatsApp
   */
  private async sendReminderWhatsApp(
    invitation: SelectFormInvitation,
    form: SelectForm
  ): Promise<void> {
    const formUrl = this.buildFormUrl(invitation.token);

    console.log(`[FormInvitation] Sending reminder WhatsApp to: ${invitation.recipientPhone}`);

    // TODO: Integrate with WhatsApp service
    console.log('[FormInvitation] Reminder WhatsApp placeholder - implement WhatsApp integration');
  }

  /**
   * Build public form URL from invitation token
   */
  private buildFormUrl(token: string): string {
    // TODO: Get base URL from environment or tenant settings
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
    return `${baseUrl}/forms/fill/${token}`;
  }
}
