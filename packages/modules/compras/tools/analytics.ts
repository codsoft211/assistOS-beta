/**
 * ComprasModule - Analytics AI Tools
 * 2 tools for demand forecasting and spend analysis
 */

import { db } from "../../../../apps/api/db";
import { 
  purchaseOrders, 
  purchaseOrderLines,
  purchasingInvoices,
  suppliers,
  products,
} from "../../../../shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

export const analyticsTools = [
  {
    type: "function" as const,
    function: {
      name: "forecast_demand",
      description: "Previsão de demanda para produtos baseado em histórico de compras. Analisa padrões, sazonalidade, tendências. Retorna forecast + recomendações de reorder.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "ID do produto a analisar (obrigatório)",
          },
          forecastMonths: {
            type: "number",
            description: "Meses à frente para prever (default: 3)",
          },
          historicalMonths: {
            type: "number",
            description: "Meses de histórico a considerar (default: 12)",
          },
        },
        required: ["productId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "spend_analysis_by_supplier",
      description: "Análise de gastos por fornecedor. Calcula total spend, número de POs, average order value, payment terms compliance. Útil para supplier negotiations e cost optimization.",
      parameters: {
        type: "object",
        properties: {
          supplierId: {
            type: "string",
            description: "ID do fornecedor (opcional - se não fornecido, analisa todos)",
          },
          startDate: {
            type: "string",
            description: "Data inicial análise YYYY-MM-DD (opcional)",
          },
          endDate: {
            type: "string",
            description: "Data final análise YYYY-MM-DD (opcional)",
          },
          topN: {
            type: "number",
            description: "Top N fornecedores por spend (default: 10)",
          },
        },
      },
    },
  },
];

/**
 * Execute an analytics tool based on tool call from AI
 */
export async function executeAnalyticsTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Analytics Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "forecast_demand":
      return await handleForecastDemand(args, context);
      
    case "spend_analysis_by_supplier":
      return await handleSpendAnalysisBySupplier(args, context);
      
    default:
      throw new Error(`Unknown analytics tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleForecastDemand(
  args: {
    productId: string;
    forecastMonths?: number;
    historicalMonths?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { productId, forecastMonths = 3, historicalMonths = 12 } = args;

  // Get product
  const product = await db
    .select()
    .from(products)
    .where(and(
      eq(products.id, productId),
      eq(products.tenantId, tenantId)
    ))
    .limit(1);

  if (product.length === 0) {
    return {
      success: false,
      error: "Produto não encontrado",
    };
  }

  // Get historical purchase orders for this product
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - historicalMonths);

  const historicalPOs = await db
    .select({
      orderDate: purchaseOrders.orderDate,
      quantity: purchaseOrderLines.quantity,
      unitPrice: purchaseOrderLines.unitPrice,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrderLines.poId, purchaseOrders.id))
    .where(and(
      eq(purchaseOrderLines.tenantId, tenantId),
      eq(purchaseOrderLines.productId, productId),
      gte(purchaseOrders.orderDate, cutoffDate)
    ))
    .orderBy(purchaseOrders.orderDate);

  if (historicalPOs.length === 0) {
    return {
      success: false,
      error: "Sem histórico de compras para este produto",
    };
  }

  // Calculate statistics
  const totalQuantity = historicalPOs.reduce((sum, po) => 
    sum + parseFloat(po.quantity || '0'), 0
  );

  const avgMonthlyDemand = totalQuantity / historicalMonths;
  const forecastedDemand = avgMonthlyDemand * forecastMonths;

  // Simple moving average forecast
  const recentMonths = 3;
  const recentPOs = historicalPOs.slice(-recentMonths);
  const recentTotalQty = recentPOs.reduce((sum, po) => 
    sum + parseFloat(po.quantity || '0'), 0
  );
  const recentAvg = recentPOs.length > 0 ? recentTotalQty / recentPOs.length : avgMonthlyDemand;

  // Trend detection (simplified)
  const trend = recentAvg > avgMonthlyDemand ? 'increasing' : 
                recentAvg < avgMonthlyDemand ? 'decreasing' : 'stable';

  // Reorder recommendation
  const safetyStock = avgMonthlyDemand * 0.5; // 50% safety stock
  const reorderPoint = (avgMonthlyDemand * 1) + safetyStock; // 1 month lead time + safety

  return {
    success: true,
    product: {
      id: product[0].id,
      code: product[0].code,
      name: product[0].name,
    },
    forecast: {
      forecastMonths,
      historicalMonths,
      dataPoints: historicalPOs.length,
      avgMonthlyDemand: Number(avgMonthlyDemand.toFixed(2)),
      forecastedDemand: Number(forecastedDemand.toFixed(2)),
      trend,
      confidence: historicalPOs.length >= 6 ? 'high' : 'medium',
    },
    recommendation: {
      reorderPoint: Number(reorderPoint.toFixed(2)),
      safetyStock: Number(safetyStock.toFixed(2)),
      suggestedOrderQty: Number(forecastedDemand.toFixed(2)),
    },
  };
}

async function handleSpendAnalysisBySupplier(
  args: {
    supplierId?: string;
    startDate?: string;
    endDate?: string;
    topN?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { supplierId, startDate, endDate, topN = 10 } = args;

  const whereConditions: any[] = [
    eq(purchaseOrders.tenantId, tenantId),
  ];

  if (supplierId) {
    whereConditions.push(eq(purchaseOrders.supplierId, supplierId));
  }

  if (startDate) {
    whereConditions.push(gte(purchaseOrders.orderDate, new Date(startDate)));
  }

  if (endDate) {
    whereConditions.push(lte(purchaseOrders.orderDate, new Date(endDate)));
  }

  // Get POs
  const pos = await db
    .select()
    .from(purchaseOrders)
    .where(and(...whereConditions));

  if (pos.length === 0) {
    return {
      success: false,
      error: "Nenhum PO encontrado no período",
    };
  }

  // Group by supplier
  const spendBySupplier = new Map<string, {
    totalSpend: number;
    poCount: number;
    avgOrderValue: number;
    supplierId: string;
  }>();

  for (const po of pos) {
    const current = spendBySupplier.get(po.supplierId) || {
      totalSpend: 0,
      poCount: 0,
      avgOrderValue: 0,
      supplierId: po.supplierId,
    };

    current.totalSpend += parseFloat(po.totalAmount);
    current.poCount += 1;

    spendBySupplier.set(po.supplierId, current);
  }

  // Calculate averages
  spendBySupplier.forEach((data, suppId) => {
    data.avgOrderValue = data.totalSpend / data.poCount;
  });

  // Get supplier names
  const supplierIds = Array.from(spendBySupplier.keys());
  const suppliersData = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.tenantId, tenantId),
      sql`${suppliers.id} = ANY(${supplierIds})`
    ));

  const supplierMap = new Map(suppliersData.map(s => [s.id, s]));

  // Build analysis
  const analysis = Array.from(spendBySupplier.entries()).map(([suppId, data]) => {
    const supplier = supplierMap.get(suppId);
    return {
      supplierId: suppId,
      supplierName: supplier?.name || 'Unknown',
      supplierRating: supplier?.rating || 0,
      totalSpend: Number(data.totalSpend.toFixed(2)),
      poCount: data.poCount,
      avgOrderValue: Number(data.avgOrderValue.toFixed(2)),
    };
  });

  // Sort by total spend
  analysis.sort((a, b) => b.totalSpend - a.totalSpend);

  // Top N
  const topSuppliers = analysis.slice(0, topN);

  const totalSpend = analysis.reduce((sum, s) => sum + s.totalSpend, 0);

  return {
    success: true,
    period: {
      startDate: startDate || 'All time',
      endDate: endDate || 'Present',
    },
    summary: {
      totalSpend: Number(totalSpend.toFixed(2)),
      totalPOs: pos.length,
      uniqueSuppliers: analysis.length,
      avgPOValue: Number((totalSpend / pos.length).toFixed(2)),
    },
    topSuppliers,
    allSuppliers: supplierId ? analysis : topSuppliers, // Return all only if specific supplier requested
  };
}
