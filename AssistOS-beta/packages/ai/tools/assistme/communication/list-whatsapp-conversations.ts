import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { whatsappConversations } from '../../../../../shared/schema';
import { eq, and, desc, or, sql } from 'drizzle-orm';

export class ListWhatsAppConversationsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_whatsapp_conversations',
    category: 'communication' as const,
    scope: 'tenant' as const,
    description: 'Lista conversas do WhatsApp',
    parameters: [
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de conversas a retornar',
        required: false,
        default: 50
      },
      {
        name: 'search',
        type: 'string',
        description: 'Termo de pesquisa para filtrar conversas',
        required: false
      }
    ],
    outputSchema: z.object({
      conversations: z.array(z.object({
        id: z.string(),
        title: z.string().nullable(),
        status: z.string(),
        contactName: z.string().nullable(),
        contactPhone: z.string(),
        unreadCount: z.number(),
        lastMessageAt: z.date().nullable()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {
      limit?: number;
      search?: string;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 50;
    
    let whereClause = eq(whatsappConversations.tenantId, context.tenantId);

    if (input.search) {
      whereClause = and(
        whereClause,
        or(
          sql`${whatsappConversations.title} ILIKE ${`%${input.search}%`}`,
          sql`EXISTS (
            SELECT 1 FROM whatsapp_contacts 
            WHERE whatsapp_contacts.id = ${whatsappConversations.contactId}
            AND (
              whatsapp_contacts.name ILIKE ${`%${input.search}%`}
              OR whatsapp_contacts.phone_number LIKE ${`%${input.search}%`}
            )
          )`
        )
      ) as any;
    }

    const conversations = await db.query.whatsappConversations.findMany({
      where: whereClause,
      orderBy: [desc(whatsappConversations.lastInboundMessageAt)],
      limit,
      with: {
        contact: {
          columns: {
            id: true,
            phoneNumber: true,
            name: true,
            profilePicUrl: true
          }
        }
      }
    });

    const conversationData = conversations.map(conv => {
      const contact = conv.contact as any;
      return {
        id: conv.id,
        title: conv.title,
        status: conv.status,
        contactName: contact?.name || null,
        contactPhone: contact?.phoneNumber || '',
        unreadCount: conv.unreadCount || 0,
        lastMessageAt: conv.lastInboundMessageAt
      };
    });

    return {
      conversations: conversationData,
      total: conversations.length,
      message: `📱 Encontradas ${conversations.length} conversa(s) do WhatsApp`
    };
  }
}
