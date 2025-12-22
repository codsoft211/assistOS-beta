import { db } from "../../../../../apps/api/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { 
  commercialLeads,
  commercialPipeline,
  budgetQuotes
} from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";

const inputSchema = z.object({
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  groupByStage: z.boolean(),
  groupByStatus: z.boolean(),
  includeQuoteMetrics: z.boolean(),
});

type Input = z.infer<typeof inputSchema>;

export const GetPipelineMetricsTool: ToolDefinition<Input> = {
  name: "get-pipeline-metrics",
  description: "Analisa o pipeline comercial com metricas de conversao e valores",
  category: "sales",
  inputSchema,
  execute: async (input: Input, context: ToolExecutionContext) => {
    // Buscar metricas do pipeline
    // Nota: Esta e uma operacao de leitura, nao precisa de transaction
    // Mas usa filtros de tenant para seguranca
    
    // 1. Buscar todos os leads no periodo
    const whereConditions = [eq(commercialLeads.tenantId, context.tenantId)];
    
    if (input.periodStart) {
      whereConditions.push(gte(commercialLeads.createdAt, new Date(input.periodStart)));
    }
    
    if (input.periodEnd) {
      whereConditions.push(lte(commercialLeads.createdAt, new Date(input.periodEnd)));
    }

    const leads = await db.query.commercialLeads.findMany({
      where: and(...whereConditions),
      columns: {
        id: true,
        status: true,
        budgetTotal: true,
        createdAt: true,
        eventDate: true,
        numPax: true
      }
    });

    // 2. Calcular metricas gerais
    const totalLeads = leads.length;
    const totalValue = leads.reduce((sum, lead) => {
      return sum + (lead.budgetTotal ? parseFloat(lead.budgetTotal) : 0);
    }, 0);

    const averageValue = totalLeads > 0 ? totalValue / totalLeads : 0;

    // 3. Agrupar por status
    const byStatus: Record<string, { count: number; value: number }> = {};
    
    for (const lead of leads) {
      const status = lead.status || 'unknown';
      if (!byStatus[status]) {
        byStatus[status] = { count: 0, value: 0 };
      }
      byStatus[status].count++;
      byStatus[status].value += lead.budgetTotal ? parseFloat(lead.budgetTotal) : 0;
    }

    // 4. Calcular taxas de conversao
    const convertedLeads = leads.filter(l => l.status === 'converted').length;
    const wonLeads = leads.filter(l => l.status === 'won' || l.status === 'approved').length;
    const lostLeads = leads.filter(l => l.status === 'lost' || l.status === 'rejected').length;

    const conversionRate = totalLeads > 0 ? ((convertedLeads + wonLeads) / totalLeads) * 100 : 0;
    const lossRate = totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0;

    // 5. Metricas de orcamentos (se solicitado)
    let quoteMetrics = null;
    if (input.includeQuoteMetrics) {
      const quotes = await db.query.budgetQuotes.findMany({
        where: eq(budgetQuotes.tenantId, context.tenantId),
        columns: {
          id: true,
          status: true,
          totalWithVat: true,
          createdAt: true,
          sentAt: true,
          approvedAt: true
        }
      });

      const totalQuotes = quotes.length;
      const sentQuotes = quotes.filter(q => q.sentAt).length;
      const approvedQuotes = quotes.filter(q => q.status === 'approved').length;
      
      const quoteValue = quotes.reduce((sum, quote) => {
        return sum + (quote.totalWithVat ? parseFloat(quote.totalWithVat) : 0);
      }, 0);

      const quoteConversionRate = sentQuotes > 0 ? (approvedQuotes / sentQuotes) * 100 : 0;

      quoteMetrics = {
        totalQuotes,
        sentQuotes,
        approvedQuotes,
        totalValue: quoteValue,
        averageValue: totalQuotes > 0 ? quoteValue / totalQuotes : 0,
        conversionRate: quoteConversionRate
      };
    }

    // 6. Analise de tendencias
    const leadsThisMonth = leads.filter(l => {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return l.createdAt >= monthAgo;
    }).length;

    const leadsLastMonth = leads.filter(l => {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return l.createdAt >= twoMonthsAgo && l.createdAt < monthAgo;
    }).length;

    const growthRate = leadsLastMonth > 0 ? ((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100 : 0;

    return {
      success: true,
      data: {
        summary: {
          totalLeads,
          totalValue,
          averageValue,
          conversionRate,
          lossRate,
          growthRate
        },
        byStatus,
        conversions: {
          converted: convertedLeads,
          won: wonLeads,
          lost: lostLeads,
          conversionRate,
          lossRate
        },
        quotes: quoteMetrics,
        period: {
          start: input.periodStart || 'all time',
          end: input.periodEnd || 'now',
          leadsThisMonth,
          leadsLastMonth,
          growthRate
        },
        message: `Pipeline analisado: ${totalLeads} leads, ${convertedLeads} convertidos (${conversionRate.toFixed(1)}%), valor total: ${totalValue.toFixed(2)} EUR`
      }
    };
  },
};
