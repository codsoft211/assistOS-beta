// Migrated from AssistOS legacy - Extended in Phase 4.1
import { db } from './db';
import { userTenants } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { UserScopes } from '../../shared/schema';

export function getDefaultScopes(role: string): UserScopes {
  if (role === 'owner') {
    return {
      viewOwnData: true,
      viewAllClients: true,
      viewAllOrders: true,
      viewAllInvoices: true,
      viewAllPayables: true,
      viewFinancialData: true,
      createForOthers: true,
      configureAutomations: true,
      manageUsers: true,
      manageModules: true,
      fullAccess: true,
    };
  }

  if (role === 'admin') {
    return {
      viewOwnData: true,
      viewAllClients: true,
      viewAllOrders: true,
      viewAllInvoices: true,
      viewAllPayables: true,
      viewFinancialData: true,
      createForOthers: true,
      configureAutomations: true,
      manageUsers: true,
      manageModules: false,
      fullAccess: false,
    };
  }

  if (role === 'config') {
    return {
      viewOwnData: true,
      viewAllClients: true,
      viewAllOrders: true,
      viewAllInvoices: true,
      viewAllPayables: false,
      viewFinancialData: false,
      createForOthers: true,
      configureAutomations: true,
      manageUsers: true,
      manageModules: true,
      fullAccess: false,
    };
  }

  // Default user role
  return {
    viewOwnData: true,
    viewAllClients: false,
    viewAllOrders: false,
    viewAllInvoices: false,
    viewAllPayables: false,
    viewFinancialData: false,
    createForOthers: false,
    configureAutomations: false,
    manageUsers: false,
    manageModules: false,
    fullAccess: false,
  };
}

/**
 * Get user permissions for a tenant
 * Used by users.ts and permissions.ts routes
 */
export async function getUserPermissions(userId: string, tenantId: string) {
  const [result] = await db
    .select({
      role: userTenants.role,
      permissions: userTenants.permissions,
      scopes: userTenants.scopes,
    })
    .from(userTenants)
    .where(and(
      eq(userTenants.userId, userId),
      eq(userTenants.tenantId, tenantId)
    ))
    .limit(1);

  return result || null;
}

/**
 * Check if user can manage other users
 * Used by users.ts routes
 */
export function canManageUsers(role: string): boolean {
  return ['owner', 'admin', 'config'].includes(role);
}

/**
 * Expand simple module-level permission
 * Handles permissions like: { compras: 'full' } or { financeiro: 'read' }
 * 
 * @param module - Module name (e.g., 'compras', 'financeiro')
 * @param level - Permission level ('read', 'write', 'full', 'none')
 * @returns Array of permission strings
 * 
 * @example
 * expandSimplePermission('compras', 'full')
 *   → ['purchasing.read', 'purchasing.write', 'purchasing.delete', 'purchasing.approve']
 * 
 * expandSimplePermission('financeiro', 'read')
 *   → ['financial.read']
 */
function expandSimplePermission(module: string, level: string): string[] {
  const permissions: string[] = [];
  
  if (!level || level === 'none') {
    return permissions;
  }
  
  // Read permission
  if (level === 'read' || level === 'write' || level === 'full') {
    permissions.push(`${module}.read`);
  }
  
  // Write permission
  if (level === 'write' || level === 'full') {
    permissions.push(`${module}.write`);
  }
  
  // Full permissions (delete + approve)
  if (level === 'full') {
    permissions.push(`${module}.delete`);
    permissions.push(`${module}.approve`);
  }
  
  return permissions;
}

/**
 * Expand scoped permission within a module
 * Handles permissions like: { compras: { suppliers: 'read', purchaseOrders: 'full' } }
 * 
 * Generates both scoped permissions AND module-level fallbacks to ensure
 * existing middleware checks continue to work.
 * 
 * @param module - Module name (e.g., 'compras')
 * @param scope - Scope within module (e.g., 'suppliers', 'purchaseOrders')
 * @param level - Permission level ('read', 'write', 'full', 'none')
 * @returns Array of permission strings (includes both scoped and module-level fallbacks)
 * 
 * @example
 * expandScopedPermission('compras', 'suppliers', 'full')
 *   → [
 *       'compras.suppliers.read', 'compras.suppliers.write', 
 *       'compras.suppliers.delete', 'compras.suppliers.approve',
 *       'purchasing.read', 'purchasing.write', 'purchasing.delete', 'purchasing.approve'
 *     ]
 * 
 * expandScopedPermission('compras', 'purchaseOrders', 'read')
 *   → ['compras.purchaseOrders.read', 'purchasing.read']
 */
function expandScopedPermission(module: string, scope: string, level: string): string[] {
  const permissions: string[] = [];
  
  if (!level || level === 'none') {
    return permissions;
  }
  
  // Scoped permissions
  if (level === 'read' || level === 'write' || level === 'full') {
    permissions.push(`${module}.${scope}.read`);
  }
  if (level === 'write' || level === 'full') {
    permissions.push(`${module}.${scope}.write`);
  }
  if (level === 'full') {
    permissions.push(`${module}.${scope}.delete`);
    permissions.push(`${module}.${scope}.approve`);
  }
  
  // Module-level fallback permissions
  // These ensure existing middleware checks like requirePermission('purchasing.read') 
  // continue to work even when permissions are scoped
  if (level === 'read' || level === 'write' || level === 'full') {
    permissions.push(`${module}.read`);
  }
  if (level === 'write' || level === 'full') {
    permissions.push(`${module}.write`);
  }
  if (level === 'full') {
    permissions.push(`${module}.delete`);
    permissions.push(`${module}.approve`);
  }
  
  return permissions;
}

/**
 * Get user permissions as an array of permission strings
 * Used by permissions middleware to check module-level permissions
 * 
 * Supports both simple and nested permission structures:
 * - Simple: { compras: 'full', financeiro: 'read' }
 * - Nested: { compras: { suppliers: 'read', purchaseOrders: 'full' } }
 * - Mixed: { compras: { suppliers: 'full' }, financeiro: 'read' }
 * 
 * Returns permission strings like: ['purchasing.read', 'purchasing.write', 'financial.read', ...]
 * 
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @returns Array of permission strings
 */
export async function getUserPermissionsInTenant(userId: string, tenantId: string): Promise<string[]> {
  const userPerms = await getUserPermissions(userId, tenantId);
  
  if (!userPerms) {
    console.log('[getUserPermissionsInTenant] No user permissions found', { userId, tenantId });
    return [];
  }

  // Admin and owner roles have all permissions
  if (['owner', 'admin'].includes(userPerms.role)) {
    console.log('[getUserPermissionsInTenant] Admin/Owner role - granting all permissions', { 
      userId, 
      tenantId, 
      role: userPerms.role 
    });
    return [
      'purchasing.read', 'purchasing.write', 'purchasing.delete', 'purchasing.approve',
      'sales.read', 'sales.write', 'sales.delete',
      'financial.read', 'financial.write', 'financial.delete',
      'logistics.read', 'logistics.write', 'logistics.delete',
      'projects.read', 'projects.write', 'projects.delete',
      'documents.read', 'documents.write', 'documents.delete',
      'lead-generation.read', 'lead-generation.write', 'lead-generation.delete',
      'lead-generation.qualify', 'lead-generation.convert', 'lead-generation.manage_sources',
      'lead-generation.manage_scoring',
      'crm.read', 'crm.write', 'crm.delete',
      'projects.read', 'projects.write', 'projects.delete',
    ];
  }

  // For other roles, dynamically extract permissions from the permissions object
  const allPermissions: string[] = [];
  
  if (userPerms.permissions) {
    const modulePermissions = userPerms.permissions as Record<string, any>;
    
    console.log('[getUserPermissionsInTenant] Processing dynamic permissions', { 
      userId, 
      tenantId, 
      role: userPerms.role,
      modulePermissions 
    });
    
    // Dynamically iterate over all modules in permissions
    for (const [moduleName, moduleConfig] of Object.entries(modulePermissions)) {
      if (!moduleConfig) continue;
      
      if (typeof moduleConfig === 'string') {
        // Simple module-level permission: { compras: 'full' }
        console.log('[getUserPermissionsInTenant] Expanding simple permission', { 
          moduleName, 
          level: moduleConfig 
        });
        allPermissions.push(...expandSimplePermission(moduleName, moduleConfig));
      } else if (typeof moduleConfig === 'object' && moduleConfig !== null) {
        // Nested scope-level permissions: { compras: { suppliers: 'read', purchaseOrders: 'full' } }
        console.log('[getUserPermissionsInTenant] Processing nested permissions', { 
          moduleName, 
          scopes: Object.keys(moduleConfig) 
        });
        
        for (const [scope, level] of Object.entries(moduleConfig)) {
          if (typeof level === 'string') {
            console.log('[getUserPermissionsInTenant] Expanding scoped permission', { 
              moduleName, 
              scope, 
              level 
            });
            allPermissions.push(...expandScopedPermission(moduleName, scope, level as string));
          }
        }
      }
    }
  }

  // Deduplicate permissions
  const uniquePermissions = Array.from(new Set(allPermissions));
  
  console.log('[getUserPermissionsInTenant] Final permissions', { 
    userId, 
    tenantId, 
    role: userPerms.role,
    permissionCount: uniquePermissions.length,
    permissions: uniquePermissions 
  });

  return uniquePermissions;
}

// ==================== ENVIRONMENT MANAGEMENT (Phase 4.2) ====================

export type Environment = 'sandbox' | 'production';

/**
 * Get current active environment for user in tenant
 */
export async function getCurrentEnvironment(userId: string, tenantId: string): Promise<Environment> {
  const [result] = await db
    .select({
      activeEnvironment: userTenants.activeEnvironment,
    })
    .from(userTenants)
    .where(and(
      eq(userTenants.userId, userId),
      eq(userTenants.tenantId, tenantId)
    ))
    .limit(1);

  return (result?.activeEnvironment || 'production') as Environment;
}

/**
 * Switch environment (sandbox ↔ production)
 * Returns success status and error message if failed
 */
export async function switchEnvironment(
  userId: string, 
  tenantId: string, 
  environment: Environment
): Promise<{ success: boolean; error?: string }> {
  // Get user permissions
  const userPerms = await getUserPermissions(userId, tenantId);
  
  if (!userPerms) {
    return { success: false, error: 'User not found in tenant' };
  }

  // Check if user can access sandbox (only admin/owner/config)
  const canAccessSandbox = ['owner', 'admin', 'config'].includes(userPerms.role);
  
  if (environment === 'sandbox' && !canAccessSandbox) {
    return { 
      success: false, 
      error: 'You do not have permission to access sandbox environment' 
    };
  }

  // Update environment
  await db
    .update(userTenants)
    .set({ 
      activeEnvironment: environment,
    })
    .where(and(
      eq(userTenants.userId, userId),
      eq(userTenants.tenantId, tenantId)
    ));

  return { success: true };
}
