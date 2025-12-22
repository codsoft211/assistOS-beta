// Migrated from AssistOS legacy - Phase 4.0
// Source: /tmp/assistos-legacy/server/agents/smart-tool-filter.ts

/**
 * Smart Tool Filter - Intelligent Tool Selection System
 * 
 * Analisa mensagem do user e seleciona apenas tools relevantes para passar ao GPT.
 * Reduz de 50+ tools para 5-15 tools específicas → respostas mais rápidas e precisas.
 */

import { db } from "../db";
import { modules, userTenants } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import {
  detectRelevantCategories,
  getToolsByCategories,
  filterToolsByPermissions,
  type ToolCategory
} from "./tool-registry";

export interface FilterContext {
  userId: string;
  tenantId: string;
  userRole: string;
}

export interface FilterResult {
  toolNames: string[];
  detectedCategories: ToolCategory[];
  debugInfo: {
    totalAvailable: number;
    afterCategoryFilter: number;
    afterPermissionFilter: number;
    userModules: string[];
  };
}

/**
 * Filtra tools baseado na mensagem do user e suas permissões
 */
export async function filterRelevantTools(
  userMessage: string,
  context: FilterContext
): Promise<FilterResult> {
  const startTime = Date.now();
  
  // 1. Detectar categorias relevantes baseado em keywords
  const detectedCategories = detectRelevantCategories(userMessage);
  console.log(`[Smart Filter] Detected categories:`, detectedCategories);
  
  // 2. Obter tools dessas categorias
  const categoryFilteredTools = getToolsByCategories(detectedCategories);
  console.log(`[Smart Filter] Tools after category filter: ${categoryFilteredTools.length}`);
  
  // 3. Obter módulos ativos do tenant
  const activeModules = await getActiveModules(context.tenantId);
  console.log(`[Smart Filter] Active modules:`, activeModules);
  
  // 4. Obter permissões do user
  const userPermissions = await getUserPermissions(context);
  
  // 5. Filtrar por permissões
  const permissionFilteredTools = filterToolsByPermissions(
    categoryFilteredTools,
    {
      role: context.userRole,
      modules: activeModules,
      permissions: userPermissions
    }
  );
  
  const duration = Date.now() - startTime;
  console.log(`[Smart Filter] Final tools: ${permissionFilteredTools.length} (took ${duration}ms)`);
  
  return {
    toolNames: permissionFilteredTools,
    detectedCategories,
    debugInfo: {
      totalAvailable: 60, // Aproximado
      afterCategoryFilter: categoryFilteredTools.length,
      afterPermissionFilter: permissionFilteredTools.length,
      userModules: activeModules
    }
  };
}

/**
 * Obtém lista de módulos ativos do tenant
 */
async function getActiveModules(tenantId: string): Promise<string[]> {
  try {
    const activeModules = await db
      .select({
        slug: modules.slug
      })
      .from(modules)
      .where(
        and(
          eq(modules.tenantId, tenantId),
          eq(modules.isActive, true)
        )
      );
    
    return activeModules.map(m => m.slug);
  } catch (error) {
    console.error('[Smart Filter] Error fetching active modules:', error);
    return [];
  }
}

/**
 * Obtém permissões do user no tenant
 */
async function getUserPermissions(context: FilterContext): Promise<any> {
  try {
    const [userTenant] = await db
      .select({
        permissions: userTenants.permissions,
        scopes: userTenants.scopes
      })
      .from(userTenants)
      .where(
        and(
          eq(userTenants.userId, context.userId),
          eq(userTenants.tenantId, context.tenantId)
        )
      )
      .limit(1);
    
    if (!userTenant) {
      return {};
    }
    
    // Merge permissions e scopes
    const permissions = userTenant.permissions || {};
    const scopes = userTenant.scopes || {};
    
    return {
      ...permissions,
      ...scopes
    };
  } catch (error) {
    console.error('[Smart Filter] Error fetching user permissions:', error);
    return {};
  }
}

/**
 * Versão simplificada para fallback - retorna todas as tools core
 */
export function getFallbackTools(): string[] {
  return getToolsByCategories(['core', 'tasks', 'financial-analytics', 'sales-orders']);
}

/**
 * Helper: Verifica se user tem acesso a dados financeiros
 * SECURITY: Admin roles (owner/configurador/admin) always have access
 * OR user must have viewFinancialData permission with financeiro module active
 */
export async function canAccessFinancialData(context: FilterContext): Promise<boolean> {
  // Admin roles (Owner, Configurador, Admin) sempre têm acesso
  if (context.userRole === 'owner' || context.userRole === 'configurador' || context.userRole === 'admin') {
    return true;
  }
  
  // Para users não-admin: verificar se módulo financeiro está ativo
  const activeModules = await getActiveModules(context.tenantId);
  if (!activeModules.includes('financeiro')) {
    return false;
  }
  
  // Verificar permissão específica viewFinancialData
  const permissions = await getUserPermissions(context);
  return permissions.viewFinancialData === true;
}
