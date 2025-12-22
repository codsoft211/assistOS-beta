import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { rfqQuotes, rfqQuoteLines, suppliers } from 'shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';

export class CompareQuotesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'compare_quotes',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Compara cotacoes recebidas para um RFQ com scoring e recomendacoes',
    parameters: [
      {
        name: 'rfqId',
        type: 'string',
        description: 'ID do RFQ',
        required: true
      }
    ],
    outputSchema: z.object({
      rfqId: z.string(),
      quotesCount: z.number(),
      ranking: z.array(z.object({
        quoteId: z.string(),
        supplierId: z.string(),
        supplierName: z.string(),
        totalAmount: z.number(),
        priceScore: z.number(),
        leadTimeScore: z.number(),
        supplierScore: z.number(),
        overallScore: z.number(),
        recommendation: z.string(),
        rank: z.number()
      })),
      bestQuote: z.object({
        quoteId: z.string(),
        supplierName: z.string(),
        overallScore: z.number()
      }).optional(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      rfqId: string;
    },
    context: ToolExecutionContext
  ) {
    // Buscar todas as cotacoes para o RFQ
    const quotes = await db.query.rfqQuotes.findMany({
      where: and(
        eq(rfqQuotes.tenantId, context.tenantId),
        eq(rfqQuotes.rfqId, input.rfqId)
      )
    });

    if (quotes.length === 0) {
      return {
        rfqId: input.rfqId,
        quotesCount: 0,
        ranking: [],
        message: 'Nenhuma cotacao encontrada para este RFQ'
      };
    }

    // Buscar dados dos fornecedores
    const supplierIds = quotes.map(q => q.supplierId);
    const suppliersData = await db.query.suppliers.findMany({
      where: and(
        eq(suppliers.tenantId, context.tenantId),
        inArray(suppliers.id, supplierIds)
      )
    });

    const supplierMap = new Map(
      suppliersData.map(s => [s.id, s])
    );

    // Calcular scores para cada cotacao
    const quotesWithScores = [];

    // Encontrar menor preco e menor lead time para normalizacao
    const prices = quotes.map(q => parseFloat(q.totalAmount || '0')).filter(p => p > 0);
    const leadTimes = quotes.map(q => q.deliveryLeadTime).filter(lt => lt !== null) as number[];
    
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const minLeadTime = leadTimes.length > 0 ? Math.min(...leadTimes) : 0;
    const maxLeadTime = leadTimes.length > 0 ? Math.max(...leadTimes) : 0;

    for (const quote of quotes) {
      const supplier = supplierMap.get(quote.supplierId);
      const totalAmount = parseFloat(quote.totalAmount || '0');
      
      // 1. Score de preco (10 = melhor preco)
      let priceScore = 0;
      if (totalAmount > 0 && minPrice > 0) {
        if (maxPrice === minPrice) {
          priceScore = 10;
        } else {
          priceScore = 10 - ((totalAmount - minPrice) / (maxPrice - minPrice)) * 10;
        }
      }

      // 2. Score de lead time (10 = menor tempo)
      let leadTimeScore = 0;
      if (quote.deliveryLeadTime !== null) {
        if (maxLeadTime === minLeadTime) {
          leadTimeScore = 10;
        } else {
          leadTimeScore = 10 - ((quote.deliveryLeadTime - minLeadTime) / (maxLeadTime - minLeadTime)) * 10;
        }
      } else {
        leadTimeScore = 5; // Score neutro se nao informado
      }

      // 3. Score do fornecedor (baseado em historico)
      let supplierScore = 5; // Default neutro
      if (supplier && supplier.overallScore) {
        supplierScore = parseFloat(supplier.overallScore);
      }

      // 4. Score geral (media ponderada)
      const overallScore = (priceScore * 0.5) + (leadTimeScore * 0.3) + (supplierScore * 0.2);

      // 5. Recomendacao
      let recommendation: 'recommended' | 'acceptable' | 'not_recommended' = 'acceptable';
      if (overallScore >= 8) {
        recommendation = 'recommended';
      } else if (overallScore < 5) {
        recommendation = 'not_recommended';
      }

      quotesWithScores.push({
        quoteId: quote.id,
        supplierId: quote.supplierId,
        supplierName: supplier?.name || 'Fornecedor desconhecido',
        totalAmount,
        priceScore: Math.round(priceScore * 10) / 10,
        leadTimeScore: Math.round(leadTimeScore * 10) / 10,
        supplierScore: Math.round(supplierScore * 10) / 10,
        overallScore: Math.round(overallScore * 10) / 10,
        recommendation,
        deliveryLeadTime: quote.deliveryLeadTime
      });
    }

    // Ordenar por overall score (maior primeiro)
    quotesWithScores.sort((a, b) => b.overallScore - a.overallScore);

    // Adicionar rank
    const ranking = quotesWithScores.map((q, index) => ({
      ...q,
      rank: index + 1
    }));

    // Melhor cotacao
    const bestQuote = ranking.length > 0 ? {
      quoteId: ranking[0].quoteId,
      supplierName: ranking[0].supplierName,
      overallScore: ranking[0].overallScore
    } : undefined;

    return {
      rfqId: input.rfqId,
      quotesCount: quotes.length,
      ranking: ranking.map(r => ({
        quoteId: r.quoteId,
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        totalAmount: r.totalAmount,
        priceScore: r.priceScore,
        leadTimeScore: r.leadTimeScore,
        supplierScore: r.supplierScore,
        overallScore: r.overallScore,
        recommendation: r.recommendation,
        rank: r.rank
      })),
      bestQuote,
      message: `Analisadas ${quotes.length} cotacao(oes) para RFQ. Melhor cotacao: ${bestQuote?.supplierName || 'N/A'} (score: ${bestQuote?.overallScore || 0})`
    };
  }
}
