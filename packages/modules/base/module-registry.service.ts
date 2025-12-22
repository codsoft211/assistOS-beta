/**
 * ModuleRegistry Service
 * 
 * Gestão centralizada de módulos instalados por tenant.
 * Carrega módulos dinamicamente, verifica instalação, e fornece
 * acesso ao ModuleDataInterface para cross-module tools.
 */

import { IModule, ModuleDataInterface, Filter } from './module.interface';
import { ModuleRegistry as IModuleRegistry, CrossModuleQuery } from '../../cross-module-tools/base/cross-module-tool.interface';
import { db } from '../../../apps/api/db';
import { sql } from 'drizzle-orm';
import { 
  selectFromTenantTable, 
  insertIntoTenantTable, 
  deleteFromTenantTable,
  updateTenantTable 
} from '../../../apps/api/utils/tenant-db-helper';
import { moduleTableService } from '../../../apps/api/services/module-table.service';

export class ModuleRegistryService implements IModuleRegistry {
  private modules: Map<string, IModule> = new Map();
  private tenantId: string;
  private static instances: Map<string, ModuleRegistryService> = new Map();
  
  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }
  
  /**
   * Get or create a ModuleRegistryService instance for a tenant
   */
  static async getInstance(tenantId: string): Promise<ModuleRegistryService> {
    // Return cached instance if exists
    if (this.instances.has(tenantId)) {
      return this.instances.get(tenantId)!;
    }
    
    // Create new instance and load modules
    const instance = new ModuleRegistryService(tenantId);
    await instance.loadModules();
    
    // Cache for future use
    this.instances.set(tenantId, instance);
    
    return instance;
  }
  
  /**
   * Clear cached instance (useful for testing or when modules change)
   */
  static clearInstance(tenantId: string): void {
    this.instances.delete(tenantId);
  }
  
  /**
   * Load all installed modules for this tenant
   */
  async loadModules(): Promise<void> {
    // Query database para módulos instalados deste tenant (tenant-scoped table)
    const installedModules = await selectFromTenantTable<{
      id: string;
      module_id: string;
      is_active: boolean;
    }>(
      this.tenantId,
      'tenant_modules',
      sql`is_active = true`
    );
    
    // Load cada módulo
    for (const moduleRecord of installedModules) {
      const module = await this.loadModule(moduleRecord.module_id);
      if (module) {
        this.modules.set(moduleRecord.module_id, module);
        
        // Initialize module if needed
        if (module.initialize) {
          await module.initialize(this.tenantId);
        }
      }
    }
  }
  
  /**
   * Get module instance
   */
  get(moduleId: string): IModule | null {
    return this.modules.get(moduleId) || null;
  }
  
  /**
   * Check if module is installed and active
   */
  isInstalled(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }
  
  /**
   * List all installed module IDs
   */
  list(): string[] {
    return Array.from(this.modules.keys());
  }
  
  /**
   * Query across multiple modules
   */
  async queryAll(query: CrossModuleQuery): Promise<any[]> {
    const results: any[] = [];
    
    for (const moduleId of query.modules) {
      const module = this.get(moduleId);
      if (!module) {
        console.warn(`Module ${moduleId} not installed, skipping query`);
        continue;
      }
      
      try {
        const dataInterface = module.exposeData();
        
        // Create new query builder for this module
        let queryBuilder = dataInterface.createQuery();
        queryBuilder = queryBuilder.select(query.entity);
        
        if (query.filters) {
          queryBuilder = queryBuilder.where(query.filters);
        }
        
        if (query.orderBy) {
          queryBuilder = queryBuilder.orderBy(query.orderBy.field, query.orderBy.direction);
        }
        
        if (query.limit) {
          queryBuilder = queryBuilder.limit(query.limit);
        }
        
        if (query.offset) {
          queryBuilder = queryBuilder.offset(query.offset);
        }
        
        const moduleResults = await queryBuilder.execute();
        
        // Tag results with module source
        const taggedResults = moduleResults.map(item => ({
          ...item,
          _moduleSource: moduleId
        }));
        
        results.push(...taggedResults);
      } catch (error) {
        console.error(`Error querying module ${moduleId}:`, error);
        // Continue with other modules
      }
    }
    
    return results;
  }
  
  /**
   * Get data interface for specific module
   */
  getDataInterface(moduleId: string): ModuleDataInterface | null {
    const module = this.get(moduleId);
    return module ? module.exposeData() : null;
  }
  
  /**
   * Install module for tenant
   */
  async installModule(moduleId: string, installedBy: string): Promise<void> {
    // Check if already installed
    if (this.isInstalled(moduleId)) {
      throw new Error(`Module ${moduleId} already installed`);
    }
    
    // Load module class
    const module = await this.loadModule(moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }
    
    // Create DB record (tenant-scoped table)
    await insertIntoTenantTable(this.tenantId, 'tenant_modules', {
      tenant_id: this.tenantId,
      module_id: moduleId,
      is_active: true,
      installed_at: new Date(),
      installed_by: installedBy
    });
    
    // Run onInstall hook
    if (module.hooks.onInstall) {
      await module.hooks.onInstall(this.tenantId);
    }
    
    // Add to registry
    this.modules.set(moduleId, module);
    
    // Initialize
    if (module.initialize) {
      await module.initialize(this.tenantId);
    }
  }
  
  /**
   * Uninstall module for tenant
   * Removes module tables and custom_tables metadata, then removes from tenant_modules
   * 
   * @param moduleId - Module ID to uninstall
   * @param hardDeleteTables - If true, physically DROP tables. If false, soft delete (rename). Default: true
   */
  async uninstallModule(moduleId: string, hardDeleteTables: boolean = true): Promise<void> {
    const module = this.get(moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not installed`);
    }
    
    // Run onUninstall hook first
    if (module.hooks.onUninstall) {
      await module.hooks.onUninstall(this.tenantId);
    }
    
    // Remove module tables and custom_tables metadata
    try {
      const tableResult = await moduleTableService.removeModuleTables(
        this.tenantId,
        moduleId,
        hardDeleteTables
      );
      console.log(`[ModuleRegistry] ✅ Removed ${tableResult.tablesRemoved} table(s) for module ${moduleId}`);
      if (tableResult.errors.length > 0) {
        console.warn(`[ModuleRegistry] ⚠️ Some tables failed to remove:`, tableResult.errors);
      }
    } catch (error: any) {
      console.error(`[ModuleRegistry] ⚠️ Failed to remove module tables:`, error.message);
      // Continue with module removal even if table removal fails
    }
    
    // Remove from DB (tenant-scoped table)
    await deleteFromTenantTable(
      this.tenantId,
      'tenant_modules',
      sql`module_id = ${moduleId}`
    );
    
    // Remove from registry
    this.modules.delete(moduleId);
  }
  
  /**
   * Activate/Deactivate module
   */
  async setModuleActive(moduleId: string, isActive: boolean): Promise<void> {
    const module = this.get(moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not installed`);
    }
    
    // Update DB (tenant-scoped table)
    await updateTenantTable(
      this.tenantId,
      'tenant_modules',
      { is_active: isActive },
      sql`module_id = ${moduleId}`
    );
    
    // Run lifecycle hook
    if (isActive && module.hooks.onActivate) {
      await module.hooks.onActivate(this.tenantId);
    } else if (!isActive && module.hooks.onDeactivate) {
      await module.hooks.onDeactivate(this.tenantId);
    }
  }
  
  /**
   * Get module health status
   */
  async getModuleHealth(moduleId: string): Promise<boolean> {
    const module = this.get(moduleId);
    if (!module || !module.healthCheck) {
      return true; // Assume healthy if no health check
    }
    
    try {
      return await module.healthCheck();
    } catch (error) {
      console.error(`Health check failed for module ${moduleId}:`, error);
      return false;
    }
  }
  
  /**
   * Get all modules health
   */
  async getAllModulesHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};
    
    for (const moduleId of this.list()) {
      health[moduleId] = await this.getModuleHealth(moduleId);
    }
    
    return health;
  }
  
  /**
   * Register module class manually (antes do dynamic import)
   */
  static moduleRegistry: Map<string, () => IModule> = new Map();
  
  static registerModule(moduleId: string, factory: () => IModule): void {
    this.moduleRegistry.set(moduleId, factory);
  }
  
  /**
   * Load module class
   * Usa registry estático primeiro, depois tenta dynamic import
   */
  private async loadModule(moduleId: string): Promise<IModule | null> {
    try {
      // Tentar registry estático primeiro
      const factory = ModuleRegistryService.moduleRegistry.get(moduleId);
      if (factory) {
        return factory();
      }
      
      // Fallback para dynamic import (FASE 2+)
      switch (moduleId) {
        // À medida que migramos os módulos, adicionar aqui:
        // case 'comercial':
        //   const { ComercialModule } = await import('../comercial');
        //   return new ComercialModule();
        // case 'financeiro':
        //   const { FinanceiroModule } = await import('../financeiro');
        //   return new FinanceiroModule();
        // ... etc
        
        default:
          console.warn(`Unknown module: ${moduleId}`);
          return null;
      }
    } catch (error) {
      console.error(`Failed to load module ${moduleId}:`, error);
      return null;
    }
  }
}

/**
 * Helper function to create module registry for tenant
 */
export async function createModuleRegistry(tenantId: string): Promise<ModuleRegistryService> {
  const registry = new ModuleRegistryService(tenantId);
  await registry.loadModules();
  return registry;
}
