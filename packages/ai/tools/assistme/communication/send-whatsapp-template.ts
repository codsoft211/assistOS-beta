import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { 
  whatsappConversations,
  whatsappTemplates,
  whatsappMessages
} from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { whatsappAPIService } from '../../../../../apps/api/services/whatsapp-api.service';

export class SendWhatsAppTemplateTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'send_whatsapp_template',
    category: 'communication' as const,
    scope: 'tenant' as const,
    description: 'Envia uma mensagem template via WhatsApp',
    parameters: [
      {
        name: 'conversationId',
        type: 'string',
        description: 'ID da conversa do WhatsApp',
        required: true
      },
      {
        name: 'templateId',
        type: 'string',
        description: 'ID do template a enviar',
        required: true
      },
      {
        name: 'parameters',
        type: 'object',
        description: 'Parâmetros opcionais para o template',
        required: false
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
      templateId: string;
      parameters?: any;
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

    if (!conversation.account || !conversation.contact) {
      throw new Error('Conta ou contacto não encontrado');
    }

    const account = conversation.account as any;
    const contact = conversation.contact as any;

    const template = await db.query.whatsappTemplates.findFirst({
      where: and(
        eq(whatsappTemplates.id, input.templateId),
        eq(whatsappTemplates.tenantId, context.tenantId)
      )
    });

    if (!template) {
      throw new Error('Template não encontrado');
    }

    const result = await whatsappAPIService.sendTemplateMessage({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      to: contact.phoneNumber,
      templateName: template.name,
      templateLanguage: template.language,
      components: input.parameters?.components || []
    });

    const [newMessage] = await db.insert(whatsappMessages).values({
      tenantId: context.tenantId,
      accountId: conversation.accountId,
      waMessageId: result.messages[0].id,
      direction: 'outbound',
      fromNumber: account.phoneNumber,
      toNumber: contact.phoneNumber,
      contactId: conversation.contactId,
      type: 'template',
      templateName: template.name,
      templateLanguage: template.language,
      templateParameters: input.parameters,
      status: 'sent',
      timestamp: new Date(),
      processingStatus: 'completed',
      waConversationId: conversation.waConversationId
    }).returning();

    return {
      messageId: newMessage.id,
      status: 'sent',
      message: `✅ Template "${template.name}" enviado com sucesso para ${contact.name || contact.phoneNumber}`
    };
  }
}
