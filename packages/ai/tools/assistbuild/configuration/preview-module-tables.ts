import { ToolBase, type ToolManifest } from '../../kernel';
import { z } from 'zod';
import { moduleTableService } from '../../../../../apps/api/services/module-table.service';
import { db } from '../../../../../apps/api/db';
import { moduleTemplates } from '../../../../../shared/schema';
import { eq } from 'drizzle-orm';
import { tenantSchemaService } from '../../../../../apps/api/services/tenant-schema.service';
import { canModifySchema } from '../../../../../apps/api/services/schema-permissions.service';

const inputSchema = z.object({
  moduleId: z.string(),
});

type PreviewModuleTablesInput = z.infer<typeof inputSchema>;

export class PreviewModuleTablesTool extends ToolBase<PreviewModuleTablesInput, any> {
  manifest: ToolManifest = {
    name: 'preview_module_tables',
    category: 'configuration',
    description: 'Preview default tables that will be created when installing a module. Use this BEFORE activate_module to show user what tables will be created. Shows table names, columns, types, and relationships.',
    parameters: [
      { name: 'moduleId', type: 'string', description: 'Module ID to preview (e.g., "compras", "financeiro", "vendas")', required: true },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false,
  };

  protected async executeInternal(
    input: PreviewModuleTablesInput,
    context: any
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

    const validated = inputSchema.parse(input);

    // Get module template
    const [template] = await db
      .select()
      .from(moduleTemplates)
      .where(eq(moduleTemplates.slug, validated.moduleId))
      .limit(1);

    if (!template) {
      return {
        success: false,
        error: `Module ${validated.moduleId} not found in catalog`,
        message: `Module "${validated.moduleId}" does not exist. Use get_modules_catalog to see available modules.`,
      };
    }

    // Check if tenant schema exists
    const schemaName = await tenantSchemaService.getTenantSchemaName(context.tenantId);
    if (!schemaName) {
      return {
        success: false,
        error: 'Tenant schema not found',
        message: 'Tenant schema must be created before previewing module tables. Please contact support.',
      };
    }

    // Preview tables
    try {
      const preview = await moduleTableService.previewModuleTables(context.tenantId, validated.moduleId);

      return {
        success: true,
        moduleId: validated.moduleId,
        moduleName: template.name,
        schemaName,
        tables: preview.tables.map(t => ({
          name: t.name,
          columns: t.columns.map(c => ({
            name: c.name,
            type: c.type,
            length: c.length,
            nullable: c.nullable ?? true,
            default: c.default,
            primaryKey: c.primaryKey ?? false,
            foreignKey: c.foreignKey,
          })),
          indexes: t.indexes?.map(idx => ({
            name: idx.name,
            columns: idx.columns,
            unique: idx.unique ?? false,
          })) || [],
        })),
        ddl: preview.ddl,
        summary: {
          totalTables: preview.tables.length,
          totalColumns: preview.tables.reduce((sum, t) => sum + t.columns.length, 0),
          totalIndexes: preview.tables.reduce((sum, t) => sum + (t.indexes?.length || 0), 0),
        },
        message: `Module ${template.name} will create ${preview.tables.length} table(s) with default structure in schema ${schemaName}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'Preview failed',
        message: error.message || 'Could not generate preview of module tables',
      };
    }
  }
}
