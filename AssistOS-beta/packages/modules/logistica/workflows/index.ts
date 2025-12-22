/**
 * LogísticaModule - Workflows
 * 
 * Equipment allocation, conflict resolution, and preventive maintenance workflows
 */

export const logisticaWorkflows = [
  {
    name: 'equipment_allocation',
    displayName: 'Alocação de Equipamento',
    description: 'Workflow completo desde reserva até devolução',
    states: ['reserved', 'checked_out', 'in_use', 'checked_in', 'completed', 'cancelled'],
    transitions: [
      { from: 'reserved', to: 'checked_out', trigger: 'checkout', conditions: ['allocation_confirmed', 'equipment_available'] },
      { from: 'checked_out', to: 'in_use', trigger: 'start_usage', conditions: ['project_active'] },
      { from: 'in_use', to: 'checked_in', trigger: 'checkin', conditions: ['equipment_returned'] },
      { from: 'checked_in', to: 'completed', trigger: 'complete', conditions: ['condition_verified', 'no_damages'] },
      { from: ['reserved', 'checked_out'], to: 'cancelled', trigger: 'cancel', conditions: ['not_in_use'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'reserved',
        to: 'checked_out',
        actions: ['update_inventory_reserved', 'create_notification', 'log_checkout']
      },
      {
        trigger: 'state_change',
        from: 'checked_in',
        to: 'completed',
        actions: ['restore_inventory_available', 'create_condition_report', 'calculate_usage_stats']
      },
      {
        trigger: 'scheduled',
        schedule: 'daily',
        actions: ['check_overdue_returns', 'send_reminder_notifications']
      }
    ]
  },
  
  {
    name: 'conflict_resolution',
    displayName: 'Resolução de Conflitos',
    description: 'Detecção e resolução automática de overbooking',
    states: ['detected', 'analyzing', 'proposed_solution', 'resolved', 'escalated'],
    transitions: [
      { from: 'detected', to: 'analyzing', trigger: 'start_analysis', conditions: ['conflict_verified'] },
      { from: 'analyzing', to: 'proposed_solution', trigger: 'generate_solution', conditions: ['alternatives_found'] },
      { from: 'analyzing', to: 'escalated', trigger: 'escalate', conditions: ['no_alternatives_found'] },
      { from: 'proposed_solution', to: 'resolved', trigger: 'apply_solution', conditions: ['solution_accepted'] },
      { from: 'proposed_solution', to: 'escalated', trigger: 'reject_solution', conditions: ['solution_rejected'] },
    ],
    automations: [
      {
        trigger: 'new_allocation',
        actions: ['check_conflicts', 'create_alert_if_conflict']
      },
      {
        trigger: 'state_change',
        from: 'detected',
        to: 'analyzing',
        actions: ['analyze_alternatives', 'suggest_reallocations']
      },
      {
        trigger: 'scheduled',
        schedule: 'hourly',
        actions: ['scan_upcoming_conflicts', 'send_proactive_alerts']
      }
    ]
  },
  
  {
    name: 'preventive_maintenance',
    displayName: 'Manutenção Preventiva',
    description: 'Agendamento e execução de manutenção preventiva',
    states: ['scheduled', 'due', 'in_progress', 'completed', 'overdue'],
    transitions: [
      { from: 'scheduled', to: 'due', trigger: 'check_date', conditions: ['maintenance_date_approaching'] },
      { from: 'due', to: 'in_progress', trigger: 'start_maintenance', conditions: ['technician_assigned'] },
      { from: 'in_progress', to: 'completed', trigger: 'complete_maintenance', conditions: ['checklist_completed'] },
      { from: 'due', to: 'overdue', trigger: 'check_date', conditions: ['past_due_date'] },
      { from: 'overdue', to: 'in_progress', trigger: 'start_maintenance', conditions: ['technician_assigned'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'scheduled',
        to: 'due',
        actions: ['notify_maintenance_team', 'reserve_equipment_downtime']
      },
      {
        trigger: 'state_change',
        from: 'in_progress',
        to: 'completed',
        actions: ['release_equipment', 'schedule_next_maintenance', 'update_equipment_history']
      },
      {
        trigger: 'scheduled',
        schedule: 'daily',
        actions: ['check_upcoming_maintenance', 'send_reminders', 'check_overdue']
      }
    ]
  },
  
  {
    name: 'three_step_receipt',
    displayName: 'Receção em 3 Etapas',
    description: 'Receção → Controlo Qualidade → Armazenamento',
    states: ['receiving', 'quality_check', 'putaway', 'completed'],
    transitions: [
      { from: 'receiving', to: 'quality_check', trigger: 'goods_received', conditions: ['receipt_confirmed'] },
      { from: 'quality_check', to: 'putaway', trigger: 'quality_approved', conditions: ['inspection_passed'] },
      { from: 'quality_check', to: 'receiving', trigger: 'quality_rejected', conditions: ['inspection_failed'] },
      { from: 'putaway', to: 'completed', trigger: 'stored', conditions: ['location_confirmed'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'quality_check',
        to: 'putaway',
        actions: ['suggest_storage_location', 'create_putaway_task']
      },
      {
        trigger: 'state_change',
        from: 'putaway',
        to: 'completed',
        actions: ['update_stock_levels', 'close_receipt_order']
      }
    ]
  },
  
  {
    name: 'two_step_delivery',
    displayName: 'Expedição em 2 Etapas',
    description: 'Picking → Embalagem → Expedição',
    states: ['picking', 'packing', 'shipping', 'completed'],
    transitions: [
      { from: 'picking', to: 'packing', trigger: 'items_picked', conditions: ['picking_complete'] },
      { from: 'packing', to: 'shipping', trigger: 'packed', conditions: ['packing_verified'] },
      { from: 'shipping', to: 'completed', trigger: 'shipped', conditions: ['carrier_confirmed'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'picking',
        to: 'packing',
        actions: ['create_packing_list', 'reserve_packing_station']
      },
      {
        trigger: 'state_change',
        from: 'packing',
        to: 'shipping',
        actions: ['generate_shipping_label', 'notify_carrier']
      },
      {
        trigger: 'state_change',
        from: 'shipping',
        to: 'completed',
        actions: ['update_stock_levels', 'send_tracking_notification']
      }
    ]
  },
  
  {
    name: 'cycle_count_automation',
    displayName: 'Contagem Cíclica Automatizada',
    description: 'Agendamento → Contagem → Ajuste',
    states: ['scheduled', 'counting', 'reconciling', 'completed'],
    transitions: [
      { from: 'scheduled', to: 'counting', trigger: 'start_count', conditions: ['counter_assigned'] },
      { from: 'counting', to: 'reconciling', trigger: 'count_complete', conditions: ['all_items_counted'] },
      { from: 'reconciling', to: 'completed', trigger: 'adjust_stock', conditions: ['discrepancies_resolved'] },
    ],
    automations: [
      {
        trigger: 'scheduled',
        schedule: 'weekly',
        actions: ['select_items_for_count', 'assign_counters']
      },
      {
        trigger: 'state_change',
        from: 'reconciling',
        to: 'completed',
        actions: ['update_stock_levels', 'create_adjustment_transaction', 'generate_variance_report']
      }
    ]
  }
];
