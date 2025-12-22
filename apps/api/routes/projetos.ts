/**
 * Projetos (Projects) Module Routes
 * 
 * Main router for Projects module including:
 * - Cross-module linking endpoints
 * - Project CRUD
 * - Templates & configuration
 */

import { Router } from 'express';
import { linkRoutes } from '../../../packages/modules/projetos/routes/link-routes';
import { crudRoutes } from '../../../packages/modules/projetos/routes/crud-routes';
import { projectsRoutes } from '../../../packages/modules/projetos/routes/projects-routes';
import { projectSubItemsRoutes } from '../../../packages/modules/projetos/routes/project-subitems-routes';
import { attachUserPermissions } from '../middleware/permissions.middleware';

const router = Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Attach user permissions to all projetos routes
// This populates (req as any).userPermissions for LinkResolver
router.use(attachUserPermissions);

// ============================================================================
// CRUD & TEMPLATES
// ============================================================================

// Mount CRUD routes under /api/projetos
router.use('/', crudRoutes);

// ============================================================================
// PROJECTS LISTING & MANAGEMENT
// ============================================================================

// Mount projects routes under /api/projetos
router.use('/', projectsRoutes);

// ============================================================================
// SUB-ITEMS MANAGEMENT
// ============================================================================

// Mount sub-items routes (menu, materials, milestones, team, tasks, expenses)
router.use('/', projectSubItemsRoutes);

// ============================================================================
// LINK MANAGEMENT
// ============================================================================

// Mount link routes under /api/projetos
router.use('/', linkRoutes);

export default router;
