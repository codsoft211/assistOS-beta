/**
 * Accounting Module - Workflows
 * 
 * Journal entry, period close, and reconciliation workflows
 */

export const accountingWorkflows = [
  {
    name: 'journal_entry_approval',
    displayName: 'Journal Entry Approval',
    description: 'Workflow for journal entry creation and posting',
    states: ['draft', 'pending_review', 'approved', 'posted', 'rejected', 'reversed'],
    transitions: [
      { from: 'draft', to: 'pending_review', trigger: 'submit', conditions: ['debits_equal_credits', 'all_accounts_valid'] },
      { from: 'pending_review', to: 'approved', trigger: 'approve', conditions: ['reviewer_authorized'] },
      { from: 'pending_review', to: 'rejected', trigger: 'reject', conditions: [] },
      { from: 'approved', to: 'posted', trigger: 'post', conditions: ['period_open', 'not_future_dated'] },
      { from: 'posted', to: 'reversed', trigger: 'reverse', conditions: ['reversal_authorized'] },
      { from: 'rejected', to: 'draft', trigger: 'revise', conditions: [] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'draft',
        to: 'pending_review',
        actions: ['validate_entry', 'notify_reviewer']
      },
      {
        trigger: 'state_change',
        from: 'approved',
        to: 'posted',
        actions: ['update_account_balances', 'create_audit_trail', 'update_general_ledger']
      },
      {
        trigger: 'state_change',
        from: 'posted',
        to: 'reversed',
        actions: ['create_reversing_entry', 'update_balances', 'notify_stakeholders']
      }
    ]
  },
  
  {
    name: 'period_close',
    displayName: 'Period Close Process',
    description: 'Month-end/year-end close workflow',
    states: ['open', 'soft_close', 'adjustments', 'review', 'closed', 'locked'],
    transitions: [
      { from: 'open', to: 'soft_close', trigger: 'initiate_close', conditions: ['all_transactions_posted'] },
      { from: 'soft_close', to: 'adjustments', trigger: 'start_adjustments', conditions: ['cutoff_complete'] },
      { from: 'adjustments', to: 'review', trigger: 'complete_adjustments', conditions: ['adjustments_balanced'] },
      { from: 'review', to: 'closed', trigger: 'approve_close', conditions: ['manager_approval'] },
      { from: 'closed', to: 'locked', trigger: 'lock', conditions: ['audit_complete'] },
      { from: 'closed', to: 'soft_close', trigger: 'reopen', conditions: ['cfo_approval'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'open',
        to: 'soft_close',
        actions: ['prevent_new_postings', 'generate_preliminary_reports', 'notify_accounting_team']
      },
      {
        trigger: 'state_change',
        from: 'adjustments',
        to: 'review',
        actions: ['run_closing_reports', 'calculate_accruals', 'check_reconciliations']
      },
      {
        trigger: 'state_change',
        from: 'review',
        to: 'closed',
        actions: ['finalize_balances', 'generate_final_reports', 'carry_forward_balances']
      },
      {
        trigger: 'state_change',
        from: 'closed',
        to: 'locked',
        actions: ['archive_period_data', 'lock_all_entries', 'create_audit_package']
      }
    ]
  },
  
  {
    name: 'account_reconciliation',
    displayName: 'Account Reconciliation',
    description: 'Bank and GL account reconciliation workflow',
    states: ['pending', 'in_progress', 'matching', 'review', 'reconciled', 'discrepancy'],
    transitions: [
      { from: 'pending', to: 'in_progress', trigger: 'start', conditions: ['reconciler_assigned'] },
      { from: 'in_progress', to: 'matching', trigger: 'import_complete', conditions: ['statement_imported'] },
      { from: 'matching', to: 'review', trigger: 'matching_complete', conditions: ['all_items_matched'] },
      { from: 'matching', to: 'discrepancy', trigger: 'flag_discrepancy', conditions: ['unmatched_items_exist'] },
      { from: 'discrepancy', to: 'matching', trigger: 'resolve', conditions: ['adjustments_made'] },
      { from: 'review', to: 'reconciled', trigger: 'approve', conditions: ['reviewer_approval'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'pending',
        to: 'in_progress',
        actions: ['prepare_reconciliation_sheet', 'load_gl_transactions']
      },
      {
        trigger: 'state_change',
        from: 'in_progress',
        to: 'matching',
        actions: ['auto_match_transactions', 'identify_outstanding_items']
      },
      {
        trigger: 'state_change',
        from: 'review',
        to: 'reconciled',
        actions: ['save_reconciliation', 'update_reconciliation_status', 'archive_documentation']
      }
    ]
  },
  
  {
    name: 'budget_approval',
    displayName: 'Budget Approval',
    description: 'Annual budget creation and approval workflow',
    states: ['draft', 'submitted', 'department_review', 'finance_review', 'cfo_approval', 'approved', 'rejected'],
    transitions: [
      { from: 'draft', to: 'submitted', trigger: 'submit', conditions: ['all_lines_complete'] },
      { from: 'submitted', to: 'department_review', trigger: 'assign_review', conditions: [] },
      { from: 'department_review', to: 'finance_review', trigger: 'dept_approve', conditions: ['department_head_approval'] },
      { from: 'finance_review', to: 'cfo_approval', trigger: 'finance_approve', conditions: ['finance_review_complete'] },
      { from: 'cfo_approval', to: 'approved', trigger: 'final_approve', conditions: ['cfo_signature'] },
      { from: ['department_review', 'finance_review', 'cfo_approval'], to: 'rejected', trigger: 'reject', conditions: [] },
      { from: 'rejected', to: 'draft', trigger: 'revise', conditions: [] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'submitted',
        to: 'department_review',
        actions: ['notify_department_heads', 'generate_summary_report']
      },
      {
        trigger: 'state_change',
        from: 'cfo_approval',
        to: 'approved',
        actions: ['load_budget_to_system', 'notify_stakeholders', 'enable_budget_tracking']
      }
    ]
  },
  
  {
    name: 'expense_allocation',
    displayName: 'Expense Allocation',
    description: 'Cost center and project expense allocation workflow',
    states: ['pending', 'calculating', 'review', 'allocated', 'posted'],
    transitions: [
      { from: 'pending', to: 'calculating', trigger: 'start', conditions: ['allocation_rules_defined'] },
      { from: 'calculating', to: 'review', trigger: 'calculation_complete', conditions: ['all_costs_allocated'] },
      { from: 'review', to: 'allocated', trigger: 'approve', conditions: ['reviewer_approval'] },
      { from: 'allocated', to: 'posted', trigger: 'post', conditions: ['period_open'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'pending',
        to: 'calculating',
        actions: ['gather_costs', 'apply_allocation_rules', 'calculate_distributions']
      },
      {
        trigger: 'state_change',
        from: 'allocated',
        to: 'posted',
        actions: ['create_allocation_entries', 'update_cost_center_balances', 'generate_allocation_report']
      }
    ]
  }
];

