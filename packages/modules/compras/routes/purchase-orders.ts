/**
 * Compras Module - Purchase Orders Routes
 * 
 * Routes for managing purchase orders and PO lines
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, purchaseOrderQuerySchema } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const poLineSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitOfMeasure: z.string().min(1),
  unitPrice: z.number().positive(),
  taxRate: z.number().min(0).max(100).default(0),
  taxAmount: z.number().min(0).optional(),
  totalPrice: z.number().positive(),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().optional()
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  requisitionId: z.string().uuid().optional(),
  rfqId: z.string().uuid().optional(),
  orderDate: z.string().datetime().optional(),
  expectedDeliveryDate: z.string().datetime(),
  deliveryLocation: z.string(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  currency: z.string().default('EUR'),
  exchangeRate: z.number().positive().default(1),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  lines: z.array(poLineSchema).min(1)
});

const updatePurchaseOrderSchema = z.object({
  expectedDeliveryDate: z.string().datetime().optional(),
  deliveryLocation: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  lines: z.array(poLineSchema).optional()
});

const sendPurchaseOrderSchema = z.object({
  sendEmail: z.boolean().default(true),
  emailMessage: z.string().optional(),
  attachments: z.array(z.string()).optional()
});

const trackPurchaseOrderSchema = z.object({
  updateStatus: z.boolean().default(false),
  addNote: z.string().optional()
});

const cancelPurchaseOrderSchema = z.object({
  reason: z.string().min(1),
  notifySupplier: z.boolean().default(true)
});

// ============================================================================
// ROUTES
// ============================================================================

export const purchaseOrdersRoutes: RouteDefinition[] = [
  // ========== PURCHASE ORDERS ==========
  {
    method: 'GET',
    path: '/api/compras/purchase-orders',
    handler: 'listPurchaseOrders',
    permissions: ['purchasing.read'],
    validation: {
      query: purchaseOrderQuerySchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/purchase-orders',
    handler: 'createPurchaseOrder',
    permissions: ['purchasing.write'],
    validation: {
      body: createPurchaseOrderSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/purchase-orders/:id',
    handler: 'getPurchaseOrder',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/purchase-orders/:id',
    handler: 'updatePurchaseOrder',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updatePurchaseOrderSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/purchase-orders/:id',
    handler: 'deletePurchaseOrder',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/purchase-orders/:id/send',
    handler: 'sendPurchaseOrder',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: sendPurchaseOrderSchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/purchase-orders/:id/confirm',
    handler: 'confirmPurchaseOrder',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        supplierConfirmationNumber: z.string().optional(),
        confirmedDeliveryDate: z.string().datetime().optional(),
        notes: z.string().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/purchase-orders/:id/track',
    handler: 'trackPurchaseOrder',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: trackPurchaseOrderSchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/purchase-orders/:id/cancel',
    handler: 'cancelPurchaseOrder',
    permissions: ['purchasing.approve'],
    validation: {
      params: idParamSchema,
      body: cancelPurchaseOrderSchema
    }
  },
  
  // ========== PURCHASE ORDER LINES ==========
  {
    method: 'GET',
    path: '/api/compras/purchase-orders/:id/lines',
    handler: 'getPurchaseOrderLines',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  }
];
