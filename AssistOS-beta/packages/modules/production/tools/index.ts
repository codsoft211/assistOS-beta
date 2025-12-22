/**
 * Production Module - AI Tools
 * 
 * Comprehensive production/manufacturing tools for:
 * - Production order management
 * - Work order management
 * - BOM (Bill of Materials)
 * - Scheduling
 * - Quality control
 */

import { z } from 'zod';
import type { ModuleTool } from '../../base/module.interface';
import { db } from '../../../../apps/api/db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { ProductionQueryBuilder } from '../query-builder';

// ==================== ZOD VALIDATION SCHEMAS ====================

const listProductionOrdersSchema = z.object({
  status: z.enum(['planned', 'scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  productId: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

const createProductionOrderSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.number().positive('Quantity must be positive'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  projectId: z.string().optional(),
  notes: z.string().optional(),
});

const createWorkOrderSchema = z.object({
  productionOrderId: z.string().min(1, 'Production Order ID is required'),
  workCenterId: z.string().optional(),
  operationId: z.string().optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  notes: z.string().optional(),
});

const createBOMSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  name: z.string().min(1, 'BOM name is required'),
  version: z.string().optional(),
  isActive: z.boolean().optional(),
});

const addBOMLineSchema = z.object({
  bomId: z.string().min(1, 'BOM ID is required'),
  componentId: z.string().min(1, 'Component ID is required'),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().optional(),
  notes: z.string().optional(),
});

const scheduleProductionSchema = z.object({
  productionOrderIds: z.array(z.string()).min(1, 'At least one production order required'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  workCenterId: z.string().optional(),
});

export const productionTools: ModuleTool[] = [
  // ==================== PRODUCTION ORDER TOOLS ====================
  
  {
    name: 'list_production_orders',
    description: 'Lists production orders with optional filters',
    parameters: [
      { name: 'status', type: 'string', description: 'Filter by status (planned, scheduled, in_progress, completed, cancelled)', required: false },
      { name: 'priority', type: 'string', description: 'Filter by priority (low, medium, high, urgent)', required: false },
      { name: 'productId', type: 'string', description: 'Filter by product ID', required: false },
      { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 50 },
    ],
    execute: async (params: any, context) => {
      const validation = listProductionOrdersSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { status, priority, productId, limit = 50 } = validation.data;
      
      try {
        const queryBuilder = new ProductionQueryBuilder(context.tenantId);
        let query = queryBuilder.select('production_orders');
        
        const filters: any[] = [];
        if (status) filters.push({ field: 'status', operator: 'eq' as const, value: status });
        if (priority) filters.push({ field: 'priority', operator: 'eq' as const, value: priority });
        if (productId) filters.push({ field: 'product_id', operator: 'eq' as const, value: productId });
        
        if (filters.length > 0) query = query.where(filters);
        
        const orders = await query.orderBy('created_at', 'desc').limit(limit).execute();
        
        return { success: true, productionOrders: orders, total: orders.length };
      } catch (error: any) {
        return { success: false, error: `Error listing production orders: ${error.message}` };
      }
    }
  },
  
  {
    name: 'create_production_order',
    description: 'Creates a new production order',
    parameters: [
      { name: 'productId', type: 'string', description: 'Product to manufacture', required: true },
      { name: 'quantity', type: 'number', description: 'Quantity to produce', required: true },
      { name: 'startDate', type: 'string', description: 'Planned start date (YYYY-MM-DD)', required: false },
      { name: 'endDate', type: 'string', description: 'Planned end date (YYYY-MM-DD)', required: false },
      { name: 'priority', type: 'string', description: 'Priority (low, medium, high, urgent)', required: false },
      { name: 'projectId', type: 'string', description: 'Associated project ID', required: false },
      { name: 'notes', type: 'string', description: 'Additional notes', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = createProductionOrderSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { productId, quantity, startDate, endDate, priority = 'medium', projectId, notes } = validation.data;
      
      try {
        // Generate order number
        const lastOrder = await db.execute(sql.raw(`
          SELECT order_number FROM production_orders 
          WHERE tenant_id = '${context.tenantId}' 
          ORDER BY created_at DESC LIMIT 1
        `));
        
        const lastNumber = lastOrder.rows[0]?.order_number?.match(/\d+$/)?.[0] || '0';
        const orderNumber = `PO-${String(parseInt(lastNumber) + 1).padStart(6, '0')}`;
        
        const result = await db.execute(sql.raw(`
          INSERT INTO production_orders (
            tenant_id, order_number, product_id, quantity, status, priority,
            start_date, end_date, project_id, notes, created_at
          ) VALUES (
            '${context.tenantId}',
            '${orderNumber}',
            '${productId}',
            ${quantity},
            'planned',
            '${priority}',
            ${startDate ? `'${startDate}'` : 'NULL'},
            ${endDate ? `'${endDate}'` : 'NULL'},
            ${projectId ? `'${projectId}'` : 'NULL'},
            ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'},
            NOW()
          ) RETURNING *
        `));
        
        const order = result.rows[0];
        
        return {
          success: true,
          data: {
            productionOrderId: order.id,
            orderNumber: order.order_number,
            status: 'planned',
            message: 'Production order created successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error creating production order: ${error.message}` };
      }
    }
  },
  
  {
    name: 'get_production_order',
    description: 'Gets detailed information about a production order',
    parameters: [
      { name: 'productionOrderId', type: 'string', description: 'Production Order ID', required: true },
    ],
    execute: async (params: any, context) => {
      const { productionOrderId } = params;
      
      if (!productionOrderId) {
        return { success: false, error: 'Production Order ID is required' };
      }
      
      try {
        const queryBuilder = new ProductionQueryBuilder(context.tenantId);
        const orders = await queryBuilder
          .select('production_orders')
          .where([{ field: 'id', operator: 'eq', value: productionOrderId }])
          .execute();
        
        if (orders.length === 0) {
          return { success: false, error: 'Production order not found' };
        }
        
        return { success: true, productionOrder: orders[0] };
      } catch (error: any) {
        return { success: false, error: `Error fetching production order: ${error.message}` };
      }
    }
  },
  
  {
    name: 'start_production_order',
    description: 'Starts a production order (changes status to in_progress)',
    parameters: [
      { name: 'productionOrderId', type: 'string', description: 'Production Order ID', required: true },
    ],
    execute: async (params: any, context) => {
      const { productionOrderId } = params;
      
      if (!productionOrderId) {
        return { success: false, error: 'Production Order ID is required' };
      }
      
      try {
        const result = await db.execute(sql.raw(`
          UPDATE production_orders
          SET status = 'in_progress', 
              actual_start_date = NOW(),
              updated_at = NOW()
          WHERE tenant_id = '${context.tenantId}'
            AND id = '${productionOrderId}'
            AND status IN ('planned', 'scheduled')
          RETURNING *
        `));
        
        if (result.rows.length === 0) {
          return { success: false, error: 'Production order not found or cannot be started' };
        }
        
        return {
          success: true,
          data: {
            productionOrderId,
            status: 'in_progress',
            message: 'Production order started',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error starting production order: ${error.message}` };
      }
    }
  },
  
  {
    name: 'complete_production_order',
    description: 'Completes a production order',
    parameters: [
      { name: 'productionOrderId', type: 'string', description: 'Production Order ID', required: true },
      { name: 'actualQuantity', type: 'number', description: 'Actual quantity produced', required: false },
      { name: 'notes', type: 'string', description: 'Completion notes', required: false },
    ],
    execute: async (params: any, context) => {
      const { productionOrderId, actualQuantity, notes } = params;
      
      if (!productionOrderId) {
        return { success: false, error: 'Production Order ID is required' };
      }
      
      try {
        const result = await db.execute(sql.raw(`
          UPDATE production_orders
          SET status = 'completed', 
              actual_end_date = NOW(),
              ${actualQuantity ? `actual_quantity = ${actualQuantity},` : ''}
              ${notes ? `notes = COALESCE(notes, '') || ' | Completion: ${notes.replace(/'/g, "''")}',` : ''}
              updated_at = NOW()
          WHERE tenant_id = '${context.tenantId}'
            AND id = '${productionOrderId}'
            AND status = 'in_progress'
          RETURNING *
        `));
        
        if (result.rows.length === 0) {
          return { success: false, error: 'Production order not found or cannot be completed' };
        }
        
        return {
          success: true,
          data: {
            productionOrderId,
            status: 'completed',
            message: 'Production order completed',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error completing production order: ${error.message}` };
      }
    }
  },
  
  // ==================== WORK ORDER TOOLS ====================
  
  {
    name: 'list_work_orders',
    description: 'Lists work orders with optional filters',
    parameters: [
      { name: 'productionOrderId', type: 'string', description: 'Filter by production order', required: false },
      { name: 'status', type: 'string', description: 'Filter by status', required: false },
      { name: 'limit', type: 'number', description: 'Maximum results', required: false },
    ],
    execute: async (params: any, context) => {
      const { productionOrderId, status, limit = 50 } = params;
      
      try {
        const queryBuilder = new ProductionQueryBuilder(context.tenantId);
        let query = queryBuilder.select('work_orders');
        
        const filters: any[] = [];
        if (productionOrderId) filters.push({ field: 'production_order_id', operator: 'eq' as const, value: productionOrderId });
        if (status) filters.push({ field: 'status', operator: 'eq' as const, value: status });
        
        if (filters.length > 0) query = query.where(filters);
        
        const workOrders = await query.limit(limit).execute();
        
        return { success: true, workOrders, total: workOrders.length };
      } catch (error: any) {
        return { success: false, error: `Error listing work orders: ${error.message}` };
      }
    }
  },
  
  {
    name: 'create_work_order',
    description: 'Creates a new work order for a production order',
    parameters: [
      { name: 'productionOrderId', type: 'string', description: 'Parent production order ID', required: true },
      { name: 'workCenterId', type: 'string', description: 'Work center ID', required: false },
      { name: 'operationId', type: 'string', description: 'Operation ID', required: false },
      { name: 'scheduledStart', type: 'string', description: 'Scheduled start datetime', required: false },
      { name: 'scheduledEnd', type: 'string', description: 'Scheduled end datetime', required: false },
      { name: 'notes', type: 'string', description: 'Additional notes', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = createWorkOrderSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { productionOrderId, workCenterId, operationId, scheduledStart, scheduledEnd, notes } = validation.data;
      
      try {
        // Generate work order number
        const lastWO = await db.execute(sql.raw(`
          SELECT work_order_number FROM work_orders 
          WHERE tenant_id = '${context.tenantId}' 
          ORDER BY created_at DESC LIMIT 1
        `));
        
        const lastNumber = lastWO.rows[0]?.work_order_number?.match(/\d+$/)?.[0] || '0';
        const workOrderNumber = `WO-${String(parseInt(lastNumber) + 1).padStart(6, '0')}`;
        
        const result = await db.execute(sql.raw(`
          INSERT INTO work_orders (
            tenant_id, work_order_number, production_order_id, work_center_id,
            operation_id, scheduled_start, scheduled_end, status, notes, created_at
          ) VALUES (
            '${context.tenantId}',
            '${workOrderNumber}',
            '${productionOrderId}',
            ${workCenterId ? `'${workCenterId}'` : 'NULL'},
            ${operationId ? `'${operationId}'` : 'NULL'},
            ${scheduledStart ? `'${scheduledStart}'` : 'NULL'},
            ${scheduledEnd ? `'${scheduledEnd}'` : 'NULL'},
            'pending',
            ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'},
            NOW()
          ) RETURNING *
        `));
        
        const workOrder = result.rows[0];
        
        return {
          success: true,
          data: {
            workOrderId: workOrder.id,
            workOrderNumber: workOrder.work_order_number,
            message: 'Work order created successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error creating work order: ${error.message}` };
      }
    }
  },
  
  // ==================== BOM TOOLS ====================
  
  {
    name: 'list_boms',
    description: 'Lists Bill of Materials',
    parameters: [
      { name: 'productId', type: 'string', description: 'Filter by product ID', required: false },
      { name: 'isActive', type: 'boolean', description: 'Filter by active status', required: false },
      { name: 'limit', type: 'number', description: 'Maximum results', required: false },
    ],
    execute: async (params: any, context) => {
      const { productId, isActive, limit = 50 } = params;
      
      try {
        const queryBuilder = new ProductionQueryBuilder(context.tenantId);
        let query = queryBuilder.select('bom');
        
        const filters: any[] = [];
        if (productId) filters.push({ field: 'product_id', operator: 'eq' as const, value: productId });
        if (isActive !== undefined) filters.push({ field: 'is_active', operator: 'eq' as const, value: isActive });
        
        if (filters.length > 0) query = query.where(filters);
        
        const boms = await query.limit(limit).execute();
        
        return { success: true, boms, total: boms.length };
      } catch (error: any) {
        return { success: false, error: `Error listing BOMs: ${error.message}` };
      }
    }
  },
  
  {
    name: 'create_bom',
    description: 'Creates a new Bill of Materials',
    parameters: [
      { name: 'productId', type: 'string', description: 'Product ID', required: true },
      { name: 'name', type: 'string', description: 'BOM name', required: true },
      { name: 'version', type: 'string', description: 'Version number', required: false },
      { name: 'isActive', type: 'boolean', description: 'Whether BOM is active', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = createBOMSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { productId, name, version = '1.0', isActive = true } = validation.data;
      
      try {
        const result = await db.execute(sql.raw(`
          INSERT INTO bill_of_materials (
            tenant_id, product_id, name, version, is_active, created_at
          ) VALUES (
            '${context.tenantId}',
            '${productId}',
            '${name.replace(/'/g, "''")}',
            '${version}',
            ${isActive},
            NOW()
          ) RETURNING *
        `));
        
        const bom = result.rows[0];
        
        return {
          success: true,
          data: {
            bomId: bom.id,
            name: bom.name,
            version: bom.version,
            message: 'BOM created successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error creating BOM: ${error.message}` };
      }
    }
  },
  
  {
    name: 'add_bom_line',
    description: 'Adds a component line to a BOM',
    parameters: [
      { name: 'bomId', type: 'string', description: 'BOM ID', required: true },
      { name: 'componentId', type: 'string', description: 'Component/Material product ID', required: true },
      { name: 'quantity', type: 'number', description: 'Quantity required', required: true },
      { name: 'unit', type: 'string', description: 'Unit of measure', required: false },
      { name: 'notes', type: 'string', description: 'Additional notes', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = addBOMLineSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { bomId, componentId, quantity, unit, notes } = validation.data;
      
      try {
        const result = await db.execute(sql.raw(`
          INSERT INTO bom_lines (
            tenant_id, bom_id, component_id, quantity, unit, notes, created_at
          ) VALUES (
            '${context.tenantId}',
            '${bomId}',
            '${componentId}',
            ${quantity},
            ${unit ? `'${unit}'` : 'NULL'},
            ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'},
            NOW()
          ) RETURNING *
        `));
        
        const line = result.rows[0];
        
        return {
          success: true,
          data: {
            lineId: line.id,
            message: 'BOM line added successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error adding BOM line: ${error.message}` };
      }
    }
  },
  
  // ==================== SCHEDULING TOOLS ====================
  
  {
    name: 'schedule_production',
    description: 'Schedules production orders',
    parameters: [
      { name: 'productionOrderIds', type: 'array', description: 'Production order IDs to schedule', required: true },
      { name: 'startDate', type: 'string', description: 'Schedule start date (YYYY-MM-DD)', required: true },
      { name: 'workCenterId', type: 'string', description: 'Work center ID', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = scheduleProductionSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { productionOrderIds, startDate, workCenterId } = validation.data;
      
      try {
        const scheduled = [];
        
        for (const orderId of productionOrderIds) {
          const result = await db.execute(sql.raw(`
            UPDATE production_orders
            SET status = 'scheduled',
                start_date = '${startDate}',
                ${workCenterId ? `work_center_id = '${workCenterId}',` : ''}
                updated_at = NOW()
            WHERE tenant_id = '${context.tenantId}'
              AND id = '${orderId}'
              AND status = 'planned'
            RETURNING id, order_number
          `));
          
          if (result.rows.length > 0) {
            scheduled.push(result.rows[0]);
          }
        }
        
        return {
          success: true,
          data: {
            scheduledOrders: scheduled,
            count: scheduled.length,
            message: `${scheduled.length} production orders scheduled`,
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error scheduling production: ${error.message}` };
      }
    }
  },
  
  // ==================== ANALYTICS TOOLS ====================
  
  {
    name: 'get_production_summary',
    description: 'Gets production summary statistics',
    parameters: [],
    execute: async (params: any, context) => {
      try {
        const result = await db.execute(sql.raw(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'planned') as planned,
            COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
            COUNT(*) FILTER (WHERE status = 'completed') as completed
          FROM production_orders
          WHERE tenant_id = '${context.tenantId}'
        `));
        
        return {
          success: true,
          data: {
            summary: result.rows[0],
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error getting production summary: ${error.message}` };
      }
    }
  },
];

