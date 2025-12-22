/**
 * Get Active Modules Tool (AssistME)
 * 
 * Returns simple list of modules currently installed and active for the tenant.
 * Focus: OPERATIONAL - "What do I have configured?"
 * 
 * AssistME uses this to answer questions like:
 * - "Que módulos tens configurados?"
 * - "O que está ativo?"
 */

import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { getTenantModules } from '../../../../../apps/api/services/module.service';

export class GetActiveModulesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'get_active_modules',
    category: 'discovery' as const,
    scope: 'tenant' as const,
    description: 'Obtém lista de módulos ativos instalados no tenant. Use quando user perguntar "que módulos tens?", "o que está configurado?", etc. Retorna apenas módulos instalados e ativos.',
    parameters: [],
    outputSchema: z.object({
      count: z.number(),
      modules: z.array(z.object({
        code: z.string(),
        name: z.string(),
        icon: z.string().optional(),
        category: z.string()
      }))
    }),
    requiresAuth: true,
    progressSupport: false
  };
  
  async executeInternal(
    input: {},
    context: ToolExecutionContext
  ) {
    console.log(`[get_active_modules] Fetching active modules for tenant ${context.tenantId}`);
    
    // Get all tenant modules (includes active and inactive)
    const allModules = await getTenantModules(context.tenantId);
    
    // Filter to only active modules
    const activeModules = allModules
      .filter(m => m.isActive)
      .map(m => ({
        code: m.moduleId,
        name: m.name,
        icon: m.icon,
        category: m.category
      }));
    
    console.log(`[get_active_modules] Found ${activeModules.length} active modules:`, 
      activeModules.map(m => m.code).join(', ')
    );
    
    return {
      count: activeModules.length,
      modules: activeModules
    };
  }
}
