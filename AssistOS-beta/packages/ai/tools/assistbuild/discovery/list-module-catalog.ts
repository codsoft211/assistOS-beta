/**
 * List Module Catalog Tool (AssistBuild)
 * 
 * Returns complete module catalog with rich metadata and installation status.
 * Focus: CONFIGURATION - "What CAN I have? What's available?"
 * 
 * AssistBuild uses this to answer questions like:
 * - "What modules are available?"
 * - "What can I install?"
 * - "Show me the complete catalog"
 */

import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { getModuleCatalog, getTenantModules } from '../../../../../apps/api/services/module.service';

export class ListModuleCatalogTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_module_catalog',
    category: 'discovery' as const,
    description: 'Lists complete catalog of available modules with detailed descriptions and installation status. Use when user asks about available modules, catalog, or wants to see configuration options.',
    parameters: [],
    outputSchema: z.object({
      totalAvailable: z.number(),
      totalInstalled: z.number(),
      totalActive: z.number(),
      modules: z.array(z.object({
        code: z.string(),
        name: z.string(),
        description: z.string(),
        icon: z.string().optional(),
        category: z.string(),
        version: z.string(),
        installed: z.boolean(),
        active: z.boolean(),
        installedAt: z.string().optional(),
        installedBy: z.string().optional().nullable()
      }))
    }),
    requiresAuth: true,
    progressSupport: false
  };
  
  async executeInternal(
    input: {},
    context: ToolExecutionContext
  ) {
    console.log(`[list_module_catalog] Fetching module catalog for tenant ${context.tenantId}`);
    
    // Get full catalog of available modules
    const catalog = await getModuleCatalog();
    
    // Get tenant's installed modules to mark which are active
    const installedModules = await getTenantModules(context.tenantId);
    const installedMap = new Map(
      installedModules.map(m => [m.moduleId, m])
    );
    
    // Enrich catalog with installation status
    const enrichedCatalog = catalog.map(module => {
      const installed = installedMap.get(module.id);
      return {
        code: module.id,
        name: module.name,
        description: module.description || 'No description available',
        icon: module.icon,
        category: module.category,
        version: module.version,
        installed: !!installed,
        active: installed?.isActive || false,
        installedAt: installed?.installedAt?.toISOString(),
        installedBy: installed?.installedBy
      };
    });
    
    const installedCount = enrichedCatalog.filter(m => m.installed).length;
    const activeCount = enrichedCatalog.filter(m => m.active).length;
    
    console.log(`[list_module_catalog] Catalog: ${catalog.length} total, ${installedCount} installed, ${activeCount} active`);
    
    return {
      totalAvailable: catalog.length,
      totalInstalled: installedCount,
      totalActive: activeCount,
      modules: enrichedCatalog
    };
  }
}
