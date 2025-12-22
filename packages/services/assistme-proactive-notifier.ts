/**
 * AssistME Proactive Notification Service
 * 
 * Sends proactive notifications to AssistME chat when important events occur,
 * such as order inquiries from configured WhatsApp automation clients.
 */

import { db } from "../../apps/api/db";
import { conversations, messages } from "../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { AutomationAnalysisResult } from "./whatsapp-automation-analyzer";
import { publishRealtimeEvent } from "../../apps/api/services/redis-event-bus";
import { REALTIME_CHANNELS } from "../../shared/realtime";
import { selectOneFromTenantTable } from "../../apps/api/utils/tenant-db-helper";

export interface ProactiveNotificationOptions {
  tenantId: string;
  environment?: string;
  userId?: string; // Optional userId - if provided, use it (e.g., from WhatsApp account creator); otherwise fallback to tenant owner
  type: 'whatsapp_order_inquiry';
  data: {
    clientName: string | null;
    clientPhone: string;
    messageText: string;
    category: string;
    confidence: number;
    reasoning: string;
    suggestedResponse?: string;
    conversationId?: string;
    messageId?: string;
    contextUsed?: {
      checkedProducts: boolean;
      checkedInventory: boolean;
      checkedPricing: boolean;
      checkedClientHistory: boolean;
      toolsUsed: string[];
    };
  };
}

/**
 * Normalizes phone numbers for consistent comparison
 * Removes +, spaces, dashes, and other formatting characters
 */
function normalizePhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  return phone.replace(/[\s\+\-\(\)]/g, '');
}

export class AssistMEProactiveNotifier {
  /**
   * Gets a userId for the tenant (for conversations table isolation)
   * Prioritizes tenant owner, falls back to any user if no owner found
   * Uses userTenants table from tenant schema
   */
  private async getTenantUserId(tenantId: string): Promise<string | null> {
    try {
      // First, try to get the tenant owner (role = 'owner')
      const ownerUserTenant = await selectOneFromTenantTable<{
        user_id: string;
        tenant_id: string;
        role: string;
      }>(
        tenantId,
        'user_tenants',
        sql`tenant_id = ${tenantId} AND role = 'owner'`
      );
      
      if (ownerUserTenant?.user_id) {
        console.log(`[AssistME Proactive Notifier] Using tenant owner userId: ${ownerUserTenant.user_id}`);
        return ownerUserTenant.user_id;
      }
      
      // Fallback: get any user from the tenant
      const anyUserTenant = await selectOneFromTenantTable<{
        user_id: string;
        tenant_id: string;
        role: string;
      }>(
        tenantId,
        'user_tenants',
        sql`tenant_id = ${tenantId}`
      );
      
      if (anyUserTenant?.user_id) {
        console.log(`[AssistME Proactive Notifier] No owner found, using first available userId: ${anyUserTenant.user_id}`);
        return anyUserTenant.user_id;
      }
      
      return null;
    } catch (error) {
      console.error('[AssistME Proactive Notifier] Error getting tenant userId:', error);
      return null;
    }
  }

  /**
   * Sends a proactive notification to AssistME chat
   */
  async sendNotification(options: ProactiveNotificationOptions): Promise<void> {
    try {
      console.log(`[AssistME Proactive Notifier] Sending notification to tenant ${options.tenantId}`);

      // Get userId for tenant isolation (conversations table uses userId, not tenantId)
      // Use provided userId if available (e.g., from WhatsApp account creator), otherwise get tenant owner
      let userId: string;
      if (options.userId) {
        userId = options.userId;
        console.log(`[AssistME Proactive Notifier] Using provided userId: ${userId}`);
      } else {
        const tenantUserId = await this.getTenantUserId(options.tenantId);
        if (!tenantUserId) {
          throw new Error(`No user found for tenant ${options.tenantId}. Cannot create conversation.`);
        }
        userId = tenantUserId;
      }

      // Extract and normalize client phone number for per-client conversation
      const clientPhone = options.data.clientPhone;
      const normalizedPhone = normalizePhoneNumber(clientPhone);
      const clientName = options.data.clientName || null;
      
      // Create conversation title: always use format Whatsapp_notification{client_name}
      const conversationTitle = clientName 
        ? `Whatsapp_notification${clientName}`
        : `Whatsapp_notification+${clientPhone}`;

      // Find or create an AssistME conversation for this specific client
      // Use relatedEntityId to store normalized phone number for unique identification
      // conversations table uses userId for tenant isolation (not tenantId)
      const [foundConversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, userId), // ✅ Use userId instead of tenantId
            eq(conversations.agentType, 'assistme'),
            eq(conversations.type, 'automation_notifications'),
            eq(conversations.relatedEntityId, normalizedPhone),
          )
        )
        .orderBy(desc(conversations.updatedAt))
        .limit(1);
      
      let conversation = foundConversation || null;

      // Track if this is a new conversation (for SSE event emission)
      let isNewConversation = false;

      if (!conversation) {
        // Create a new conversation for this specific client
        isNewConversation = true;
        const [newConversation] = await db.insert(conversations).values({
          userId: userId, // ✅ Use userId instead of tenantId
          title: conversationTitle,
          agentType: 'assistme',
          type: 'automation_notifications',
          scope: 'tenant',
          status: 'active',
          priority: 'high',
          relatedEntityId: normalizedPhone,
          relatedEntityName: clientName || `+${clientPhone}`,
        }).returning();
        
        conversation = newConversation;
        console.log(`[AssistME Proactive Notifier] Created new automation conversation for client ${clientName || clientPhone}: ${conversation.id}`);
      } else {
        // Update conversation timestamp to bring it to the top
        // Preserve title format - only update if it doesn't match expected format
        // Always update relatedEntityName with current client name
        const titleNeedsUpdate = !conversation.title.startsWith('Whatsapp_notification');
        
        const updateData: any = {
          updatedAt: new Date(),
          relatedEntityName: clientName || `+${clientPhone}`,
        };
        
        // Only update title if it doesn't match the expected format
        if (titleNeedsUpdate) {
          updateData.title = conversationTitle;
        }
        
        const [updatedConversation] = await db.update(conversations)
          .set(updateData)
          .where(eq(conversations.id, conversation.id))
          .returning();
        
        conversation = updatedConversation;
        console.log(`[AssistME Proactive Notifier] Updated existing conversation timestamp for client ${clientName || clientPhone}: ${conversation.id}${titleNeedsUpdate ? ' (title updated)' : ' (title preserved)'}`);
      }

      // Format the notification message
      const notificationContent = this.formatNotificationMessage(options);

      // Insert the notification message
      // CRITICAL: Use 'assistant' role so it's not filtered out by API conversation history
      // messages table uses userId for tenant isolation (not tenantId)
      const messageMetadata = {
        notificationType: options.type,
        isAutomationNotification: true, // Flag for easy detection
        automationToolHint: 'handle_whatsapp_automation_response', // Hint which tool to use
        handled: false, // Track if this notification has been processed
        clientName: options.data.clientName,
        clientPhone: options.data.clientPhone,
        messageText: options.data.messageText,
        category: options.data.category,
        confidence: options.data.confidence,
        reasoning: options.data.reasoning,
        suggestedResponse: options.data.suggestedResponse,
        contextUsed: options.data.contextUsed,
        timestamp: new Date().toISOString(),
      };
      
      const [insertedMessage] = await db.insert(messages).values({
        userId: userId, // ✅ Use userId instead of tenantId
        conversationId: conversation.id,
        role: 'assistant',
        content: notificationContent,
        metadata: messageMetadata,
        isRead: false,
      }).returning();

      console.log(`[AssistME Proactive Notifier] ✅ Notification sent successfully`);

      // Emit real-time events for frontend to update immediately
      // CROSS-PROCESS: Use Redis Pub/Sub since worker runs in separate process
      if (conversation && insertedMessage) {
        console.log(`📡 [AssistME Proactive Notifier] Publishing real-time events via Redis for tenantId: ${options.tenantId}`);
        console.log(`📡 [AssistME Proactive Notifier] Conversation: ${conversation.id} (${isNewConversation ? 'NEW' : 'EXISTING'})`);
        
        // Emit conversation created/updated event
        const conversationEvent = isNewConversation ? REALTIME_CHANNELS.CONVERSATION_CREATED : REALTIME_CHANNELS.CONVERSATION_UPDATED;
        console.log(`📡 [AssistME Proactive Notifier] Publishing: ${conversationEvent}`);
        
        await publishRealtimeEvent(
          conversationEvent,
          options.tenantId,
          { 
            tenantId: options.tenantId, 
            conversationId: conversation.id,
            conversation: {
              id: conversation.id,
              title: conversation.title,
              updatedAt: conversation.updatedAt,
              agentType: conversation.agentType,
              type: conversation.type,
              status: conversation.status,
              priority: conversation.priority,
            }
          }
        );

        // Emit message created event
        console.log(`📡 [AssistME Proactive Notifier] Publishing: ${REALTIME_CHANNELS.MESSAGE_CREATED}`);
        
        await publishRealtimeEvent(
          REALTIME_CHANNELS.MESSAGE_CREATED,
          options.tenantId,
          {
            tenantId: options.tenantId,
            conversationId: conversation.id,
            messageId: insertedMessage.id,
            message: {
              id: insertedMessage.id,
              role: insertedMessage.role,
              content: insertedMessage.content,
              createdAt: insertedMessage.createdAt,
              metadata: insertedMessage.metadata,
            }
          }
        );

        // Emit automation notification event for frontend toast notification
        // This shows "1 message from {clientName}" when a new automation notification arrives
        console.log(`📡 [AssistME Proactive Notifier] Publishing: ${REALTIME_CHANNELS.AI_RESPONSE_COMPLETED} (as automation notification)`);
        
        await publishRealtimeEvent(
          REALTIME_CHANNELS.AI_RESPONSE_COMPLETED,
          options.tenantId,
          {
            conversationId: conversation.id,
            messageId: insertedMessage.id,
            clientName: clientName || `+${clientPhone}`,
            isAutomationNotification: true,
            isNewNotification: true, // Flag to indicate this is a new notification, not a completion
            timestamp: new Date().toISOString(),
          }
        );

        console.log(`[AssistME Proactive Notifier] ✅ Real-time events published to Redis (conversation: ${isNewConversation ? 'created' : 'updated'}, message: created, notification: sent)`);
      }
    } catch (error) {
      console.error('[AssistME Proactive Notifier] Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Formats the notification message for display in AssistME chat
   */
  private formatNotificationMessage(options: ProactiveNotificationOptions): string {
    const { data } = options;
    
    switch (options.type) {
      case 'whatsapp_order_inquiry':
        return this.formatWhatsAppOrderInquiry(data);
      default:
        return `Nova notificação: ${JSON.stringify(data)}`;
    }
  }

  /**
   * Formats a WhatsApp order inquiry notification
   */
  private formatWhatsAppOrderInquiry(data: ProactiveNotificationOptions['data']): string {
    // Show contact name if available, otherwise show "Cliente"
    const clientDisplay = data.clientName || 'Cliente';
    // Include phone number in brackets so AI can extract it from content
    const clientDisplayWithPhone = `${clientDisplay} (+${data.clientPhone})`;
    
    let message = `## 📱 Nova Mensagem WhatsApp de **${clientDisplayWithPhone}**\n\n`;
    message += `> *"${data.messageText}"*\n\n`;

    if (data.suggestedResponse) {
      message += `Sugestão de resposta:\n\n`;
      message += `${data.suggestedResponse}\n\n`;
      message += `---\n\n`;
      message += `Responde **"sim"** ou **"ok"** para enviar, ou **"ignorar"** para não responder.`;
    } else {
      message += `---\n\n`;
      message += `Como devo responder a esta mensagem?`;
    }

    return message;
  }

  /**
   * Gets a localized label for a message category
   */
  private getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      order: '📦 Pedido',
      info_request: 'ℹ️ Pedido de Informação',
      invoice: '💰 Fatura',
      complaint: '⚠️ Reclamação',
      other: '📝 Outro',
    };
    return labels[category] || category;
  }

  /**
   * Sends a WhatsApp order inquiry notification
   */
  async notifyWhatsAppOrderInquiry(
    tenantId: string,
    analysis: AutomationAnalysisResult,
    messageText: string,
    userId?: string, // Optional userId - if provided, use it (e.g., from WhatsApp account creator)
  ): Promise<void> {
    if (!analysis.clientInfo) {
      console.warn('[AssistME Proactive Notifier] Cannot notify without client info');
      return;
    }

    await this.sendNotification({
      tenantId,
      userId,
      type: 'whatsapp_order_inquiry',
      data: {
        clientName: analysis.clientInfo.name,
        clientPhone: analysis.clientInfo.phoneNumber,
        messageText,
        category: analysis.category,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        suggestedResponse: analysis.suggestedResponse,
        contextUsed: analysis.contextUsed,
      },
    });
  }
}

// Export singleton instance
export const assistMEProactiveNotifier = new AssistMEProactiveNotifier();
