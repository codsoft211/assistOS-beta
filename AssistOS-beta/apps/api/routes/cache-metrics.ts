/**
 * Cache Metrics API
 * 
 * Endpoint para monitorizar performance do cache de platform resources
 * Útil para validar redução de tool calls e ROI do sistema
 * 
 * SECURITY: All mutation endpoints require authentication
 */

import { Router } from 'express';
import { platformCache } from '../../../packages/ai/agents/core/prompt-builder';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/cache/metrics
 * 
 * Retorna métricas de cache hit/miss rate
 * PROTECTED: Requires authentication (telemetria sensível)
 * 
 * Response:
 * {
 *   hits: 150,
 *   misses: 30,
 *   sets: 30,
 *   evictions: 5,
 *   hitRate: 83.33,  // percentagem
 *   size: 25         // entradas ativas
 * }
 */
router.get('/metrics', requireAuth, (req, res) => {
  const metrics = platformCache.getMetrics();
  
  res.json({
    ...metrics,
    timestamp: new Date().toISOString(),
    message: `Cache hit rate: ${metrics.hitRate}% (${metrics.hits} hits, ${metrics.misses} misses)`
  });
});

/**
 * POST /api/cache/reset-metrics
 * 
 * Limpa todas as métricas (útil para testes)
 * PROTECTED: Requires authentication
 */
router.post('/reset-metrics', requireAuth, (req, res) => {
  platformCache.resetMetrics();
  
  res.json({
    message: 'Cache metrics reset successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/cache/clear
 * 
 * Limpa todo o cache (força tool calls na próxima consulta)
 * PROTECTED: Requires authentication
 */
router.post('/clear', requireAuth, (req, res) => {
  platformCache.clear();
  
  res.json({
    message: 'Cache cleared successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * DELETE /api/cache/:tenantId
 * 
 * Invalida cache para tenant específico
 * PROTECTED: Requires authentication
 */
router.delete('/:tenantId', requireAuth, (req, res) => {
  const { tenantId } = req.params;
  platformCache.invalidate(tenantId);
  
  res.json({
    message: `Cache invalidated for tenant ${tenantId}`,
    timestamp: new Date().toISOString()
  });
});

export default router;
