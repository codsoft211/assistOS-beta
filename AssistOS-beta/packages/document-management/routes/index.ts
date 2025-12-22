/**
 * Document Management Routes
 * 
 * Combines all document management routes into a single router
 * to be mounted in the main Express application.
 * 
 * Usage in main app:
 * ```typescript
 * import documentRoutes from './packages/document-management/routes';
 * app.use('/api', documentRoutes);
 * ```
 * 
 * This will mount:
 * - /api/documents (document management routes)
 * - /api/storage-providers (storage provider routes)
 */

import { Router } from 'express';
import documentsRouter from './documents';
import providersRouter from './providers';
import foldersRouter from './folders';
import { requireAuth } from '../../../apps/api/middleware/auth.middleware';
import { tenantMiddleware } from '../../../apps/api/middleware/tenant-middleware';

const router = Router();

// Apply authentication and tenant middleware to all document management routes
router.use(requireAuth);
router.use(tenantMiddleware);

// Mount routers
router.use('/documents', documentsRouter);
router.use('/storage-providers', providersRouter);
router.use('/folders', foldersRouter);

export default router;
