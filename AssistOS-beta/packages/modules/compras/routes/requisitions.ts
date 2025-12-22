/**
 * Compras Module - Purchase Requisitions Routes
 * 
 * Routes for managing purchase requisitions and requisition lines
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, requisitionQuerySchema, priorityEnum } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const requisitionLineSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitOfMeasure: z.string().min(1),
  estimatedUnitPrice: z.number().positive().optional(),
  estimatedTotal: z.number().positive().optional(),
  neededByDate: z.string().datetime().optional(),
  notes: z.string().optional()
});

const createRequisitionSchema = z.object({
  requestDate: z.string().datetime().optional(),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
  source: z.enum(['manual', 'auto_reorder', 'forecast', 'project_need']).default('manual'),
  priority: priorityEnum.default('normal'),
  neededByDate: z.string().datetime().optional(),
  justification: z.string().optional(),
  budgetId: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(requisitionLineSchema).min(1)
});

const updateRequisitionSchema = z.object({
  priority: priorityEnum.optional(),
  neededByDate: z.string().datetime().optional(),
  justification: z.string().optional(),
  budgetId: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(requisitionLineSchema).optional()
});

const approveRequisitionSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().optional(),
  notes: z.string().optional()
});

// ============================================================================
// ROUTES
// ============================================================================

export const requisitionsRoutes: RouteDefinition[] = [
  // ========== PURCHASE REQUISITIONS ==========
  {
    method: 'GET',
    path: '/api/compras/requisitions',
    handler: 'listRequisitions',
    permissions: ['purchasing.read'],
    validation: {
      query: requisitionQuerySchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/requisitions',
    handler: 'createRequisition',
    permissions: ['purchasing.write'],
    validation: {
      body: createRequisitionSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/requisitions/:id',
    handler: 'getRequisition',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/requisitions/:id',
    handler: 'updateRequisition',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateRequisitionSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/requisitions/:id',
    handler: 'deleteRequisition',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/requisitions/:id/approve',
    handler: 'approveRequisition',
    permissions: ['purchasing.approve'],
    validation: {
      params: idParamSchema,
      body: approveRequisitionSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/requisitions/:id/convert-to-po',
    handler: 'convertRequisitionToPO',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        supplierId: z.string().uuid().optional(),
        notes: z.string().optional()
      }).optional()
    }
  }
];
