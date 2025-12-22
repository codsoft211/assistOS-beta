import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { whatsappContacts } from '../../../../../shared/schema';
import { eq, and, desc, or, sql } from 'drizzle-orm';

export class SearchWhatsAppContactsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'search_whatsapp_contacts',
    category: 'communication' as const,
    scope: 'tenant' as const,
    description: 'Pesquisa contactos do WhatsApp',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Termo de pesquisa (nome ou número de telefone)',
        required: true
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de contactos a retornar',
        required: false,
        default: 20
      }
    ],
    outputSchema: z.object({
      contacts: z.array(z.object({
        id: z.string(),
        name: z.string().nullable(),
        phoneNumber: z.string(),
        optInStatus: z.string(),
        messageCount: z.number(),
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
      query: string;
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    const limit = input.limit || 20;

    const whereClause = and(
      eq(whatsappContacts.tenantId, context.tenantId),
      or(
        sql`${whatsappContacts.name} ILIKE ${`%${input.query}%`}`,
        sql`${whatsappContacts.phoneNumber} LIKE ${`%${input.query}%`}`
      )
    );

    const contacts = await db.query.whatsappContacts.findMany({
      where: whereClause as any,
      orderBy: [desc(whatsappContacts.lastMessageAt)],
      limit
    });

    const contactData = contacts.map(contact => ({
      id: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      optInStatus: contact.optInStatus,
      messageCount: contact.messageCount || 0,
      lastMessageAt: contact.lastMessageAt
    }));

    return {
      contacts: contactData,
      total: contacts.length,
      message: `👥 ${contacts.length} contacto(s) encontrado(s) com "${input.query}"`
    };
  }
}
