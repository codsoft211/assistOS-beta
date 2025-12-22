import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { 
  whatsappConversations,
  whatsappContacts,
  whatsappAccounts,
  whatsappMessages
} from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { whatsappAPIService } from '../../../../../apps/api/services/whatsapp-api.service';

export class SendWhatsAppMessageTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'send_whatsapp_message',
    category: 'communication' as const,
    scope: 'tenant' as const,
    description: 'Envia uma mensagem de texto via WhatsApp',
    parameters: [
      {
        name: 'conversationId',
        type: 'string',
        description: 'ID da conversa do WhatsApp',
        required: true
      },
      {
        name: 'message',
        type: 'string',
        description: 'Mensagem de texto a enviar',
        required: true
      }
    ],
    outputSchema: z.object({
      messageId: z.string(),
      status: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      conversationId: string;
      message: string;
    },
    context: ToolExecutionContext
  ) {
    const conversation = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.id, input.conversationId),
        eq(whatsappConversations.tenantId, context.tenantId)
      ),
      with: {
        contact: true,
        account: true
      }
    });

    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    if (!conversation.account) {
      throw new Error('Conta WhatsApp não encontrada');
    }

    if (!conversation.contact) {
      throw new Error('Contacto não encontrado');
    }

    const account = conversation.account as any;
    const contact = conversation.contact as any;

    const result = await whatsappAPIService.sendTextMessage({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      to: contact.phoneNumber,
      text: input.message
    });

    const [newMessage] = await db.insert(whatsappMessages).values({
      tenantId: context.tenantId,
      accountId: conversation.accountId,
      waMessageId: result.messages[0].id,
      direction: 'outbound',
      fromNumber: account.phoneNumber,
      toNumber: contact.phoneNumber,
      contactId: conversation.contactId,
      type: 'text',
      text: input.message,
      status: 'sent',
      timestamp: new Date(),
      processingStatus: 'completed',
      waConversationId: conversation.waConversationId
    }).returning();

    return {
      messageId: newMessage.id,
      status: 'sent',
      message: `✅ Mensagem enviada com sucesso via WhatsApp para ${contact.name || contact.phoneNumber}`
    };
  }
}
