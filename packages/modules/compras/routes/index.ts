/**
 * Compras Module Routes
 * 
 * Consolidated API routes for the procurement module.
 * Aggregates all route definitions from individual route files.
 */

import type { RouteDefinition } from '../../base/module.interface';
import { suppliersRoutes } from './suppliers';
import { requisitionsRoutes } from './requisitions';
import { rfqsRoutes } from './rfqs';
import { purchaseOrdersRoutes } from './purchase-orders';
import { receiptsRoutes } from './receipts';
import { returnsRoutes } from './returns';
import { invoicesRoutes } from './invoices';
import { paymentsRoutes } from './payments';
import { expensesRoutes } from './expenses';
import { quickPurchaseRoutes } from './quick-purchase';
import { accountsPayableRoutes } from './accounts-payable';
import { publicRoutes } from './public';

/**
 * Complete route definitions for the Compras (Procurement) module
 * 
 * Routes are organized by functional area:
 * 
 * 1. Suppliers Management (15 routes)
 *    - Suppliers CRUD
 *    - Product Suppliers CRUD
 *    - Supplier Price History
 *    - Supplier Scoring
 * 
 * 2. Purchase Requisitions (7 routes)
 *    - Requisitions CRUD
 *    - Approval workflow
 *    - Conversion to PO
 * 
 * 3. RFQs (Request for Quotations) (13 routes)
 *    - RFQs CRUD
 *    - Supplier Quotes CRUD
 *    - Evaluation and Selection
 * 
 * 4. Purchase Orders (10 routes)
 *    - Purchase Orders CRUD
 *    - Send, Confirm, Track, Cancel workflows
 * 
 * 5. Goods Receipts (7 routes)
 *    - Receipts CRUD
 *    - Validation and QC
 *    - Inventory updates
 * 
 * 6. Purchase Returns (8 routes)
 *    - Returns CRUD
 *    - Processing and Resolution
 *    - Inventory adjustments
 * 
 * 7. Purchasing Invoices (10 routes)
 *    - Invoices CRUD
 *    - OCR upload and data extraction
 *    - Three-way matching
 *    - Approval workflow
 * 
 * 8. Payments (13 routes)
 *    - Payments CRUD
 *    - Payment Allocations
 *    - Confirmation and Void
 * 
 * 9. Employee Expenses (10 routes)
 *    - Expenses CRUD
 *    - Submission and Approval
 *    - Allocation and Reimbursement
 * 
 * 10. Quick Purchase (8 routes)
 *     - Quick Purchase CRUD
 *     - Bulk operations
 *     - Receipt uploads
 * 
 * 11. Accounts Payable Analytics (10 routes)
 *     - AP Summary and Aging Reports
 *     - Cash Flow Forecasting
 *     - Supplier Balances and Performance
 *     - Spending Analysis
 * 
 * 12. Public Routes (2 routes)
 *     - Supplier Invoice Submission (Token-based, no auth)
 *     - Token Validation
 * 
 * Total: 113 routes
 */
export const comprasRoutes: RouteDefinition[] = [
  // ========== PUBLIC ROUTES (NO AUTH) ==========
  ...publicRoutes,
  
  // ========== SUPPLIERS ==========
  ...suppliersRoutes,
  
  // ========== PURCHASE REQUISITIONS ==========
  ...requisitionsRoutes,
  
  // ========== RFQs (REQUEST FOR QUOTATIONS) ==========
  ...rfqsRoutes,
  
  // ========== PURCHASE ORDERS ==========
  ...purchaseOrdersRoutes,
  
  // ========== GOODS RECEIPTS ==========
  ...receiptsRoutes,
  
  // ========== PURCHASE RETURNS ==========
  ...returnsRoutes,
  
  // ========== PURCHASING INVOICES ==========
  ...invoicesRoutes,
  
  // ========== PAYMENTS ==========
  ...paymentsRoutes,
  
  // ========== EMPLOYEE EXPENSES ==========
  ...expensesRoutes,
  
  // ========== QUICK PURCHASE ==========
  ...quickPurchaseRoutes,
  
  // ========== ACCOUNTS PAYABLE ANALYTICS ==========
  ...accountsPayableRoutes
];

/**
 * Route statistics for the Compras module:
 * 
 * - Total Routes: 111
 * - GET Routes: ~45 (queries and reads)
 * - POST Routes: ~50 (creates and workflows)
 * - PATCH Routes: ~12 (updates)
 * - DELETE Routes: ~12 (deletes)
 * 
 * Permission Usage:
 * - purchasing.read: ~45 routes (read operations)
 * - purchasing.write: ~40 routes (create/update operations)
 * - purchasing.approve: ~10 routes (approval workflows)
 * - compras.payments: ~16 routes (payment operations)
 */
