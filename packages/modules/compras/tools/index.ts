/**
 * Compras Module AI Tools
 * 
 * 33 AI tools across 11 functional domains for procurement automation.
 * All tools enforce tenant isolation and validate input parameters.
 */

import type { ModuleTool } from '../../base/module.interface';

// Import tool definitions + execute functions
import { supplierTools, executeSupplierTool } from './suppliers.js';
import { supplierInvoiceTools, executeSupplierInvoiceTool } from './supplier-invoices.js';
import { quickPurchaseTools, executeQuickPurchaseTool } from './quick-purchase.js';
import { requisitionTools, executeRequisitionTool } from './requisitions.js';
import { rfqTools, executeRfqTool } from './rfqs.js';
import { purchaseOrderTools, executePurchaseOrderTool } from './purchase-orders.js';
import { receiptTools, executeReceiptTool } from './receipts.js';
import { invoiceTools, executeInvoiceTool } from './invoices.js';
import { paymentTools, executePaymentTool } from './payments.js';
import { returnTools, executeReturnTool } from './returns.js';
import { expenseTools, executeExpenseTool } from './expenses.js';
import { analyticsTools, executeAnalyticsTool } from './analytics.js';

// ============================================================================
// EXECUTE DISPATCHER
// ============================================================================

/**
 * Central dispatcher for all Compras AI tools.
 * Routes tool calls to appropriate domain handler.
 */
export async function executeComprasTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  // Supplier Invoices (1 tool)
  if (toolName === 'register_supplier_invoice') {
    return await executeSupplierInvoiceTool(toolName, args, context);
  }
  
  // Suppliers (4 tools)
  if (toolName.includes('supplier') || toolName === 'score_supplier') {
    return await executeSupplierTool(toolName, args, context);
  }
  
  // Quick Purchase (5 tools)
  if (
    toolName === 'bulk_create_purchase_requests' ||
    toolName === 'auto_generate_purchase_orders' ||
    toolName === 'send_po_with_invoice_request' ||
    toolName === 'process_supplier_invoice_submission' ||
    toolName === 'get_accounts_payable_summary'
  ) {
    return await executeQuickPurchaseTool(toolName, args, context);
  }
  
  // Requisitions (3 tools)
  if (toolName.includes('requisition')) {
    return await executeRequisitionTool(toolName, args, context);
  }
  
  // RFQs (3 tools)
  if (toolName.includes('rfq')) {
    return await executeRfqTool(toolName, args, context);
  }
  
  // Purchase Orders (4 tools)
  if (toolName.includes('purchase_order') || toolName.includes('_po')) {
    return await executePurchaseOrderTool(toolName, args, context);
  }
  
  // Receipts (2 tools)
  if (toolName.includes('receipt')) {
    return await executeReceiptTool(toolName, args, context);
  }
  
  // Invoices (4 tools)
  if (toolName.includes('invoice')) {
    return await executeInvoiceTool(toolName, args, context);
  }
  
  // Payments (3 tools)
  if (toolName.includes('payment')) {
    return await executePaymentTool(toolName, args, context);
  }
  
  // Returns (2 tools)
  if (toolName.includes('return')) {
    return await executeReturnTool(toolName, args, context);
  }
  
  // Expenses (3 tools)
  if (toolName.includes('expense')) {
    return await executeExpenseTool(toolName, args, context);
  }
  
  // Analytics (2 tools)
  if (toolName === 'forecast_demand' || toolName === 'spend_analysis_by_supplier') {
    return await executeAnalyticsTool(toolName, args, context);
  }
  
  throw new Error(`Unknown Compras tool: ${toolName}`);
}

// ============================================================================
// MODULE TOOL CONVERSION
// ============================================================================

/**
 * Convert OpenAI function format to ModuleTool format.
 * Maps execute dispatcher for each tool.
 */
function convertToModuleTools(toolDefinitions: any[]): ModuleTool[] {
  return toolDefinitions.map((tool) => {
    const func = tool.function;
    
    // Convert OpenAI parameters to ModuleTool parameters array
    const parameters = Object.entries(func.parameters.properties || {}).map(
      ([name, prop]: [string, any]) => ({
        name,
        type: prop.type,
        description: prop.description || '',
        required: func.parameters.required?.includes(name) || false,
        default: prop.default,
        enum: prop.enum,
      })
    );
    
    return {
      name: func.name,
      description: func.description,
      parameters,
      execute: async (params: any, context: any) => {
        return await executeComprasTool(func.name, params, context);
      },
    };
  });
}

// ============================================================================
// CONSOLIDATED TOOLS EXPORT
// ============================================================================

/**
 * All 34 Compras AI tools in ModuleTool format.
 * 
 * Tool Categories:
 * - Suppliers: 4 tools (list, create, update, score)
 * - Supplier Invoices: 1 tool (register with lineItems)
 * - Quick Purchase: 5 tools (bulk create, auto PO, send, process invoice, AP summary)
 * - Requisitions: 3 tools (list, create, approve)
 * - RFQs: 3 tools (create, evaluate, select)
 * - Purchase Orders: 4 tools (list, create, track, cancel)
 * - Receipts: 2 tools (create, validate)
 * - Invoices: 4 tools (list, OCR, 3-way match, approve)
 * - Payments: 3 tools (list, create, allocate)
 * - Returns: 2 tools (create, process)
 * - Expenses: 3 tools (create, approve, allocate)
 * - Analytics: 2 tools (forecast, spend analysis)
 */
export const comprasTools: ModuleTool[] = [
  ...convertToModuleTools(supplierTools),
  ...convertToModuleTools(supplierInvoiceTools),
  ...convertToModuleTools(quickPurchaseTools),
  ...convertToModuleTools(requisitionTools),
  ...convertToModuleTools(rfqTools),
  ...convertToModuleTools(purchaseOrderTools),
  ...convertToModuleTools(receiptTools),
  ...convertToModuleTools(invoiceTools),
  ...convertToModuleTools(paymentTools),
  ...convertToModuleTools(returnTools),
  ...convertToModuleTools(expenseTools),
  ...convertToModuleTools(analyticsTools),
];
