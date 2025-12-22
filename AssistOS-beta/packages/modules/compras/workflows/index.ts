/**
 * Compras Module Workflows
 * 
 * Procurement automation workflows: requisitions, RFQs, POs, receipts, invoices, payments.
 * AI-first design with multi-stage approval, 3-way matching, and exception handling.
 */

import type { WorkflowDefinition } from '../../base/module.interface';

export const comprasWorkflows: WorkflowDefinition[] = [
  // ============================================================================
  // 1. QUICK PURCHASE AUTOMATION
  // ============================================================================
  {
    name: 'Quick Purchase Automation',
    entity: 'purchase_requisitions',
    states: [
      {
        key: 'draft',
        label: 'Rascunho',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'auto_generated',
        label: 'Auto-gerado',
        color: '#60a5fa'
      },
      {
        key: 'po_created',
        label: 'PO Criado',
        color: '#34d399'
      },
      {
        key: 'receipt_registered',
        label: 'Recebimento Registado',
        color: '#fbbf24'
      },
      {
        key: 'invoice_received',
        label: 'Invoice Recebida',
        color: '#f97316'
      },
      {
        key: 'payment_scheduled',
        label: 'Pagamento Agendado',
        color: '#a78bfa'
      },
      {
        key: 'completed',
        label: 'Completado',
        color: '#10b981',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'draft', to: 'auto_generated', action: 'bulk_create', label: 'Criar em massa' },
      { from: 'auto_generated', to: 'po_created', action: 'auto_generate_po', label: 'Gerar PO' },
      { from: 'po_created', to: 'receipt_registered', action: 'register_receipt', label: 'Registar recebimento' },
      { from: 'receipt_registered', to: 'invoice_received', action: 'process_invoice', label: 'Processar invoice' },
      { from: 'invoice_received', to: 'payment_scheduled', action: 'schedule_payment', label: 'Agendar pagamento' },
      { from: 'payment_scheduled', to: 'completed', action: 'complete', label: 'Finalizar' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'auto_generated' },
        action: 'auto_generate_purchase_orders',
        params: { batch_size: 50 }
      },
      {
        trigger: 'state_change',
        condition: { to: 'po_created' },
        action: 'send_po_with_invoice_request',
        params: { include_invoice_link: true }
      },
      {
        trigger: 'state_change',
        condition: { to: 'invoice_received' },
        action: 'three_way_match_validation',
        params: { tolerance_percent: 5 }
      }
    ]
  },

  // ============================================================================
  // 2. REQUISITION APPROVAL WORKFLOW
  // ============================================================================
  {
    name: 'Requisition Approval Workflow',
    entity: 'purchase_requisitions',
    states: [
      {
        key: 'pending',
        label: 'Pendente',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'submitted',
        label: 'Submetido',
        color: '#60a5fa'
      },
      {
        key: 'manager_review',
        label: 'Revisão Gerente',
        color: '#fbbf24'
      },
      {
        key: 'finance_review',
        label: 'Revisão Financeira',
        color: '#f97316'
      },
      {
        key: 'approved',
        label: 'Aprovado',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'rejected',
        label: 'Rejeitado',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'pending', to: 'submitted', action: 'submit', label: 'Submeter' },
      { from: 'submitted', to: 'manager_review', action: 'send_to_manager', label: 'Enviar para gerente' },
      { from: 'manager_review', to: 'finance_review', action: 'manager_approve', label: 'Aprovação gerente' },
      { from: 'finance_review', to: 'approved', action: 'finance_approve', label: 'Aprovação financeira' },
      { from: '*', to: 'rejected', action: 'reject', label: 'Rejeitar' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'approved' },
        action: 'create_rfq_or_po',
        params: { threshold: 1000 }
      },
      {
        trigger: 'time_based',
        condition: {},
        action: 'escalate_to_senior_manager'
      }
    ]
  },

  // ============================================================================
  // 3. RFQ EVALUATION WORKFLOW
  // ============================================================================
  {
    name: 'RFQ Evaluation Workflow',
    entity: 'rfqs',
    states: [
      {
        key: 'draft',
        label: 'Rascunho',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'sent_to_suppliers',
        label: 'Enviado Fornecedores',
        color: '#60a5fa'
      },
      {
        key: 'quotes_received',
        label: 'Quotes Recebidas',
        color: '#34d399'
      },
      {
        key: 'quotes_evaluated',
        label: 'Quotes Avaliadas',
        color: '#fbbf24'
      },
      {
        key: 'quote_selected',
        label: 'Quote Selecionada',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'cancelled',
        label: 'Cancelado',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'draft', to: 'sent_to_suppliers', action: 'send', label: 'Enviar RFQ' },
      { from: 'sent_to_suppliers', to: 'quotes_received', action: 'receive_quotes', label: 'Receber quotes' },
      { from: 'quotes_received', to: 'quotes_evaluated', action: 'evaluate', label: 'Avaliar quotes' },
      { from: 'quotes_evaluated', to: 'quote_selected', action: 'select_best', label: 'Selecionar melhor' },
      { from: '*', to: 'cancelled', action: 'cancel', label: 'Cancelar' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'quotes_received' },
        action: 'evaluate_rfq_quotes',
        params: { 
          price_weight: 0.5,
          lead_time_weight: 0.3,
          supplier_score_weight: 0.2
        }
      },
      {
        trigger: 'state_change',
        condition: { to: 'quote_selected' },
        action: 'create_purchase_order_from_quote'
      }
    ]
  },

  // ============================================================================
  // 4. PO LIFECYCLE
  // ============================================================================
  {
    name: 'PO Lifecycle',
    entity: 'purchase_orders',
    states: [
      {
        key: 'draft',
        label: 'Rascunho',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'pending_approval',
        label: 'Aguardando Aprovação',
        color: '#60a5fa'
      },
      {
        key: 'approved',
        label: 'Aprovado',
        color: '#34d399'
      },
      {
        key: 'sent_to_supplier',
        label: 'Enviado Fornecedor',
        color: '#fbbf24'
      },
      {
        key: 'acknowledged',
        label: 'Confirmado',
        color: '#a78bfa'
      },
      {
        key: 'partially_received',
        label: 'Parcialmente Recebido',
        color: '#f97316'
      },
      {
        key: 'fully_received',
        label: 'Totalmente Recebido',
        color: '#10b981'
      },
      {
        key: 'completed',
        label: 'Completado',
        color: '#059669',
        isFinal: true
      },
      {
        key: 'cancelled',
        label: 'Cancelado',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'draft', to: 'pending_approval', action: 'submit_for_approval', label: 'Submeter aprovação' },
      { from: 'pending_approval', to: 'approved', action: 'approve', label: 'Aprovar' },
      { from: 'approved', to: 'sent_to_supplier', action: 'send', label: 'Enviar' },
      { from: 'sent_to_supplier', to: 'acknowledged', action: 'acknowledge', label: 'Confirmar' },
      { from: 'acknowledged', to: 'partially_received', action: 'partial_receive', label: 'Receber parcial' },
      { from: 'acknowledged', to: 'fully_received', action: 'full_receive', label: 'Receber total' },
      { from: 'partially_received', to: 'fully_received', action: 'complete_receive', label: 'Completar recebimento' },
      { from: 'fully_received', to: 'completed', action: 'close_po', label: 'Fechar PO' },
      { from: '*', to: 'cancelled', action: 'cancel', label: 'Cancelar' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'sent_to_supplier' },
        action: 'send_po_with_invoice_request',
        params: { include_invoice_link: true }
      },
      {
        trigger: 'state_change',
        condition: { to: 'fully_received' },
        action: 'validate_receipt_vs_po',
        params: { strict_mode: true }
      },
      {
        trigger: 'time_based',
        condition: {},
        action: 'track_po_delivery'
      }
    ]
  },

  // ============================================================================
  // 5. RECEIPT VALIDATION WORKFLOW
  // ============================================================================
  {
    name: 'Receipt Validation Workflow',
    entity: 'receipts',
    states: [
      {
        key: 'pending_inspection',
        label: 'Aguardando Inspeção',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'under_inspection',
        label: 'Em Inspeção',
        color: '#60a5fa'
      },
      {
        key: 'quality_check',
        label: 'Verificação Qualidade',
        color: '#fbbf24'
      },
      {
        key: 'accepted',
        label: 'Aceite',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'partial_rejection',
        label: 'Rejeição Parcial',
        color: '#f97316',
        isFinal: true
      },
      {
        key: 'full_rejection',
        label: 'Rejeição Total',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'pending_inspection', to: 'under_inspection', action: 'start_inspection', label: 'Iniciar inspeção' },
      { from: 'under_inspection', to: 'quality_check', action: 'check_quality', label: 'Verificar qualidade' },
      { from: 'quality_check', to: 'accepted', action: 'accept', label: 'Aceitar' },
      { from: 'quality_check', to: 'partial_rejection', action: 'partial_reject', label: 'Rejeitar parcial' },
      { from: 'quality_check', to: 'full_rejection', action: 'full_reject', label: 'Rejeitar total' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'accepted' },
        action: 'validate_receipt_vs_po',
        params: { strict_mode: false }
      },
      {
        trigger: 'state_change',
        condition: { to: 'partial_rejection' },
        action: 'create_return',
        params: { auto_create: true }
      },
      {
        trigger: 'state_change',
        condition: { to: 'full_rejection' },
        action: 'create_return',
        params: { auto_create: true, return_all: true }
      }
    ]
  },

  // ============================================================================
  // 6. INVOICE MATCHING WORKFLOW (3-WAY MATCH)
  // ============================================================================
  {
    name: 'Invoice Matching Workflow',
    entity: 'purchasing_invoices',
    states: [
      {
        key: 'draft',
        label: 'Rascunho',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'pending_approval',
        label: 'Aguardando Aprovação',
        color: '#60a5fa'
      },
      {
        key: 'under_review',
        label: 'Em Revisão',
        color: '#fbbf24'
      },
      {
        key: 'matched',
        label: '3-Way Match OK',
        color: '#34d399'
      },
      {
        key: 'discrepancy',
        label: 'Discrepância',
        color: '#f97316'
      },
      {
        key: 'override',
        label: 'Override Aprovado',
        color: '#a78bfa'
      },
      {
        key: 'approved',
        label: 'Aprovado',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'rejected',
        label: 'Rejeitado',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'draft', to: 'pending_approval', action: 'submit', label: 'Submeter' },
      { from: 'pending_approval', to: 'under_review', action: 'start_review', label: 'Iniciar revisão' },
      { from: 'under_review', to: 'matched', action: 'auto_match', label: 'Match automático' },
      { from: 'under_review', to: 'discrepancy', action: 'detect_discrepancy', label: 'Detectar discrepância' },
      { from: 'discrepancy', to: 'override', action: 'approve_with_override', label: 'Aprovar com override' },
      { from: 'matched', to: 'approved', action: 'approve', label: 'Aprovar' },
      { from: 'override', to: 'approved', action: 'finalize', label: 'Finalizar' },
      { from: '*', to: 'rejected', action: 'reject', label: 'Rejeitar' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'pending_approval' },
        action: 'process_invoice_ocr',
        params: { engine: 'tesseract' }
      },
      {
        trigger: 'state_change',
        condition: { to: 'under_review' },
        action: 'three_way_match_validation',
        params: { tolerance_percent: 5 }
      },
      {
        trigger: 'state_change',
        condition: { to: 'approved' },
        action: 'create_payment',
        params: { auto_allocate: true }
      }
    ]
  },

  // ============================================================================
  // 7. SUPPLIER RETURN WORKFLOW
  // ============================================================================
  {
    name: 'Supplier Return Workflow',
    entity: 'supplier_returns',
    states: [
      {
        key: 'initiated',
        label: 'Iniciado',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'authorized',
        label: 'Autorizado',
        color: '#60a5fa'
      },
      {
        key: 'shipped_to_supplier',
        label: 'Enviado Fornecedor',
        color: '#fbbf24'
      },
      {
        key: 'received_by_supplier',
        label: 'Recebido Fornecedor',
        color: '#34d399'
      },
      {
        key: 'credit_issued',
        label: 'Credit Note Emitida',
        color: '#a78bfa'
      },
      {
        key: 'completed',
        label: 'Completado',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'disputed',
        label: 'Em Disputa',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'initiated', to: 'authorized', action: 'authorize', label: 'Autorizar' },
      { from: 'authorized', to: 'shipped_to_supplier', action: 'ship', label: 'Enviar' },
      { from: 'shipped_to_supplier', to: 'received_by_supplier', action: 'confirm_receipt', label: 'Confirmar recebimento' },
      { from: 'received_by_supplier', to: 'credit_issued', action: 'issue_credit', label: 'Emitir credit note' },
      { from: 'credit_issued', to: 'completed', action: 'complete', label: 'Completar' },
      { from: '*', to: 'disputed', action: 'dispute', label: 'Disputar' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'authorized' },
        action: 'send_rma_to_supplier'
      },
      {
        trigger: 'state_change',
        condition: { to: 'credit_issued' },
        action: 'allocate_credit_to_invoices'
      }
    ]
  },

  // ============================================================================
  // 8. EXPENSE APPROVAL WORKFLOW
  // ============================================================================
  {
    name: 'Expense Approval Workflow',
    entity: 'employee_expenses',
    states: [
      {
        key: 'draft',
        label: 'Rascunho',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'submitted',
        label: 'Submetido',
        color: '#60a5fa'
      },
      {
        key: 'manager_review',
        label: 'Revisão Gerente',
        color: '#fbbf24'
      },
      {
        key: 'finance_review',
        label: 'Revisão Financeira',
        color: '#f97316'
      },
      {
        key: 'approved',
        label: 'Aprovado',
        color: '#10b981'
      },
      {
        key: 'payment_scheduled',
        label: 'Pagamento Agendado',
        color: '#a78bfa'
      },
      {
        key: 'reimbursed',
        label: 'Reembolsado',
        color: '#059669',
        isFinal: true
      },
      {
        key: 'rejected',
        label: 'Rejeitado',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'draft', to: 'submitted', action: 'submit', label: 'Submeter' },
      { from: 'submitted', to: 'manager_review', action: 'send_to_manager', label: 'Enviar gerente' },
      { from: 'manager_review', to: 'finance_review', action: 'manager_approve', label: 'Aprovação gerente' },
      { from: 'finance_review', to: 'approved', action: 'finance_approve', label: 'Aprovação financeira' },
      { from: 'approved', to: 'payment_scheduled', action: 'schedule_payment', label: 'Agendar pagamento' },
      { from: 'payment_scheduled', to: 'reimbursed', action: 'reimburse', label: 'Reembolsar' },
      { from: '*', to: 'rejected', action: 'reject', label: 'Rejeitar' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'approved' },
        action: 'allocate_expense_to_project',
        params: { auto_allocate: true }
      },
      {
        trigger: 'state_change',
        condition: { to: 'payment_scheduled' },
        action: 'create_payment_batch'
      },
      {
        trigger: 'time_based',
        condition: {},
        action: 'auto_approve_small_expenses',
        params: { threshold: 50 }
      }
    ]
  }
];
