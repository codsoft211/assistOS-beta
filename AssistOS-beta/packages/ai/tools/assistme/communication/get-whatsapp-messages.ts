import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { whatsappMessages, whatsappConversations } from '../../../../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export class GetWhatsAppMessagesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'get_whatsapp_messages',
    category: 'communication' as const,
    scope: 'tenant' as const,
    description: 'Obtém mensagens de uma conversa do WhatsApp',
    parameters: [
      {
        name: 'conversationId',
        type: 'string',
        description: 'ID da conversa',
        required: true
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de mensagens a retornar',
        required: false,
        default: 50
      }
    ],
    outputSchema: z.object({
      messages: z.array(z.object({
        id: z.string(),
        direction: z.string(),
        type: z.string(),
        text: z.string().nullable(),
        status: z.string().nullable(),
        timestamp: z.date(),
        fromNumber: z.string(),
        toNumber: z.string()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      conversationId: string;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;

    const conversation = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.id, input.conversationId),
        eq(whatsappConversations.tenantId, context.tenantId)
      )
    });

    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    const messages = await db.query.whatsappMessages.findMany({
      where: and(
        eq(whatsappMessages.tenantId, context.tenantId),
        eq(whatsappMessages.waConversationId, conversation.waConversationId!)
      ),
      orderBy: [desc(whatsappMessages.timestamp)],
      limit
    });

    const messageData = messages.map(msg => ({
      id: msg.id,
      direction: msg.direction,
      type: msg.type,
      text: msg.text,
      status: msg.status,
      timestamp: msg.timestamp,
      fromNumber: msg.fromNumber,
      toNumber: msg.toNumber
    }));

    return {
      messages: messageData,
      total: messages.length,
      message: `💬 ${messages.length} mensagem(ns) encontrada(s) na conversa`
    };
  }
}
