/**
 * Projetos Module Workflows
 * 
 * Stub implementation - will be expanded in next tasks
 * 
 * Planned workflows:
 * - Project Lifecycle: Planning -> Active -> On Hold -> Completed/Cancelled
 * - Phase Progress: Not Started -> In Progress -> Completed/Delayed
 * - Resource Lifecycle: Allocated -> In Use -> Released
 * - Document Workflow: Draft -> Review -> Approved -> Published
 */

import type { WorkflowDefinition } from '../../base/module.interface';

export const projetosWorkflows: WorkflowDefinition[] = [
  // TODO: Implement workflows in next task
  // Stub example - Project Lifecycle:
  // {
  //   name: 'Project Lifecycle',
  //   entity: 'projects',
  //   states: [
  //     { key: 'planning', label: 'Planning', color: '#3b82f6', isInitial: true },
  //     { key: 'active', label: 'Active', color: '#10b981' },
  //     { key: 'on_hold', label: 'On Hold', color: '#f59e0b' },
  //     { key: 'completed', label: 'Completed', color: '#6366f1', isFinal: true },
  //     { key: 'cancelled', label: 'Cancelled', color: '#ef4444', isFinal: true }
  //   ],
  //   transitions: [
  //     { from: 'planning', to: 'active', action: 'start_project', label: 'Start Project' },
  //     { from: 'active', to: 'on_hold', action: 'pause_project', label: 'Pause' },
  //     { from: 'on_hold', to: 'active', action: 'resume_project', label: 'Resume' },
  //     { from: 'active', to: 'completed', action: 'complete_project', label: 'Complete' },
  //     { from: '*', to: 'cancelled', action: 'cancel_project', label: 'Cancel' }
  //   ]
  // }
];
