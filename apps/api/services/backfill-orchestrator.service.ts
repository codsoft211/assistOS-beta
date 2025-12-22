import { Queue } from 'bullmq';
import { redisConnection } from '../../worker/config/redis';

interface BackfillTableConfig {
  name: string;
  batchSize: number;
  category: string;
}

const TABLES_TO_BACKFILL: BackfillTableConfig[] = [
  // ============================================================================
  // SMALL TABLES (< 10K rows) - Batch Size: 10,000
  // ============================================================================
  
  // Core Platform & Configuration (11 tables)
  { name: 'sequence_counters', batchSize: 10000, category: 'Core Platform' },
  { name: 'company_info', batchSize: 10000, category: 'Core Platform' },
  { name: 'modules', batchSize: 10000, category: 'Core Platform' },
  { name: 'module_interface_config', batchSize: 10000, category: 'Core Platform' },
  { name: 'tenant_modules', batchSize: 10000, category: 'Core Platform' },
  { name: 'module_features', batchSize: 10000, category: 'Core Platform' },
  { name: 'user_module_preferences', batchSize: 10000, category: 'Core Platform' },
  { name: 'tenant_blueprints', batchSize: 10000, category: 'Core Platform' },
  { name: 'user_tenants', batchSize: 10000, category: 'Core Platform' },
  { name: 'tenant_invitations', batchSize: 10000, category: 'Core Platform' },
  { name: 'tenant_context', batchSize: 10000, category: 'Core Platform' },

  // Users & Authentication (7 tables)
  { name: 'user_oauth_tokens', batchSize: 10000, category: 'Users & Auth' },
  { name: 'user_profiles', batchSize: 10000, category: 'Users & Auth' },
  { name: 'user_gmail_accounts', batchSize: 10000, category: 'Users & Auth' },
  { name: 'oauth_states', batchSize: 10000, category: 'Users & Auth' },
  { name: 'onboarding_cache', batchSize: 10000, category: 'Users & Auth' },
  { name: 'user_actions', batchSize: 10000, category: 'Users & Auth' },
  { name: 'detected_patterns', batchSize: 10000, category: 'Users & Auth' },

  // Notifications (3 tables)
  { name: 'notifications', batchSize: 10000, category: 'Notifications' },
  { name: 'notification_rules', batchSize: 10000, category: 'Notifications' },
  { name: 'conversation_insights', batchSize: 10000, category: 'Notifications' },

  // Proactive Intelligence (1 table)
  { name: 'proactive_insights', batchSize: 10000, category: 'AI Insights' },

  // Connectors & Integrations (6 tables)
  { name: 'connector_secrets', batchSize: 10000, category: 'Connectors' },
  { name: 'connector_instances', batchSize: 10000, category: 'Connectors' },
  { name: 'connector_sync_jobs', batchSize: 10000, category: 'Connectors' },
  { name: 'connector_sync_errors', batchSize: 10000, category: 'Connectors' },
  { name: 'connector_event_log', batchSize: 10000, category: 'Connectors' },
  { name: 'connector_sync_logs', batchSize: 10000, category: 'Connectors' },

  // Document Management - Metadata (5 tables)
  { name: 'document_providers', batchSize: 10000, category: 'Documents' },
  { name: 'document_shares', batchSize: 10000, category: 'Documents' },
  { name: 'document_tags', batchSize: 10000, category: 'Documents' },
  { name: 'document_folders', batchSize: 10000, category: 'Documents' },
  { name: 'document_analysis_results', batchSize: 10000, category: 'Documents' },

  // Quote Templates & Pricing (6 tables)
  { name: 'quote_templates', batchSize: 10000, category: 'Quote Templates' },
  { name: 'quote_template_sections', batchSize: 10000, category: 'Quote Templates' },
  { name: 'quote_template_line_items', batchSize: 10000, category: 'Quote Templates' },
  { name: 'quote_versions', batchSize: 10000, category: 'Quote Templates' },
  { name: 'quote_price_books', batchSize: 10000, category: 'Quote Templates' },
  { name: 'quote_price_items', batchSize: 10000, category: 'Quote Templates' },

  // Products (1 table)
  { name: 'products', batchSize: 10000, category: 'Products' },

  // Budgeting (3 tables)
  { name: 'budgets', batchSize: 10000, category: 'Budgeting' },
  { name: 'budget_lines', batchSize: 10000, category: 'Budgeting' },
  { name: 'budget_actuals', batchSize: 10000, category: 'Budgeting' },

  // Cost Templates (4 tables)
  { name: 'cost_templates', batchSize: 10000, category: 'Cost Templates' },
  { name: 'cost_template_sections', batchSize: 10000, category: 'Cost Templates' },
  { name: 'cost_template_line_items', batchSize: 10000, category: 'Cost Templates' },
  { name: 'cost_summaries', batchSize: 10000, category: 'Cost Templates' },

  // Rate Cards (2 tables)
  { name: 'rate_cards', batchSize: 10000, category: 'Rate Cards' },
  { name: 'rate_card_roles', batchSize: 10000, category: 'Rate Cards' },

  // Logistics & Warehouse (5 tables)
  { name: 'warehouses', batchSize: 10000, category: 'Logistics' },
  { name: 'warehouse_locations', batchSize: 10000, category: 'Logistics' },
  { name: 'stock_alerts', batchSize: 10000, category: 'Logistics' },

  // Production & Manufacturing (6 tables)
  { name: 'production_work_orders', batchSize: 10000, category: 'Manufacturing' },
  { name: 'production_operations', batchSize: 10000, category: 'Manufacturing' },
  { name: 'production_materials', batchSize: 10000, category: 'Manufacturing' },
  { name: 'production_quality_checks', batchSize: 10000, category: 'Manufacturing' },
  { name: 'production_defects', batchSize: 10000, category: 'Manufacturing' },
  { name: 'production_integrations', batchSize: 10000, category: 'Manufacturing' },

  // Catering-Specific (3 tables)
  { name: 'catering_kitchen_workflows', batchSize: 10000, category: 'Catering' },
  { name: 'catering_prep_lists', batchSize: 10000, category: 'Catering' },
  { name: 'catering_logistics', batchSize: 10000, category: 'Catering' },

  // Configuration Studio V2 (6 tables)
  { name: 'tenant_code_modules', batchSize: 10000, category: 'Studio' },
  { name: 'execution_plans', batchSize: 10000, category: 'Studio' },
  { name: 'sandbox_executions', batchSize: 10000, category: 'Studio' },
  { name: 'tenant_code_tests', batchSize: 10000, category: 'Studio' },
  { name: 'blueprint_usage_stats', batchSize: 10000, category: 'Studio' },
  { name: 'blueprint_improvements', batchSize: 10000, category: 'Studio' },

  // Governance (1 table)
  { name: 'governance_policies', batchSize: 10000, category: 'Governance' },

  // Gmail Integration - Settings (2 tables)
  { name: 'gmail_auto_responders', batchSize: 10000, category: 'Gmail' },
  { name: 'gmail_settings', batchSize: 10000, category: 'Gmail' },
  { name: 'gmail_templates', batchSize: 10000, category: 'Gmail' },

  // WhatsApp Integration - Settings (2 tables)
  { name: 'whatsapp_accounts', batchSize: 10000, category: 'WhatsApp' },
  { name: 'whatsapp_templates', batchSize: 10000, category: 'WhatsApp' },

  // ============================================================================
  // MEDIUM TABLES (10K-100K rows) - Batch Size: 5,000
  // ============================================================================

  // Audit & Logging (3 tables) - can grow large
  { name: 'audit_log', batchSize: 5000, category: 'Audit' },
  { name: 'studio_audit_log', batchSize: 5000, category: 'Audit' },
  { name: 'code_generation_audit', batchSize: 5000, category: 'Audit' },

  // CRM & Commercial (14 tables)
  { name: 'clients', batchSize: 5000, category: 'CRM' },
  { name: 'client_contacts', batchSize: 5000, category: 'CRM' },
  { name: 'client_documents', batchSize: 5000, category: 'CRM' },
  { name: 'leads', batchSize: 5000, category: 'CRM' },
  { name: 'lead_activities', batchSize: 5000, category: 'CRM' },
  { name: 'lead_scores', batchSize: 5000, category: 'CRM' },
  { name: 'opportunities', batchSize: 5000, category: 'CRM' },
  { name: 'opportunity_rules', batchSize: 5000, category: 'CRM' },
  { name: 'client_orders', batchSize: 5000, category: 'CRM' },
  { name: 'client_order_lines', batchSize: 5000, category: 'CRM' },
  { name: 'sales_pipelines', batchSize: 5000, category: 'CRM' },
  { name: 'sales_pipeline_stages', batchSize: 5000, category: 'CRM' },
  { name: 'quotes', batchSize: 5000, category: 'CRM' },
  { name: 'quote_lines', batchSize: 5000, category: 'CRM' },

  // Procurement & Suppliers (21 tables)
  { name: 'suppliers', batchSize: 5000, category: 'Procurement' },
  { name: 'supplier_contacts', batchSize: 5000, category: 'Procurement' },
  { name: 'supplier_documents', batchSize: 5000, category: 'Procurement' },
  { name: 'supplier_performance', batchSize: 5000, category: 'Procurement' },
  { name: 'supplier_embeddings', batchSize: 5000, category: 'Procurement' },
  { name: 'purchase_requisitions', batchSize: 5000, category: 'Procurement' },
  { name: 'purchase_requisition_lines', batchSize: 5000, category: 'Procurement' },
  { name: 'rfqs', batchSize: 5000, category: 'Procurement' },
  { name: 'rfq_lines', batchSize: 5000, category: 'Procurement' },
  { name: 'rfq_quotes', batchSize: 5000, category: 'Procurement' },
  { name: 'rfq_quote_lines', batchSize: 5000, category: 'Procurement' },
  { name: 'purchase_orders', batchSize: 5000, category: 'Procurement' },
  { name: 'purchase_order_lines', batchSize: 5000, category: 'Procurement' },
  { name: 'receipts', batchSize: 5000, category: 'Procurement' },
  { name: 'receipt_lines', batchSize: 5000, category: 'Procurement' },
  { name: 'supplier_returns', batchSize: 5000, category: 'Procurement' },
  { name: 'supplier_return_lines', batchSize: 5000, category: 'Procurement' },
  { name: 'purchasing_invoices', batchSize: 5000, category: 'Procurement' },
  { name: 'purchasing_invoice_lines', batchSize: 5000, category: 'Procurement' },
  { name: 'purchasing_payments', batchSize: 5000, category: 'Procurement' },
  { name: 'purchasing_payment_allocations', batchSize: 5000, category: 'Procurement' },

  // Expenses (1 table)
  { name: 'employee_expenses', batchSize: 5000, category: 'Expenses' },

  // Financial - AR & Banking (9 tables)
  { name: 'invoices', batchSize: 5000, category: 'Financial' },
  { name: 'invoice_lines', batchSize: 5000, category: 'Financial' },
  { name: 'invoice_embeddings', batchSize: 5000, category: 'Financial' },
  { name: 'payments', batchSize: 5000, category: 'Financial' },
  { name: 'payment_allocations', batchSize: 5000, category: 'Financial' },
  { name: 'bank_accounts', batchSize: 5000, category: 'Financial' },
  { name: 'bank_transactions', batchSize: 5000, category: 'Financial' },
  { name: 'bank_reconciliations', batchSize: 5000, category: 'Financial' },
  { name: 'reconciliation_matches', batchSize: 5000, category: 'Financial' },

  // Projects (7 tables)
  { name: 'projects', batchSize: 5000, category: 'Projects' },
  { name: 'project_embeddings', batchSize: 5000, category: 'Projects' },
  { name: 'project_tasks', batchSize: 5000, category: 'Projects' },
  { name: 'project_task_dependencies', batchSize: 5000, category: 'Projects' },
  { name: 'project_milestones', batchSize: 5000, category: 'Projects' },
  { name: 'project_resources', batchSize: 5000, category: 'Projects' },
  { name: 'project_time_entries', batchSize: 5000, category: 'Projects' },

  // WhatsApp Integration - Contacts (1 table)
  { name: 'whatsapp_contacts', batchSize: 5000, category: 'WhatsApp' },

  // ============================================================================
  // LARGE TABLES (> 100K rows) - Batch Size: 2,000
  // ============================================================================

  // Document Management - Files & Versions (3 tables) - can be very large
  { name: 'documents', batchSize: 2000, category: 'Documents' },
  { name: 'document_versions', batchSize: 2000, category: 'Documents' },
  { name: 'document_embeddings', batchSize: 2000, category: 'Documents' },

  // Inventory - Stock Movements (2 tables) - high transaction volume
  { name: 'stock_items', batchSize: 2000, category: 'Logistics' },
  { name: 'stock_movements', batchSize: 2000, category: 'Logistics' },

  // Gmail Integration - Messages (3 tables) - very large
  { name: 'gmail_messages', batchSize: 2000, category: 'Gmail' },
  { name: 'gmail_threads', batchSize: 2000, category: 'Gmail' },
  { name: 'email_classifications', batchSize: 2000, category: 'Gmail' },

  // WhatsApp Integration - Messages (2 tables) - very large
  { name: 'whatsapp_messages', batchSize: 2000, category: 'WhatsApp' },
  { name: 'whatsapp_conversations', batchSize: 2000, category: 'WhatsApp' },
];

export class BackfillOrchestrator {
  private queue: Queue;

  constructor() {
    this.queue = new Queue('backfill-environment', {
      connection: redisConnection,
    });
  }

  async startBackfill(): Promise<{ message: string; tablesEnqueued: number }> {
    console.log('[BackfillOrchestrator] Starting environment backfill for all tables...');

    let enqueued = 0;

    for (const table of TABLES_TO_BACKFILL) {
      try {
        await this.queue.add(
          'backfill-table',
          {
            tableName: table.name,
            batchSize: table.batchSize,
            offset: 0,
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        );

        console.log(`[BackfillOrchestrator] ✅ Enqueued ${table.name} (${table.category}) with batch size ${table.batchSize}`);
        enqueued++;
      } catch (error) {
        console.error(`[BackfillOrchestrator] ❌ Failed to enqueue ${table.name}:`, error);
      }
    }

    console.log(`[BackfillOrchestrator] Backfill jobs enqueued successfully: ${enqueued}/${TABLES_TO_BACKFILL.length}`);

    return {
      message: 'Backfill started successfully',
      tablesEnqueued: enqueued,
    };
  }

  async getBackfillStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    totalTables: number;
  }> {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        totalTables: TABLES_TO_BACKFILL.length,
      };
    } catch (error) {
      console.error('[BackfillOrchestrator] Error getting status:', error);
      throw error;
    }
  }

  async getFailedJobs(): Promise<any[]> {
    try {
      const failed = await this.queue.getFailed(0, 100);
      return failed.map(job => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        attemptsMade: job.attemptsMade,
      }));
    } catch (error) {
      console.error('[BackfillOrchestrator] Error getting failed jobs:', error);
      throw error;
    }
  }

  async retryFailedJobs(): Promise<{ retriedCount: number }> {
    try {
      const failed = await this.queue.getFailed(0, 1000);
      
      for (const job of failed) {
        await job.retry();
      }

      console.log(`[BackfillOrchestrator] Retried ${failed.length} failed jobs`);

      return {
        retriedCount: failed.length,
      };
    } catch (error) {
      console.error('[BackfillOrchestrator] Error retrying failed jobs:', error);
      throw error;
    }
  }

  getTableList(): BackfillTableConfig[] {
    return TABLES_TO_BACKFILL;
  }
}
