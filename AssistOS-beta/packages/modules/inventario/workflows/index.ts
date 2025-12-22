/**
 * Inventory Module - Workflow Definitions
 */

import type { WorkflowDefinition } from '../../base/module.interface';

export const inventarioWorkflows: WorkflowDefinition[] = [
  {
    name: 'Item Lifecycle',
    entity: 'products',
    states: [
      { key: 'draft', label: 'Rascunho', color: '#6B7280', isInitial: true },
      { key: 'active', label: 'Ativo', color: '#10B981' },
      { key: 'inactive', label: 'Inativo', color: '#F59E0B' },
      { key: 'discontinued', label: 'Descontinuado', color: '#EF4444', isFinal: true }
    ],
    transitions: [
      { from: 'draft', to: 'active', action: 'activate', label: 'Ativar' },
      { from: 'active', to: 'inactive', action: 'deactivate', label: 'Desativar' },
      { from: 'inactive', to: 'active', action: 'reactivate', label: 'Reativar' },
      { from: '*', to: 'discontinued', action: 'discontinue', label: 'Descontinuar' }
    ]
  },
  {
    name: 'Recipe Approval',
    entity: 'recipes',
    states: [
      { key: 'draft', label: 'Rascunho', color: '#6B7280', isInitial: true },
      { key: 'pending_review', label: 'Em Revisão', color: '#3B82F6' },
      { key: 'approved', label: 'Aprovado', color: '#10B981' },
      { key: 'archived', label: 'Arquivado', color: '#9CA3AF', isFinal: true }
    ],
    transitions: [
      { from: 'draft', to: 'pending_review', action: 'submit', label: 'Submeter para Revisão' },
      { from: 'pending_review', to: 'approved', action: 'approve', label: 'Aprovar' },
      { from: 'pending_review', to: 'draft', action: 'reject', label: 'Rejeitar' },
      { from: 'approved', to: 'archived', action: 'archive', label: 'Arquivar' }
    ]
  }
];
