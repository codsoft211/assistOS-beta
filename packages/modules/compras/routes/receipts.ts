/**
 * Compras Module - Goods Receipts Routes
 * 
 * Routes for managing goods receipts and receipt lines
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, listQuerySchema, receiptStatusEnum } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const receiptLineSchema = z.object({
  poLineId: z.string().uuid(),
  quantityOrdered: z.number().positive(),
  quantityReceived: z.number().positive(),
  quantityAccepted: z.number().min(0),
  quantityRejected: z.number().min(0),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
  qcStatus: z.enum(['pending', 'passed', 'failed', 'partial']).optional(),
  qcNotes: z.string().optional(),
  defectDescription: z.string().optional(),
  storageLocation: z.string().optional(),
  batchNumber: z.string().optional(),
  expiryDate: z.string().datetime().optional(),
  notes: z.string().optional()
});

const createReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  receiptDate: z.string().datetime(),
  receivedBy: z.string().uuid().optional(),
  deliveryNote: z.string().optional(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  inspectionRequired: z.boolean().default(true),
  inspectionDate: z.string().datetime().optional(),
  inspectedBy: z.string().uuid().optional(),
  inspectionNotes: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(receiptLineSchema).min(1)
});

const updateReceiptSchema = z.object({
  receiptDate: z.string().datetime().optional(),
  deliveryNote: z.string().optional(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  inspectionDate: z.string().datetime().optional(),
  inspectedBy: z.string().uuid().optional(),
  inspectionNotes: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(receiptLineSchema).optional()
});

const validateReceiptSchema = z.object({
  validationType: z.enum(['accept_all', 'partial_accept', 'reject_all']),
  inspectionNotes: z.string().optional(),
  qcResults: z.array(z.object({
    lineId: z.string().uuid(),
    qcStatus: z.enum(['passed', 'failed']),
    quantityAccepted: z.number().min(0),
    quantityRejected: z.number().min(0),
    defectDescription: z.string().optional()
  })).optional(),
  createReturn: z.boolean().default(false)
});

// ============================================================================
// ROUTES
// ============================================================================

export const receiptsRoutes: RouteDefinition[] = [
  // ========== GOODS RECEIPTS ==========
  {
    method: 'GET',
    path: '/api/compras/receipts',
    handler: 'listReceipts',
    permissions: ['purchasing.read'],
    validation: {
      query: listQuerySchema.merge(z.object({
        status: receiptStatusEnum.optional(),
        purchaseOrderId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      })).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/receipts',
    handler: 'createReceipt',
    permissions: ['purchasing.write'],
    validation: {
      body: createReceiptSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/receipts/:id',
    handler: 'getReceipt',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/receipts/:id',
    handler: 'updateReceipt',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateReceiptSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/receipts/:id',
    handler: 'deleteReceipt',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/receipts/:id/validate',
    handler: 'validateReceipt',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: validateReceiptSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/receipts/:id/update-inventory',
    handler: 'updateInventoryFromReceipt',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        autoAllocate: z.boolean().default(true),
        storageLocations: z.array(z.object({
          lineId: z.string().uuid(),
          location: z.string()
        })).optional()
      }).optional()
    }
  }
];
