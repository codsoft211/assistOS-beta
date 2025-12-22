/**
 * Module Management Routes (FASE 2)
 * 
 * Endpoints para gestão de módulos:
 * - Listar catálogo de módulos disponíveis
 * - Gestão de módulos instalados (owner/admin)
 * - Sidebar dinâmica com módulos filtrados por user
 * - Preferências de visibilidade por user
 */

import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant-middleware';
import {
  getModuleCatalog,
  getTenantModules,
  getAllModulesWithStatus,
  getUserModuleSidebar,
  updateModuleStatus,
  updateUserPreference,
} from '../services/module.service';
import { getUserRoleInTenant } from '../services/tenant.service';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { ModuleRegistryService } from '../../../packages/modules/base/module-registry.service';
import { realtimeEvents } from '../services/event-emitter';
import { validateCoreMutation, recordMutationMiddleware } from '../middleware/core-protection.middleware';
import { selectFromTenantTable, selectOneFromTenantTable } from '../utils/tenant-db-helper';
import { tenants } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

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

const router = express.Router();

// DEBUG ENDPOINT - Remove after testing
router.get('/debug/registry', (req, res) => {
  const modules = Array.from(ModuleRegistryService.moduleRegistry.keys());
  res.json({ 
    count: modules.length,
    modules,
    message: modules.length === 0 ? 'NO MODULES REGISTERED!' : 'Modules OK'
  });
});

// DEBUG ENDPOINT - Force cache invalidation via SSE
router.get('/debug/invalidate-cache', async (req, res) => {
  try {
    // Get all active tenants from DB
    const results = await db.select({ id: tenants.id })
      .from(tenants);
    
    // Emit event for each tenant
    for (const { id } of results) {
      realtimeEvents.emitForTenant('modules.updated', id, {});
    }
    
    res.json({ 
      success: true,
      message: `Emitted modules.updated event for ${results.length} tenants`,
      tenants: results.map(r => r.id)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// All routes require auth + tenant context
router.use(requireAuth);
router.use(tenantMiddleware);

/**
 * GET /api/modules/catalog
 * List all available modules from registry
 * Public for all authenticated users
 */
router.get('/catalog', async (req, res) => {
  try {
    const catalog = await getModuleCatalog();
    res.json({ modules: catalog });
  } catch (error: any) {
    console.error('[Modules API] Error fetching catalog:', error);
    res.status(500).json({ error: 'Failed to fetch module catalog' });
  }
});

/**
 * GET /api/modules/tenant
 * List installed modules for tenant
 * Only accessible by owner/admin/config
 */
router.get('/tenant', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const tenantId = (req as any).tenantId;
    
    // Check if user is owner, admin, or config (queries tenant schema)
    const userRole = await getUserRoleInTenant(userId, tenantId);
    
    if (!userRole || !['owner', 'admin', 'config'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const modules = await getTenantModules(tenantId);
    res.json({ modules });
  } catch (error: any) {
    console.error('[Modules API] Error fetching tenant modules:', error);
    res.status(500).json({ error: 'Failed to fetch tenant modules' });
  }
});

/**
 * GET /api/modules/available
 * List ALL available modules with tenant activation status
 * For Configuration Studio - shows complete catalog with active/inactive flags
 * Only accessible by owner/admin/config
 */
router.get('/available', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const tenantId = (req as any).tenantId;
    
    // Check if user is owner, admin, or config (queries tenant schema)
    const userRole = await getUserRoleInTenant(userId, tenantId);
    
    if (!userRole || !['owner', 'admin', 'config'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const environment = (req as any).environment || 'production'; // Get environment from tenant context
    const modules = await getAllModulesWithStatus(tenantId, environment);
    res.json({ modules });
  } catch (error: any) {
    console.error('[Modules API] Error fetching available modules:', error);
    res.status(500).json({ error: 'Failed to fetch available modules' });
  }
});

/**
 * GET /api/modules/sidebar
 * List modules for user's sidebar (filtered by permissions + preferences)
 * Accessible by all authenticated users
 */
router.get('/sidebar', async (req, res) => {
  try {
    // CRITICAL: Disable HTTP caching for this endpoint
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    const userId = (req as any).user.id;
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || 'production'; // Get environment from tenant context
    
    const modules = await getUserModuleSidebar(userId, tenantId, environment);
    res.json({ modules });
  } catch (error: any) {
    console.error('[Modules API] Error fetching sidebar modules:', error);
    res.status(500).json({ error: 'Failed to fetch sidebar modules' });
  }
});

/**
 * PATCH /api/modules/:moduleId/status
 * Update module status (activate/deactivate)
 * Only accessible by owner/admin/config
 */
const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

router.patch('/:moduleId/status', 
  async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const tenantId = (req as any).tenantId;
      const { moduleId } = req.params;
      
      // Check if user is owner, admin, or config (queries tenant schema)
      const userRole = await getUserRoleInTenant(userId, tenantId);
      
      if (!userRole || !['owner', 'admin', 'config'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      
      // Validate request body
      const result = updateStatusSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          error: 'Invalid request body',
          details: result.error.errors 
        });
      }
      
      const { isActive } = result.data;
      
      // Store snapshot for audit trail
      res.locals.assetSnapshot = { moduleId, isActive, userId, tenantId };
      res.locals.createdAssetId = moduleId;
      
      // Pass userId for custom_tables registration and audit trail
      await updateModuleStatus(tenantId, moduleId, isActive, userId);
      
      // Emit SSE event to trigger frontend cache invalidation
      realtimeEvents.emitForTenant('modules.updated', tenantId, {
        moduleId,
        action: isActive ? 'activated' : 'deactivated',
        userId,
      });
      
      res.json({ 
        success: true,
        message: `Module ${moduleId} ${isActive ? 'activated' : 'deactivated'}` 
      });
    } catch (error: any) {
      console.error('[Modules API] Error updating module status:', error);
      res.status(500).json({ error: error.message || 'Failed to update module status' });
    }
  },
  recordMutationMiddleware('module', 'update')
);

/**
 * GET /api/modules/:moduleId/config
 * Get module configuration (including UI settings)
 * Accessible by all authenticated users
 * Uses tenant-scoped tenant_modules table
 */
router.get('/:moduleId/config', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { moduleId } = req.params;
    
    // Query from tenant schema
    const module = await selectOneFromTenantTable<TenantModuleRow>(
      tenantId,
      'tenant_modules',
      sql`module_id = ${moduleId}`
    );
    
    if (!module) {
      return res.status(404).json({ error: 'Module not found or not installed' });
    }
    
    res.json({ 
      success: true,
      config: module.config || {},
      moduleId: module.module_id,
      isActive: module.is_active
    });
  } catch (error: any) {
    console.error('[Modules API] Error fetching module config:', error);
    res.status(500).json({ error: 'Failed to fetch module configuration' });
  }
});

/**
 * PATCH /api/modules/preferences
 * Update user's module visibility preferences
 * Accessible by all authenticated users
 */
const updatePreferencesSchema = z.object({
  moduleId: z.string(),
  isHidden: z.boolean(),
});

router.patch('/preferences', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const tenantId = (req as any).tenantId;
    
    // Validate request body
    const result = updatePreferencesSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Invalid request body',
        details: result.error.errors 
      });
    }
    
    const { moduleId, isHidden } = result.data;
    
    await updateUserPreference(userId, tenantId, moduleId, isHidden);
    
    res.json({ 
      success: true,
      message: `Module ${moduleId} ${isHidden ? 'hidden' : 'shown'} in sidebar` 
    });
  } catch (error: any) {
    console.error('[Modules API] Error updating user preferences:', error);
    res.status(500).json({ error: error.message || 'Failed to update preferences' });
  }
});

export default router;
