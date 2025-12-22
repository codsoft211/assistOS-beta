import { ToolBase, type ToolManifest } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { moduleTemplates } from '../../../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { realtimeEvents } from '../../../../../apps/api/services/event-emitter';
import { tenantSchemaService } from '../../../../../apps/api/services/tenant-schema.service';
import { moduleTableService } from '../../../../../apps/api/services/module-table.service';
import { canModifySchema } from '../../../../../apps/api/services/schema-permissions.service';
import { selectOneFromTenantTable, insertIntoTenantTable, updateTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

// Interface for tenant_modules table rows
interface TenantModuleRow {
  id: string;
  tenant_id: string;
  module_id: string;
  is_active: boolean;
  installed_at: Date;
  installed_by: string | null;
  config: Record<string, any> | null;
  environment: string;
  updated_at: Date;
}

interface ActivateModuleInput {
  moduleId: string;
  config?: Record<string, any>;
  useDefaultTables?: boolean; // true = use default tables, false = customize (requires customTables)
  customTables?: any[]; // Custom table definitions if useDefaultTables=false
  preview?: boolean; // Preview only, don't install
}

export class ActivateModuleTool extends ToolBase<ActivateModuleInput, any> {
  manifest: ToolManifest = {
    name: 'activate_module',
    category: 'configuration',
    description: 'Activates/installs a module for the tenant ONE BY ONE. User can choose to use default pre-defined tables or customize them. Always install modules one at a time, never bulk.',
    parameters: [
      { name: 'moduleId', type: 'string', description: 'Module ID or slug (e.g., "compras", "financeiro", "vendas")', required: true },
      { name: 'config', type: 'object', description: 'Initial module configurations', required: false },
      { name: 'useDefaultTables', type: 'boolean', description: 'If true, use default pre-defined tables from public schema templates. If false, use custom tables (requires customTables). Default: true', required: false },
      { 
        name: 'customTables', 
        type: 'array', 
        description: 'Custom table definitions (required if useDefaultTables=false). Each table should have name, columns, and optional indexes.', 
        required: false,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Table name' },
            columns: { 
              type: 'array',
              description: 'Column definitions',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  nullable: { type: 'boolean' },
                  primaryKey: { type: 'boolean' },
                  foreignKey: { type: 'object' }
                }
              }
            },
            indexes: { 
              type: 'array',
              description: 'Index definitions',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  columns: { type: 'array', items: { type: 'string' } },
                  unique: { type: 'boolean' }
                }
              }
            }
          }
        }
      },
      { name: 'preview', type: 'boolean', description: 'If true, preview tables that will be created without installing. Use this to show user what will be created.', required: false },
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant-wide module activation - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: ActivateModuleInput,
    context: any,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    // ✅ SECURITY: Verify user has owner/config role
    const permissionCheck = await canModifySchema(context.userId, context.tenantId);
    if (!permissionCheck.allowed) {
      return {
        success: false,
        error: 'Insufficient permissions',
        message: permissionCheck.reason,
        required: ['owner', 'config'],
        current: permissionCheck.role,
      };
    }

    onProgress?.(10, 'Checking module in catalog...');
    
    const [template] = await db
      .select()
      .from(moduleTemplates)
      .where(eq(moduleTemplates.slug, input.moduleId));

    if (!template) {
      return {
        success: false,
        message: `Module ${input.moduleId} not found in catalog`
      };
    }

    onProgress?.(20, 'Checking if already installed...');
    
    // Query from tenant schema
    const existing = await selectOneFromTenantTable<TenantModuleRow>(
      context.tenantId,
      'tenant_modules',
      sql`module_id = ${input.moduleId}`
    );

    if (existing && existing.is_active) {
      return {
        success: false,
        message: `Module ${input.moduleId} is already active. Use deactivate_module first if you want to reinstall.`
      };
    }

    // ✅ Check if tenant schema exists
    const schemaName = await tenantSchemaService.getTenantSchemaName(context.tenantId);
    if (!schemaName) {
      return {
        success: false,
        error: 'Tenant schema not found',
        message: 'Tenant schema must be created before installing modules. Please contact support or use bootstrap_tenant.',
      };
    }

    // ✅ PREVIEW MODE: Show what tables will be created
    if (input.preview) {
      onProgress?.(50, 'Generating preview...');
      
      const useDefaults = input.useDefaultTables !== false; // Default to true if not specified
      
      if (useDefaults) {
        // Preview default tables
        try {
          const preview = await moduleTableService.previewModuleTables(context.tenantId, input.moduleId);
          return {
            success: true,
            preview: true,
            moduleId: input.moduleId,
            moduleName: template.name,
            useDefaultTables: true,
            tables: preview.tables.map(t => ({
              name: t.name,
              columns: t.columns.map(c => ({
                name: c.name,
                type: c.type,
                nullable: c.nullable,
                primaryKey: c.primaryKey,
                foreignKey: c.foreignKey,
              })),
              indexes: t.indexes,
            })),
            ddl: preview.ddl,
            message: `Preview: ${preview.tables.length} default table(s) will be created for module ${template.name}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: 'Preview failed',
            message: error.message || 'Could not generate preview',
          };
        }
      } else {
        // Preview custom tables
        if (!input.customTables || input.customTables.length === 0) {
          return {
            success: false,
            error: 'Custom tables required',
            message: 'If useDefaultTables=false, you must provide customTables array for preview',
          };
        }
        
        return {
          success: true,
          preview: true,
          moduleId: input.moduleId,
          moduleName: template.name,
          useDefaultTables: false,
          customTables: input.customTables,
          message: `Preview: ${input.customTables.length} custom table(s) will be created for module ${template.name}`,
        };
      }
    }

    // ✅ INSTALLATION MODE
    onProgress?.(40, 'Preparing module installation...');

    // Determine table creation strategy
    const useDefaults = input.useDefaultTables !== false; // Default to true if not specified

    if (useDefaults) {
      // ✅ OPTION 1: Use default tables (copy ALL tables from public schema)
      onProgress?.(50, 'Creating all module tables in tenant schema...');
      
      try {
        // Use new method that creates ALL tables for the module (not just 1-2)
        // Also registers each table in custom_tables metadata
        const result = await moduleTableService.createModuleTablesFromSchema(
          context.tenantId, 
          input.moduleId,
          context.userId // Pass userId for custom_tables created_by field
        );
        console.log(`[ActivateModule] ✅ Created ${result.tablesCreated} table(s) for module ${input.moduleId}`);
        console.log(`[ActivateModule] Tables: ${result.tables.join(', ')}`);
        console.log(`[ActivateModule] Registered ${result.customTableIds?.length || 0} custom_tables metadata entries`);
        onProgress?.(70, `Created ${result.tablesCreated} table(s) including all related tables`);
      } catch (error: any) {
        console.error(`[ActivateModule] ❌ Failed to create module tables:`, error);
        return {
          success: false,
          error: 'Failed to create module tables',
          message: error.message || 'Could not create module tables in tenant schema',
        };
      }
    } else {
      // ✅ OPTION 2: Use custom tables
      if (!input.customTables || input.customTables.length === 0) {
        return {
          success: false,
          error: 'Custom tables required',
          message: 'If useDefaultTables=false, you must provide customTables array with table definitions',
        };
      }

      onProgress?.(50, 'Creating custom tables...');
      
      try {
        // Import and use create_custom_table tool logic
        const { CreateCustomTableTool } = await import('./create-custom-table');
        const createTableTool = new CreateCustomTableTool();
        
        for (let i = 0; i < input.customTables.length; i++) {
          const tableDef = input.customTables[i];
          const progress = 50 + (i / input.customTables.length) * 20;
          onProgress?.(progress, `Creating table: ${tableDef.name}...`);
          
          await createTableTool.executeInternal(
            {
              tenantId: context.tenantId,
              tableName: tableDef.name,
              columns: tableDef.columns,
              indexes: tableDef.indexes,
              preview: false,
            },
            context
          );
        }
        
        onProgress?.(70, `Created ${input.customTables.length} custom table(s)`);
      } catch (error: any) {
        console.error(`[ActivateModule] ❌ Failed to create custom tables:`, error);
        return {
          success: false,
          error: 'Failed to create custom tables',
          message: error.message || 'Could not create custom tables in tenant schema',
        };
      }
    }

    onProgress?.(80, 'Registering module...');
    
    // Register module in tenant_modules (tenant schema)
    if (existing) {
      // Reactivate existing module
      const reactivated = await updateTenantTable<TenantModuleRow>(
        context.tenantId,
        'tenant_modules',
        { 
          is_active: true, 
          config: input.config || existing.config || {},
        },
        sql`id = ${existing.id}`
      );

      realtimeEvents.emitForTenant('modules.updated', context.tenantId, {
        moduleId: input.moduleId,
        action: 'reactivated',
        module: reactivated
      });

      onProgress?.(100, 'Module reactivated!');

      return {
        success: true,
        module: reactivated,
        template,
        useDefaultTables: useDefaults,
        message: `Module ${template.name} reactivated with ${useDefaults ? 'default' : 'custom'} tables`
      };
    } else {
      // Install new module in tenant schema
      const newModule = await insertIntoTenantTable<TenantModuleRow>(
        context.tenantId,
        'tenant_modules',
        {
          tenant_id: context.tenantId, // Required NOT NULL column
          module_id: input.moduleId,
          is_active: true,
          installed_by: context.userId,
          installed_at: new Date(),
          config: input.config || {},
          environment: 'production',
        }
      );

      onProgress?.(100, 'Module installed!');

      // Emit SSE event to trigger frontend cache invalidation
      realtimeEvents.emitForTenant('modules.updated', context.tenantId, {
        moduleId: input.moduleId,
        action: 'installed',
        module: newModule,
        template
      });

      return {
        success: true,
        module: newModule,
        template,
        useDefaultTables: useDefaults,
        message: `Module ${template.name} installed successfully with ${useDefaults ? 'default' : 'custom'} tables`
      };
    }
  }
}
