/**
 * AssistME Tool: Handle WhatsApp Automation Response
 * 
 * Allows AssistME to respond to WhatsApp automation notifications
 * by sending approved or custom responses to clients.
 */

import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from "../../../../../apps/api/db";
import { whatsappMessages, whatsappConversations, whatsappContacts, messages, conversations } from "../../../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";

interface AutomationNotificationMetadata {
  notificationType?: string;
  isAutomationNotification?: boolean;
  automationToolHint?: string;
  handled?: boolean;
  clientPhone?: string;
  suggestedResponse?: string;
  clientName?: string;
  messageText?: string;
  category?: string;
  confidence?: number;
  timestamp?: string;
  handledAt?: string;
  handledBy?: string;
  handledAction?: string;
  [key: string]: any;
}

/**
 * Normalizes phone numbers for consistent comparison
 * Removes +, spaces, dashes, and other formatting characters
 */
function normalizePhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  return phone.replace(/[\s\+\-\(\)]/g, '');
}


/**
 * Finds the automation notification conversation for a specific client
 * Do NOT filter by environment - automation notifications can be in any environment
 * @param tenantId - Tenant ID
 * @param clientPhone - Client phone number (will be normalized for lookup)
 */
async function findAutomationNotificationConversation(tenantId: string, clientPhone: string): Promise<string | undefined> {
  const normalizedPhone = normalizePhoneNumber(clientPhone);
  
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.tenantId, tenantId),
      eq(conversations.agentType, 'assistme'),
      eq(conversations.type, 'automation_notifications'),
      eq(conversations.relatedEntityId, normalizedPhone),
    ),
    orderBy: [desc(conversations.updatedAt)],
  });
  
  if (conversation) {
    console.log(`[AssistME Tool] 🔍 Found automation notification conversation for client ${normalizedPhone}: ${conversation.id} (environment: ${conversation.environment})`);
    return conversation.id;
  }
  
  console.warn(`[AssistME Tool] ⚠️  No automation notification conversation found for tenant ${tenantId}, client ${normalizedPhone}`);
  return undefined;
}

export class HandleWhatsAppAutomationResponseTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'handle_whatsapp_automation_response',
    category: 'communication' as const,
    scope: 'tenant' as const,
    description: `**CRÍTICO: Responde a notificações de automação WhatsApp**

🚨 USA ESTA FERRAMENTA quando o utilizador diz: "responder", "enviar", "send", "sim", "yes", "ok", "aprova"

📋 IMPORTANTE: Se há múltiplas notificações pendentes:
- "ok" → chama esta ferramenta PARA TODAS (uma chamada por notificação)
- "ignore" → chama esta ferramenta COM action="reject" PARA TODAS
- "A-ok B-ignore" → chama individualmente conforme especificado

COMO FUNCIONA:
1. Procura nas mensagens ANTERIORES da conversa
2. Encontra notificações com metadata.isAutomationNotification=true
3. Usa metadata.clientPhone e metadata.suggestedResponse

AÇÕES:
- action="approve" → envia a resposta sugerida (quando utilizador diz "responder", "enviar", "sim", "ok")
- action="reject" → ignora (quando utilizador diz "ignorar", "não", "skip", "ignore")
- action="custom" → envia texto personalizado (quando utilizador diz "Muda para X")

NOTA: Esta ferramenta pode ser chamada múltiplas vezes para processar várias notificações.
Cada chamada processa UMA notificação específica (identificada por clientPhone).

Esta ferramenta envia mensagens WhatsApp automaticamente.`,
    parameters: [
      {
        name: 'clientPhone',
        type: 'string',
        description: 'Número de telefone do cliente (com código de país, sem + ou espaços). Ex: 351912345678',
        required: true
      },
      {
        name: 'action',
        type: 'string',
        description: 'Ação a tomar: "approve" para enviar resposta sugerida, "reject" para ignorar, "custom" para enviar resposta personalizada',
        required: true
      },
      {
        name: 'responseText',
        type: 'string',
        description: 'Resposta a enviar ao cliente (obrigatório se action="approve" ou "custom")',
        required: false
      },
    ],
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      messageId: z.string().optional(),
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      clientPhone: string;
      action: string;
      responseText?: string;
    },
    context: ToolExecutionContext
  ) {
    console.log(`[AssistME Tool] ========== START handle_whatsapp_automation_response ==========`);
    console.log(`[AssistME Tool] Input:`, {
      clientPhone: input.clientPhone,
      action: input.action,
      hasResponseText: !!input.responseText,
    });
    console.log(`[AssistME Tool] Context:`, {
      conversationId: context.conversationId,
      tenantId: context.tenantId,
      environment: context.environment,
      userId: context.userId,
    });

    // Note: Notification will be marked as handled after successful processing

    // If rejecting, mark notification as handled first, then return
    if (input.action === 'reject' || input.action === 'ignorar') {
      // Mark notification as handled
      // Find conversationId - use provided one or find automation notification conversation for this client
      let conversationId: string | undefined = context.conversationId;
      if (!conversationId) {
        console.log(`[AssistME Tool] ⚠️  conversationId is undefined, finding automation notification conversation for client ${input.clientPhone}...`);
        conversationId = await findAutomationNotificationConversation(context.tenantId, input.clientPhone);
        if (!conversationId) {
          console.warn(`[AssistME Tool] ⚠️  Cannot mark notification as handled: no conversation found for client ${input.clientPhone}`);
        }
      }
      
      if (conversationId) {
        try {
          // Find all automation notifications in this conversation (most recent first)
          // NOTE: Do NOT filter by environment - notifications can be in any environment
          console.log(`[AssistME Tool] 🔍 Querying notifications for conversation ${conversationId}, tenant ${context.tenantId}`);
          const allNotifications = await db.query.messages.findMany({
            where: and(
              eq(messages.tenantId, context.tenantId),
              eq(messages.conversationId, conversationId),
            ),
            orderBy: [desc(messages.createdAt)],
          });
          console.log(`[AssistME Tool] 📊 Found ${allNotifications.length} total messages in conversation`);
          
          // Find the most recent UNHANDLED notification matching this client
          // First try exact match (with normalized phone numbers), then try most recent unhandled if no match
          const normalizedInputPhone = normalizePhoneNumber(input.clientPhone);
          let notificationMessage = allNotifications.find(msg => {
            const metadata = msg.metadata as AutomationNotificationMetadata | null;
            const normalizedMetadataPhone = normalizePhoneNumber(metadata?.clientPhone);
            return (
              metadata?.isAutomationNotification === true &&
              normalizedMetadataPhone === normalizedInputPhone &&
              metadata?.handled !== true
            );
          });
          
          let matchType: 'exact' | 'fallback' = 'exact';
          
          // If no exact match, find most recent unhandled (phone might have been wrong)
          if (!notificationMessage) {
            console.log(`[AssistME Tool] ⚠️  No exact match for ${input.clientPhone} (normalized: ${normalizedInputPhone}), trying most recent unhandled...`);
            notificationMessage = allNotifications.find(msg => {
              const metadata = msg.metadata as AutomationNotificationMetadata | null;
              return (
                metadata?.isAutomationNotification === true &&
                metadata?.handled !== true
              );
            });
            if (notificationMessage) {
              const metadata = notificationMessage.metadata as AutomationNotificationMetadata;
              const normalizedFoundPhone = normalizePhoneNumber(metadata?.clientPhone);
              console.log(`[AssistME Tool] 🔍 Found most recent unhandled for: ${metadata?.clientPhone} (normalized: ${normalizedFoundPhone}, was trying: ${input.clientPhone})`);
              matchType = 'fallback';
            }
          }
          
          if (notificationMessage) {
            const currentMetadata = (notificationMessage.metadata || {}) as AutomationNotificationMetadata;
            console.log(`[AssistME Tool] 📝 Updating notification ${notificationMessage.id} (reject):`, {
              messageTenantId: notificationMessage.tenantId,
              messageEnvironment: notificationMessage.environment,
              contextTenantId: context.tenantId,
              contextEnvironment: context.environment,
              tenantIdMatch: notificationMessage.tenantId === context.tenantId,
              environmentMatch: notificationMessage.environment === context.environment,
              currentHandled: currentMetadata.handled,
              clientPhone: currentMetadata.clientPhone,
              normalizedInput: normalizedInputPhone,
              matchType,
            });
            
            // Warn if tenantId mismatch
            if (notificationMessage.tenantId !== context.tenantId) {
              console.error(`[AssistME Tool] ⚠️  TENANT ID MISMATCH: Message tenantId=${notificationMessage.tenantId}, Context tenantId=${context.tenantId}`);
            }
            
            const updatedMetadata: AutomationNotificationMetadata = {
              ...currentMetadata,
              handled: true,
              handledAt: new Date().toISOString(),
              handledBy: context.userId,
              handledAction: input.action,
            };
            
            // Build WHERE clause - include tenantId if available for security, but don't fail if null
            const whereConditions = [eq(messages.id, notificationMessage.id)];
            if (context.tenantId && notificationMessage.tenantId) {
              // Only add tenantId filter if both are present and match
              if (notificationMessage.tenantId === context.tenantId) {
                whereConditions.push(eq(messages.tenantId, context.tenantId));
              } else {
                console.error(`[AssistME Tool] ❌ Cannot update: tenantId mismatch prevents update`);
                throw new Error(`Tenant ID mismatch: cannot update notification`);
              }
            }
            
            const updateResult = await db.update(messages)
              .set({ 
                metadata: updatedMetadata,
              })
              .where(and(...whereConditions))
              .returning();
            
            if (updateResult.length > 0) {
              console.log(`[AssistME Tool] 📊 Update returned ${updateResult.length} row(s)`);
              
              // Verify the update actually persisted by re-querying
              const verifyWhere = [eq(messages.id, notificationMessage.id)];
              if (context.tenantId) {
                verifyWhere.push(eq(messages.tenantId, context.tenantId));
              }
              const verifiedMessage = await db.query.messages.findFirst({
                where: and(...verifyWhere),
              });
              
              if (!verifiedMessage) {
                console.error(`[AssistME Tool] ❌ CRITICAL: Could not find message ${notificationMessage.id} after update!`);
              } else {
                const verifiedMetadata = verifiedMessage.metadata as AutomationNotificationMetadata | null;
                if (verifiedMetadata?.handled === true) {
                  console.log(`[AssistME Tool] ✅ Verified: Notification ${notificationMessage.id} marked as rejected/handled (match: ${matchType})`);
                } else {
                  console.error(`[AssistME Tool] ❌ VERIFICATION FAILED: Notification ${notificationMessage.id} still shows handled=${verifiedMetadata?.handled}`);
                  console.error(`[AssistME Tool] Expected: handled=true, Got:`, JSON.stringify(verifiedMetadata, null, 2));
                  console.error(`[AssistME Tool] Update result metadata:`, JSON.stringify(updateResult[0]?.metadata, null, 2));
                }
              }
            } else {
              console.error(`[AssistME Tool] ❌ Update returned no rows for notification ${notificationMessage.id}`);
              console.error(`[AssistME Tool] Message ID: ${notificationMessage.id}, TenantId: ${context.tenantId}, ConversationId: ${conversationId}`);
            }
          } else {
            console.warn(`[AssistME Tool] ⚠️  Could not find any unhandled notification for client ${input.clientPhone}`);
          }
        } catch (error) {
          console.warn(`[AssistME Tool] Could not mark notification as handled on reject:`, error);
        }
      }
      
      const contact = await db.query.whatsappContacts.findFirst({
        where: and(
          eq(whatsappContacts.tenantId, context.tenantId),
          eq(whatsappContacts.phoneNumber, input.clientPhone),
        ),
      });
      
      const contactDisplay = contact?.name || 'cliente';
      
      return {
        success: true,
        message: `✅ Mensagem de **${contactDisplay}** ignorada.`,
      };
    }

    // Validate response text
    if (!input.responseText) {
      throw new Error('Resposta é necessária quando action é "approve" ou "custom"');
    }

    // Simple check: Find the notification and verify it's still unhandled (basic race condition prevention)
    // The orchestrator already filters similar notifications before passing to AI, so we just need to check
    // if this specific notification was already handled by another parallel tool call
    let conversationId: string | undefined = context.conversationId;
    if (!conversationId) {
      conversationId = await findAutomationNotificationConversation(context.tenantId, input.clientPhone);
    }
    
    let currentNotification: any = null;
    if (conversationId) {
      try {
        const allNotifications = await db.query.messages.findMany({
          where: and(
            eq(messages.tenantId, context.tenantId),
            eq(messages.conversationId, conversationId),
          ),
          orderBy: [desc(messages.createdAt)],
        });
        
        const normalizedInputPhone = normalizePhoneNumber(input.clientPhone);
        currentNotification = allNotifications.find(msg => {
          const metadata = msg.metadata as AutomationNotificationMetadata | null;
          const normalizedMetadataPhone = normalizePhoneNumber(metadata?.clientPhone);
          return (
            metadata?.isAutomationNotification === true &&
            normalizedMetadataPhone === normalizedInputPhone &&
            metadata?.handled !== true
          );
        });
        
        // Simple race condition check: if notification is already handled, skip
        if (currentNotification) {
          const metadata = currentNotification.metadata as AutomationNotificationMetadata;
          if (metadata?.handled === true) {
            console.log(`[AssistME Tool] ⚠️  Notification ${currentNotification.id} is already handled. Skipping.`);
            const contact = await db.query.whatsappContacts.findFirst({
              where: and(
                eq(whatsappContacts.tenantId, context.tenantId),
                eq(whatsappContacts.phoneNumber, input.clientPhone),
              ),
            });
            const contactDisplay = contact?.name || 'cliente';
            return {
              success: true,
              message: `✅ Notificação de **${contactDisplay}** já foi tratada anteriormente.`,
              messageId: undefined,
            };
          }
        }
      } catch (error) {
        console.warn(`[AssistME Tool] Could not check notification status:`, error);
      }
    }

    // Get the contact - phone number should be extracted correctly from notification content now
    const contact = await db.query.whatsappContacts.findFirst({
      where: and(
        eq(whatsappContacts.tenantId, context.tenantId),
        eq(whatsappContacts.phoneNumber, input.clientPhone),
      ),
    });

    if (!contact) {
      // Get all contacts for better error message
      const allContacts = await db.query.whatsappContacts.findMany({
        where: eq(whatsappContacts.tenantId, context.tenantId),
        columns: { phoneNumber: true, name: true },
      });
      console.error(`[AssistME Tool] ❌ Contact not found for phone: ${input.clientPhone}`);
      console.log(`[AssistME Tool] Available contacts:`, allContacts.map((c: { phoneNumber: string; name: string | null }) => ({ phone: c.phoneNumber, name: c.name })));
      throw new Error(
        `❌ Número de telefone inválido: ${input.clientPhone}\n\n` +
        `Números válidos disponíveis:\n` +
        allContacts.map((c: { phoneNumber: string; name: string | null }) => `  - ${c.name || 'Cliente'}: ${c.phoneNumber}`).join('\n') +
        `\n\nO número deve corresponder EXATAMENTE ao número no formato (+XXXXXXXXXXX) que aparece na notificação.`
      );
    }

    const conversation = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.tenantId, context.tenantId),
        eq(whatsappConversations.contactId, contact.id),
      ),
      orderBy: [desc(whatsappConversations.updatedAt)],
      with: {
        account: true,
      },
    });

    if (!conversation) {
      throw new Error(`Conversa com cliente ${input.clientPhone} não encontrada.`);
    }

    if (!conversation.account) {
      throw new Error('Conta WhatsApp não encontrada');
    }

    const account = conversation.account as any;

    let messageId: string | undefined;
    let newMessage: any = null;
    
    // Check account connection type and use appropriate sending method
    if (account.connectionType === 'web-connector') {
      // WhatsApp Web - use worker HTTP endpoint (same as inbox)
      console.log(`[AssistME Tool] Using WhatsApp Web to send message to ${contact.phoneNumber}`);
      
      const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
      
      const response = await fetch(`${workerUrl}/whatsapp-web/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          to: contact.phoneNumber,
          text: input.responseText,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Worker error: ${await response.text()}`);
      }
      
      const data = await response.json();
      messageId = data.messageId;
    } else {
      // WhatsApp Business API - use API service
      console.log(`[AssistME Tool] Using WhatsApp Business API to send message to ${contact.phoneNumber}`);
      
      const { whatsappAPIService } = await import('../../../../../apps/api/services/whatsapp-api.service');

      const result = await whatsappAPIService.sendTextMessage({
        phoneNumberId: account.phoneNumberId!,
        accessToken: account.accessToken!,
        to: contact.phoneNumber,
        text: input.responseText,
      });
      
      messageId = result.messages[0].id;
    }

    // Save the message to database
    if (messageId) {
      [newMessage] = await db.insert(whatsappMessages).values({
        tenantId: context.tenantId,
        accountId: conversation.accountId,
        waMessageId: messageId,
        direction: 'outbound',
        fromNumber: account.phoneNumber,
        toNumber: contact.phoneNumber,
        contactId: conversation.contactId,
        type: 'text',
        text: input.responseText,
        status: 'sent',
        timestamp: new Date(),
        processingStatus: 'completed',
        waConversationId: conversation.waConversationId,
      }).returning();
    }

    const contactDisplay = contact.name || contact.phoneNumber;
    
    // Mark the notification as handled in AssistME conversation
    // The orchestrator already filtered similar notifications, so we only mark this one
    if (!conversationId) {
      console.log(`[AssistME Tool] ⚠️  conversationId is undefined, finding automation notification conversation for client ${input.clientPhone}...`);
      conversationId = await findAutomationNotificationConversation(context.tenantId, input.clientPhone);
      if (!conversationId) {
        console.warn(`[AssistME Tool] ⚠️  Cannot mark notification as handled: no conversation found for client ${input.clientPhone}`);
      }
    }
    
    if (conversationId && currentNotification) {
      try {
        const currentMetadata = (currentNotification.metadata || {}) as AutomationNotificationMetadata;
        console.log(`[AssistME Tool] 📝 Marking notification ${currentNotification.id} as handled`);
        
        // Warn if tenantId mismatch
        if (currentNotification.tenantId !== context.tenantId) {
          console.error(`[AssistME Tool] ⚠️  TENANT ID MISMATCH: Message tenantId=${currentNotification.tenantId}, Context tenantId=${context.tenantId}`);
        }
        
        const updatedMetadata: AutomationNotificationMetadata = {
          ...currentMetadata,
          handled: true,
          handledAt: new Date().toISOString(),
          handledBy: context.userId,
          handledAction: input.action,
        };
        
        // Build WHERE clause - include tenantId if available for security
        const whereConditions = [eq(messages.id, currentNotification.id)];
        if (context.tenantId && currentNotification.tenantId) {
          if (currentNotification.tenantId === context.tenantId) {
            whereConditions.push(eq(messages.tenantId, context.tenantId));
          } else {
            console.error(`[AssistME Tool] ❌ Cannot update: tenantId mismatch prevents update`);
            throw new Error(`Tenant ID mismatch: cannot update notification`);
          }
        }
        
        const updateResult = await db.update(messages)
          .set({ 
            metadata: updatedMetadata,
          })
          .where(and(...whereConditions))
          .returning();
        
        if (updateResult.length > 0) {
          console.log(`[AssistME Tool] ✅ Marked notification ${currentNotification.id} as handled`);
        } else {
          console.error(`[AssistME Tool] ❌ Update returned no rows for notification ${currentNotification.id}`);
        }
      } catch (error) {
        console.warn(`[AssistME Tool] Could not mark notification as handled:`, error);
        // Don't fail the whole operation if marking fails
      }
    } else if (conversationId && !currentNotification) {
      console.warn(`[AssistME Tool] ⚠️  Could not find unhandled notification for client ${input.clientPhone} to mark as handled`);
    }
    
    console.log(`[AssistME Tool] ========== END handle_whatsapp_automation_response (SUCCESS) ==========`);
    
    return {
      success: true,
      message: `✅ Resposta WhatsApp enviada para **${contactDisplay}**\n\n*Mensagem enviada:*\n> ${input.responseText}`,
      messageId: newMessage?.id,
    };
  }
}
