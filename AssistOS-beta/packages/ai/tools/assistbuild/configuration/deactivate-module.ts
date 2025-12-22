import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { moduleTemplates } from '../../../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { selectFromTenantTable, selectOneFromTenantTable, updateTenantTable, insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';
import { moduleTableService } from '../../../../../apps/api/services/module-table.service';
import { realtimeEvents } from '../../../../../apps/api/services/event-emitter';

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

const inputSchema = z.object({
  moduleId: z.string().min(1, 'Module ID is required'),
  force: z.boolean().optional().default(false),
  removeTables: z.boolean().optional().default(true), // Always remove module tables by default
  hardDeleteTables: z.boolean().optional().default(true), // Physically drop tables by default
});

type DeactivateModuleInput = z.infer<typeof inputSchema>;

export class DeactivateModuleTool extends ToolBase<DeactivateModuleInput, any> {
  manifest: ToolManifest = {
    name: 'deactivate_module',
    category: 'configuration',
    description: 'Uninstalls/deactivates a module. By default, removes all module tables from tenant schema and custom_tables metadata.',
    parameters: [
      { name: 'moduleId', type: 'string', description: 'Module ID or slug to deactivate', required: true },
      { name: 'force', type: 'boolean', description: 'Force deactivation even with dependencies (default: false)', required: false },
      { name: 'removeTables', type: 'boolean', description: 'Remove all module tables from tenant schema and custom_tables metadata (default: true)', required: false },
      { name: 'hardDeleteTables', type: 'boolean', description: 'Physically DROP tables instead of renaming them. WARNING: This permanently deletes data! (default: true)', required: false }
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant-wide module deactivation - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: DeactivateModuleInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      
      onProgress?.(20, 'Checking if module is installed...');
      
      // Check if module is installed and active (tenant schema)
      const existing = await selectOneFromTenantTable<TenantModuleRow>(
        context.tenantId,
        'tenant_modules',
        sql`module_id = ${validated.moduleId}`
      );

      if (!existing) {
        return {
          success: false,
          message: `Module ${validated.moduleId} is not installed in this tenant`
        };
      }

      if (!existing.is_active) {
        return {
          success: false,
          message: `Module ${validated.moduleId} is already deactivated`
        };
      }

      onProgress?.(40, 'Checking dependencies...');
      
      // Get module template for metadata
      const [template] = await db
        .select()
        .from(moduleTemplates)
        .where(eq(moduleTemplates.slug, validated.moduleId));

      // Check for dependencies: Get all OTHER active modules (tenant schema)
      const allActiveModules = await selectFromTenantTable<TenantModuleRow>(
        context.tenantId,
        'tenant_modules',
        sql`is_active = true`
      );
      const otherActiveModules = allActiveModules.filter(m => m.module_id !== validated.moduleId);

      // CRITICAL: Known dependency mappings (hardcoded for MVP safety)
      // In production, this should be loaded from moduleTemplates metadata
      const KNOWN_DEPENDENCIES: Record<string, string[]> = {
        'comercial': [], // Base module - no dependencies
        'financeiro': ['comercial'], // Financial depends on commercial
        'producao': ['comercial', 'inventory'], // Production depends on both
        'inventory': [], // Base module
      };

      // Check if any active modules depend on the one being deactivated
      const dependentModules = otherActiveModules.filter(module => {
        const deps = KNOWN_DEPENDENCIES[module.module_id] || [];
        return deps.includes(validated.moduleId);
      });

      if (dependentModules.length > 0 && !validated.force) {
        const dependentNames = dependentModules.map(m => m.module_id).join(', ');
        return {
          success: false,
          error: `Cannot deactivate ${validated.moduleId}: ${dependentModules.length} module(s) depend on it`,
          blockedBy: dependentNames,
          message: `Active dependent modules: ${dependentNames}. Use force=true to force deactivation.`,
          canRetry: true,
          suggestion: 'Deactivate dependent modules first or use force=true'
        };
      }

      if (dependentModules.length > 0 && validated.force) {
        onProgress?.(60, `Forcing deactivation despite ${dependentModules.length} dependencies...`);
      }

      // Remove tables if requested
      let tablesRemovalResult: { tablesRemoved: number; tables: string[]; errors: string[] } | null = null;
      
      if (validated.removeTables) {
        onProgress?.(70, validated.hardDeleteTables ? 'Permanently dropping module tables...' : 'Removing module tables (soft delete)...');
        
        try {
          tablesRemovalResult = await moduleTableService.removeModuleTables(
            context.tenantId,
            validated.moduleId,
            validated.hardDeleteTables // hardDelete flag
          );
          
          if (tablesRemovalResult.errors.length > 0) {
            console.warn(`[DeactivateModule] Some tables failed to remove:`, tablesRemovalResult.errors);
          }
          
          onProgress?.(85, `Removed ${tablesRemovalResult.tablesRemoved} table(s)`);
        } catch (error: any) {
          console.error(`[DeactivateModule] ❌ Failed to remove tables:`, error);
          // Continue with deactivation even if table removal fails
        }
      }

      onProgress?.(90, 'Deactivating module...');
      
      // Soft delete: set is_active to false (tenant schema)
      const deactivated = await updateTenantTable<TenantModuleRow>(
        context.tenantId,
        'tenant_modules',
        { is_active: false },
        sql`id = ${existing.id}`
      );

      // Create audit log entry (tenant schema)
      await insertIntoTenantTable(
        context.tenantId,
        'audit_log',
        {
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          action: 'module_deactivated',
          metadata: JSON.stringify({
            moduleId: validated.moduleId,
            moduleName: template?.name || validated.moduleId,
            previousState: existing,
            force: validated.force,
            tablesRemoved: tablesRemovalResult?.tablesRemoved || 0,
            hardDeleteTables: validated.hardDeleteTables,
          })
        }
      );

      // Emit SSE event to trigger frontend cache invalidation
      realtimeEvents.emitForTenant('modules.updated', context.tenantId, {
        moduleId: validated.moduleId,
        action: 'deactivated',
        tablesRemoved: tablesRemovalResult?.tablesRemoved || 0,
      });

      onProgress?.(100, 'Module deactivated successfully!');

      return {
        success: true,
        module: deactivated,
        message: `Module ${template?.name || validated.moduleId} deactivated.${validated.removeTables ? ` ${tablesRemovalResult?.tablesRemoved || 0} table(s) ${validated.hardDeleteTables ? 'permanently dropped' : 'soft-deleted'}.` : ' Can be reactivated with activate_module.'}`,
        info: {
          canBeReactivated: !validated.hardDeleteTables,
          dataPreserved: !validated.hardDeleteTables,
          tablesRemoved: tablesRemovalResult?.tablesRemoved || 0,
          removedTables: tablesRemovalResult?.tables || [],
          errors: tablesRemovalResult?.errors || [],
        }
      };

    } catch (error) {
      console.error('[DeactivateModuleTool] Error:', error);
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Invalid input parameters',
          details: error.errors
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deactivate module'
      };
    }
  }
}
