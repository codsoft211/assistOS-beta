/**
 * Compras Module - Quick Purchase Routes
 * 
 * Routes for managing quick purchases (lightweight purchasing for low-value items)
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, listQuerySchema } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const quickPurchaseItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
  category: z.string().optional(),
  merchantName: z.string().optional(),
  purchaseDate: z.string().datetime().optional(),
  paymentMethod: z.enum(['company_card', 'petty_cash', 'personal_reimbursement', 'other']).optional(),
  receipt: z.string().url().optional(),
  notes: z.string().optional()
});

const createQuickPurchaseSchema = z.object({
  purchasedBy: z.string().uuid(),
  purchaseDate: z.string().datetime(),
  merchantName: z.string(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
  category: z.string().optional(),
  paymentMethod: z.enum(['company_card', 'petty_cash', 'personal_reimbursement', 'other']),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
  receipt: z.string().url().optional(),
  requiresApproval: z.boolean().default(false),
  notes: z.string().optional()
});

const updateQuickPurchaseSchema = createQuickPurchaseSchema.partial();

const bulkCreateSchema = z.object({
  purchases: z.array(quickPurchaseItemSchema).min(1),
  purchasedBy: z.string().uuid(),
  merchantName: z.string(),
  purchaseDate: z.string().datetime(),
  paymentMethod: z.enum(['company_card', 'petty_cash', 'personal_reimbursement', 'other']),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
  requiresApproval: z.boolean().default(false),
  notes: z.string().optional()
});

// ============================================================================
// ROUTES
// ============================================================================

export const quickPurchaseRoutes: RouteDefinition[] = [
  // ========== QUICK PURCHASES ==========
  {
    method: 'GET',
    path: '/api/compras/quick-purchase',
    handler: 'listQuickPurchases',
    permissions: ['purchasing.read'],
    validation: {
      query: listQuerySchema.merge(z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'completed']).optional(),
        purchasedBy: z.string().uuid().optional(),
        category: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      })).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/quick-purchase',
    handler: 'createQuickPurchase',
    permissions: ['purchasing.write'],
    validation: {
      body: createQuickPurchaseSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/quick-purchase/:id',
    handler: 'getQuickPurchase',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/quick-purchase/:id',
    handler: 'updateQuickPurchase',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateQuickPurchaseSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/quick-purchase/:id',
    handler: 'deleteQuickPurchase',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== BULK OPERATIONS ==========
  {
    method: 'POST',
    path: '/api/compras/quick-purchase/bulk-create',
    handler: 'bulkCreateQuickPurchase',
    permissions: ['purchasing.write'],
    validation: {
      body: bulkCreateSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/quick-purchase/bulk-approve',
    handler: 'bulkApproveQuickPurchase',
    permissions: ['purchasing.approve'],
    validation: {
      body: z.object({
        purchaseIds: z.array(z.string().uuid()).min(1),
        approved: z.boolean(),
        notes: z.string().optional()
      })
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/quick-purchase/:id/approve',
    handler: 'approveQuickPurchase',
    permissions: ['purchasing.approve'],
    validation: {
      params: idParamSchema,
      body: z.object({
        approved: z.boolean(),
        rejectionReason: z.string().optional(),
        notes: z.string().optional()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/quick-purchase/:id/upload-receipt',
    handler: 'uploadQuickPurchaseReceipt',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        receiptUrl: z.string().url(),
        extractData: z.boolean().default(false)
      })
    }
  }
];
