import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryTransactions, inventoryLevels } from 'shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export class StockForecastTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'stock_forecast',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Prevê necessidades futuras de stock baseado em histórico de vendas',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto',
        required: true
      },
      {
        name: 'forecastDays',
        type: 'number',
        description: 'Número de dias a prever',
        required: false,
        default: 30
      },
      {
        name: 'includeSeasonality',
        type: 'boolean',
        description: 'Considerar sazonalidade',
        required: false,
        default: true
      }
    ],
    outputSchema: z.object({
      productId: z.string(),
      currentStock: z.number(),
      forecastDemand: z.number(),
      recommendedReorder: z.number(),
      stockoutRisk: z.enum(['low', 'medium', 'high']),
      suggestedOrderDate: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      productId: string;
      forecastDays?: number;
      includeSeasonality?: boolean;
    },
    context: ToolExecutionContext
  ) {
    // Get current stock level
    const levels = await db.select().from(inventoryLevels)
      .where(and(
        eq(inventoryLevels.tenantId, context.tenantId),
        eq(inventoryLevels.productId, input.productId)
      ));

    const currentStock = levels.reduce((sum, l) => sum + parseFloat(l.qtyOnHand), 0);

    // Get historical shipments/sales (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const shipments = await db.select()
      .from(inventoryTransactions)
      .where(and(
        eq(inventoryTransactions.tenantId, context.tenantId),
        eq(inventoryTransactions.productId, input.productId),
        eq(inventoryTransactions.type, 'shipment'),
        gte(inventoryTransactions.createdAt, ninetyDaysAgo)
      ));

    // Calculate daily demand
    const totalShipped = shipments.reduce((sum, s) => sum + parseFloat(s.qty), 0);
    const dailyDemand = shipments.length > 0 ? totalShipped / 90 : 5; // Default to 5 if no history

    const forecastDays = input.forecastDays || 30;
    const forecastDemand = Math.round(dailyDemand * forecastDays);
    const recommendedReorder = Math.max(0, forecastDemand - currentStock + Math.round(dailyDemand * 10)); // 10 days buffer
    
    const stockoutRisk = currentStock < forecastDemand * 0.3 ? 'high' :
                        currentStock < forecastDemand * 0.6 ? 'medium' : 'low';
    
    const daysUntilOrder = dailyDemand > 0 
      ? Math.max(0, Math.floor((currentStock - (dailyDemand * 10)) / dailyDemand))
      : 30;
    
    const suggestedDate = new Date();
    suggestedDate.setDate(suggestedDate.getDate() + daysUntilOrder);
    
    return {
      productId: input.productId,
      currentStock: Math.round(currentStock),
      forecastDemand,
      recommendedReorder,
      stockoutRisk: stockoutRisk as 'low' | 'medium' | 'high',
      suggestedOrderDate: suggestedDate.toISOString().split('T')[0],
      message: `Previsão para ${forecastDays} dias: ${forecastDemand} unidades necessárias (baseado em ${Math.round(dailyDemand * 10) / 10} unidades/dia). Stock atual: ${Math.round(currentStock)}. Recomendação: encomendar ${recommendedReorder} unidades até ${suggestedDate.toLocaleDateString('pt-PT')}. Risco de rutura: ${stockoutRisk === 'high' ? 'Alto' : stockoutRisk === 'medium' ? 'Médio' : 'Baixo'}`
    };
  }
}
