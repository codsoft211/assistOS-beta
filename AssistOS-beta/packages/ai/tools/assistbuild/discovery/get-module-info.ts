import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { moduleTemplates } from '../../../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { selectOneFromTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

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

export class GetModuleInfoTool extends ToolBase<{ moduleId: string }, any> {
  manifest: ToolManifest = {
    name: 'get_module_info',
    category: 'discovery',
    description: 'Gets complete details of a specific module (template + tenant installation)',
    parameters: [
      {
        name: 'moduleId',
        type: 'string',
        description: 'Module ID or slug',
        required: true
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: { moduleId: string },
    context: ToolExecutionContext
  ): Promise<any> {
    const [template] = await db
      .select()
      .from(moduleTemplates)
      .where(eq(moduleTemplates.slug, input.moduleId));

    if (!template) {
      return { found: false, moduleId: input.moduleId };
    }

    // Query from tenant schema
    const installed = await selectOneFromTenantTable<TenantModuleRow>(
      context.tenantId,
      'tenant_modules',
      sql`module_id = ${input.moduleId}`
    );

    return {
      found: true,
      template,
      installed: installed ? {
        id: installed.id,
        moduleId: installed.module_id,
        isActive: installed.is_active,
        installedAt: installed.installed_at,
        config: installed.config
      } : null,
      isInstalled: !!installed,
      isActive: installed?.is_active || false
    };
  }
}
