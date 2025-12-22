/**
 * LogísticaModule - AI Tools
 * 
 * Comprehensive logistics tools with:
 * - Base inventory management
 * - Project linking (equipment allocations)
 * - Conflict detection
 * - Equipment condition tracking
 * - Advanced features (replenishment, batch picking, maintenance)
 */

import { z } from 'zod';
import type { ModuleTool } from '../../base/module.interface';
import { db } from '../../../../apps/api/db';
import { 
  warehouses,
  warehouseLocations,
  inventoryLevels,
  inventoryBatches,
  stockMoves,
  equipmentAllocations,
  equipmentConditions,
  pickingBatches,
  reorderingRules,
  maintenanceSchedule,
  projects,
  products
} from '../../../../shared/schema';
import { eq, and, gte, lte, desc, sql, or } from 'drizzle-orm';

// ==================== ZOD VALIDATION SCHEMAS ====================

const listWarehousesSchema = z.object({
  type: z.enum(['central', 'rental', 'project', 'virtual']).optional(),
  isActive: z.boolean().optional(),
  availableForProjects: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
});

const createWarehouseSchema = z.object({
  name: z.string().min(1, 'Nome do armazém é obrigatório'),
  type: z.enum(['central', 'rental', 'project', 'virtual']).optional(),
  address: z.string().optional(),
  availableForProjects: z.boolean().optional(),
  linkedProjectId: z.string().uuid('ID do projeto deve ser um UUID válido').optional(),
});

const checkStockLevelsSchema = z.object({
  warehouseId: z.string().optional(),
  productId: z.string().optional(),
  belowMinThreshold: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
});

const createStockMoveSchema = z.object({
  productId: z.string().min(1, 'ID do produto é obrigatório'),
  fromLocationId: z.string().optional(),
  toLocationId: z.string().optional(),
  qty: z.number().positive('Quantidade deve ser maior que zero'),
  notes: z.string().optional(),
});

const checkAvailabilitySchema = z.object({
  productId: z.string().min(1, 'ID do produto é obrigatório'),
  warehouseId: z.string().min(1, 'ID do armazém é obrigatório'),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  qtyNeeded: z.number().positive('Quantidade necessária deve ser maior que zero'),
});

const allocateToProjectSchema = z.object({
  projectId: z.string().min(1, 'ID do projeto é obrigatório'),
  items: z.array(z.object({
    warehouseId: z.string().min(1, 'ID do armazém é obrigatório'),
    productId: z.string().min(1, 'ID do produto é obrigatório'),
    qty: z.number().positive('Quantidade deve ser maior que zero'),
  })).min(1, 'Lista de items não pode estar vazia'),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  notes: z.string().optional(),
});

const detectConflictsSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  warehouseId: z.string().optional(),
});

const checkoutEquipmentSchema = z.object({
  allocationId: z.string().min(1, 'ID da alocação é obrigatório'),
});

const checkinEquipmentSchema = z.object({
  allocationId: z.string().min(1, 'ID da alocação é obrigatório'),
  condition: z.enum(['good', 'fair', 'damaged'], {
    errorMap: () => ({ message: 'Condição deve ser: good, fair ou damaged' }),
  }),
  notes: z.string().optional(),
});

const trackEquipmentConditionSchema = z.object({
  productId: z.string().min(1, 'ID do produto é obrigatório'),
  conditionType: z.enum(['damage', 'repair', 'maintenance'], {
    errorMap: () => ({ message: 'Tipo deve ser: damage, repair ou maintenance' }),
  }),
  conditionStatus: z.enum(['good', 'fair', 'damaged', 'under_repair'], {
    errorMap: () => ({ message: 'Status deve ser: good, fair, damaged ou under_repair' }),
  }),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  description: z.string().optional(),
});

const suggestReplenishmentSchema = z.object({
  warehouseId: z.string().optional(),
});

const createBatchPickingSchema = z.object({
  warehouseId: z.string().min(1, 'ID do armazém é obrigatório'),
  pickingIds: z.array(z.string()).min(1, 'Lista de pickings não pode estar vazia'),
  batchType: z.enum(['single', 'cluster', 'wave']).optional(),
});

const scheduleMaintenanceSchema = z.object({
  productId: z.string().min(1, 'ID do produto é obrigatório'),
  maintenanceType: z.enum(['preventive', 'corrective', 'inspection'], {
    errorMap: () => ({ message: 'Tipo deve ser: preventive, corrective ou inspection' }),
  }),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], {
    errorMap: () => ({ message: 'Frequência deve ser: daily, weekly, monthly, quarterly ou yearly' }),
  }),
  nextMaintenanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  notes: z.string().optional(),
});

export const logisticaTools: ModuleTool[] = [
  // ==================== BASE INVENTORY TOOLS ====================
  
  {
    name: 'list_warehouses',
    description: 'Lista armazéns com filtros opcionais (tipo, ativo, disponível para projetos)',
    parameters: [
      {
        name: 'type',
        type: 'string',
        description: 'Filtrar por tipo de armazém (central, rental, project, virtual)',
        required: false
      },
      {
        name: 'isActive',
        type: 'boolean',
        description: 'Filtrar por armazéns ativos',
        required: false
      },
      {
        name: 'availableForProjects',
        type: 'boolean',
        description: 'Filtrar por disponibilidade para projetos',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const validation = listWarehousesSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { type, isActive, availableForProjects, limit = 50 } = validation.data;
      
      const conditions: any[] = [
        eq(warehouses.tenantId, context.tenantId)
      ];
      
      if (type) {
        conditions.push(eq(warehouses.type, type));
      }
      
      if (isActive !== undefined) {
        conditions.push(eq(warehouses.isActive, isActive));
      }
      
      if (availableForProjects !== undefined) {
        conditions.push(eq(warehouses.availableForProjects, availableForProjects));
      }
      
      const warehousesList = await db
        .select()
        .from(warehouses)
        .where(and(...conditions))
        .limit(limit);
      
      return { warehouses: warehousesList, total: warehousesList.length };
    }
  },
  
  {
    name: 'create_warehouse',
    description: 'Cria novo armazém com configurações opcionais de project linking',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Nome do armazém',
        required: true
      },
      {
        name: 'type',
        type: 'string',
        description: 'Tipo (central, rental, project, virtual)',
        required: false,
        default: 'central'
      },
      {
        name: 'address',
        type: 'string',
        description: 'Morada',
        required: false
      },
      {
        name: 'availableForProjects',
        type: 'boolean',
        description: 'Disponível para alocação a projetos',
        required: false,
        default: false
      },
      {
        name: 'linkedProjectId',
        type: 'string',
        description: 'ID do projeto linkado (se tipo=project)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const validation = createWarehouseSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { name, type = 'central', address, availableForProjects = false, linkedProjectId } = validation.data;
      
      // If linkedProjectId provided, validate it belongs to tenant
      if (linkedProjectId) {
        const projectResult = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(
            eq(projects.id, linkedProjectId),
            eq(projects.tenantId, context.tenantId)
          ))
          .limit(1);
        
        if (!projectResult || projectResult.length === 0) {
          return {
            success: false,
            error: `Projeto '${linkedProjectId}' não encontrado ou não pertence ao seu tenant.`,
          };
        }
      }
      
      try {
        const warehouseResult = await db
          .insert(warehouses)
          .values({
            tenantId: context.tenantId,
            name,
            type,
            address: address || null,
            availableForProjects,
            linkedProjectId: linkedProjectId || null,
            isActive: true,
          })
          .returning();
        
        const warehouse = Array.isArray(warehouseResult) ? warehouseResult[0] : warehouseResult;
        
        return {
          success: true,
          data: {
            warehouseId: warehouse.id,
            name: warehouse.name,
            type: warehouse.type,
            message: 'Armazém criado com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[create_warehouse] Database error:', error);
        return {
          success: false,
          error: `Erro ao criar armazém: ${error.message || error}`,
        };
      }
    }
  },
  
  {
    name: 'check_stock_levels',
    description: 'Verifica níveis de stock por armazém e produto',
    parameters: [
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém (opcional)',
        required: false
      },
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto (opcional)',
        required: false
      },
      {
        name: 'belowMinThreshold',
        type: 'boolean',
        description: 'Apenas produtos abaixo do threshold mínimo',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const validation = checkStockLevelsSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { warehouseId, productId, belowMinThreshold, limit = 50 } = validation.data;
      
      const conditions: any[] = [
        eq(inventoryLevels.tenantId, context.tenantId)
      ];
      
      if (warehouseId) {
        // SECURITY: Validate warehouse belongs to tenant
        const warehouseResult = await db
          .select({ id: warehouses.id })
          .from(warehouses)
          .where(and(
            eq(warehouses.id, warehouseId),
            eq(warehouses.tenantId, context.tenantId)
          ))
          .limit(1);
        
        if (!warehouseResult || warehouseResult.length === 0) {
          return {
            success: false,
            error: `Armazém '${warehouseId}' não encontrado ou não pertence ao seu tenant.`,
          };
        }
        
        conditions.push(eq(inventoryLevels.warehouseId, warehouseId));
      }
      
      if (productId) {
        // SECURITY: Validate product belongs to tenant
        const productResult = await db
          .select({ id: products.id })
          .from(products)
          .where(and(
            eq(products.id, productId),
            eq(products.tenantId, context.tenantId)
          ))
          .limit(1);
        
        if (!productResult || productResult.length === 0) {
          return {
            success: false,
            error: `Produto '${productId}' não encontrado ou não pertence ao seu tenant.`,
          };
        }
        
        conditions.push(eq(inventoryLevels.productId, productId));
      }
      
      if (belowMinThreshold) {
        conditions.push(sql`${inventoryLevels.qtyOnHand} < ${inventoryLevels.minThreshold}`);
      }
      
      const levels = await db
        .select()
        .from(inventoryLevels)
        .where(and(...conditions))
        .limit(limit);
      
      return { stockLevels: levels, total: levels.length };
    }
  },
  
  {
    name: 'create_stock_move',
    description: 'Cria movimento de stock entre localizações',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto',
        required: true
      },
      {
        name: 'fromLocationId',
        type: 'string',
        description: 'ID da localização origem',
        required: false
      },
      {
        name: 'toLocationId',
        type: 'string',
        description: 'ID da localização destino',
        required: false
      },
      {
        name: 'qty',
        type: 'number',
        description: 'Quantidade a movimentar',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas adicionais',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const validation = createStockMoveSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { productId, fromLocationId, toLocationId, qty, notes } = validation.data;
      
      // SECURITY: Validate product belongs to tenant
      const productResult = await db
        .select({ id: products.id })
        .from(products)
        .where(and(
          eq(products.id, productId),
          eq(products.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!productResult || productResult.length === 0) {
        return {
          success: false,
          error: `Produto '${productId}' não encontrado ou não pertence ao seu tenant.`,
        };
      }
      
      try {
        const moveResult = await db
          .insert(stockMoves)
          .values({
            tenantId: context.tenantId,
            productId,
            fromLocationId: fromLocationId || null,
            toLocationId: toLocationId || null,
            qty: qty as any,
            state: 'draft',
            notes: notes || null,
          })
          .returning();
        
        const move = Array.isArray(moveResult) ? moveResult[0] : moveResult;
        
        return {
          success: true,
          data: {
            moveId: move.id,
            productId: move.productId,
            qty: move.qty,
            state: move.state,
            message: 'Movimento de stock criado com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[create_stock_move] Database error:', error);
        return {
          success: false,
          error: `Erro ao criar movimento: ${error.message || error}`,
        };
      }
    }
  },
  
  // ==================== PROJECT LINKING TOOLS ====================
  
  {
    name: 'check_availability',
    description: 'Verifica disponibilidade de equipamento para período específico',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto/equipamento',
        required: true
      },
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém',
        required: true
      },
      {
        name: 'fromDate',
        type: 'string',
        description: 'Data início (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'toDate',
        type: 'string',
        description: 'Data fim (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'qtyNeeded',
        type: 'number',
        description: 'Quantidade necessária',
        required: true
      }
    ],
    execute: async (params: any, context) => {
      const validation = checkAvailabilitySchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { productId, warehouseId, fromDate, toDate, qtyNeeded } = validation.data;
      
      // SECURITY: Validate warehouse and product belong to tenant
      const warehouseResult = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(and(
          eq(warehouses.id, warehouseId),
          eq(warehouses.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!warehouseResult || warehouseResult.length === 0) {
        return {
          success: false,
          error: `Armazém não encontrado ou não pertence ao seu tenant.`,
        };
      }
      
      const productResult = await db
        .select({ id: products.id })
        .from(products)
        .where(and(
          eq(products.id, productId),
          eq(products.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!productResult || productResult.length === 0) {
        return {
          success: false,
          error: `Produto não encontrado ou não pertence ao seu tenant.`,
        };
      }
      
      // Get current stock level
      const stockLevel = await db
        .select()
        .from(inventoryLevels)
        .where(and(
          eq(inventoryLevels.tenantId, context.tenantId),
          eq(inventoryLevels.warehouseId, warehouseId),
          eq(inventoryLevels.productId, productId)
        ))
        .limit(1);
      
      if (!stockLevel || stockLevel.length === 0) {
        return {
          success: true,
          data: {
            available: false,
            reason: 'Produto não encontrado neste armazém',
            currentStock: 0,
            qtyNeeded,
          },
        };
      }
      
      const currentQty = Number(stockLevel[0].qtyOnHand);
      
      // Check for overlapping allocations in the period
      const overlappingAllocations = await db
        .select()
        .from(equipmentAllocations)
        .where(and(
          eq(equipmentAllocations.tenantId, context.tenantId),
          eq(equipmentAllocations.warehouseId, warehouseId),
          eq(equipmentAllocations.productId, productId),
          or(
            and(
              lte(equipmentAllocations.fromDate, new Date(toDate)),
              gte(equipmentAllocations.toDate, new Date(fromDate))
            )
          )
        ));
      
      const allocatedQty = overlappingAllocations.reduce((sum, alloc) => sum + Number(alloc.qtyAllocated), 0);
      const availableQty = currentQty - allocatedQty;
      
      return {
        success: true,
        data: {
          available: availableQty >= qtyNeeded,
          currentStock: currentQty,
          allocated: allocatedQty,
          availableQty,
          qtyNeeded,
          conflicts: overlappingAllocations.length,
        },
      };
    }
  },
  
  {
    name: 'allocate_to_project',
    description: 'Aloca equipamento a um projeto para período específico',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'ID do projeto',
        required: true
      },
      {
        name: 'items',
        type: 'array',
        description: 'Items a alocar (warehouseId, productId, qty)',
        required: true
      },
      {
        name: 'fromDate',
        type: 'string',
        description: 'Data início (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'toDate',
        type: 'string',
        description: 'Data fim (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas adicionais',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const validation = allocateToProjectSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { projectId, items, fromDate, toDate, notes } = validation.data;
      
      // SECURITY: Validate project belongs to tenant
      const projectResult = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.id, projectId),
          eq(projects.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!projectResult || projectResult.length === 0) {
        return {
          success: false,
          error: `Projeto não encontrado ou não pertence ao seu tenant.`,
        };
      }
      
      const allocations = [];
      
      try {
        for (const item of items) {
          if (!item.warehouseId || !item.productId || !item.qty) {
            return {
              success: false,
              error: 'Cada item deve ter warehouseId, productId e qty.',
            };
          }
          
          // SECURITY: Validate warehouse belongs to tenant
          const warehouseResult = await db
            .select({ id: warehouses.id })
            .from(warehouses)
            .where(and(
              eq(warehouses.id, item.warehouseId),
              eq(warehouses.tenantId, context.tenantId)
            ))
            .limit(1);
          
          if (!warehouseResult || warehouseResult.length === 0) {
            return {
              success: false,
              error: `Armazém '${item.warehouseId}' não encontrado.`,
            };
          }
          
          // Create allocation
          const allocationResult = await db
            .insert(equipmentAllocations)
            .values({
              tenantId: context.tenantId,
              projectId,
              warehouseId: item.warehouseId,
              productId: item.productId,
              qtyAllocated: item.qty as any,
              fromDate: new Date(fromDate),
              toDate: new Date(toDate),
              status: 'reserved',
              notes: notes || null,
            })
            .returning();
          
          const allocation = Array.isArray(allocationResult) ? allocationResult[0] : allocationResult;
          allocations.push(allocation);
        }
        
        return {
          success: true,
          data: {
            allocations,
            message: `${allocations.length} alocação(ões) criada(s) com sucesso`,
          },
        };
      } catch (error: any) {
        console.error('[allocate_to_project] Database error:', error);
        return {
          success: false,
          error: `Erro ao alocar equipamento: ${error.message || error}`,
        };
      }
    }
  },
  
  {
    name: 'detect_conflicts',
    description: 'Deteta conflitos de alocação (overbooking) para período',
    parameters: [
      {
        name: 'fromDate',
        type: 'string',
        description: 'Data início (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'toDate',
        type: 'string',
        description: 'Data fim (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém (opcional)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const validation = detectConflictsSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { fromDate, toDate, warehouseId } = validation.data;
      
      const conditions: any[] = [
        eq(equipmentAllocations.tenantId, context.tenantId),
        or(
          and(
            lte(equipmentAllocations.fromDate, new Date(toDate)),
            gte(equipmentAllocations.toDate, new Date(fromDate))
          )
        )
      ];
      
      if (warehouseId) {
        conditions.push(eq(equipmentAllocations.warehouseId, warehouseId));
      }
      
      const allocations = await db
        .select()
        .from(equipmentAllocations)
        .where(and(...conditions));
      
      // Group by warehouse + product
      const grouped = allocations.reduce((acc: any, alloc) => {
        const key = `${alloc.warehouseId}_${alloc.productId}`;
        if (!acc[key]) {
          acc[key] = {
            warehouseId: alloc.warehouseId,
            productId: alloc.productId,
            allocations: [],
            totalAllocated: 0,
          };
        }
        acc[key].allocations.push(alloc);
        acc[key].totalAllocated += Number(alloc.qtyAllocated);
        return acc;
      }, {});
      
      // Check each group for conflicts
      const conflicts = [];
      for (const key in grouped) {
        const group = grouped[key];
        
        // Get current stock
        const stockLevel = await db
          .select()
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, context.tenantId),
            eq(inventoryLevels.warehouseId, group.warehouseId),
            eq(inventoryLevels.productId, group.productId)
          ))
          .limit(1);
        
        const available = stockLevel.length > 0 ? Number(stockLevel[0].qtyOnHand) : 0;
        
        if (group.totalAllocated > available) {
          conflicts.push({
            warehouseId: group.warehouseId,
            productId: group.productId,
            available,
            allocated: group.totalAllocated,
            overbooking: group.totalAllocated - available,
            affectedAllocations: group.allocations.length,
          });
        }
      }
      
      return {
        success: true,
        data: {
          conflicts,
          totalConflicts: conflicts.length,
        },
      };
    }
  },
  
  // ==================== EQUIPMENT MANAGEMENT TOOLS ====================
  
  {
    name: 'checkout_equipment',
    description: 'Faz check-out de equipamento alocado a projeto',
    parameters: [
      {
        name: 'allocationId',
        type: 'string',
        description: 'ID da alocação',
        required: true
      }
    ],
    execute: async (params: any, context) => {
      const validation = checkoutEquipmentSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { allocationId } = validation.data;
      
      // SECURITY: Validate allocation belongs to tenant
      const allocation = await db
        .select()
        .from(equipmentAllocations)
        .where(and(
          eq(equipmentAllocations.id, allocationId),
          eq(equipmentAllocations.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!allocation || allocation.length === 0) {
        return {
          success: false,
          error: 'Alocação não encontrada ou não pertence ao seu tenant.',
        };
      }
      
      if (allocation[0].status !== 'reserved') {
        return {
          success: false,
          error: `Alocação não pode ser checked-out. Status atual: ${allocation[0].status}`,
        };
      }
      
      try {
        await db
          .update(equipmentAllocations)
          .set({
            status: 'checked_out',
            checkedOutBy: context.userId || null,
            checkedOutAt: new Date(),
          })
          .where(eq(equipmentAllocations.id, allocationId));
        
        return {
          success: true,
          data: {
            allocationId,
            status: 'checked_out',
            message: 'Check-out realizado com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[checkout_equipment] Database error:', error);
        return {
          success: false,
          error: `Erro ao fazer check-out: ${error.message || error}`,
        };
      }
    }
  },
  
  {
    name: 'checkin_equipment',
    description: 'Faz check-in de equipamento com tracking de condição',
    parameters: [
      {
        name: 'allocationId',
        type: 'string',
        description: 'ID da alocação',
        required: true
      },
      {
        name: 'condition',
        type: 'string',
        description: 'Condição do equipamento (good, fair, damaged)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas sobre a condição',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const validation = checkinEquipmentSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { allocationId, condition, notes } = validation.data;
      
      // SECURITY: Validate allocation belongs to tenant
      const allocation = await db
        .select()
        .from(equipmentAllocations)
        .where(and(
          eq(equipmentAllocations.id, allocationId),
          eq(equipmentAllocations.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!allocation || allocation.length === 0) {
        return {
          success: false,
          error: 'Alocação não encontrada ou não pertence ao seu tenant.',
        };
      }
      
      if (allocation[0].status !== 'checked_out') {
        return {
          success: false,
          error: `Alocação não pode ser checked-in. Status atual: ${allocation[0].status}`,
        };
      }
      
      try {
        // Update allocation status
        await db
          .update(equipmentAllocations)
          .set({
            status: 'completed',
            checkedInBy: context.userId || null,
            checkedInAt: new Date(),
          })
          .where(eq(equipmentAllocations.id, allocationId));
        
        // Create condition record if not 'good'
        if (condition !== 'good') {
          await db
            .insert(equipmentConditions)
            .values({
              tenantId: context.tenantId,
              allocationId,
              productId: allocation[0].productId,
              conditionType: 'checkin',
              conditionStatus: condition,
              severity: condition === 'damaged' ? 'high' : 'low',
              description: notes || null,
              reportedBy: context.userId || '',
            });
        }
        
        return {
          success: true,
          data: {
            allocationId,
            status: 'completed',
            condition,
            message: 'Check-in realizado com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[checkin_equipment] Database error:', error);
        return {
          success: false,
          error: `Erro ao fazer check-in: ${error.message || error}`,
        };
      }
    }
  },
  
  {
    name: 'track_equipment_condition',
    description: 'Regista condição de equipamento (danos, reparações)',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto/equipamento',
        required: true
      },
      {
        name: 'conditionType',
        type: 'string',
        description: 'Tipo (damage, repair, maintenance)',
        required: true
      },
      {
        name: 'conditionStatus',
        type: 'string',
        description: 'Status (good, fair, damaged, under_repair)',
        required: true
      },
      {
        name: 'severity',
        type: 'string',
        description: 'Severidade (low, medium, high)',
        required: false,
        default: 'low'
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição da condição',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const validation = trackEquipmentConditionSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { productId, conditionType, conditionStatus, severity = 'low', description } = validation.data;
      
      // SECURITY: Validate product belongs to tenant
      const productResult = await db
        .select({ id: products.id })
        .from(products)
        .where(and(
          eq(products.id, productId),
          eq(products.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!productResult || productResult.length === 0) {
        return {
          success: false,
          error: 'Produto não encontrado ou não pertence ao seu tenant.',
        };
      }
      
      try {
        const conditionResult = await db
          .insert(equipmentConditions)
          .values({
            tenantId: context.tenantId,
            productId,
            conditionType,
            conditionStatus,
            severity,
            description: description || null,
            reportedBy: context.userId || '',
          })
          .returning();
        
        const conditionRecord = Array.isArray(conditionResult) ? conditionResult[0] : conditionResult;
        
        return {
          success: true,
          data: {
            conditionId: conditionRecord.id,
            productId,
            conditionStatus,
            message: 'Condição registada com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[track_equipment_condition] Database error:', error);
        return {
          success: false,
          error: `Erro ao registar condição: ${error.message || error}`,
        };
      }
    }
  },
  
  // ==================== ADVANCED TOOLS ====================
  
  {
    name: 'suggest_replenishment',
    description: 'Sugere reposição de stock baseado em níveis mínimos e regras',
    parameters: [
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém (opcional)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const validation = suggestReplenishmentSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { warehouseId } = validation.data;
      
      const conditions: any[] = [
        eq(inventoryLevels.tenantId, context.tenantId),
        sql`${inventoryLevels.qtyOnHand} < ${inventoryLevels.reorderPoint}`,
      ];
      
      if (warehouseId) {
        conditions.push(eq(inventoryLevels.warehouseId, warehouseId));
      }
      
      const lowStock = await db
        .select()
        .from(inventoryLevels)
        .where(and(...conditions));
      
      const suggestions = lowStock.map((item) => ({
        warehouseId: item.warehouseId,
        productId: item.productId,
        currentQty: Number(item.qtyOnHand),
        reorderPoint: Number(item.reorderPoint),
        suggestedQty: Number(item.minThreshold) - Number(item.qtyOnHand),
      }));
      
      return {
        success: true,
        data: {
          suggestions,
          total: suggestions.length,
        },
      };
    }
  },
  
  {
    name: 'create_batch_picking',
    description: 'Cria batch de picking para otimizar recolha',
    parameters: [
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém',
        required: true
      },
      {
        name: 'pickingIds',
        type: 'array',
        description: 'IDs dos pickings a agrupar',
        required: true
      },
      {
        name: 'batchType',
        type: 'string',
        description: 'Tipo de batch (single, cluster, wave)',
        required: false,
        default: 'single'
      }
    ],
    execute: async (params: any, context) => {
      const validation = createBatchPickingSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { warehouseId, pickingIds, batchType = 'single' } = validation.data;
      
      // SECURITY: Validate warehouse belongs to tenant
      const warehouseResult = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(and(
          eq(warehouses.id, warehouseId),
          eq(warehouses.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!warehouseResult || warehouseResult.length === 0) {
        return {
          success: false,
          error: 'Armazém não encontrado ou não pertence ao seu tenant.',
        };
      }
      
      try {
        // Generate batch number
        const lastBatch = await db
          .select({ batchNumber: pickingBatches.batchNumber })
          .from(pickingBatches)
          .where(eq(pickingBatches.tenantId, context.tenantId))
          .orderBy(desc(pickingBatches.createdAt))
          .limit(1);
        
        const lastNumber = lastBatch[0]?.batchNumber?.match(/\d+$/)?.[0] || '0';
        const batchNumber = `BATCH-${String(parseInt(lastNumber) + 1).padStart(6, '0')}`;
        
        const batchResult = await db
          .insert(pickingBatches)
          .values({
            tenantId: context.tenantId,
            batchNumber,
            warehouseId,
            batchType,
            pickingIds,
            status: 'draft',
          })
          .returning();
        
        const batch = Array.isArray(batchResult) ? batchResult[0] : batchResult;
        
        return {
          success: true,
          data: {
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            pickingCount: pickingIds.length,
            message: 'Batch de picking criado com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[create_batch_picking] Database error:', error);
        return {
          success: false,
          error: `Erro ao criar batch: ${error.message || error}`,
        };
      }
    }
  },
  
  {
    name: 'schedule_maintenance',
    description: 'Agenda manutenção preventiva de equipamento',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto/equipamento',
        required: true
      },
      {
        name: 'maintenanceType',
        type: 'string',
        description: 'Tipo (preventive, corrective, inspection)',
        required: true
      },
      {
        name: 'frequency',
        type: 'string',
        description: 'Frequência (daily, weekly, monthly, quarterly, yearly)',
        required: true
      },
      {
        name: 'nextMaintenanceDate',
        type: 'string',
        description: 'Próxima data de manutenção (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas adicionais',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const validation = scheduleMaintenanceSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validação falhou: ${validation.error.message}`,
        };
      }
      
      const { productId, maintenanceType, frequency, nextMaintenanceDate, notes } = validation.data;
      
      // SECURITY: Validate product belongs to tenant
      const productResult = await db
        .select({ id: products.id })
        .from(products)
        .where(and(
          eq(products.id, productId),
          eq(products.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!productResult || productResult.length === 0) {
        return {
          success: false,
          error: 'Produto não encontrado ou não pertence ao seu tenant.',
        };
      }
      
      try {
        const scheduleResult = await db
          .insert(maintenanceSchedule)
          .values({
            tenantId: context.tenantId,
            productId,
            maintenanceType,
            frequency,
            nextMaintenanceDate: new Date(nextMaintenanceDate),
            status: 'scheduled',
            notes: notes || null,
          })
          .returning();
        
        const schedule = Array.isArray(scheduleResult) ? scheduleResult[0] : scheduleResult;
        
        return {
          success: true,
          data: {
            scheduleId: schedule.id,
            productId,
            nextMaintenanceDate: schedule.nextMaintenanceDate,
            message: 'Manutenção agendada com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[schedule_maintenance] Database error:', error);
        return {
          success: false,
          error: `Erro ao agendar manutenção: ${error.message || error}`,
        };
      }
    }
  },
  
  // ==================== ADDITIONAL ASSISTME TOOLS ====================
  
  {
    name: 'transfer_stock_between_warehouses',
    description: 'Transfere stock de um armazém para outro (warehouse-to-warehouse transfer)',
    parameters: [
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto a transferir',
        required: true
      },
      {
        name: 'fromWarehouseId',
        type: 'string',
        description: 'ID do armazém origem',
        required: true
      },
      {
        name: 'toWarehouseId',
        type: 'string',
        description: 'ID do armazém destino',
        required: true
      },
      {
        name: 'quantity',
        type: 'number',
        description: 'Quantidade a transferir',
        required: true
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Razão da transferência',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { productId, fromWarehouseId, toWarehouseId, quantity, reason } = params;
      
      if (!productId || !fromWarehouseId || !toWarehouseId || !quantity) {
        return {
          success: false,
          error: 'productId, fromWarehouseId, toWarehouseId e quantity são obrigatórios',
        };
      }
      
      if (quantity <= 0) {
        return {
          success: false,
          error: 'Quantidade deve ser maior que zero',
        };
      }
      
      if (fromWarehouseId === toWarehouseId) {
        return {
          success: false,
          error: 'Armazém origem e destino não podem ser iguais',
        };
      }
      
      try {
        // Validate warehouses belong to tenant
        const warehousesCheck = await db
          .select()
          .from(warehouses)
          .where(and(
            eq(warehouses.tenantId, context.tenantId),
            or(
              eq(warehouses.id, fromWarehouseId),
              eq(warehouses.id, toWarehouseId)
            )
          ));
        
        if (warehousesCheck.length !== 2) {
          return {
            success: false,
            error: 'Um ou ambos os armazéns não encontrados ou não pertencem ao tenant',
          };
        }
        
        // Validate product belongs to tenant
        const productCheck = await db
          .select()
          .from(products)
          .where(and(
            eq(products.id, productId),
            eq(products.tenantId, context.tenantId)
          ))
          .limit(1);
        
        if (productCheck.length === 0) {
          return {
            success: false,
            error: 'Produto não encontrado ou não pertence ao tenant',
          };
        }
        
        // Check source warehouse has enough stock
        const sourceLevels = await db
          .select()
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, context.tenantId),
            eq(inventoryLevels.warehouseId, fromWarehouseId),
            eq(inventoryLevels.productId, productId)
          ))
          .limit(1);
        
        if (sourceLevels.length === 0 || Number(sourceLevels[0].qtyOnHand) < quantity) {
          return {
            success: false,
            error: `Stock insuficiente no armazém origem (disponível: ${sourceLevels[0]?.qtyOnHand || 0})`,
          };
        }
        
        const { inventoryTransactions } = await import('../../../../shared/schema');
        
        // Decrease source warehouse
        await db
          .update(inventoryLevels)
          .set({
            qtyOnHand: sql`${inventoryLevels.qtyOnHand} - ${quantity}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(inventoryLevels.tenantId, context.tenantId),
            eq(inventoryLevels.warehouseId, fromWarehouseId),
            eq(inventoryLevels.productId, productId)
          ));
        
        // Increase destination warehouse (or create if doesn't exist)
        const destLevels = await db
          .select()
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, context.tenantId),
            eq(inventoryLevels.warehouseId, toWarehouseId),
            eq(inventoryLevels.productId, productId)
          ))
          .limit(1);
        
        if (destLevels.length > 0) {
          await db
            .update(inventoryLevels)
            .set({
              qtyOnHand: sql`${inventoryLevels.qtyOnHand} + ${quantity}`,
              updatedAt: new Date(),
            })
            .where(and(
              eq(inventoryLevels.tenantId, context.tenantId),
              eq(inventoryLevels.warehouseId, toWarehouseId),
              eq(inventoryLevels.productId, productId)
            ));
        } else {
          await db
            .insert(inventoryLevels)
            .values({
              tenantId: context.tenantId,
              warehouseId: toWarehouseId,
              productId,
              qtyOnHand: quantity.toString(),
              qtyReserved: "0",
            });
        }
        
        // Audit trail
        await db.insert(inventoryTransactions).values({
          tenantId: context.tenantId,
          type: 'transfer',
          productId,
          quantity: quantity.toString(),
          notes: reason || null,
          metadata: {
            source: 'assistme',
            userId: context.userId,
            fromWarehouseId,
            toWarehouseId,
          },
        });
        
        return {
          success: true,
          data: {
            productId,
            fromWarehouseId,
            toWarehouseId,
            quantity,
            message: `${quantity} unidades transferidas com sucesso`,
          },
        };
      } catch (error: any) {
        console.error('[transfer_stock_between_warehouses] Error:', error);
        return {
          success: false,
          error: `Erro ao transferir stock: ${error.message || error}`,
        };
      }
    }
  },
  
  {
    name: 'adjust_inventory',
    description: 'Ajusta manualmente nível de stock (correções, inventário físico). Requer razão obrigatória para auditoria.',
    parameters: [
      {
        name: 'warehouseId',
        type: 'string',
        description: 'ID do armazém',
        required: true
      },
      {
        name: 'productId',
        type: 'string',
        description: 'ID do produto',
        required: true
      },
      {
        name: 'newQuantity',
        type: 'number',
        description: 'Nova quantidade (absolute value, não delta)',
        required: true
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Razão do ajuste (OBRIGATÓRIO para auditoria)',
        required: true
      }
    ],
    execute: async (params: any, context) => {
      const { warehouseId, productId, newQuantity, reason } = params;
      
      if (!warehouseId || !productId || newQuantity === undefined || !reason) {
        return {
          success: false,
          error: 'warehouseId, productId, newQuantity e reason são obrigatórios',
        };
      }
      
      if (newQuantity < 0) {
        return {
          success: false,
          error: 'Quantidade não pode ser negativa',
        };
      }
      
      if (!reason || reason.trim().length < 5) {
        return {
          success: false,
          error: 'Razão deve ter pelo menos 5 caracteres (obrigatório para auditoria)',
        };
      }
      
      try {
        // Validate warehouse and product belong to tenant
        const warehouseCheck = await db
          .select()
          .from(warehouses)
          .where(and(
            eq(warehouses.id, warehouseId),
            eq(warehouses.tenantId, context.tenantId)
          ))
          .limit(1);
        
        if (warehouseCheck.length === 0) {
          return {
            success: false,
            error: 'Armazém não encontrado ou não pertence ao tenant',
          };
        }
        
        const productCheck = await db
          .select()
          .from(products)
          .where(and(
            eq(products.id, productId),
            eq(products.tenantId, context.tenantId)
          ))
          .limit(1);
        
        if (productCheck.length === 0) {
          return {
            success: false,
            error: 'Produto não encontrado ou não pertence ao tenant',
          };
        }
        
        // Get current level
        const currentLevels = await db
          .select()
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, context.tenantId),
            eq(inventoryLevels.warehouseId, warehouseId),
            eq(inventoryLevels.productId, productId)
          ))
          .limit(1);
        
        const oldQuantity = currentLevels.length > 0 ? Number(currentLevels[0].qtyOnHand) : 0;
        const delta = newQuantity - oldQuantity;
        
        const { inventoryTransactions } = await import('../../../../shared/schema');
        
        // Update or insert inventory level
        if (currentLevels.length > 0) {
          await db
            .update(inventoryLevels)
            .set({
              qtyOnHand: newQuantity.toString(),
              updatedAt: new Date(),
            })
            .where(and(
              eq(inventoryLevels.tenantId, context.tenantId),
              eq(inventoryLevels.warehouseId, warehouseId),
              eq(inventoryLevels.productId, productId)
            ));
        } else {
          await db
            .insert(inventoryLevels)
            .values({
              tenantId: context.tenantId,
              warehouseId,
              productId,
              qtyOnHand: newQuantity.toString(),
              qtyReserved: "0",
            });
        }
        
        // Audit trail
        await db.insert(inventoryTransactions).values({
          tenantId: context.tenantId,
          type: 'adjustment',
          productId,
          quantity: delta.toString(),
          notes: reason,
          metadata: {
            source: 'assistme',
            userId: context.userId,
            warehouseId,
            oldQuantity,
            newQuantity,
          },
        });
        
        return {
          success: true,
          data: {
            productId,
            warehouseId,
            oldQuantity,
            newQuantity,
            delta,
            reason,
            message: `Stock ajustado: ${oldQuantity} → ${newQuantity} (${delta >= 0 ? '+' : ''}${delta})`,
          },
        };
      } catch (error: any) {
        console.error('[adjust_inventory] Error:', error);
        return {
          success: false,
          error: `Erro ao ajustar inventário: ${error.message || error}`,
        };
      }
    }
  },
];
