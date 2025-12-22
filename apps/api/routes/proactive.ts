/**
 * Proactive Insights API Routes
 * 
 * Endpoints para gerenciar insights proativos do sistema
 */

import express from 'express';
import { db } from '../db';
import { proactiveInsights, insertProactiveInsightSchema } from '@shared/schema';
import { and, eq, isNull, desc, sql } from 'drizzle-orm';
import { proactiveAnalyzer } from '../../../packages/ai/services/proactive-analyzer';

const router = express.Router();

/**
 * GET /api/proactive/insights
 * Retorna insights proativos para o tenant autenticado
 * Query params:
 *   - dismissed: 'true' | 'false' (default: 'false') - se deve incluir insights dismissados
 */
router.get('/insights', async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const tenantId = user.activeTenantId;
    
    // ⚠️  TEMPORARILY DISABLED - ProactiveAnalyzer has issues:
    // 1. proactive_insights table doesn't exist
    // 2. SQL syntax errors in checkUpcomingDeadlines
    // 3. Missing relation in detectOverdueItems
    // 4. Column estimated_budget doesn't exist
    // TODO: Fix these issues and re-enable
    console.log(`[Proactive] ⚠️  ProactiveAnalyzer temporarily disabled for tenant ${tenantId}`);
    
    // Return empty array for now
    res.json([]);
  } catch (error: any) {
    console.error('[Proactive] Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch proactive insights',
      message: error.message 
    });
  }
});

/**
 * POST /api/proactive/insights/:id/dismiss
 * Marca um insight como dismissado
 */
router.post('/insights/:id/dismiss', async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    const tenantId = user.activeTenantId;

    // Update the insight to mark as dismissed
    const result = await db.update(proactiveInsights)
      .set({ dismissedAt: new Date() })
      .where(and(
        eq(proactiveInsights.id, id),
        eq(proactiveInsights.tenantId, tenantId)
      ))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    console.log(`[Proactive] Dismissed insight ${id} for tenant ${tenantId}`);

    res.json({ 
      success: true,
      insight: result[0]
    });
  } catch (error: any) {
    console.error('[Proactive] Error dismissing insight:', error);
    res.status(500).json({ 
      error: 'Failed to dismiss insight',
      message: error.message 
    });
  }
});

/**
 * DELETE /api/proactive/insights/:id
 * Remove um insight permanentemente (opcional)
 */
router.delete('/insights/:id', async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    const tenantId = user.activeTenantId;

    const result = await db.delete(proactiveInsights)
      .where(and(
        eq(proactiveInsights.id, id),
        eq(proactiveInsights.tenantId, tenantId)
      ))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    console.log(`[Proactive] Deleted insight ${id} for tenant ${tenantId}`);

    res.json({ 
      success: true 
    });
  } catch (error: any) {
    console.error('[Proactive] Error deleting insight:', error);
    res.status(500).json({ 
      error: 'Failed to delete insight',
      message: error.message 
    });
  }
});

/**
 * POST /api/proactive/analyze
 * Força uma análise imediata (para testes ou refresh manual)
 */
router.post('/analyze', async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const tenantId = user.activeTenantId;

    console.log(`[Proactive] Manual analysis triggered for tenant ${tenantId}`);

    const insights = await proactiveAnalyzer.analyzeAll(tenantId);

    // UPSERT all insights
    for (const insight of insights) {
      try {
        await db.insert(proactiveInsights).values({
          id: insight.id!,
          tenantId,
          type: insight.type,
          severity: insight.severity,
          category: insight.category,
          title: insight.title,
          description: insight.description,
          suggestedActions: insight.suggestedActions,
          affectedEntities: insight.affectedEntities,
          metadata: insight.metadata
        }).onConflictDoUpdate({
          target: proactiveInsights.id,
          set: {
            severity: sql`EXCLUDED.severity`,
            title: sql`EXCLUDED.title`,
            description: sql`EXCLUDED.description`,
            suggestedActions: sql`EXCLUDED.suggested_actions`,
            affectedEntities: sql`EXCLUDED.affected_entities`,
            metadata: sql`EXCLUDED.metadata`
          }
        });
      } catch (insertError) {
        console.error('[Proactive] Error upserting insight:', insertError);
      }
    }

    res.json({ 
      success: true,
      count: insights.length,
      insights 
    });
  } catch (error: any) {
    console.error('[Proactive] Error in manual analysis:', error);
    res.status(500).json({ 
      error: 'Failed to run analysis',
      message: error.message 
    });
  }
});

export default router;
