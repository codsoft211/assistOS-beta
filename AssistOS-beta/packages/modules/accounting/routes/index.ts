/**
 * Accounting Module - API Routes
 */

export const accountingRoutes = [
  // Chart of Accounts
  { method: 'GET', path: '/api/accounting/chart-of-accounts', handler: 'listAccounts' },
  { method: 'POST', path: '/api/accounting/chart-of-accounts', handler: 'createAccount' },
  { method: 'GET', path: '/api/accounting/chart-of-accounts/:id', handler: 'getAccount' },
  { method: 'PATCH', path: '/api/accounting/chart-of-accounts/:id', handler: 'updateAccount' },
  { method: 'DELETE', path: '/api/accounting/chart-of-accounts/:id', handler: 'deleteAccount' },
  
  // Journal Entries
  { method: 'GET', path: '/api/accounting/journal-entries', handler: 'listJournalEntries' },
  { method: 'POST', path: '/api/accounting/journal-entries', handler: 'createJournalEntry' },
  { method: 'GET', path: '/api/accounting/journal-entries/:id', handler: 'getJournalEntry' },
  { method: 'PATCH', path: '/api/accounting/journal-entries/:id', handler: 'updateJournalEntry' },
  { method: 'POST', path: '/api/accounting/journal-entries/:id/post', handler: 'postJournalEntry' },
  { method: 'POST', path: '/api/accounting/journal-entries/:id/reverse', handler: 'reverseJournalEntry' },
  
  // Journal Entry Lines
  { method: 'GET', path: '/api/accounting/journal-entries/:entryId/lines', handler: 'listJournalEntryLines' },
  { method: 'POST', path: '/api/accounting/journal-entries/:entryId/lines', handler: 'addJournalEntryLine' },
  { method: 'PATCH', path: '/api/accounting/journal-entries/:entryId/lines/:lineId', handler: 'updateJournalEntryLine' },
  { method: 'DELETE', path: '/api/accounting/journal-entries/:entryId/lines/:lineId', handler: 'deleteJournalEntryLine' },
  
  // Financial Periods
  { method: 'GET', path: '/api/accounting/periods', handler: 'listFinancialPeriods' },
  { method: 'POST', path: '/api/accounting/periods', handler: 'createFinancialPeriod' },
  { method: 'GET', path: '/api/accounting/periods/:id', handler: 'getFinancialPeriod' },
  { method: 'POST', path: '/api/accounting/periods/:id/close', handler: 'closeFinancialPeriod' },
  { method: 'POST', path: '/api/accounting/periods/:id/reopen', handler: 'reopenFinancialPeriod' },
  
  // Account Balances
  { method: 'GET', path: '/api/accounting/balances', handler: 'listAccountBalances' },
  { method: 'GET', path: '/api/accounting/balances/:accountId', handler: 'getAccountBalance' },
  
  // General Ledger
  { method: 'GET', path: '/api/accounting/general-ledger', handler: 'getGeneralLedger' },
  { method: 'GET', path: '/api/accounting/general-ledger/:accountId', handler: 'getAccountLedger' },
  
  // Cost Centers
  { method: 'GET', path: '/api/accounting/cost-centers', handler: 'listCostCenters' },
  { method: 'POST', path: '/api/accounting/cost-centers', handler: 'createCostCenter' },
  { method: 'GET', path: '/api/accounting/cost-centers/:id', handler: 'getCostCenter' },
  { method: 'PATCH', path: '/api/accounting/cost-centers/:id', handler: 'updateCostCenter' },
  
  // Tax Codes
  { method: 'GET', path: '/api/accounting/tax-codes', handler: 'listTaxCodes' },
  { method: 'POST', path: '/api/accounting/tax-codes', handler: 'createTaxCode' },
  { method: 'GET', path: '/api/accounting/tax-codes/:id', handler: 'getTaxCode' },
  { method: 'PATCH', path: '/api/accounting/tax-codes/:id', handler: 'updateTaxCode' },
  
  // Budget
  { method: 'GET', path: '/api/accounting/budgets', handler: 'listBudgets' },
  { method: 'POST', path: '/api/accounting/budgets', handler: 'createBudget' },
  { method: 'GET', path: '/api/accounting/budgets/:id', handler: 'getBudget' },
  { method: 'GET', path: '/api/accounting/budgets/:id/variance', handler: 'getBudgetVariance' },
  
  // Reports
  { method: 'GET', path: '/api/accounting/reports/trial-balance', handler: 'getTrialBalance' },
  { method: 'GET', path: '/api/accounting/reports/income-statement', handler: 'getIncomeStatement' },
  { method: 'GET', path: '/api/accounting/reports/balance-sheet', handler: 'getBalanceSheet' },
  { method: 'GET', path: '/api/accounting/reports/cash-flow', handler: 'getCashFlow' },
  
  // Analytics
  { method: 'GET', path: '/api/accounting/analytics/summary', handler: 'getAccountingSummary' },
  { method: 'GET', path: '/api/accounting/analytics/trends', handler: 'getAccountingTrends' },
];

