// GROUP 1: INVOICES (6 tools)
import { CreateInvoiceTool } from './create-invoice';
import { SendInvoiceTool } from './send-invoice';
import { ListInvoicesTool } from './list-invoices';
import { CheckOverdueTool } from './check-overdue';
import { CreateCreditNoteTool } from './create-credit-note';
import { CalculateVatTool } from './calculate-vat';

// GROUP 2: PAYMENTS (2 tools)
import { TrackPaymentTool } from './track-payment';
import { RecordPaymentTool } from './record-payment';

// GROUP 3: EXPENSES (3 tools)
import { CreateExpenseTool } from './create-expense';
import { ApproveExpenseTool } from './approve-expense';
import { ListExpensesTool } from './list-expenses';

// GROUP 4: BUDGETS (5 tools)
import { CreateBudgetTool } from './create-budget';
import { TrackBudgetTool } from './track-budget';
import { GetBudgetVsActualTool } from './get-budget-vs-actual';
import { GenerateForecastTool } from './generate-forecast';
import { CompareScenariosTool } from './compare-scenarios';

// GROUP 5: REPORTS (4 tools)
import { GeneratePLReportTool } from './generate-pl-report';
import { GenerateCashflowTool } from './generate-cashflow';
import { AgingReportTool } from './aging-report';
import { MarginAnalysisTool } from './margin-analysis';

// GROUP 6: OPERATIONS (3 tools)
import { BankReconciliationTool } from './bank-reconciliation';
import { ForecastRevenueTool } from './forecast-revenue';
import { PaymentReminderTool } from './payment-reminder';

// GROUP 7: ADVANCED FINANCIAL TOOLS (6 tools)
import { CalculateIvaTaxTool } from './calculate-iva-tax';
import { CalculateIrcEstimateTool } from './calculate-irc-estimate';
import { ForecastCashflowTool } from './forecast-cashflow';
import { AgingAnalysisTool } from './aging-analysis';
import { CalculateFinancialKpisTool } from './financial-kpis';
import { GenerateRecurringInvoicesTool } from './recurring-invoice-generator';

import { toolRegistry } from '../../kernel';

// All 29 Financial tools (26 existing + 3 new Financial Grid tools)
export const financialTools = [
  // GROUP 1: INVOICES
  new CreateInvoiceTool(),
  new SendInvoiceTool(),
  new ListInvoicesTool(),
  new CheckOverdueTool(),
  new CreateCreditNoteTool(),
  new CalculateVatTool(),
  
  // GROUP 2: PAYMENTS
  new TrackPaymentTool(),
  new RecordPaymentTool(),
  
  // GROUP 3: EXPENSES
  new CreateExpenseTool(),
  new ApproveExpenseTool(),
  new ListExpensesTool(),
  
  // GROUP 4: BUDGETS
  new CreateBudgetTool(),
  new TrackBudgetTool(),
  new GetBudgetVsActualTool(),
  new GenerateForecastTool(),
  new CompareScenariosTool(),
  
  // GROUP 5: REPORTS
  new GeneratePLReportTool(),
  new GenerateCashflowTool(),
  new AgingReportTool(),
  new MarginAnalysisTool(),
  
  // GROUP 6: OPERATIONS
  new BankReconciliationTool(),
  new ForecastRevenueTool(),
  new PaymentReminderTool(),
  
  // GROUP 7: ADVANCED FINANCIAL TOOLS
  new CalculateIvaTaxTool(),
  new CalculateIrcEstimateTool(),
  new ForecastCashflowTool(),
  new AgingAnalysisTool(),
  new CalculateFinancialKpisTool(),
  new GenerateRecurringInvoicesTool()
];

// Auto-register all Financial tools on import
for (const tool of financialTools) {
  toolRegistry.register(tool);
}

// Export all classes
export * from './create-invoice';
export * from './send-invoice';
export * from './list-invoices';
export * from './check-overdue';
export * from './create-credit-note';
export * from './calculate-vat';
export * from './track-payment';
export * from './record-payment';
export * from './create-expense';
export * from './approve-expense';
export * from './list-expenses';
export * from './create-budget';
export * from './track-budget';
export * from './get-budget-vs-actual';
export * from './generate-forecast';
export * from './compare-scenarios';
export * from './generate-pl-report';
export * from './generate-cashflow';
export * from './aging-report';
export * from './margin-analysis';
export * from './bank-reconciliation';
export * from './forecast-revenue';
export * from './payment-reminder';
export * from './calculate-iva-tax';
export * from './calculate-irc-estimate';
export * from './forecast-cashflow';
export * from './aging-analysis';
export * from './financial-kpis';
export * from './recurring-invoice-generator';
