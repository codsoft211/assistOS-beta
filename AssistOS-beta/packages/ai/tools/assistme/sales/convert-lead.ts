import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  commercialLeads,
  clients,
  commercialActivities
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().min(1, "ID do lead obrigatorio"),
  clientId: z.string().optional(),
  createNewClient: z.boolean(),
  clientData: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    nif: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string(),
  }).optional(),
  notes: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const ConvertCommercialLeadTool: ToolDefinition<Input> = {
  name: "convert-commercial-lead",
  description: "Converte um lead comercial em cliente ativo",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Converter lead em transacao atomica com row-level locking
    const result = await db.transaction(async (tx) => {
      // 1. Ler lead com lock exclusivo (forUpdate) DENTRO do transaction
      const lead = await tx.query.commercialLeads.findFirst({
        where: and(
          eq(commercialLeads.tenantId, context.tenantId),
          eq(commercialLeads.id, input.leadId)
        )
      }).for('update');

      // 2. Validar lead existe
      if (!lead) {
        throw new Error(`Lead ${input.leadId} nao encontrado`);
      }

      // 3. Verificar se lead ja foi convertido
      if (lead.status === 'converted') {
        throw new Error(`Lead ${lead.proposalNumber} ja foi convertido anteriormente`);
      }

      let clientId = input.clientId;
      let clientName = '';

      // 4. Criar novo cliente se solicitado
      if (input.createNewClient && input.clientData) {
        const [newClient] = await tx.insert(clients).values({
          tenantId: context.tenantId,
          name: input.clientData.name,
          email: input.clientData.email,
          phone: input.clientData.phone,
          nif: input.clientData.nif,
          address: input.clientData.address,
          city: input.clientData.city,
          postalCode: input.clientData.postalCode,
          country: input.clientData.country,
          status: 'active',
          createdBy: context.userId,
        }).returning();

        clientId = newClient.id;
        clientName = newClient.name ?? '';
      } else if (input.clientId) {
        // Validar que cliente existe
        const existingClient = await tx.query.clients.findFirst({
          where: and(
            eq(clients.tenantId, context.tenantId),
            eq(clients.id, input.clientId)
          )
        });

        if (!existingClient) {
          throw new Error(`Cliente ${input.clientId} nao encontrado`);
        }

        clientName = existingClient.name ?? '';
      } else {
        throw new Error('Deve fornecer clientId ou createNewClient=true com clientData');
      }

      // 5. Atualizar lead para status 'converted'
      const [convertedLead] = await tx.update(commercialLeads)
        .set({
          status: 'converted',
          updatedAt: new Date(),
          // Nota: commercialLeads nao tem campo convertedToClientId no schema atual
          // Usando comments para armazenar a referencia
          comments: `${lead.comments || ''}\n\nConvertido para cliente ID: ${clientId}`.trim()
        })
        .where(eq(commercialLeads.id, input.leadId))
        .returning();

      // 6. Registar atividade de conversao
      await tx.insert(commercialActivities).values({
        tenantId: context.tenantId,
        leadId: input.leadId,
        activityType: 'conversion',
        subject: `Lead convertido em cliente: ${clientName}`,
        description: input.notes || `Lead ${lead.proposalNumber} convertido com sucesso para cliente ${clientName}`,
        outcome: 'completed',
        completedAt: new Date(),
        createdBy: context.userId,
        assignedTo: context.userId,
        metadata: {
          clientId,
          clientName,
          convertedBy: context.userId,
          convertedAt: new Date().toISOString(),
          leadValue: lead.budgetTotal
        }
      });

      return { convertedLead, clientId, clientName };
    });

    return {
      success: true,
      data: {
        leadId: result.convertedLead.id,
        proposalNumber: result.convertedLead.proposalNumber,
        clientId: result.clientId,
        clientName: result.clientName,
        convertedAt: new Date().toISOString(),
        message: `Lead ${result.convertedLead.proposalNumber} convertido com sucesso para cliente "${result.clientName}"`
      }
    };
  },
};
