/**
 * Compras Module - RFQs (Request for Quotations) Routes
 * 
 * Routes for managing RFQs, RFQ lines, and supplier quotes
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, rfqQuerySchema } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const rfqLineSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitOfMeasure: z.string().min(1),
  targetPrice: z.number().positive().optional(),
  specifications: z.string().optional(),
  notes: z.string().optional()
});

const createRfqSchema = z.object({
  requisitionId: z.string().uuid().optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime(),
  deliveryLocation: z.string().optional(),
  deliveryDate: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(rfqLineSchema).min(1),
  supplierIds: z.array(z.string().uuid()).min(1)
});

const updateRfqSchema = z.object({
  dueDate: z.string().datetime().optional(),
  deliveryLocation: z.string().optional(),
  deliveryDate: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(rfqLineSchema).optional()
});

const supplierQuoteSchema = z.object({
  rfqId: z.string().uuid(),
  supplierId: z.string().uuid(),
  quoteDate: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
  deliveryDate: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    rfqLineId: z.string().uuid(),
    unitPrice: z.number().positive(),
    totalPrice: z.number().positive(),
    leadTimeDays: z.number().int().positive().optional(),
    notes: z.string().optional()
  })).min(1)
});

const evaluateRfqSchema = z.object({
  evaluationCriteria: z.object({
    priceWeight: z.number().min(0).max(100).default(50),
    qualityWeight: z.number().min(0).max(100).default(30),
    deliveryWeight: z.number().min(0).max(100).default(20)
  }).optional(),
  notes: z.string().optional()
});

const selectQuoteSchema = z.object({
  supplierQuoteId: z.string().uuid(),
  reason: z.string().optional(),
  createPO: z.boolean().default(false)
});

// ============================================================================
// ROUTES
// ============================================================================

export const rfqsRoutes: RouteDefinition[] = [
  // ========== RFQs ==========
  {
    method: 'GET',
    path: '/api/compras/rfqs',
    handler: 'listRfqs',
    permissions: ['purchasing.read'],
    validation: {
      query: rfqQuerySchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/rfqs',
    handler: 'createRfq',
    permissions: ['purchasing.write'],
    validation: {
      body: createRfqSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/rfqs/:id',
    handler: 'getRfq',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/rfqs/:id',
    handler: 'updateRfq',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateRfqSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/rfqs/:id',
    handler: 'deleteRfq',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/rfqs/:id/send',
    handler: 'sendRfq',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        supplierIds: z.array(z.string().uuid()).optional(),
        message: z.string().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/rfqs/:id/evaluate',
    handler: 'evaluateRfq',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: evaluateRfqSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/rfqs/:id/select-quote',
    handler: 'selectQuote',
    permissions: ['purchasing.approve'],
    validation: {
      params: idParamSchema,
      body: selectQuoteSchema
    }
  },
  
  // ========== SUPPLIER QUOTES ==========
  {
    method: 'GET',
    path: '/api/compras/rfqs/:id/quotes',
    handler: 'getRfqQuotes',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/supplier-quotes',
    handler: 'createSupplierQuote',
    permissions: ['purchasing.write'],
    validation: {
      body: supplierQuoteSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/supplier-quotes/:id',
    handler: 'getSupplierQuote',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/supplier-quotes/:id',
    handler: 'updateSupplierQuote',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: supplierQuoteSchema.partial()
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/supplier-quotes/:id',
    handler: 'deleteSupplierQuote',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  }
];
