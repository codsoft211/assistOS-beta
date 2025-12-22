import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryLevels, products } from 'shared/schema';
import { eq, and, sql, or, lt } from 'drizzle-orm';

export class StockAlertTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'stock_alert',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Verifica produtos com stock abaixo do nível mínimo e gera alertas',
    parameters: [
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém (opcional - todos se não fornecido)',
        required: false
      },
      {
        name: 'criticalOnly',
        type: 'boolean',
        description: 'Mostrar apenas alertas críticos (stock = 0)',
        required: false
      }
    ],
    outputSchema: z.object({
      alerts: z.array(z.object({
        productId: z.string(),
        productName: z.string(),
        currentStock: z.number(),
        reorderLevel: z.number(),
        severity: z.enum(['warning', 'critical']),
        warehouseId: z.string()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      warehouseId?: string;
      criticalOnly?: boolean;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [eq(inventoryLevels.tenantId, context.tenantId)];
    
    if (input.warehouseId) {
      conditions.push(eq(inventoryLevels.warehouseId, input.warehouseId));
    }

    const results = await db
      .select({
        productId: inventoryLevels.productId,
        productName: products.name,
        warehouseId: inventoryLevels.warehouseId,
        qtyOnHand: inventoryLevels.qtyOnHand,
        reorderPoint: inventoryLevels.reorderPoint,
        minThreshold: inventoryLevels.minThreshold,
      })
      .from(inventoryLevels)
      .leftJoin(products, eq(inventoryLevels.productId, products.id))
      .where(and(...conditions));

    const alerts = results
      .map(row => {
        const currentStock = parseFloat(row.qtyOnHand);
        const reorderLevel = parseFloat(row.reorderPoint || row.minThreshold || '0');
        
        if (currentStock <= reorderLevel) {
          return {
            productId: row.productId,
            productName: row.productName || 'Produto sem nome',
            currentStock,
            reorderLevel,
            severity: currentStock === 0 ? 'critical' as const : 'warning' as const,
            warehouseId: row.warehouseId
          };
        }
        return null;
      })
      .filter(alert => alert !== null);

    const filtered = input.criticalOnly 
      ? alerts.filter(a => a!.severity === 'critical')
      : alerts;

    const criticalCount = filtered.filter(a => a!.severity === 'critical').length;
    const warningCount = filtered.filter(a => a!.severity === 'warning').length;

    return {
      alerts: filtered as any[],
      total: filtered.length,
      message: `Alertas de stock: ${criticalCount} crítico(s), ${warningCount} aviso(s)${criticalCount > 0 ? `. Ação necessária para ${criticalCount} produto(s) sem stock!` : ''}`
    };
  }
}
