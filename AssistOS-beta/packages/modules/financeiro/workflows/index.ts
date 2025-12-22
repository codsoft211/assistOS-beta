/**
 * FinanceiroModule - Workflows
 */

import type { WorkflowDefinition } from '../../base/module.interface';

export const financeiroWorkflows: WorkflowDefinition[] = [
  {
    name: 'invoice_lifecycle',
    entity: 'invoices',
    states: [
      { key: 'draft', label: 'Rascunho', color: '#94a3b8', isInitial: true },
      { key: 'sent', label: 'Enviada', color: '#3b82f6' },
      { key: 'paid', label: 'Paga', color: '#10b981', isFinal: true },
      { key: 'overdue', label: 'Vencida', color: '#f59e0b' },
      { key: 'cancelled', label: 'Cancelada', color: '#ef4444', isFinal: true },
    ],
    transitions: [
      { from: 'draft', to: 'sent', action: 'send' },
      { from: 'sent', to: 'paid', action: 'receive_payment' },
      { from: 'sent', to: 'overdue', action: 'check_due_date' },
      { from: 'overdue', to: 'paid', action: 'receive_payment' },
      { from: 'draft', to: 'cancelled', action: 'cancel' },
      { from: 'sent', to: 'cancelled', action: 'cancel' },
      { from: 'overdue', to: 'cancelled', action: 'cancel' },
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { from: 'draft', to: 'sent' },
        action: 'send_invoice_email'
      },
      {
        trigger: 'state_change',
        condition: { from: 'sent', to: 'paid' },
        action: 'send_payment_confirmation'
      },
      {
        trigger: 'time_based',
        action: 'check_overdue_invoices'
      }
    ]
  },
  
  {
    name: 'payment_reconciliation',
    entity: 'payments',
    states: [
      { key: 'pending', label: 'Pendente', color: '#94a3b8', isInitial: true },
      { key: 'matched', label: 'Correspondido', color: '#3b82f6' },
      { key: 'unmatched', label: 'Não correspondido', color: '#f59e0b' },
      { key: 'verified', label: 'Verificado', color: '#10b981', isFinal: true },
    ],
    transitions: [
      { from: 'pending', to: 'matched', action: 'auto_match' },
      { from: 'pending', to: 'unmatched', action: 'mark_unmatched' },
      { from: 'unmatched', to: 'matched', action: 'manual_match' },
      { from: 'matched', to: 'verified', action: 'verify' },
    ],
    automations: [
      {
        trigger: 'field_change',
        condition: { field: 'status', value: 'pending' },
        action: 'attempt_auto_match'
      }
    ]
  },
  
  {
    name: 'month_end_close',
    entity: 'financialPeriods',
    states: [
      { key: 'open', label: 'Aberto', color: '#10b981', isInitial: true },
      { key: 'reconciling', label: 'Em reconciliação', color: '#3b82f6' },
      { key: 'review', label: 'Em revisão', color: '#f59e0b' },
      { key: 'closed', label: 'Fechado', color: '#ef4444', isFinal: true },
    ],
    transitions: [
      { from: 'open', to: 'reconciling', action: 'start_close' },
      { from: 'reconciling', to: 'review', action: 'complete_reconciliation' },
      { from: 'review', to: 'closed', action: 'approve_close' },
      { from: 'review', to: 'reconciling', action: 'reject_close' },
    ],
    automations: [
      {
        trigger: 'time_based',
        action: 'generate_financial_reports'
      }
    ]
  }
];
