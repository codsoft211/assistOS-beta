/**
 * Compras Module - Accounts Payable Routes
 * 
 * Routes for accounts payable analytics and summary views
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { dateRangeSchema } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const apSummaryQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  groupBy: z.enum(['supplier', 'category', 'department', 'month', 'status']).optional(),
  supplierId: z.string().uuid().optional(),
  departmentId: z.string().optional()
});

const agingReportQuerySchema = z.object({
  asOfDate: z.string().datetime().optional(),
  supplierId: z.string().uuid().optional(),
  includeCredits: z.coerce.boolean().default(true),
  periods: z.array(z.coerce.number().int().positive()).optional()
});

const cashFlowForecastQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  includeScheduled: z.coerce.boolean().default(true),
  includePending: z.coerce.boolean().default(true),
  groupBy: z.enum(['day', 'week', 'month']).default('week')
});

// ============================================================================
// ROUTES
// ============================================================================

export const accountsPayableRoutes: RouteDefinition[] = [
  // ========== SUMMARY & ANALYTICS ==========
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/summary',
    handler: 'getAccountsPayableSummary',
    permissions: ['purchasing.read'],
    validation: {
      query: apSummaryQuerySchema.optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/aging-report',
    handler: 'getAgingReport',
    permissions: ['purchasing.read'],
    validation: {
      query: agingReportQuerySchema.optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/cash-flow-forecast',
    handler: 'getCashFlowForecast',
    permissions: ['purchasing.read'],
    validation: {
      query: cashFlowForecastQuerySchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/supplier-balances',
    handler: 'getSupplierBalances',
    permissions: ['purchasing.read'],
    validation: {
      query: z.object({
        supplierId: z.string().uuid().optional(),
        asOfDate: z.string().datetime().optional(),
        minBalance: z.coerce.number().optional(),
        onlyOverdue: z.coerce.boolean().default(false)
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/overdue-invoices',
    handler: 'getOverdueInvoices',
    permissions: ['purchasing.read'],
    validation: {
      query: z.object({
        supplierId: z.string().uuid().optional(),
        daysOverdue: z.coerce.number().int().positive().optional(),
        minAmount: z.coerce.number().positive().optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/payment-schedule',
    handler: 'getPaymentSchedule',
    permissions: ['purchasing.read'],
    validation: {
      query: dateRangeSchema.merge(z.object({
        supplierId: z.string().uuid().optional(),
        status: z.enum(['pending', 'scheduled', 'completed']).optional()
      }))
    }
  },
  
  // ========== REPORTING ==========
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/spending-analysis',
    handler: 'getSpendingAnalysis',
    permissions: ['purchasing.read'],
    validation: {
      query: dateRangeSchema.merge(z.object({
        groupBy: z.enum(['supplier', 'category', 'department', 'month']),
        topN: z.coerce.number().int().positive().max(100).optional(),
        includeComparison: z.coerce.boolean().default(false)
      }))
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/supplier-performance',
    handler: 'getSupplierPerformance',
    permissions: ['purchasing.read'],
    validation: {
      query: dateRangeSchema.merge(z.object({
        supplierId: z.string().uuid().optional(),
        metrics: z.array(z.enum(['delivery', 'quality', 'price', 'communication'])).optional(),
        minOrders: z.coerce.number().int().positive().optional()
      })).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/accounts-payable/payment-terms-analysis',
    handler: 'getPaymentTermsAnalysis',
    permissions: ['purchasing.read'],
    validation: {
      query: dateRangeSchema.merge(z.object({
        supplierId: z.string().uuid().optional(),
        includeEarlyPaymentOpportunities: z.coerce.boolean().default(true)
      })).optional()
    }
  },
  
  // ========== EXPORT ==========
  {
    method: 'POST',
    path: '/api/compras/accounts-payable/export',
    handler: 'exportAccountsPayable',
    permissions: ['purchasing.read'],
    validation: {
      body: z.object({
        format: z.enum(['csv', 'excel', 'pdf']),
        reportType: z.enum(['summary', 'aging', 'supplier_balances', 'overdue', 'spending']),
        filters: z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          supplierId: z.string().uuid().optional(),
          departmentId: z.string().optional()
        }).optional()
      })
    }
  }
];
