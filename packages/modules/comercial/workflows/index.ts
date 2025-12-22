/**
 * Comercial Module Workflows
 * 
 * Definição do pipeline de vendas e workflows comerciais.
 */

import type { WorkflowDefinition } from '../../base/module.interface';

export const comercialWorkflows: WorkflowDefinition[] = [
  {
    name: 'Lead Pipeline',
    entity: 'leads',
    states: [
      {
        key: 'novo',
        label: 'New',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'contactado',
        label: 'Contacted',
        color: '#60a5fa'
      },
      {
        key: 'qualificado',
        label: 'Qualified',
        color: '#34d399'
      },
      {
        key: 'proposta_enviada',
        label: 'Proposal Sent',
        color: '#fbbf24'
      },
      {
        key: 'negociacao',
        label: 'Negotiation',
        color: '#f97316'
      },
      {
        key: 'ganho',
        label: 'Won',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'perdido',
        label: 'Lost',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'novo', to: 'contactado', action: 'contact', label: 'Contact' },
      { from: 'contactado', to: 'qualificado', action: 'qualify', label: 'Qualify' },
      { from: 'qualificado', to: 'proposta_enviada', action: 'send_proposal', label: 'Send Proposal' },
      { from: 'proposta_enviada', to: 'negociacao', action: 'negotiate', label: 'Negotiate' },
      { from: 'negociacao', to: 'ganho', action: 'win', label: 'Win' },
      { from: '*', to: 'perdido', action: 'lose', label: 'Lose' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'proposta_enviada' },
        action: 'send_proposal_email',
        params: { template: 'proposal' }
      },
      {
        trigger: 'state_change',
        condition: { to: 'ganho' },
        action: 'create_customer_record'
      }
    ]
  },
  
  {
    name: 'Quote Workflow',
    entity: 'quotes',
    states: [
      {
        key: 'draft',
        label: 'Draft',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'sent',
        label: 'Sent',
        color: '#60a5fa'
      },
      {
        key: 'accepted',
        label: 'Accepted',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'rejected',
        label: 'Rejected',
        color: '#ef4444',
        isFinal: true
      },
      {
        key: 'expired',
        label: 'Expired',
        color: '#6b7280',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'draft', to: 'sent', action: 'send', label: 'Send' },
      { from: 'sent', to: 'accepted', action: 'accept', label: 'Accept' },
      { from: 'sent', to: 'rejected', action: 'reject', label: 'Reject' },
      { from: 'sent', to: 'expired', action: 'expire', label: 'Expire' }
    ]
  },
  
  {
    name: 'Order Fulfillment',
    entity: 'orders',
    states: [
      {
        key: 'pending',
        label: 'Pending',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'confirmed',
        label: 'Confirmed',
        color: '#60a5fa'
      },
      {
        key: 'processing',
        label: 'Processing',
        color: '#fbbf24'
      },
      {
        key: 'shipped',
        label: 'Shipped',
        color: '#a78bfa'
      },
      {
        key: 'delivered',
        label: 'Delivered',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'cancelled',
        label: 'Cancelled',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'pending', to: 'confirmed', action: 'confirm', label: 'Confirm' },
      { from: 'confirmed', to: 'processing', action: 'start_processing', label: 'Start Processing' },
      { from: 'processing', to: 'shipped', action: 'ship', label: 'Ship' },
      { from: 'shipped', to: 'delivered', action: 'deliver', label: 'Deliver' },
      { from: '*', to: 'cancelled', action: 'cancel', label: 'Cancel' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'shipped' },
        action: 'send_tracking_email'
      },
      {
        trigger: 'state_change',
        condition: { to: 'delivered' },
        action: 'request_feedback'
      }
    ]
  }
];
