import { db } from "../../../../../apps/api/db";
import { and, eq, desc, asc, gte } from "drizzle-orm";
import { commercialLeads, users } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  status: z.string().optional().describe("Filtrar por status (Novo, Em Contacto, Qualificado, Proposta, Negociacao, Ganho, Perdido)"),
  sortBy: z.enum(['eventDate', 'createdAt', 'budgetTotal', 'numPax']).optional().describe("Campo para ordenacao (default: eventDate)"),
  sortDirection: z.enum(['asc', 'desc']).optional().describe("Direcao: asc (proximos primeiro) ou desc (default: asc)"),
  upcomingOnly: z.boolean().optional().describe("Se true, apenas leads com eventos futuros (default: false)"),
  limit: z.number().int().positive().optional().describe("Numero maximo de resultados (default: 10)"),
  ownerId: z.string().optional().describe("Filtrar por responsavel"),
});

type Input = z.infer<typeof inputSchema>;

export const ListLeadsTool: ToolDefinition<Input> = {
  name: "list-leads",
  description: "Lista leads comerciais com filtros. Pode ordenar por data de evento para ver leads com eventos mais proximos. Use upcomingOnly=true e sortBy=eventDate para ver leads com proximos eventos.",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    const limit = input.limit || 10;
    const sortBy = input.sortBy || 'eventDate';
    const sortDirection = input.sortDirection || 'asc';

    const conditions: any[] = [eq(commercialLeads.tenantId, context.tenantId)];
    
    if (context.environment) {
      conditions.push(eq(commercialLeads.environment, context.environment));
    }
    
    if (input.status) {
      conditions.push(eq(commercialLeads.status, input.status));
    }

    if (input.ownerId) {
      conditions.push(eq(commercialLeads.ownerId, input.ownerId));
    }

    if (input.upcomingOnly) {
      conditions.push(gte(commercialLeads.eventDate, new Date()));
    }

    const sortFieldMap: Record<string, any> = {
      'eventDate': commercialLeads.eventDate,
      'createdAt': commercialLeads.createdAt,
      'budgetTotal': commercialLeads.budgetTotal,
      'numPax': commercialLeads.numPax,
    };

    const orderByField = sortFieldMap[sortBy] || commercialLeads.eventDate;
    const orderByDirection = sortDirection === 'desc' ? desc(orderByField) : asc(orderByField);

    const results = await db
      .select({
        id: commercialLeads.id,
        proposalNumber: commercialLeads.proposalNumber,
        contactName: commercialLeads.contactName,
        contactEmail: commercialLeads.contactEmail,
        contactPhone: commercialLeads.contactPhone,
        eventDate: commercialLeads.eventDate,
        eventType: commercialLeads.eventType,
        location: commercialLeads.location,
        numPax: commercialLeads.numPax,
        budgetTotal: commercialLeads.budgetTotal,
        status: commercialLeads.status,
        createdAt: commercialLeads.createdAt,
        description: commercialLeads.description,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName
      })
      .from(commercialLeads)
      .leftJoin(users, eq(commercialLeads.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(orderByDirection)
      .limit(limit);

    const leads = results.map(row => ({
      id: row.id,
      proposalNumber: row.proposalNumber,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      eventDate: row.eventDate ? row.eventDate.toISOString().split('T')[0] : null,
      eventType: row.eventType,
      location: row.location,
      numPax: row.numPax,
      budgetTotal: row.budgetTotal,
      status: row.status,
      ownerName: row.ownerFirstName && row.ownerLastName 
        ? `${row.ownerFirstName} ${row.ownerLastName}` 
        : row.ownerFirstName || 'Nao atribuido',
      description: row.description
    }));

    const upcomingText = input.upcomingOnly ? ' com eventos futuros' : '';
    const sortText = sortBy === 'eventDate' ? ' ordenados por data de evento' : '';
    
    return {
      success: true,
      data: {
        leads,
        total: leads.length,
        message: `Encontrados ${leads.length} lead(s)${upcomingText}${sortText}`
      }
    };
  },
};
