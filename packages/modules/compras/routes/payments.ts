/**
 * Compras Module - Purchasing Payments Routes
 * 
 * Routes for managing purchasing payments and payment allocations
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, paymentQuerySchema, listQuerySchema } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createPaymentSchema = z.object({
  supplierId: z.string().uuid(),
  paymentDate: z.string().datetime(),
  paymentMethod: z.enum(['bank_transfer', 'check', 'credit_card', 'cash', 'other']),
  referenceNumber: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().default('EUR'),
  exchangeRate: z.number().positive().default(1),
  bankAccountId: z.string().optional(),
  checkNumber: z.string().optional(),
  notes: z.string().optional(),
  attachments: z.array(z.string()).optional()
});

const updatePaymentSchema = z.object({
  paymentDate: z.string().datetime().optional(),
  paymentMethod: z.enum(['bank_transfer', 'check', 'credit_card', 'cash', 'other']).optional(),
  referenceNumber: z.string().optional(),
  amount: z.number().positive().optional(),
  bankAccountId: z.string().optional(),
  checkNumber: z.string().optional(),
  notes: z.string().optional(),
  attachments: z.array(z.string()).optional()
});

const allocatePaymentSchema = z.object({
  allocations: z.array(z.object({
    invoiceId: z.string().uuid(),
    amount: z.number().positive(),
    notes: z.string().optional()
  })).min(1),
  autoApply: z.boolean().default(true)
});

const paymentAllocationSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  allocationDate: z.string().datetime().optional(),
  notes: z.string().optional()
});

// ============================================================================
// ROUTES
// ============================================================================

export const paymentsRoutes: RouteDefinition[] = [
  // ========== PURCHASING PAYMENTS ==========
  {
    method: 'GET',
    path: '/api/compras/payments',
    handler: 'listPayments',
    permissions: ['purchasing.read'],
    validation: {
      query: paymentQuerySchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/payments',
    handler: 'createPayment',
    permissions: ['compras.payments'],
    validation: {
      body: createPaymentSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/payments/:id',
    handler: 'getPayment',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/payments/:id',
    handler: 'updatePayment',
    permissions: ['compras.payments'],
    validation: {
      params: idParamSchema,
      body: updatePaymentSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/payments/:id',
    handler: 'deletePayment',
    permissions: ['compras.payments'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/payments/:id/allocate',
    handler: 'allocatePayment',
    permissions: ['compras.payments'],
    validation: {
      params: idParamSchema,
      body: allocatePaymentSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/payments/:id/confirm',
    handler: 'confirmPayment',
    permissions: ['compras.payments'],
    validation: {
      params: idParamSchema,
      body: z.object({
        bankStatementReference: z.string().optional(),
        confirmationDate: z.string().datetime().optional(),
        notes: z.string().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/payments/:id/void',
    handler: 'voidPayment',
    permissions: ['compras.payments'],
    validation: {
      params: idParamSchema,
      body: z.object({
        reason: z.string().min(1),
        voidDate: z.string().datetime().optional()
      })
    }
  },
  
  // ========== PAYMENT ALLOCATIONS ==========
  {
    method: 'GET',
    path: '/api/compras/payment-allocations',
    handler: 'listPaymentAllocations',
    permissions: ['purchasing.read'],
    validation: {
      query: listQuerySchema.merge(z.object({
        paymentId: z.string().uuid().optional(),
        invoiceId: z.string().uuid().optional()
      })).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/payment-allocations',
    handler: 'createPaymentAllocation',
    permissions: ['compras.payments'],
    validation: {
      body: paymentAllocationSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/payment-allocations/:id',
    handler: 'getPaymentAllocation',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/payment-allocations/:id',
    handler: 'deletePaymentAllocation',
    permissions: ['compras.payments'],
    validation: {
      params: idParamSchema
    }
  }
];
