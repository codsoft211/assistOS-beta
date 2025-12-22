/**
 * Compras Module - Purchase Returns Routes
 * 
 * Routes for managing purchase returns and return lines
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, listQuerySchema, returnStatusEnum } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const returnLineSchema = z.object({
  receiptLineId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  description: z.string().min(1),
  quantityReturned: z.number().positive(),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
  reason: z.enum(['defective', 'damaged', 'wrong_item', 'excess_quantity', 'other']),
  defectDescription: z.string().optional(),
  restockable: z.boolean().default(false),
  notes: z.string().optional()
});

const createReturnSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  receiptId: z.string().uuid().optional(),
  returnDate: z.string().datetime(),
  returnType: z.enum(['full', 'partial']),
  reason: z.string().min(1),
  requestedAction: z.enum(['refund', 'replacement', 'credit_note']),
  pickupRequired: z.boolean().default(false),
  pickupDate: z.string().datetime().optional(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(returnLineSchema).min(1)
});

const updateReturnSchema = z.object({
  returnDate: z.string().datetime().optional(),
  reason: z.string().optional(),
  requestedAction: z.enum(['refund', 'replacement', 'credit_note']).optional(),
  pickupRequired: z.boolean().optional(),
  pickupDate: z.string().datetime().optional(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(returnLineSchema).optional()
});

const processReturnSchema = z.object({
  action: z.enum(['accept', 'reject', 'partial_accept']),
  supplierResponse: z.string().optional(),
  resolution: z.enum(['refund', 'replacement', 'credit_note']).optional(),
  refundAmount: z.number().positive().optional(),
  creditNoteNumber: z.string().optional(),
  replacementOrderId: z.string().uuid().optional(),
  notes: z.string().optional(),
  lineResolutions: z.array(z.object({
    lineId: z.string().uuid(),
    accepted: z.boolean(),
    resolution: z.enum(['refund', 'replacement', 'credit_note']).optional(),
    amount: z.number().optional()
  })).optional()
});

// ============================================================================
// ROUTES
// ============================================================================

export const returnsRoutes: RouteDefinition[] = [
  // ========== PURCHASE RETURNS ==========
  {
    method: 'GET',
    path: '/api/compras/returns',
    handler: 'listReturns',
    permissions: ['purchasing.read'],
    validation: {
      query: listQuerySchema.merge(z.object({
        status: returnStatusEnum.optional(),
        purchaseOrderId: z.string().uuid().optional(),
        supplierId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      })).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/returns',
    handler: 'createReturn',
    permissions: ['purchasing.write'],
    validation: {
      body: createReturnSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/returns/:id',
    handler: 'getReturn',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/returns/:id',
    handler: 'updateReturn',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateReturnSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/returns/:id',
    handler: 'deleteReturn',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/returns/:id/send',
    handler: 'sendReturn',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        notifySupplier: z.boolean().default(true),
        message: z.string().optional(),
        attachments: z.array(z.string()).optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/returns/:id/process',
    handler: 'processReturn',
    permissions: ['purchasing.approve'],
    validation: {
      params: idParamSchema,
      body: processReturnSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/returns/:id/update-inventory',
    handler: 'updateInventoryFromReturn',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        adjustInventory: z.boolean().default(true),
        restockLocations: z.array(z.object({
          lineId: z.string().uuid(),
          location: z.string(),
          restockable: z.boolean()
        })).optional()
      }).optional()
    }
  }
];
