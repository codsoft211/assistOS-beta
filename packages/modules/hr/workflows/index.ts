/**
 * HR Module - Workflows
 * 
 * Employee lifecycle, leave management, and performance review workflows
 */

export const hrWorkflows = [
  {
    name: 'employee_onboarding',
    displayName: 'Employee Onboarding',
    description: 'Complete onboarding workflow from hire to productive employee',
    states: ['pending', 'documents_collection', 'system_setup', 'training', 'probation', 'completed'],
    transitions: [
      { from: 'pending', to: 'documents_collection', trigger: 'start_onboarding', conditions: ['offer_accepted'] },
      { from: 'documents_collection', to: 'system_setup', trigger: 'documents_complete', conditions: ['all_documents_received'] },
      { from: 'system_setup', to: 'training', trigger: 'systems_ready', conditions: ['accounts_created', 'equipment_assigned'] },
      { from: 'training', to: 'probation', trigger: 'training_complete', conditions: ['mandatory_training_done'] },
      { from: 'probation', to: 'completed', trigger: 'probation_pass', conditions: ['performance_acceptable'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'pending',
        to: 'documents_collection',
        actions: ['send_welcome_email', 'create_onboarding_checklist', 'notify_hr_team']
      },
      {
        trigger: 'state_change',
        from: 'system_setup',
        to: 'training',
        actions: ['schedule_orientation', 'assign_buddy', 'create_training_plan']
      },
      {
        trigger: 'state_change',
        from: 'probation',
        to: 'completed',
        actions: ['update_employee_status', 'notify_manager', 'schedule_benefits_enrollment']
      }
    ]
  },
  
  {
    name: 'leave_request_approval',
    displayName: 'Leave Request Approval',
    description: 'Leave request submission and approval workflow',
    states: ['draft', 'pending', 'approved', 'rejected', 'cancelled'],
    transitions: [
      { from: 'draft', to: 'pending', trigger: 'submit', conditions: ['dates_valid', 'balance_available'] },
      { from: 'pending', to: 'approved', trigger: 'approve', conditions: ['manager_approval'] },
      { from: 'pending', to: 'rejected', trigger: 'reject', conditions: [] },
      { from: ['draft', 'pending'], to: 'cancelled', trigger: 'cancel', conditions: ['not_started'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'draft',
        to: 'pending',
        actions: ['notify_manager', 'check_conflicts', 'calculate_days']
      },
      {
        trigger: 'state_change',
        from: 'pending',
        to: 'approved',
        actions: ['update_leave_balance', 'notify_employee', 'update_calendar', 'notify_team']
      },
      {
        trigger: 'state_change',
        from: 'pending',
        to: 'rejected',
        actions: ['notify_employee', 'restore_tentative_balance']
      }
    ]
  },
  
  {
    name: 'performance_review',
    displayName: 'Performance Review Cycle',
    description: 'Annual/quarterly performance review process',
    states: ['scheduled', 'self_assessment', 'manager_review', 'calibration', 'feedback_session', 'completed', 'archived'],
    transitions: [
      { from: 'scheduled', to: 'self_assessment', trigger: 'start_cycle', conditions: ['review_period_started'] },
      { from: 'self_assessment', to: 'manager_review', trigger: 'submit_self_assessment', conditions: ['self_assessment_complete'] },
      { from: 'manager_review', to: 'calibration', trigger: 'submit_manager_review', conditions: ['manager_review_complete'] },
      { from: 'calibration', to: 'feedback_session', trigger: 'calibration_complete', conditions: ['ratings_calibrated'] },
      { from: 'feedback_session', to: 'completed', trigger: 'feedback_delivered', conditions: ['meeting_completed', 'employee_acknowledged'] },
      { from: 'completed', to: 'archived', trigger: 'archive', conditions: ['retention_period_met'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'scheduled',
        to: 'self_assessment',
        actions: ['notify_employee', 'send_self_assessment_form', 'set_deadline']
      },
      {
        trigger: 'state_change',
        from: 'self_assessment',
        to: 'manager_review',
        actions: ['notify_manager', 'provide_team_context', 'set_manager_deadline']
      },
      {
        trigger: 'state_change',
        from: 'feedback_session',
        to: 'completed',
        actions: ['update_employee_record', 'trigger_compensation_review', 'create_development_plan']
      },
      {
        trigger: 'scheduled',
        schedule: 'daily',
        actions: ['check_overdue_assessments', 'send_reminders']
      }
    ]
  },
  
  {
    name: 'employee_offboarding',
    displayName: 'Employee Offboarding',
    description: 'Complete offboarding workflow for departing employees',
    states: ['notice_given', 'knowledge_transfer', 'exit_interview', 'asset_return', 'final_settlement', 'completed'],
    transitions: [
      { from: 'notice_given', to: 'knowledge_transfer', trigger: 'start_offboarding', conditions: ['notice_period_started'] },
      { from: 'knowledge_transfer', to: 'exit_interview', trigger: 'transfer_complete', conditions: ['documentation_done'] },
      { from: 'exit_interview', to: 'asset_return', trigger: 'interview_complete', conditions: ['exit_interview_conducted'] },
      { from: 'asset_return', to: 'final_settlement', trigger: 'assets_returned', conditions: ['all_assets_collected'] },
      { from: 'final_settlement', to: 'completed', trigger: 'settlement_done', conditions: ['final_pay_processed', 'access_revoked'] },
    ],
    automations: [
      {
        trigger: 'state_change',
        from: 'notice_given',
        to: 'knowledge_transfer',
        actions: ['create_offboarding_checklist', 'notify_it_team', 'notify_manager', 'schedule_exit_interview']
      },
      {
        trigger: 'state_change',
        from: 'asset_return',
        to: 'final_settlement',
        actions: ['calculate_final_pay', 'prepare_clearance_form', 'generate_experience_letter']
      },
      {
        trigger: 'state_change',
        from: 'final_settlement',
        to: 'completed',
        actions: ['revoke_all_access', 'archive_employee_data', 'update_org_chart', 'close_payroll_account']
      }
    ]
  },
  
  {
    name: 'payroll_processing',
    displayName: 'Payroll Processing',
    description: 'Monthly payroll calculation and processing workflow',
    states: ['preparation', 'calculation', 'review', 'approval', 'processing', 'completed'],
    transitions: [
      { from: 'preparation', to: 'calculation', trigger: 'start_payroll', conditions: ['attendance_finalized', 'leave_approved'] },
      { from: 'calculation', to: 'review', trigger: 'calculation_complete', conditions: ['all_employees_processed'] },
      { from: 'review', to: 'approval', trigger: 'review_complete', conditions: ['discrepancies_resolved'] },
      { from: 'approval', to: 'processing', trigger: 'approve', conditions: ['manager_approval', 'finance_approval'] },
      { from: 'processing', to: 'completed', trigger: 'process_complete', conditions: ['payments_transferred'] },
    ],
    automations: [
      {
        trigger: 'scheduled',
        schedule: 'monthly',
        day: 25,
        actions: ['initiate_payroll_cycle', 'lock_attendance', 'notify_hr_team']
      },
      {
        trigger: 'state_change',
        from: 'calculation',
        to: 'review',
        actions: ['generate_payroll_report', 'flag_anomalies', 'calculate_taxes']
      },
      {
        trigger: 'state_change',
        from: 'processing',
        to: 'completed',
        actions: ['generate_payslips', 'send_payslips', 'update_accounting', 'create_audit_trail']
      }
    ]
  }
];

