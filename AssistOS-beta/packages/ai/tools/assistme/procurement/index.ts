import { toolRegistry } from '../../kernel/registry';

// Import all ToolBase classes
import { CreatePurchaseRequisitionTool } from './create-purchase-requisition';
import { ApproveRequisitionTool } from './approve-requisition';
import { CreatePurchaseOrderTool } from './create-purchase-order';
import { ReceiveInvoiceTool } from './receive-invoice';
import { MatchInvoiceTool } from './match-invoice';
import { ManageSuppliersTool } from './manage-suppliers';
import { RequestQuotationTool } from './request-quotation';
import { CompareQuotesTool } from './compare-quotes';
import { SupplierPerformanceTool } from './supplier-performance';
import { ForecastDemandTool } from './forecast-demand';
import { ListSuppliersTool } from './list-suppliers';

// Instantiate ToolBase classes
const procurementTools = [
  new CreatePurchaseRequisitionTool(),
  new ApproveRequisitionTool(),
  new CreatePurchaseOrderTool(),
  new ReceiveInvoiceTool(),
  new MatchInvoiceTool(),
  new ManageSuppliersTool(),
  new RequestQuotationTool(),
  new CompareQuotesTool(),
  new SupplierPerformanceTool(),
  new ForecastDemandTool(),
  new ListSuppliersTool(),
];

// Auto-register all tools
for (const tool of procurementTools) {
  toolRegistry.register(tool);
}

console.log(`[Procurement] Registered ${procurementTools.length} tools`);

// Export for direct usage if needed
export { CreatePurchaseRequisitionTool } from './create-purchase-requisition';
export { ApproveRequisitionTool } from './approve-requisition';
export { CreatePurchaseOrderTool } from './create-purchase-order';
export { ReceiveInvoiceTool } from './receive-invoice';
export { MatchInvoiceTool } from './match-invoice';
export { ManageSuppliersTool } from './manage-suppliers';
export { RequestQuotationTool } from './request-quotation';
export { CompareQuotesTool } from './compare-quotes';
export { SupplierPerformanceTool } from './supplier-performance';
export { ForecastDemandTool } from './forecast-demand';
export { ListSuppliersTool } from './list-suppliers';
