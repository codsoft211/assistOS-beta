import express from 'express';
import { db } from '../db';
import { detectedPatterns, tenantWorkflows } from '../../../shared/schema';
import { and, eq, isNull, desc, sql } from 'drizzle-orm';
import { patternDetector } from '../../../packages/ai/services/pattern-detector';
import { patternSuggestionService } from '../../../packages/ai/services/pattern-suggestion.service';
import { quotaMiddleware } from '../middleware/quota.middleware';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { dismissed = 'false', analyze = 'false' } = req.query;
    const tenantId = user.activeTenantId;
    const userId = user.id;

    if (analyze === 'true') {
      console.log(`[Patterns] Executando análise para user ${userId}`);
      const freshPatterns = await patternDetector.detectPatterns(tenantId, userId);
      
      for (const pattern of freshPatterns) {
        await db.insert(detectedPatterns).values({
          id: pattern.id,
          tenantId,
          userId,
          type: pattern.type,
          sequence: pattern.sequence,
          occurrences: pattern.occurrences,
          confidence: pattern.confidence,
          suggestedWorkflow: pattern.suggestedWorkflow,
          firstSeen: pattern.firstSeen,
          lastSeen: pattern.lastSeen,
        }).onConflictDoUpdate({
          target: detectedPatterns.id,
          set: {
            occurrences: sql`EXCLUDED.occurrences`,
            confidence: sql`EXCLUDED.confidence`,
            lastSeen: sql`EXCLUDED.last_seen`,
            updatedAt: sql`NOW()`,
          }
        });
      }
    }

    const whereConditions = [
      eq(detectedPatterns.tenantId, tenantId),
      eq(detectedPatterns.userId, userId),
    ];

    if (dismissed === 'false') {
      whereConditions.push(isNull(detectedPatterns.dismissedAt));
    }

    const patterns = await db.query.detectedPatterns.findMany({
      where: and(...whereConditions),
      orderBy: [desc(detectedPatterns.confidence), desc(detectedPatterns.occurrences)],
      limit: 20,
    });

    res.json(patterns);
  } catch (error) {
    console.error('[Patterns] Erro ao buscar patterns:', error);
    res.status(500).json({ error: 'Erro ao buscar patterns' });
  }
});

router.post('/:id/dismiss', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { id } = req.params;

    await db.update(detectedPatterns)
      .set({ dismissedAt: new Date() })
      .where(and(
        eq(detectedPatterns.id, id),
        eq(detectedPatterns.tenantId, user.activeTenantId),
        eq(detectedPatterns.userId, user.id)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error('[Patterns] Erro ao dismissar pattern:', error);
    res.status(500).json({ error: 'Erro ao dismissar pattern' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { id } = req.params;

    await db.delete(detectedPatterns)
      .where(and(
        eq(detectedPatterns.id, id),
        eq(detectedPatterns.tenantId, user.activeTenantId),
        eq(detectedPatterns.userId, user.id)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error('[Patterns] Erro ao remover pattern:', error);
    res.status(500).json({ error: 'Erro ao remover pattern' });
  }
});

/**
 * POST /api/patterns/:id/create-workflow
 * Create a workflow from a detected pattern
 * 
 * GAP #5: Enforces workflow quota limits via quotaMiddleware
 */
router.post('/:id/create-workflow', quotaMiddleware('workflows'), async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { id } = req.params;
    const tenantId = user.activeTenantId;

    const [pattern] = await db.select()
      .from(detectedPatterns)
      .where(and(
        eq(detectedPatterns.id, id),
        eq(detectedPatterns.tenantId, tenantId),
        eq(detectedPatterns.userId, user.id)
      ))
      .limit(1);

    if (!pattern) {
      return res.status(404).json({ error: 'Pattern não encontrado' });
    }

    const workflowData = {
      tenantId,
      name: pattern.suggestedWorkflow.name,
      description: pattern.suggestedWorkflow.description,
      triggerType: 'manual' as const,
      triggerConfig: {},
      steps: pattern.sequence.map((step, index) => ({
        id: `step_${index}`,
        type: 'tool_execution',
        name: step.toolName || step.actionType,
        config: {
          tool: step.toolName || step.actionType,
          category: step.category,
        },
        nextSteps: index < pattern.sequence.length - 1 ? [`step_${index + 1}`] : [],
        order: index,
      })),
      isActive: false,
      createdBy: user.id,
    };

    const [newWorkflow] = await db.insert(tenantWorkflows)
      .values(workflowData)
      .returning();

    await db.update(detectedPatterns)
      .set({ dismissedAt: new Date() })
      .where(eq(detectedPatterns.id, id));

    res.json({ 
      success: true,
      workflow: newWorkflow 
    });
  } catch (error) {
    console.error('[Patterns] Erro ao criar workflow:', error);
    res.status(500).json({ error: 'Erro ao criar workflow' });
  }
});

// ==================== CROSS-TENANT PATTERN ENDPOINTS (GAP #4) ====================

/**
 * GET /api/patterns/suggestions
 * Get cross-tenant pattern suggestions for the current tenant
 * Query params:
 * - category: Optional category filter
 * - minUtilityScore: Minimum utility score (0-1)
 * - limit: Max results
 */
router.get('/suggestions', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { category, minUtilityScore, limit } = req.query;
    // CRITICAL: Environment derived from request context (never user-controlled header)
    // Default to sandbox for safety - production access requires explicit tenant configuration
    const environment = (req as any).environment || 'sandbox';

    const suggestions = await patternSuggestionService.getSuggestionsForTenant(
      user.activeTenantId,
      environment,
      {
        category: category as string | undefined,
        minUtilityScore: minUtilityScore ? parseFloat(minUtilityScore as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      }
    );

    res.json(suggestions);
  } catch (error) {
    console.error('[Patterns] Erro ao buscar sugestões cross-tenant:', error);
    res.status(500).json({ error: 'Erro ao buscar sugestões' });
  }
});

/**
 * GET /api/patterns/search
 * Search cross-tenant patterns by keyword
 * Query params:
 * - q: Search query (required)
 * - limit: Max results
 */
router.get('/search', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { q, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" é obrigatório' });
    }

    // CRITICAL: Environment derived from request context (never user-controlled header)
    const environment = (req as any).environment || 'sandbox';

    const results = await patternSuggestionService.searchPatterns(
      q as string,
      environment,
      limit ? parseInt(limit as string, 10) : undefined
    );

    res.json({
      query: q,
      totalResults: results.length,
      patterns: results,
    });
  } catch (error) {
    console.error('[Patterns] Erro ao buscar patterns:', error);
    res.status(500).json({ error: 'Erro ao buscar patterns' });
  }
});

/**
 * GET /api/patterns/adoption-stats
 * Get cross-tenant pattern adoption statistics
 */
router.get('/adoption-stats', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // CRITICAL: Environment derived from request context (never user-controlled header)
    const environment = (req as any).environment || 'sandbox';

    const stats = await patternSuggestionService.getAdoptionStats(environment);

    res.json(stats);
  } catch (error) {
    console.error('[Patterns] Erro ao buscar estatísticas de adoção:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export default router;
