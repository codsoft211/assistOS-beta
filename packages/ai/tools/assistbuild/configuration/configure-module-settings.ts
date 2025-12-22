import { ToolBase, type ToolManifest } from '../../kernel';
import { sql } from 'drizzle-orm';
import { selectOneFromTenantTable, updateTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

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

interface ConfigureModuleInput {
  moduleId: string;
  settings: Record<string, any>;
  merge?: boolean;
}

export class ConfigureModuleSettingsTool extends ToolBase<ConfigureModuleInput, any> {
  manifest: ToolManifest = {
    name: 'configure_module_settings',
    category: 'configuration',
    description: 'Configures settings of an installed module (merge or replace)',
    parameters: [
      { name: 'moduleId', type: 'string', description: 'Module ID', required: true },
      { name: 'settings', type: 'object', description: 'Settings to apply', required: true },
      { name: 'merge', type: 'boolean', description: 'Merge with existing settings (default: true)', required: false }
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant-wide module configuration - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: ConfigureModuleInput,
    context: any
  ): Promise<any> {
    const tenantId = context.tenantId;
    
    // Find module in tenant schema
    const existing = await selectOneFromTenantTable<TenantModuleRow>(
      tenantId,
      'tenant_modules',
      sql`module_id = ${input.moduleId}`
    );

    if (!existing) {
      return {
        success: false,
        message: `Module ${input.moduleId} is not installed. Use activate_module first.`
      };
    }

    const merge = input.merge ?? true;
    const newConfig = merge
      ? { ...(existing.config || {}), ...input.settings }
      : input.settings;

    // Update module in tenant schema
    // Note: updated_at is automatically set by updateTenantTable function
    const updated = await updateTenantTable(
      tenantId,
      'tenant_modules',
      {
        config: newConfig
      },
      sql`id = ${existing.id}`
    );

    return {
      success: true,
      module: updated,
      message: `Module ${input.moduleId} settings updated`
    };
  }
}
