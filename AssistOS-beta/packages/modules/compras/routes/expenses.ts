/**
 * Compras Module - Employee Expenses Routes
 * 
 * Routes for managing employee expenses and expense lines
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, expenseQuerySchema } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const expenseLineSchema = z.object({
  expenseDate: z.string().datetime(),
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().default('EUR'),
  exchangeRate: z.number().positive().default(1),
  merchantName: z.string().optional(),
  paymentMethod: z.enum(['personal_card', 'company_card', 'cash', 'other']).optional(),
  receipt: z.string().url().optional(),
  isBillable: z.boolean().default(false),
  clientId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  notes: z.string().optional()
});

const createExpenseSchema = z.object({
  employeeId: z.string().uuid(),
  reportNumber: z.string().optional(),
  reportDate: z.string().datetime().optional(),
  purpose: z.string().min(1),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(expenseLineSchema).min(1)
});

const updateExpenseSchema = z.object({
  reportNumber: z.string().optional(),
  reportDate: z.string().datetime().optional(),
  purpose: z.string().optional(),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(expenseLineSchema).optional()
});

const approveExpenseSchema = z.object({
  approved: z.boolean(),
  approvedAmount: z.number().positive().optional(),
  rejectionReason: z.string().optional(),
  scheduleReimbursement: z.boolean().default(false),
  reimbursementDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  lineApprovals: z.array(z.object({
    lineId: z.string().uuid(),
    approved: z.boolean(),
    approvedAmount: z.number().positive().optional(),
    reason: z.string().optional()
  })).optional()
});

const allocateExpenseSchema = z.object({
  allocations: z.array(z.object({
    lineId: z.string().uuid(),
    costCenter: z.string(),
    accountCode: z.string(),
    percentage: z.number().min(0).max(100).optional(),
    amount: z.number().positive().optional()
  })).min(1)
});

// ============================================================================
// ROUTES
// ============================================================================

export const expensesRoutes: RouteDefinition[] = [
  // ========== EMPLOYEE EXPENSES ==========
  {
    method: 'GET',
    path: '/api/compras/expenses',
    handler: 'listExpenses',
    permissions: ['purchasing.read'],
    validation: {
      query: expenseQuerySchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/expenses',
    handler: 'createExpense',
    permissions: ['purchasing.write'],
    validation: {
      body: createExpenseSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/expenses/:id',
    handler: 'getExpense',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/expenses/:id',
    handler: 'updateExpense',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateExpenseSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/expenses/:id',
    handler: 'deleteExpense',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/expenses/:id/submit',
    handler: 'submitExpense',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        submittedDate: z.string().datetime().optional(),
        notes: z.string().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/expenses/:id/approve',
    handler: 'approveExpense',
    permissions: ['purchasing.approve'],
    validation: {
      params: idParamSchema,
      body: approveExpenseSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/expenses/:id/allocate',
    handler: 'allocateExpense',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: allocateExpenseSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/expenses/:id/reimburse',
    handler: 'reimburseExpense',
    permissions: ['compras.payments'],
    validation: {
      params: idParamSchema,
      body: z.object({
        reimbursementDate: z.string().datetime(),
        paymentMethod: z.enum(['bank_transfer', 'check', 'cash', 'other']),
        referenceNumber: z.string().optional(),
        amount: z.number().positive(),
        notes: z.string().optional()
      })
    }
  },
  
  // ========== EXPENSE LINES ==========
  {
    method: 'GET',
    path: '/api/compras/expenses/:id/lines',
    handler: 'getExpenseLines',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/expenses/:id/lines/:lineId/upload-receipt',
    handler: 'uploadExpenseReceipt',
    permissions: ['purchasing.write'],
    validation: {
      params: z.object({
        id: z.string().uuid(),
        lineId: z.string().uuid()
      }),
      body: z.object({
        receiptUrl: z.string().url(),
        extractData: z.boolean().default(true)
      })
    }
  }
];
