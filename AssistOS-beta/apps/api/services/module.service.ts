/**
 * Module Service (FASE 2)
 * 
 * Gestão de módulos do AssistOS:
 * - Lista catálogo de módulos disponíveis
 * - Gestão de módulos instalados por tenant
 * - Preferências de visibilidade por user
 * - Permissões de acesso a módulos
 */

import { db } from '../db';
import { userModulePreferences, userTenants, moduleTemplates } from '../../../shared/schema';
import { ModuleRegistryService } from '../../../packages/modules/base/module-registry.service';
import { eq, and, sql } from 'drizzle-orm';
import { getModulePageTree, type ModulePageTree } from './module-page.service';
import { 
  selectFromTenantTable, 
  selectOneFromTenantTable, 
  insertIntoTenantTable, 
  updateTenantTable 
} from '../utils/tenant-db-helper';
import { moduleTableService } from './module-table.service';

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

/**
 * Module metadata from registry
 */
export interface ModuleCatalogItem {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category: string;
  version: string;
  permissions: Array<{ key: string; name: string; description?: string }>;
}

/**
 * Tenant module with installation info
 */
export interface TenantModuleInfo {
  id: string;
  moduleId: string;
  name: string;
  description?: string;
  icon?: string;
  category: string;
  isActive: boolean;
  installedAt: Date | null; // null for catalog-only entries (not yet installed)
  installedBy: string | null;
  config: Record<string, any> | null;
}

/**
 * Module page for sidebar (supports hierarchical structure)
 */
export interface SidebarModulePage {
  title: string;
  url: string;
  icon?: string;
  isGroup?: boolean;
  children?: SidebarModulePage[];
}

/**
 * Module for sidebar (filtered by user permissions + preferences)
 */
export interface SidebarModuleInfo {
  id: string;
  moduleId: string;
  name: string;
  icon?: string;
  category: string;
  isActive: boolean;
  isHiddenByUser: boolean;
  pages?: SidebarModulePage[];
}

/**
 * Get all modules from registry catalog
 * BROADENED: Now returns ALL modules from DB, enriched with registry metadata when available
 */
export async function getModuleCatalog(): Promise<ModuleCatalogItem[]> {
  const catalog: ModuleCatalogItem[] = [];
  
  // 1. Buscar TODOS os módulos ativos da DB
  const dbModules = await db
    .select()
    .from(moduleTemplates)
    .where(eq(moduleTemplates.isActive, true));
  
  console.log(`[ModuleService::getModuleCatalog] 📦 Found ${dbModules.length} active modules in DB`);
  
  // Access static registry for enrichment
  const registeredModules = ModuleRegistryService.moduleRegistry;
  console.log(`[ModuleService::getModuleCatalog] 🗄️  Registry has ${registeredModules.size} modules`);
  
  // 2. Para cada módulo DB, enriquecer com registry (se existir)
  for (const dbModule of dbModules) {
    try {
      const factory = registeredModules.get(dbModule.slug);
      
      if (factory) {
        // Module exists in registry - use registry metadata (more complete)
        const module = factory();
        const metadata = module.metadata;
        
        catalog.push({
          id: dbModule.slug,
          name: metadata.name,
          description: metadata.description,
          icon: metadata.icon,
          category: metadata.category,
          version: metadata.version,
          permissions: metadata.permissions,
        });
        
        console.log(`[ModuleService::getModuleCatalog] ✅ Module "${dbModule.slug}" enriched from registry`);
      } else {
        // Module NOT in registry - use DB metadata directly (legacy/experimental modules)
        catalog.push({
          id: dbModule.slug,
          name: dbModule.name,
          description: dbModule.description || undefined,
          icon: dbModule.icon || undefined,
          category: dbModule.category,
          version: '1.0.0', // Default version for legacy/experimental modules
          permissions: [], // No permissions for non-registry modules yet
        });
        
        console.log(`[ModuleService::getModuleCatalog] ⚠️  Module "${dbModule.slug}" using DB metadata (not in registry - legacy/experimental)`);
      }
    } catch (error) {
      console.error(`[ModuleService::getModuleCatalog] ❌ Failed to load module ${dbModule.slug}:`, error);
      // Still add to catalog with DB data as fallback
      catalog.push({
        id: dbModule.slug,
        name: dbModule.name,
        description: dbModule.description || undefined,
        icon: dbModule.icon || undefined,
        category: dbModule.category,
        version: '1.0.0',
        permissions: [],
      });
    }
  }
  
  console.log(`[ModuleService::getModuleCatalog] 🎯 Returning ${catalog.length} modules in catalog (DB + registry enrichment)`);
  
  return catalog;
}

/**
 * Get installed modules for tenant (owner/admin only)
 * Uses tenant-scoped tenant_modules table
 */
export async function getTenantModules(tenantId: string): Promise<TenantModuleInfo[]> {
  // Query tenant_modules from tenant schema
  const installed = await selectFromTenantTable<TenantModuleRow>(tenantId, 'tenant_modules');
  
  const results: TenantModuleInfo[] = [];
  
  for (const record of installed) {
    const factory = ModuleRegistryService.moduleRegistry.get(record.module_id);
    if (!factory) {
      console.warn(`[ModuleService] Module ${record.module_id} not found in registry`);
      continue;
    }
    
    try {
      const module = factory();
      const metadata = module.metadata;
      
      results.push({
        id: record.id,
        moduleId: record.module_id,
        name: metadata.name,
        description: metadata.description,
        icon: metadata.icon,
        category: metadata.category,
        isActive: record.is_active,
        installedAt: new Date(record.installed_at),
        installedBy: record.installed_by,
        config: record.config,
      });
    } catch (error) {
      console.error(`[ModuleService] Failed to load metadata for ${record.module_id}:`, error);
    }
  }
  
  return results;
}

/**
 * Get all available modules with tenant installation status
 * For Configuration Studio - shows ALL modules with active/inactive status
 * Uses tenant-scoped tenant_modules table
 */
export async function getAllModulesWithStatus(
  tenantId: string,
  environment?: string
): Promise<TenantModuleInfo[]> {
  // Default to production if not provided (backward compatibility)
  const env = environment || 'production';
  
  // 1. Get ALL available modules from catalog
  const catalog = await getModuleCatalog();
  
  // 2. Get installed modules for tenant in SPECIFIC environment from tenant schema
  const installed = await selectFromTenantTable<TenantModuleRow>(
    tenantId, 
    'tenant_modules',
    sql`environment = ${env}`
  );
  
  // Create map for quick lookup
  const installedMap = new Map(installed.map(m => [m.module_id, m]));
  
  // 3. Merge: all catalog modules + installation status
  const results: TenantModuleInfo[] = [];
  
  for (const catalogModule of catalog) {
    const installedRecord = installedMap.get(catalogModule.id);
    
    results.push({
      id: installedRecord?.id || '', // Empty if not installed
      moduleId: catalogModule.id,
      name: catalogModule.name,
      description: catalogModule.description,
      icon: catalogModule.icon,
      category: catalogModule.category,
      isActive: installedRecord?.is_active || false, // false if not installed
      installedAt: installedRecord ? new Date(installedRecord.installed_at) : null, // null if not installed
      installedBy: installedRecord?.installed_by || null,
      config: installedRecord?.config || null,
    });
  }
  
  console.log(`[ModuleService::getAllModulesWithStatus] 📦 Returning ${results.length} modules (${installed.length} installed)`);
  
  return results;
}

/**
 * Convert hierarchical module page tree to SidebarModulePage format (preserves hierarchy)
 * @param tree - Hierarchical page tree from module_pages table
 * @returns Hierarchical array with collapsible groups and children
 */
function convertModulePageTreeToSidebar(tree: ModulePageTree[]): SidebarModulePage[] {
  function convertNode(node: ModulePageTree): SidebarModulePage {
    const sidebarPage: SidebarModulePage = {
      title: String(node.displayLabel),
      url: String(node.routePath ?? ''),
      icon: node.icon ? String(node.icon) : undefined,
    };
    
    // If it's a group, mark it and convert children
    if (node.isGroup) {
      sidebarPage.isGroup = true;
      if (node.children && node.children.length > 0) {
        sidebarPage.children = node.children.map(convertNode);
      }
    }
    
    return sidebarPage;
  }
  
  return tree.map(convertNode);
}

/**
 * Get module pages from database (module_pages table) or fallback to hardcoded pages
 * @param moduleId - Module identifier
 * @param tenantId - Tenant identifier
 * @param environment - Environment (production/sandbox)
 * @returns Flat array of pages for sidebar
 */
async function getModulePagesForSidebar(
  moduleId: string,
  tenantId: string,
  environment: 'production' | 'sandbox' = 'production'
): Promise<SidebarModulePage[]> {
  try {
    // Try to fetch from module_pages table first (dynamic modules like financeiro)
    const tree = await getModulePageTree(tenantId, moduleId, environment);
    
    if (tree && tree.length > 0) {
      console.log(`[ModuleService] 📄 Found ${tree.length} page tree nodes for ${moduleId}:`, JSON.stringify(tree, null, 2));
      const sidebarPages = convertModulePageTreeToSidebar(tree);
      console.log(`[ModuleService] 🔄 Converted to ${sidebarPages.length} sidebar pages:`, JSON.stringify(sidebarPages, null, 2));
      return sidebarPages;
    }
    
    // Fallback to hardcoded MODULE_PAGES (legacy modules - flat structure)
    console.log(`[ModuleService] 📋 No pages in module_pages table for ${moduleId}, using hardcoded MODULE_PAGES`);
    return MODULE_PAGES[moduleId] || [];
  } catch (error) {
    console.error(`[ModuleService] ❌ Error fetching pages for ${moduleId}:`, error);
    // Fallback to hardcoded pages on error
    return MODULE_PAGES[moduleId] || [];
  }
}

/**
 * Module pages mapping (hardcoded for now, can be made dynamic later)
 * NOTE: Keys are English module IDs (matching registry), titles are English (i18n handles translation), URLs remain Portuguese (matching frontend routes)
 */
const MODULE_PAGES: Record<string, SidebarModulePage[]> = {
  // financeiro: Fallback pages (should use module_pages table for hierarchical navigation)
  financeiro: [
    { title: 'Dashboard', url: '/financeiro' },
    { title: 'Invoices', url: '/financeiro/invoices' },
    { title: 'Payments', url: '/financeiro/payments' },
    { title: 'Reconciliation', url: '/financeiro/reconciliation' },
  ],
  purchasing: [
    { title: 'Dashboard', url: '/compras' },
    { title: 'Suppliers', url: '/compras/fornecedores' },
    { title: 'Bills', url: '/compras/faturas' },
    { title: 'Purchase Orders', url: '/compras/orders' },
    { title: 'RFQs', url: '/compras/rfqs' },
  ],
  compras: [
    { title: 'Dashboard', url: '/compras' },
    { title: 'Fornecedores', url: '/compras/fornecedores' },
    { title: 'Faturas', url: '/compras/faturas' },
    { title: 'Encomendas', url: '/compras/orders' },
    { title: 'Pedidos Cotação', url: '/compras/rfqs' },
  ],
  crm: [
    { title: 'Dashboard', url: '/crm' },
    { title: 'Clients', url: '/crm/clients' },
    { title: 'Opportunities', url: '/crm/opportunities' },
    { title: 'Orders', url: '/crm/orders' },
    { title: 'Activities', url: '/crm/activities' },
    { title: 'Contracts', url: '/crm/contracts' },
    { title: 'Renewals', url: '/crm/renewals' },
    { title: 'Rules', url: '/crm/rules' },
  ],
  logistics: [
    { title: 'Dashboard', url: '/logistica' },
    { title: 'Warehouses', url: '/logistica/armazens' },
    { title: 'Inventory', url: '/logistica/inventario' },
    { title: 'Equipment', url: '/logistica/equipamentos' },
  ],
  projects: [
    { title: 'Dashboard', url: '/projects' },
    { title: 'Lista', url: '/projects/list' },
  ],
  'lead-generation': [
    { title: 'Dashboard', url: '/lead-generation' },
    { title: 'Leads', url: '/lead-generation/leads' },
    { title: 'Campaigns', url: '/lead-generation/campaigns' },
    { title: 'Sources', url: '/lead-generation/sources' },
    { title: 'Scoring Rules', url: '/lead-generation/scoring-rules' },
  ],
  // Inventory module - both keys for compatibility
  inventory: [
    { title: 'Dashboard', url: '/inventory' },
    { title: 'Products', url: '/inventory/products' },
    { title: 'Categories', url: '/inventory/categories' },
    { title: 'Units of Measure', url: '/inventory/uoms' },
    { title: 'Recipes / BOM', url: '/inventory/recipes' },
    { title: 'Stock Levels', url: '/inventory/stock' },
    { title: 'Warehouses', url: '/inventory/warehouses' },
    { title: 'Transactions', url: '/inventory/transactions' },
    { title: 'Alerts', url: '/inventory/alerts' },
  ],
  inventario: [
    { title: 'Dashboard', url: '/inventory' },
    { title: 'Products', url: '/inventory/products' },
    { title: 'Categories', url: '/inventory/categories' },
    { title: 'Units of Measure', url: '/inventory/uoms' },
    { title: 'Recipes / BOM', url: '/inventory/recipes' },
    { title: 'Stock Levels', url: '/inventory/stock' },
    { title: 'Warehouses', url: '/inventory/warehouses' },
    { title: 'Transactions', url: '/inventory/transactions' },
    { title: 'Alerts', url: '/inventory/alerts' },
  ],
  hr: [
    { title: 'HR Dashboard', url: '/hr' },
  ],
  production: [
    { title: 'Production Dashboard', url: '/production' },
  ],
  accounting: [
    { title: 'Accounting Dashboard', url: '/accounting' },
  ]
};

/**
 * Get modules for user's sidebar (filtered by permissions + preferences)
 * Uses tenant-scoped tenant_modules table
 */
export async function getUserModuleSidebar(
  userId: string,
  tenantId: string,
  environment?: string
): Promise<SidebarModuleInfo[]> {
  // Default to production if not provided (backward compatibility)
  // Ensure environment is either 'production' or 'sandbox'
  const env: 'production' | 'sandbox' = (environment === 'sandbox' || environment === 'production') 
    ? environment 
    : 'production';
  console.log(`[ModuleService] 🔍 getUserModuleSidebar called - userId: ${userId}, tenantId: ${tenantId}, environment: ${env}`);
  
  // Get ONLY ACTIVE modules for tenant in SPECIFIC environment from tenant schema
  const installed = await selectFromTenantTable<TenantModuleRow>(
    tenantId,
    'tenant_modules',
    sql`is_active = true AND environment = ${env}`
  );
  
  console.log(`[ModuleService] 📦 Found ${installed.length} active modules in DB:`, installed.map(m => m.module_id));
  console.log(`[ModuleService] 🗄️  Registry size: ${ModuleRegistryService.moduleRegistry.size}`);
  console.log(`[ModuleService] 🗄️  Registry keys:`, Array.from(ModuleRegistryService.moduleRegistry.keys()));
  
  // Get user's visibility preferences
  const preferences = await db
    .select()
    .from(userModulePreferences)
    .where(
      and(
        eq(userModulePreferences.userId, userId),
        eq(userModulePreferences.tenantId, tenantId)
      )
    );
  
  const hiddenModules = new Set(
    preferences
      .filter(p => p.isHiddenInSidebar)
      .map(p => p.moduleId)
  );
  
  // Get user role for permission filtering
  const userTenant = await db
    .select()
    .from(userTenants)
    .where(
      and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId)
      )
    )
    .limit(1);
  
  const userRole = userTenant[0]?.role || 'member';
  
  const results: SidebarModuleInfo[] = [];
  
  for (const record of installed) {
    console.log(`[ModuleService] 🔄 Processing module: ${record.module_id}`);
    const factory = ModuleRegistryService.moduleRegistry.get(record.module_id);
    
    if (!factory) {
      console.warn(`[ModuleService] ❌ Module ${record.module_id} NOT FOUND in registry!`);
      continue;
    }
    
    console.log(`[ModuleService] ✅ Module ${record.module_id} found in registry`);
    
    try {
      const module = factory();
      const metadata = module.metadata;
      
      console.log(`[ModuleService] ✅ Module ${record.module_id} loaded - name: ${metadata.name}, icon: ${metadata.icon}`);
      
      // TODO: Check module-specific permissions based on userRole
      // For now, show all active modules (permission filtering will be in FASE 3)
      
      // Fetch pages from database (module_pages table) or fallback to hardcoded
      const pages = await getModulePagesForSidebar(record.module_id, tenantId, 'production');
      
      const moduleInfo = {
        id: record.id,
        moduleId: record.module_id,
        name: metadata.name,
        icon: metadata.icon,
        category: metadata.category,
        isActive: record.is_active,
        isHiddenByUser: hiddenModules.has(record.module_id),
        pages,
      };
      
      console.log(`[ModuleService] ✅ Adding to results: moduleId=${moduleInfo.moduleId}, name=${moduleInfo.name}, icon=${moduleInfo.icon}, pages=${moduleInfo.pages.length}`);
      
      results.push(moduleInfo);
    } catch (error) {
      console.error(`[ModuleService] ❌ Failed to load sidebar info for ${record.module_id}:`, error);
    }
  }
  
  console.log(`[ModuleService] 🎯 Returning ${results.length} modules for sidebar:`, results.map(r => r.moduleId));
  
  return results;
}

/**
 * Install module for tenant (called by AssistBuild)
 * Uses tenant-scoped tenant_modules table
 */
export async function installModule(
  tenantId: string,
  moduleId: string,
  installedBy: string
): Promise<void> {
  // Check if module exists in registry
  const factory = ModuleRegistryService.moduleRegistry.get(moduleId);
  if (!factory) {
    throw new Error(`Module ${moduleId} not found in catalog`);
  }
  
  // Check if already installed from tenant schema
  const existing = await selectOneFromTenantTable<TenantModuleRow>(
    tenantId,
    'tenant_modules',
    sql`module_id = ${moduleId}`
  );
  
  if (existing) {
    throw new Error(`Module ${moduleId} already installed`);
  }
  
  // Create physical tables and register in custom_tables
  try {
    const tableResult = await moduleTableService.createModuleTablesFromSchema(
      tenantId,
      moduleId,
      installedBy
    );
    console.log(`[ModuleService] ✅ Created ${tableResult.tablesCreated} table(s) for module ${moduleId}`);
    console.log(`[ModuleService] Tables: ${tableResult.tables.join(', ')}`);
    console.log(`[ModuleService] Registered ${tableResult.customTableIds.length} entries in custom_tables`);
  } catch (error: any) {
    console.error(`[ModuleService] ⚠️ Failed to create module tables (module will still be installed):`, error.message);
    // Continue with module installation even if table creation fails
  }
  
  // Install module in tenant schema
  await insertIntoTenantTable(tenantId, 'tenant_modules', {
    tenant_id: tenantId, // Required NOT NULL column
    module_id: moduleId,
    is_active: true,
    installed_by: installedBy,
    installed_at: new Date(),
    environment: 'production',
  });
  
  // Run onInstall hook if exists
  try {
    const module = factory();
    if (module.hooks?.onInstall) {
      await module.hooks.onInstall(tenantId);
    }
  } catch (error) {
    console.error(`[ModuleService] onInstall hook failed for ${moduleId}:`, error);
    // Don't fail the installation if hook fails
  }
}

/**
 * Update module status (activate/deactivate)
 * Uses tenant-scoped tenant_modules table
 * 
 * @param tenantId - Tenant ID
 * @param moduleId - Module ID to activate/deactivate
 * @param isActive - Whether to activate or deactivate
 * @param userId - Optional user ID for audit trail (required for custom_tables registration)
 */
export async function updateModuleStatus(
  tenantId: string,
  moduleId: string,
  isActive: boolean,
  userId?: string
): Promise<void> {
  // CRITICAL: Validate module exists in catalog before any operations
  const catalog = await getModuleCatalog();
  const moduleExists = catalog.some(m => m.id === moduleId);
  
  if (!moduleExists) {
    throw new Error(`Module ${moduleId} not found in catalog`);
  }
  
  // Check if module exists in tenant schema
  const existing = await selectOneFromTenantTable<TenantModuleRow>(
    tenantId,
    'tenant_modules',
    sql`module_id = ${moduleId}`
  );
  
  if (!existing) {
    // Module not installed - install it automatically
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`[ModuleService] 📦 AUTO-INSTALLING MODULE: ${moduleId}`);
    console.log(`[ModuleService] TenantId: ${tenantId}, UserId: ${userId || 'NOT PROVIDED'}`);
    console.log(`${'='.repeat(80)}`);
    
    // Create physical tables and register in custom_tables
    try {
      console.log(`[ModuleService] 🔧 Calling createModuleTablesFromSchema...`);
      const tableResult = await moduleTableService.createModuleTablesFromSchema(
        tenantId,
        moduleId,
        userId // Pass userId for custom_tables registration (if available)
      );
      console.log(`[ModuleService] ✅ Result: ${tableResult.tablesCreated} table(s) created`);
      console.log(`[ModuleService] Tables: ${tableResult.tables.join(', ') || 'NONE'}`);
      console.log(`[ModuleService] Custom Table IDs: ${tableResult.customTableIds.length > 0 ? tableResult.customTableIds.join(', ') : 'NONE'}`);
      console.log(`[ModuleService] Errors: ${tableResult.errors.length > 0 ? tableResult.errors.join(', ') : 'NONE'}`);
    } catch (error: any) {
      console.error(`[ModuleService] ❌ FAILED to create module tables:`, error.message);
      console.error(`[ModuleService] Full error:`, error);
      // Continue with module installation even if table creation fails
      // This could happen if the module doesn't have any defined tables
    }
    console.log(`${'='.repeat(80)}\n\n`);
    
    // Insert module record
    await insertIntoTenantTable(tenantId, 'tenant_modules', {
      tenant_id: tenantId, // Required NOT NULL column
      module_id: moduleId,
      is_active: isActive,
      installed_at: new Date(),
      installed_by: userId || null, // Use userId if available
      config: null,
      environment: 'production',
    });
  } else {
    // Module already installed - update status and ensure tables exist
    console.log(`\n[ModuleService] Module ${moduleId} already installed, updating status to ${isActive ? 'active' : 'inactive'}`);
    
    if (isActive) {
      // If activating, ensure tables exist (for modules installed before table creation was added)
      if (userId) {
        console.log(`[ModuleService] 🔧 Ensuring tables exist for module ${moduleId}...`);
        try {
          const tableResult = await moduleTableService.createModuleTablesFromSchema(
            tenantId,
            moduleId,
            userId
          );
          if (tableResult.tablesCreated > 0) {
            console.log(`[ModuleService] ✅ Created ${tableResult.tablesCreated} missing table(s): ${tableResult.tables.join(', ')}`);
          } else {
            console.log(`[ModuleService] ℹ️ All tables already exist or module has no tables`);
          }
        } catch (error: any) {
          console.log(`[ModuleService] ℹ️ Table check result: ${error.message}`);
        }
      }
    } else {
      // If deactivating, remove module tables (archive them - soft delete)
      console.log(`[ModuleService] 🗑️ Removing tables for module ${moduleId}...`);
      try {
        const removeResult = await moduleTableService.removeModuleTables(
          tenantId,
          moduleId,
          false // softDelete = false means archive (drop SQL but keep metadata)
        );
        console.log(`[ModuleService] ✅ Archived ${removeResult.tablesRemoved} table(s): ${removeResult.tables.join(', ') || 'NONE'}`);
        if (removeResult.errors.length > 0) {
          console.log(`[ModuleService] ⚠️ Errors: ${removeResult.errors.join(', ')}`);
        }
      } catch (error: any) {
        console.error(`[ModuleService] ❌ Failed to remove module tables:`, error.message);
        // Continue with deactivation even if table removal fails
      }
    }
    
    await updateTenantTable(
      tenantId,
      'tenant_modules',
      { is_active: isActive },
      sql`module_id = ${moduleId}`
    );
  }
  
  // Run lifecycle hooks
  const factory = ModuleRegistryService.moduleRegistry.get(moduleId);
  if (factory) {
    try {
      const module = factory();
      if (isActive && module.hooks?.onActivate) {
        await module.hooks.onActivate(tenantId);
      } else if (!isActive && module.hooks?.onDeactivate) {
        await module.hooks.onDeactivate(tenantId);
      }
    } catch (error) {
      console.error(`[ModuleService] Lifecycle hook failed for ${moduleId}:`, error);
    }
  }
  
  console.log(`[ModuleService] ✅ Module ${moduleId} ${isActive ? 'activated' : 'deactivated'} for tenant ${tenantId}`);
}

/**
 * Update user module preference (hide/show in sidebar)
 */
export async function updateUserPreference(
  userId: string,
  tenantId: string,
  moduleId: string,
  isHidden: boolean
): Promise<void> {
  // Upsert preference
  const existing = await db
    .select()
    .from(userModulePreferences)
    .where(
      and(
        eq(userModulePreferences.userId, userId),
        eq(userModulePreferences.tenantId, tenantId),
        eq(userModulePreferences.moduleId, moduleId)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    // Update existing
    await db
      .update(userModulePreferences)
      .set({ isHiddenInSidebar: isHidden, updatedAt: new Date() })
      .where(eq(userModulePreferences.id, existing[0].id));
  } else {
    // Insert new
    await db.insert(userModulePreferences).values({
      userId,
      tenantId,
      moduleId,
      isHiddenInSidebar: isHidden,
    });
  }
}
