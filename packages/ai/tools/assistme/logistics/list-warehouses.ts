import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { warehouses, inventoryLevels } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class ListWarehousesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_warehouses',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Lista todos os armazéns da empresa',
    parameters: [
      {
        name: 'active',
        type: 'boolean',
        description: 'Mostrar apenas armazéns ativos',
        required: false,
        default: true
      }
    ],
    outputSchema: z.object({
      warehouses: z.array(z.object({
        id: z.string(),
        name: z.string(),
        location: z.string(),
        type: z.string(),
        capacity: z.number(),
        utilization: z.number(),
        status: z.string()
      })),
      total: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      active?: boolean;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [eq(warehouses.tenantId, context.tenantId)];
    
    if (input.active !== false) {
      conditions.push(eq(warehouses.isActive, true));
    }

    const results = await db.select().from(warehouses)
      .where(and(...conditions));

    const warehousesWithUtilization = await Promise.all(
      results.map(async (wh) => {
        // Calculate utilization based on inventory levels
        const inventory = await db.select({
          totalQty: sql<number>`SUM(CAST(${inventoryLevels.qtyOnHand} AS NUMERIC))`
        })
        .from(inventoryLevels)
        .where(and(
          eq(inventoryLevels.tenantId, context.tenantId),
          eq(inventoryLevels.warehouseId, wh.id)
        ));

        const totalQty = inventory[0]?.totalQty || 0;
        const capacity = parseFloat(wh.capacity || '0');
        const utilization = capacity > 0 ? Math.round((totalQty / capacity) * 100) : 0;

        return {
          id: wh.id,
          name: wh.name,
          location: wh.city || wh.address || 'Não especificado',
          type: wh.type,
          capacity: capacity,
          utilization,
          status: wh.isActive ? 'active' : 'inactive'
        };
      })
    );

    return {
      warehouses: warehousesWithUtilization,
      total: warehousesWithUtilization.length,
      message: `Encontrados ${warehousesWithUtilization.length} armazém(s)${input.active !== false ? ' ativo(s)' : ''}`
    };
  }
}
