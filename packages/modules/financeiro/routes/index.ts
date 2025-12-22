/**
 * FinanceiroModule - API Routes
 */

import type { RouteDefinition } from '../../base/module.interface';

export const financeiroRoutes: RouteDefinition[] = [
  // Invoices
  { method: 'GET' as const, path: '/api/financeiro/invoices', handler: 'listInvoices' },
  { method: 'POST' as const, path: '/api/financeiro/invoices', handler: 'createInvoice' },
  { method: 'GET' as const, path: '/api/financeiro/invoices/:id', handler: 'getInvoice' },
  { method: 'PATCH' as const, path: '/api/financeiro/invoices/:id', handler: 'updateInvoice' },
  { method: 'DELETE' as const, path: '/api/financeiro/invoices/:id', handler: 'deleteInvoice' },
  
  // Payments
  { method: 'GET' as const, path: '/api/financeiro/payments', handler: 'listPayments' },
  { method: 'POST' as const, path: '/api/financeiro/payments', handler: 'createPayment' },
  { method: 'GET' as const, path: '/api/financeiro/payments/:id', handler: 'getPayment' },
  
  // Bank Accounts
  { method: 'GET' as const, path: '/api/financeiro/bank-accounts', handler: 'listBankAccounts' },
  { method: 'POST' as const, path: '/api/financeiro/bank-accounts', handler: 'createBankAccount' },
  
  // Tax Rates
  { method: 'GET' as const, path: '/api/financeiro/tax-rates', handler: 'listTaxRates' },
  
  // Analytics
  { method: 'GET' as const, path: '/api/financeiro/analytics/receivables', handler: 'getReceivablesSummary' },
  { method: 'GET' as const, path: '/api/financeiro/analytics/cash-flow', handler: 'getCashFlowAnalysis' },
];
