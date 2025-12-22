/**
 * Angariação Module Workflows
 * 
 * Definição de workflows de automação para gestão de leads.
 */

import type { WorkflowDefinition } from '../../base/module.interface';

export const angariacaoWorkflows: WorkflowDefinition[] = [
  {
    name: 'Automatic scoring for new leads',
    entity: 'commercial_leads',
    states: [
      {
        key: 'new',
        label: 'New',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'contacted',
        label: 'Contacted',
        color: '#60a5fa'
      },
      {
        key: 'qualified',
        label: 'Qualified',
        color: '#34d399'
      },
      {
        key: 'nurturing',
        label: 'Nurturing',
        color: '#fbbf24'
      },
      {
        key: 'converted',
        label: 'Converted',
        color: '#10b981',
        isFinal: true
      },
      {
        key: 'lost',
        label: 'Lost',
        color: '#ef4444',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'new', to: 'contacted', action: 'contact', label: 'Contact' },
      { from: 'contacted', to: 'qualified', action: 'qualify', label: 'Qualify' },
      { from: 'contacted', to: 'nurturing', action: 'nurture', label: 'Nurture' },
      { from: 'nurturing', to: 'qualified', action: 'qualify', label: 'Qualify' },
      { from: 'qualified', to: 'converted', action: 'convert', label: 'Convert' },
      { from: '*', to: 'lost', action: 'lose', label: 'Mark as Lost' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'new' },
        action: 'apply_scoring_rules',
        params: { autoQualify: true }
      },
      {
        trigger: 'state_change',
        condition: { to: 'qualified' },
        action: 'notify_sales_team',
        params: { template: 'new_qualified_lead' }
      },
      {
        trigger: 'state_change',
        condition: { to: 'converted' },
        action: 'create_client_record',
        params: { syncFields: true }
      }
    ]
  },
  
  {
    name: 'Automatic lead assignment',
    entity: 'commercial_leads',
    states: [
      {
        key: 'unassigned',
        label: 'Unassigned',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'assigned',
        label: 'Assigned',
        color: '#60a5fa',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'unassigned', to: 'assigned', action: 'auto_assign', label: 'Assign Automatically' }
    ],
    automations: [
      {
        trigger: 'state_change',
        condition: { to: 'assigned' },
        action: 'auto_assign_to_sales_rep',
        params: { 
          method: 'round_robin', 
          criteria: { 
            minScore: 70,
            excludeNurturing: true
          }
        }
      },
      {
        trigger: 'state_change',
        condition: { to: 'assigned' },
        action: 'send_notification',
        params: { 
          type: 'email',
          template: 'lead_assigned'
        }
      }
    ]
  },
  
  {
    name: 'Nurturing unqualified leads',
    entity: 'commercial_leads',
    states: [
      {
        key: 'cold',
        label: 'Cold',
        color: '#94a3b8',
        isInitial: true
      },
      {
        key: 'warming',
        label: 'Warming',
        color: '#fbbf24'
      },
      {
        key: 'hot',
        label: 'Hot',
        color: '#f97316'
      },
      {
        key: 'ready',
        label: 'Ready',
        color: '#10b981',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'cold', to: 'warming', action: 'engage', label: 'Start Engagement' },
      { from: 'warming', to: 'hot', action: 'increase_engagement', label: 'Increase Engagement' },
      { from: 'hot', to: 'ready', action: 'qualify_for_sales', label: 'Qualify for Sales' }
    ],
    automations: [
      {
        trigger: 'time_based',
        action: 'send_nurture_emails',
        params: { 
          segmentBy: 'score',
          segments: [
            { minScore: 0, maxScore: 30, template: 'nurture_cold' },
            { minScore: 31, maxScore: 60, template: 'nurture_warm' },
            { minScore: 61, maxScore: 69, template: 'nurture_hot' }
          ]
        }
      },
      {
        trigger: 'time_based',
        action: 'review_nurture_performance',
        params: { 
          updateScores: true,
          autoQualify: true,
          minScoreForQualification: 70
        }
      },
      {
        trigger: 'field_change',
        condition: { field: 'lastActivityAt' },
        action: 'increment_engagement_score',
        params: { points: 5 }
      },
      {
        trigger: 'field_change',
        condition: { field: 'lastActivityAt' },
        action: 'increment_engagement_score',
        params: { points: 10 }
      },
      {
        trigger: 'field_change',
        condition: { field: 'lastActivityAt' },
        action: 'increment_engagement_score',
        params: { points: 20, autoQualify: true }
      }
    ]
  },
  
  {
    name: 'Cleanup of inactive leads',
    entity: 'commercial_leads',
    states: [
      {
        key: 'active',
        label: 'Active',
        color: '#10b981',
        isInitial: true
      },
      {
        key: 'dormant',
        label: 'Inactive',
        color: '#fbbf24'
      },
      {
        key: 'archived',
        label: 'Archived',
        color: '#6b7280',
        isFinal: true
      }
    ],
    transitions: [
      { from: 'active', to: 'dormant', action: 'mark_dormant', label: 'Mark as Inactive' },
      { from: 'dormant', to: 'archived', action: 'archive', label: 'Archive' },
      { from: 'dormant', to: 'active', action: 'reactivate', label: 'Reactivate' }
    ],
    automations: [
      {
        trigger: 'time_based',
        action: 'identify_dormant_leads',
        params: { 
          inactiveDays: 90,
          excludeStatus: ['qualified', 'converted']
        }
      },
      {
        trigger: 'time_based',
        action: 'archive_old_leads',
        params: { 
          dormantDays: 180,
          autoArchive: true
        }
      }
    ]
  }
];
