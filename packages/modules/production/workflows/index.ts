/**
 * Production Module - Workflows
 * 
 * Production order, work order, and quality control workflows
 */

export const productionWorkflows = [
  {
    name: 'production_order_lifecycle',
    displayName: 'Production Order Lifecycle',
    description: 'Complete lifecycle from planning to completion',
    states: ['draft', 'planned', 'scheduled', 'released', 'in_progress', 'completed', 'cancelled'],
    transitions: [
      { from: 'draft', to: 'planned', trigger: 'plan', conditions: ['product_selected', 'quantity_set'] },
      { from: 'planned', to: 'scheduled', trigger: 'schedule', conditions: ['dates_set', 'resources_available'] },
      { from: 'scheduled', to: 'released', trigger: 'release', conditions: ['materials_available', 'work_center_ready'] },
      { from: 'released', to: 'in_progress', trigger: 'start', conditions: ['operator_assigned'] },
      { from: 'in_progress', to: 'completed', trigger: 'complete', conditions: ['quantity_met', 'quality_passed'] },
      { from: ['draft', 'planned', 'scheduled'], to: 'cancelled', trigger: 'cancel', conditions: [] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'planned',
        to: 'scheduled',
        actions: ['reserve_materials', 'reserve_capacity', 'notify_planning']
      },
      {
        trigger: 'state_change',
        from: 'scheduled',
        to: 'released',
        actions: ['generate_work_orders', 'create_material_requisitions', 'print_job_card']
      },
      {
        trigger: 'state_change',
        from: 'in_progress',
        to: 'completed',
        actions: ['update_inventory', 'release_materials', 'calculate_costs', 'update_kpis']
      },
      {
        trigger: 'scheduled',
        schedule: 'hourly',
        actions: ['check_overdue_orders', 'alert_delays']
      }
    ]
  },
  
  {
    name: 'work_order_execution',
    displayName: 'Work Order Execution',
    description: 'Shop floor work order execution workflow',
    states: ['pending', 'ready', 'in_progress', 'paused', 'completed', 'cancelled'],
    transitions: [
      { from: 'pending', to: 'ready', trigger: 'prepare', conditions: ['materials_staged', 'tooling_ready'] },
      { from: 'ready', to: 'in_progress', trigger: 'start', conditions: ['operator_clocked_in'] },
      { from: 'in_progress', to: 'paused', trigger: 'pause', conditions: [] },
      { from: 'paused', to: 'in_progress', trigger: 'resume', conditions: [] },
      { from: 'in_progress', to: 'completed', trigger: 'complete', conditions: ['output_recorded', 'quality_verified'] },
      { from: ['pending', 'ready'], to: 'cancelled', trigger: 'cancel', conditions: [] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'pending',
        to: 'ready',
        actions: ['send_to_work_center', 'prepare_tooling', 'stage_materials']
      },
      {
        trigger: 'state_change',
        from: 'ready',
        to: 'in_progress',
        actions: ['start_time_tracking', 'update_work_center_status']
      },
      {
        trigger: 'state_change',
        from: 'in_progress',
        to: 'completed',
        actions: ['stop_time_tracking', 'record_output', 'update_parent_order']
      }
    ]
  },
  
  {
    name: 'quality_inspection',
    displayName: 'Quality Inspection',
    description: 'Quality control inspection workflow',
    states: ['pending', 'sampling', 'testing', 'review', 'approved', 'rejected', 'conditional'],
    transitions: [
      { from: 'pending', to: 'sampling', trigger: 'start_inspection', conditions: ['inspector_assigned'] },
      { from: 'sampling', to: 'testing', trigger: 'samples_collected', conditions: ['sample_size_met'] },
      { from: 'testing', to: 'review', trigger: 'tests_complete', conditions: ['all_tests_run'] },
      { from: 'review', to: 'approved', trigger: 'approve', conditions: ['all_specs_met'] },
      { from: 'review', to: 'rejected', trigger: 'reject', conditions: ['critical_failure'] },
      { from: 'review', to: 'conditional', trigger: 'conditional_release', conditions: ['minor_deviations'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'review',
        to: 'approved',
        actions: ['release_to_inventory', 'generate_coa', 'notify_production']
      },
      {
        trigger: 'state_change',
        from: 'review',
        to: 'rejected',
        actions: ['quarantine_batch', 'create_ncr', 'notify_quality_manager']
      },
      {
        trigger: 'state_change',
        from: 'review',
        to: 'conditional',
        actions: ['create_deviation_report', 'require_approval', 'document_concession']
      }
    ]
  },
  
  {
    name: 'material_requisition',
    displayName: 'Material Requisition',
    description: 'Production material requisition workflow',
    states: ['requested', 'approved', 'picking', 'staged', 'issued', 'returned'],
    transitions: [
      { from: 'requested', to: 'approved', trigger: 'approve', conditions: ['stock_available', 'authorized'] },
      { from: 'approved', to: 'picking', trigger: 'start_pick', conditions: ['picker_assigned'] },
      { from: 'picking', to: 'staged', trigger: 'staging_complete', conditions: ['all_items_picked'] },
      { from: 'staged', to: 'issued', trigger: 'issue', conditions: ['production_confirmed'] },
      { from: 'issued', to: 'returned', trigger: 'return_excess', conditions: [] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'approved',
        to: 'picking',
        actions: ['create_pick_list', 'assign_picker', 'reserve_inventory']
      },
      {
        trigger: 'state_change',
        from: 'staged',
        to: 'issued',
        actions: ['deduct_inventory', 'link_to_work_order', 'record_consumption']
      },
      {
        trigger: 'state_change',
        from: 'issued',
        to: 'returned',
        actions: ['return_to_inventory', 'adjust_consumption', 'update_costing']
      }
    ]
  },
  
  {
    name: 'maintenance_request',
    displayName: 'Equipment Maintenance',
    description: 'Production equipment maintenance workflow',
    states: ['reported', 'assessed', 'scheduled', 'in_progress', 'testing', 'completed'],
    transitions: [
      { from: 'reported', to: 'assessed', trigger: 'assess', conditions: ['technician_assigned'] },
      { from: 'assessed', to: 'scheduled', trigger: 'schedule', conditions: ['parts_available', 'downtime_approved'] },
      { from: 'scheduled', to: 'in_progress', trigger: 'start', conditions: ['equipment_available'] },
      { from: 'in_progress', to: 'testing', trigger: 'repair_complete', conditions: ['work_done'] },
      { from: 'testing', to: 'completed', trigger: 'verify', conditions: ['tests_passed'] },
      { from: 'testing', to: 'in_progress', trigger: 'reopen', conditions: ['tests_failed'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'reported',
        to: 'assessed',
        actions: ['analyze_failure', 'estimate_downtime', 'check_parts_inventory']
      },
      {
        trigger: 'state_change',
        from: 'in_progress',
        to: 'testing',
        actions: ['run_test_protocol', 'verify_calibration']
      },
      {
        trigger: 'state_change',
        from: 'testing',
        to: 'completed',
        actions: ['release_equipment', 'update_maintenance_log', 'calculate_mttr']
      }
    ]
  }
];

