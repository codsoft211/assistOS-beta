import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { selectFromTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';
import { sql } from 'drizzle-orm';

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

export class GetModulesActiveTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_modules_active',
    category: 'discovery',
    description: 'Lists all active/installed modules for this tenant',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: {}, context: ToolExecutionContext): Promise<any> {
    // Query from tenant schema
    const activeModules = await selectFromTenantTable<TenantModuleRow>(
      context.tenantId,
      'tenant_modules',
      sql`is_active = true`
    );

    return {
      modules: activeModules.map(m => ({
        id: m.id,
        moduleId: m.module_id,
        isActive: m.is_active,
        installedAt: m.installed_at,
        config: m.config
      })),
      count: activeModules.length
    };
  }
}
