import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { purchaseOrders, purchaseOrderLines, products } from 'shared/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';

export class ForecastDemandTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'forecast_demand',
    category: 'procurement' as const,
    scope: 'tenant' as const,
    description: 'Previsao de procura baseada em historico de compras',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto (opcional - se omitido, analisa todos)',
        required: false
      },
      {
        name: 'periodMonths',
        type: 'number',
        description: 'Periodo de analise em meses (default: 6)',
        required: false
      },
      {
        name: 'forecastMonths',
        type: 'number',
        description: 'Meses a prever (default: 3)',
        required: false
      }
    ],
    outputSchema: z.object({
      productId: z.string().optional(),
      periodMonths: z.number(),
      forecastMonths: z.number(),
      analysis: z.array(z.object({
        productId: z.string(),
        productName: z.string(),
        historicalAvgMonthly: z.number(),
        trend: z.string(),
        forecastedMonthly: z.number(),
        forecastedTotal: z.number(),
        confidence: z.string()
      })),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      productId?: string;
      periodMonths?: number;
      forecastMonths?: number;
    },
    context: ToolExecutionContext
  ) {
    const periodMonths = input.periodMonths || 6;
    const forecastMonths = input.forecastMonths || 3;

    // Calcular data de inicio do periodo
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - periodMonths);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Buscar POs no periodo
    const pos = await db.query.purchaseOrders.findMany({
      where: and(
        eq(purchaseOrders.tenantId, context.tenantId),
        gte(purchaseOrders.orderDate, startDateStr)
      )
    });

    const poIds = pos.map(po => po.id);

    if (poIds.length === 0) {
      return {
        periodMonths,
        forecastMonths,
        analysis: [],
        message: `Nenhuma ordem de compra encontrada nos ultimos ${periodMonths} meses`
      };
    }

    // Buscar linhas das POs
    const allLines = await db.query.purchaseOrderLines.findMany({
      where: and(
        eq(purchaseOrderLines.tenantId, context.tenantId)
      )
    });

    // Filtrar linhas das POs do periodo
    const lines = allLines.filter(line => poIds.includes(line.poId));

    // Se productId especificado, filtrar
    const relevantLines = input.productId 
      ? lines.filter(line => line.productId === input.productId)
      : lines;

    if (relevantLines.length === 0) {
      return {
        productId: input.productId,
        periodMonths,
        forecastMonths,
        analysis: [],
        message: input.productId 
          ? `Nenhuma compra encontrada para o produto nos ultimos ${periodMonths} meses`
          : `Nenhuma compra encontrada nos ultimos ${periodMonths} meses`
      };
    }

    // Agrupar por produto
    const productMap = new Map<string, { 
      productId: string; 
      quantities: number[];
      dates: Date[];
    }>();

    for (const line of relevantLines) {
      if (!line.productId) continue;

      const po = pos.find(p => p.id === line.poId);
      if (!po) continue;

      const qty = parseFloat(line.quantity);
      const orderDate = new Date(po.orderDate);

      if (!productMap.has(line.productId)) {
        productMap.set(line.productId, {
          productId: line.productId,
          quantities: [],
          dates: []
        });
      }

      const productData = productMap.get(line.productId)!;
      productData.quantities.push(qty);
      productData.dates.push(orderDate);
    }

    // Buscar nomes dos produtos
    const productIds = Array.from(productMap.keys());
    const productsData = await db.query.products.findMany({
      where: and(
        eq(products.tenantId, context.tenantId)
      )
    });

    const productNameMap = new Map(
      productsData.map(p => [p.id, p.name])
    );

    // Analisar cada produto
    const analysis = [];

    for (const [productId, data] of productMap.entries()) {
      const productName = productNameMap.get(productId) || 'Produto desconhecido';
      
      // Calcular media mensal historica
      const totalQty = data.quantities.reduce((sum, q) => sum + q, 0);
      const avgMonthly = totalQty / periodMonths;

      // Detectar tendencia (simplificado)
      // Comparar primeira metade vs segunda metade do periodo
      const midpoint = Math.floor(data.quantities.length / 2);
      const firstHalf = data.quantities.slice(0, midpoint);
      const secondHalf = data.quantities.slice(midpoint);

      const avgFirstHalf = firstHalf.reduce((s, q) => s + q, 0) / (firstHalf.length || 1);
      const avgSecondHalf = secondHalf.reduce((s, q) => s + q, 0) / (secondHalf.length || 1);

      let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      let trendFactor = 1.0;

      if (avgSecondHalf > avgFirstHalf * 1.15) {
        trend = 'increasing';
        trendFactor = 1.15;
      } else if (avgSecondHalf < avgFirstHalf * 0.85) {
        trend = 'decreasing';
        trendFactor = 0.85;
      }

      // Previsao ajustada pela tendencia
      const forecastedMonthly = avgMonthly * trendFactor;
      const forecastedTotal = forecastedMonthly * forecastMonths;

      // Confianca baseada em quantidade de dados
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (data.quantities.length >= 10) {
        confidence = 'high';
      } else if (data.quantities.length >= 5) {
        confidence = 'medium';
      }

      analysis.push({
        productId,
        productName,
        historicalAvgMonthly: Math.round(avgMonthly * 100) / 100,
        trend,
        forecastedMonthly: Math.round(forecastedMonthly * 100) / 100,
        forecastedTotal: Math.round(forecastedTotal * 100) / 100,
        confidence
      });
    }

    // Ordenar por quantidade prevista (maior primeiro)
    analysis.sort((a, b) => b.forecastedTotal - a.forecastedTotal);

    return {
      productId: input.productId,
      periodMonths,
      forecastMonths,
      analysis,
      message: `Previsao gerada para ${analysis.length} produto(s) baseada em ${periodMonths} meses de historico`
    };
  }
}
