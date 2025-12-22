/**
 * Module Table Templates (SIMPLIFIED - FOR PREVIEW ONLY)
 * 
 * ⚠️ WARNING: These templates only contain 1-2 representative tables per module.
 * They are used ONLY for `previewModuleTables()` to show users what will be created.
 * 
 * Actual module installation uses `createModuleTablesFromSchema()` in 
 * module-table.service.ts which dynamically copies ALL tables from the public schema.
 * 
 * The complete list of tables per module is defined in:
 * - apps/api/services/module-table.service.ts (MODULE_TABLE_LISTS)
 * - Each module's index.ts (entities array)
 * 
 * NOTE: Missing modules in this file (crm, lead-generation) will show 
 * "No table template found" error in preview mode but will still install correctly.
 * 
 * @see apps/api/services/module-table.service.ts for complete implementation
 */

export interface ColumnDefinition {
  name: string;
  type: 'varchar' | 'text' | 'integer' | 'decimal' | 'boolean' | 'timestamp' | 'jsonb' | 'date';
  length?: number; // For varchar
  nullable?: boolean;
  default?: string | number | boolean;
  primaryKey?: boolean;
  foreignKey?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  };
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  indexes?: Array<{
    name: string;
    columns: string[];
    unique?: boolean;
  }>;
}

export interface ModuleTableTemplate {
  moduleId: string;
  tables: TableDefinition[];
}

export const MODULE_TABLE_TEMPLATES: Record<string, ModuleTableTemplate> = {
  // CRM Module (simplified preview)
  crm: {
    moduleId: 'crm',
    tables: [
      {
        name: 'clients',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'name', type: 'varchar', length: 255, nullable: false },
          { name: 'email', type: 'varchar', length: 255, nullable: true },
          { name: 'phone', type: 'varchar', length: 50, nullable: true },
          { name: 'company', type: 'varchar', length: 255, nullable: true },
          { name: 'status', type: 'varchar', length: 50, nullable: false, default: 'Active' },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
          { name: 'updated_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_clients_tenant', columns: ['tenant_id'] },
          { name: 'idx_clients_email', columns: ['email'] },
        ],
      },
      {
        name: 'opportunities',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'client_id', type: 'varchar', length: 255, nullable: true },
          { name: 'name', type: 'varchar', length: 255, nullable: false },
          { name: 'value', type: 'decimal', nullable: true },
          { name: 'status', type: 'varchar', length: 50, nullable: false, default: 'open' },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_opp_tenant', columns: ['tenant_id'] },
          { name: 'idx_opp_client', columns: ['client_id'] },
        ],
      },
    ],
  },
  
  // Lead Generation Module (simplified preview)
  'lead-generation': {
    moduleId: 'lead-generation',
    tables: [
      {
        name: 'angariacao_leads',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'email', type: 'varchar', length: 255, nullable: false },
          { name: 'first_name', type: 'varchar', length: 100, nullable: true },
          { name: 'last_name', type: 'varchar', length: 100, nullable: true },
          { name: 'phone', type: 'varchar', length: 50, nullable: true },
          { name: 'company', type: 'varchar', length: 255, nullable: true },
          { name: 'lead_source', type: 'varchar', length: 100, nullable: true },
          { name: 'status', type: 'varchar', length: 50, nullable: false, default: 'new' },
          { name: 'score', type: 'integer', nullable: false, default: 0 },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_leads_tenant', columns: ['tenant_id'] },
          { name: 'idx_leads_email', columns: ['email'] },
          { name: 'idx_leads_status', columns: ['status'] },
        ],
      },
      {
        name: 'lead_sources',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'source_type', type: 'varchar', length: 50, nullable: false },
          { name: 'source_name', type: 'varchar', length: 255, nullable: false },
          { name: 'is_active', type: 'boolean', nullable: false, default: true },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_sources_tenant', columns: ['tenant_id'] },
        ],
      },
    ],
  },
  
  // Purchasing Module (simplified preview)
  purchasing: {
    moduleId: 'purchasing',
    tables: [
      {
        name: 'purchase_orders',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'supplier_id', type: 'varchar', length: 255, nullable: true },
          { name: 'order_number', type: 'varchar', length: 100, nullable: false },
          { name: 'order_date', type: 'date', nullable: false },
          { name: 'total_amount', type: 'decimal', nullable: false, default: 0 },
          { name: 'status', type: 'varchar', length: 50, nullable: false, default: 'pending' },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
          { name: 'updated_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_po_tenant', columns: ['tenant_id'] },
          { name: 'idx_po_supplier', columns: ['supplier_id'] },
          { name: 'idx_po_status', columns: ['status'] },
        ],
      },
      {
        name: 'purchase_order_items',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'purchase_order_id', type: 'varchar', length: 255, nullable: false },
          { name: 'product_id', type: 'varchar', length: 255, nullable: true },
          { name: 'quantity', type: 'decimal', nullable: false },
          { name: 'unit_price', type: 'decimal', nullable: false },
          { name: 'total_price', type: 'decimal', nullable: false },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_poi_order', columns: ['purchase_order_id'] },
        ],
      },
    ],
  },
  financial: {
    moduleId: 'financial',
    tables: [
      {
        name: 'invoices',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'customer_id', type: 'varchar', length: 255, nullable: true },
          { name: 'invoice_number', type: 'varchar', length: 100, nullable: false },
          { name: 'invoice_date', type: 'date', nullable: false },
          { name: 'due_date', type: 'date', nullable: true },
          { name: 'total_amount', type: 'decimal', nullable: false, default: 0 },
          { name: 'status', type: 'varchar', length: 50, nullable: false, default: 'draft' },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
          { name: 'updated_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_inv_tenant', columns: ['tenant_id'] },
          { name: 'idx_inv_customer', columns: ['customer_id'] },
          { name: 'idx_inv_status', columns: ['status'] },
        ],
      },
    ],
  },
  sales: {
    moduleId: 'sales',
    tables: [
      {
        name: 'sales_orders',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'customer_id', type: 'varchar', length: 255, nullable: true },
          { name: 'order_number', type: 'varchar', length: 100, nullable: false },
          { name: 'order_date', type: 'date', nullable: false },
          { name: 'total_amount', type: 'decimal', nullable: false, default: 0 },
          { name: 'status', type: 'varchar', length: 50, nullable: false, default: 'pending' },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
          { name: 'updated_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_so_tenant', columns: ['tenant_id'] },
          { name: 'idx_so_customer', columns: ['customer_id'] },
        ],
      },
    ],
  },
  logistics: {
    moduleId: 'logistics',
    tables: [
      {
        name: 'warehouses',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'name', type: 'varchar', length: 255, nullable: false },
          { name: 'address', type: 'text', nullable: true },
          { name: 'is_active', type: 'boolean', nullable: false, default: true },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_wh_tenant', columns: ['tenant_id'] },
        ],
      },
      {
        name: 'stock_movements',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'warehouse_id', type: 'varchar', length: 255, nullable: true },
          { name: 'product_id', type: 'varchar', length: 255, nullable: true },
          { name: 'movement_type', type: 'varchar', length: 50, nullable: false }, // 'in', 'out', 'adjustment'
          { name: 'quantity', type: 'decimal', nullable: false },
          { name: 'movement_date', type: 'timestamp', nullable: false, default: 'NOW()' },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_sm_tenant', columns: ['tenant_id'] },
          { name: 'idx_sm_warehouse', columns: ['warehouse_id'] },
        ],
      },
    ],
  },
  projects: {
    moduleId: 'projects',
    tables: [
      {
        name: 'projects',
        columns: [
          { name: 'id', type: 'varchar', length: 255, primaryKey: true, nullable: false },
          { name: 'tenant_id', type: 'varchar', length: 255, nullable: false },
          { name: 'name', type: 'varchar', length: 255, nullable: false },
          { name: 'description', type: 'text', nullable: true },
          { name: 'start_date', type: 'date', nullable: true },
          { name: 'end_date', type: 'date', nullable: true },
          { name: 'status', type: 'varchar', length: 50, nullable: false, default: 'active' },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'NOW()' },
          { name: 'updated_at', type: 'timestamp', nullable: false, default: 'NOW()' },
        ],
        indexes: [
          { name: 'idx_proj_tenant', columns: ['tenant_id'] },
          { name: 'idx_proj_status', columns: ['status'] },
        ],
      },
    ],
  },
};
