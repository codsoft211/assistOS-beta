/**
 * Universal Search API Routes
 * 
 * Provides endpoints for cross-module search
 */

import { Router } from 'express';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { requireAuth } from '../middleware/auth.middleware';
import { hardTenantGuard } from '../middleware/hard-tenant-guard';
import { universalSearchService } from '../../../packages/platform/services/universal-search';

const router = Router();

// All routes require authentication and tenant context
router.use(requireAuth);
router.use(hardTenantGuard);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query cannot be empty'),
  modules: z.string().optional().transform(val => val ? val.split(',') : undefined),
  entities: z.string().optional().transform(val => val ? val.split(',') : undefined),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 20).pipe(z.number().int().min(1).max(100)),
  offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0).pipe(z.number().int().min(0)),
});

/**
 * GET /api/universal-search/search
 * Textual search across all modules
 */
router.get('/search', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    
    // Validate query parameters
    const validated = searchQuerySchema.parse(req.query);

    const results = await universalSearchService.search(
      validated.q,
      tenantId,
      {
        modules: validated.modules,
        entities: validated.entities,
        limit: validated.limit,
        offset: validated.offset,
      }
    );

    res.json({ results, count: results.length });
  } catch (error: any) {
    console.error('[Universal Search] Error searching:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: fromZodError(error).message 
      });
    }
    res.status(500).json({ error: error.message || 'Failed to search' });
  }
});

/**
 * GET /api/universal-search/semantic
 * Semantic search using embeddings
 */
router.get('/semantic', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    
    // Validate query parameters
    const semanticQuerySchema = searchQuerySchema.omit({ modules: true, entities: true });
    const validated = semanticQuerySchema.parse(req.query);

    const results = await universalSearchService.semanticSearch(
      validated.q,
      tenantId,
      {
        limit: validated.limit,
        offset: validated.offset,
      }
    );

    res.json({ results, count: results.length });
  } catch (error: any) {
    console.error('[Universal Search] Error semantic searching:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: fromZodError(error).message 
      });
    }
    res.status(500).json({ error: error.message || 'Failed to semantic search' });
  }
});

/**
 * GET /api/universal-search/intelligent
 * Intelligent search (combines textual and semantic)
 */
router.get('/intelligent', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    
    // Validate query parameters
    const validated = searchQuerySchema.parse(req.query);

    const results = await universalSearchService.intelligentSearch(
      validated.q,
      tenantId,
      {
        modules: validated.modules,
        entities: validated.entities,
        limit: validated.limit,
        offset: validated.offset,
      }
    );

    res.json({ results, count: results.length });
  } catch (error: any) {
    console.error('[Universal Search] Error intelligent searching:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: fromZodError(error).message 
      });
    }
    res.status(500).json({ error: error.message || 'Failed to intelligent search' });
  }
});

export default router;

