import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { 
  budgetQuotes,
  budgetQuoteItems,
  commercialLeads
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().min(1, "ID do lead obrigatorio"),
  packageId: z.string().min(1, "ID do pacote obrigatorio"),
  numPax: z.number().int().positive("Numero de participantes deve ser positivo"),
  eventLocation: z.string().optional(),
  distanceKm: z.number().positive().optional(),
  customMarginPercentage: z.number().min(0).max(100).optional(),
  items: z.array(z.object({
    menuItemId: z.string(),
    isIncluded: z.boolean(),
    quantityMultiplier: z.number().positive(),
    customCostPerPax: z.number().positive().optional()
  })).optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

export const CreateBudgetQuoteTool: ToolDefinition<Input> = {
  name: "create-budget-quote",
  description: "Cria um orcamento/proposta comercial com calculo automatico de totais",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Criar orcamento em transacao atomica
    const result = await db.transaction(async (tx) => {
      // 1. Validar que lead existe
      const lead = await tx.query.commercialLeads.findFirst({
        where: and(
          eq(commercialLeads.tenantId, context.tenantId),
          eq(commercialLeads.id, input.leadId)
        )
      });

      if (!lead) {
        throw new Error(`Lead ${input.leadId} nao encontrado`);
      }

      // 2. Gerar numero de orcamento unico
      const timestamp = Date.now();
      const quoteNumber = `QT-${timestamp}`;

      // 3. Calcular valores do orcamento
      // Valores base (simplificado - em producao viria do package e menu items)
      const baseValuePerPax = 50; // Valor base por pessoa
      const subtotal = input.numPax * baseValuePerPax;
      
      // Calcular margem
      const marginPercentage = input.customMarginPercentage || 20; // 20% default
      const marginAmount = (subtotal * marginPercentage) / 100;
      
      const totalWithoutVat = subtotal + marginAmount;
      
      // IVA 23% (Portugal)
      const vatRate = 23;
      const vatAmount = (totalWithoutVat * vatRate) / 100;
      const totalWithVat = totalWithoutVat + vatAmount;

      // 4. Inserir orcamento
      const [quote] = await tx.insert(budgetQuotes).values({
        tenantId: context.tenantId,
        leadId: input.leadId,
        packageId: input.packageId,
        quoteNumber,
        version: 1,
        status: 'draft',
        numPax: input.numPax,
        eventLocation: input.eventLocation,
        distanceKm: input.distanceKm ? input.distanceKm.toString() : null,
        customMarginPercentage: marginPercentage.toString(),
        calculatedMenuCost: subtotal.toString(),
        subtotal: subtotal.toString(),
        marginAmount: marginAmount.toString(),
        totalWithoutVat: totalWithoutVat.toString(),
        totalWithVat: totalWithVat.toString(),
        notes: input.notes,
        internalNotes: input.internalNotes,
        createdByUserId: context.userId,
      }).returning();

      // 5. Inserir items se fornecidos
      let itemsCount = 0;
      if (input.items && input.items.length > 0) {
        for (const item of input.items) {
          await tx.insert(budgetQuoteItems).values({
            quoteId: quote.id,
            menuItemId: item.menuItemId,
            isIncluded: item.isIncluded,
            quantityMultiplier: item.quantityMultiplier.toString(),
            customCostPerPax: item.customCostPerPax ? item.customCostPerPax.toString() : null,
          });
          itemsCount++;
        }
      }

      return { quote, itemsCount, subtotal, totalWithVat };
    });

    return {
      success: true,
      data: {
        quoteId: result.quote.id,
        quoteNumber: result.quote.quoteNumber,
        leadId: input.leadId,
        status: result.quote.status,
        numPax: input.numPax,
        subtotal: result.subtotal,
        totalWithVat: result.totalWithVat,
        itemsCount: result.itemsCount,
        message: `Orcamento ${result.quote.quoteNumber} criado. ${input.numPax} participantes. Total: ${result.totalWithVat.toFixed(2)} EUR (com IVA)`
      }
    };
  },
};
