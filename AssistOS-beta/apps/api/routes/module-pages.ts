/**
 * Module Pages Routes
 * 
 * Manages hierarchical page structure for modules:
 * - GET /api/module-pages/:moduleId/tree - Get nested page hierarchy
 * - POST /api/module-pages - Create new page (owner/admin)
 * - PATCH /api/module-pages/:pageId - Update page (owner/admin)
 * - PATCH /api/module-pages/reorder - Batch reorder pages (owner/admin)
 * - DELETE /api/module-pages/:pageId - Delete page (owner/admin)
 */

import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant-middleware';
import {
  getModulePageTree,
  createModulePage,
  updateModulePage,
  deleteModulePage,
  reorderModulePages,
} from '../services/module-page.service';
import { db } from '../db';
import { userTenants, insertModulePageSchema } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

// All routes require auth + tenant context
router.use(requireAuth);
router.use(tenantMiddleware);

/**
 * GET /api/module-pages/:moduleId/tree
 * Get nested page hierarchy for a module
 * Public for all authenticated users with tenant context
 */
router.get('/:moduleId/tree', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { moduleId } = req.params;
    const environment = (req.query.environment as 'production' | 'sandbox') || 'production';

    const tree = await getModulePageTree(tenantId, moduleId, environment);

    res.json({ pages: tree });
  } catch (error: any) {
    console.error('[Module Pages API] Error fetching page tree:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch page tree' });
  }
});

/**
 * POST /api/module-pages
 * Create a new module page
 * Only accessible by owner/admin
 */
router.post('/', async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const tenantId = (req as any).tenantId;

      // Check if user is owner or admin
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

      if (!userTenant[0] || !['owner', 'admin'].includes(userTenant[0].role)) {
        return res.status(403).json({ error: 'Insufficient permissions. Only owners and admins can create pages.' });
      }

      // Validate request body
      const result = insertModulePageSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: result.error.errors,
        });
      }

      const data = result.data;

      // Ensure tenantId matches authenticated tenant
      if (data.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Cannot create pages for other tenants' });
      }

      const created = await createModulePage(data);

      res.status(201).json({ page: created });
    } catch (error: any) {
      console.error('[Module Pages API] Error creating page:', error);
      res.status(500).json({ error: error.message || 'Failed to create page' });
    }
  });

/**
 * PATCH /api/module-pages/:pageId
 * Update a module page
 * Only accessible by owner/admin
 */
router.patch('/:pageId', async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const tenantId = (req as any).tenantId;
      const { pageId } = req.params;

      // Check if user is owner or admin
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

      if (!userTenant[0] || !['owner', 'admin'].includes(userTenant[0].role)) {
        return res.status(403).json({ error: 'Insufficient permissions. Only owners and admins can update pages.' });
      }

      // Validate request body (partial schema)
      const updateSchema = insertModulePageSchema.partial();
      const result = updateSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: result.error.errors,
        });
      }

      const updates = result.data;

      // Prevent changing tenantId
      if (updates.tenantId && updates.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Cannot change page tenant' });
      }

      const updated = await updateModulePage(pageId, updates, tenantId);

      res.json({ page: updated });
    } catch (error: any) {
      console.error('[Module Pages API] Error updating page:', error);
      res.status(500).json({ error: error.message || 'Failed to update page' });
    }
  });

/**
 * PATCH /api/module-pages/reorder
 * Batch reorder module pages
 * Only accessible by owner/admin
 */
const reorderSchema = z.object({
  pages: z.array(
    z.object({
      pageId: z.string(),
      displayOrder: z.number().int().min(0),
    })
  ).min(1),
});

router.patch('/reorder', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const tenantId = (req as any).tenantId;

    // Check if user is owner or admin
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

    if (!userTenant[0] || !['owner', 'admin'].includes(userTenant[0].role)) {
      return res.status(403).json({ error: 'Insufficient permissions. Only owners and admins can reorder pages.' });
    }

    // Validate request body
    const result = reorderSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: result.error.errors,
      });
    }

    const { pages } = result.data;

    await reorderModulePages(pages, tenantId);

    res.json({
      success: true,
      message: `Reordered ${pages.length} pages`,
    });
  } catch (error: any) {
    console.error('[Module Pages API] Error reordering pages:', error);
    res.status(500).json({ error: error.message || 'Failed to reorder pages' });
  }
});

/**
 * DELETE /api/module-pages/:pageId
 * Delete a module page
 * Only accessible by owner/admin
 */
router.delete('/:pageId', async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const tenantId = (req as any).tenantId;
      const { pageId } = req.params;

      // Check if user is owner or admin
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

      if (!userTenant[0] || !['owner', 'admin'].includes(userTenant[0].role)) {
        return res.status(403).json({ error: 'Insufficient permissions. Only owners and admins can delete pages.' });
      }

      await deleteModulePage(pageId, tenantId);

      res.json({
        success: true,
        message: 'Page deleted successfully',
      });
    } catch (error: any) {
      console.error('[Module Pages API] Error deleting page:', error);
      res.status(500).json({ error: error.message || 'Failed to delete page' });
    }
  });

export default router;
