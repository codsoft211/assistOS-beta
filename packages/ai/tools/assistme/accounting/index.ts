import { ToolDefinitionAdapter } from '../../kernel/adapters';
import { toolRegistry } from '../../kernel/registry';

// Import all tools
import { CreateJournalEntryTool } from './create-journal-entry';
import { PostJournalEntryTool } from './post-journal-entry';
import { CreateAccountTool } from './create-account';
import { CloseFiscalPeriodTool } from './close-fiscal-period';
import { CreateBankReconciliationTool } from './create-bank-reconciliation';
import { MatchBankTransactionTool } from './match-bank-transaction';
import { GetTrialBalanceTool } from './get-trial-balance';
import { GetAccountLedgerTool } from './get-account-ledger';

// Wrap ToolDefinition tools with adapter
const accountingTools = [
  new ToolDefinitionAdapter(CreateJournalEntryTool),
  new ToolDefinitionAdapter(PostJournalEntryTool),
  new ToolDefinitionAdapter(CreateAccountTool),
  new ToolDefinitionAdapter(CloseFiscalPeriodTool),
  new ToolDefinitionAdapter(CreateBankReconciliationTool),
  new ToolDefinitionAdapter(MatchBankTransactionTool),
  new ToolDefinitionAdapter(GetTrialBalanceTool),
  new ToolDefinitionAdapter(GetAccountLedgerTool),
];

// Auto-register all tools
for (const tool of accountingTools) {
  toolRegistry.register(tool);
}

console.log(`[Accounting] Registered ${accountingTools.length} tools`);

// Export for direct usage if needed
export { CreateJournalEntryTool } from './create-journal-entry';
export { PostJournalEntryTool } from './post-journal-entry';
export { CreateAccountTool } from './create-account';
export { CloseFiscalPeriodTool } from './close-fiscal-period';
export { CreateBankReconciliationTool } from './create-bank-reconciliation';
export { MatchBankTransactionTool } from './match-bank-transaction';
export { GetTrialBalanceTool } from './get-trial-balance';
export { GetAccountLedgerTool } from './get-account-ledger';
