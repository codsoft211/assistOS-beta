/**
 * Health Check Routes
 * 
 * Endpoints para verificar a saúde do sistema.
 * - GET /api/health - Quick health check (fast, para load balancers)
 * - GET /api/health/detailed - Detailed health check (completo, fluxo faturas)
 * - GET /api/health/healthz - K8s liveness probe
 * - GET /api/health/readyz - K8s readiness probe
 * 
 * IMPORTANT: Tenant middleware explicitly skips /api/health routes (see apps/api/index.ts)
 */

import { Router } from 'express';
import { getBasicHealth, getSystemHealth } from '../services/health.service';
import { Sentry } from '../sentry.js';

const router = Router();

/**
 * GET /api/health
 * Basic health check - fast response for monitoring/load balancers
 */
router.get('/', async (req, res) => {
  try {
    const health = await getBasicHealth();
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : 'Health check failed',
    });
  }
});

/**
 * GET /api/health/detailed
 * Detailed health check - full system diagnosis (invoice flow)
 */
router.get('/detailed', async (req, res) => {
  try {
    const health = await getSystemHealth();
    
    const statusCode = health.overall === 'healthy' ? 200 : 
                      health.overall === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      overall: 'unhealthy',
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : 'Health check failed',
      error: error instanceof Error ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/health/healthz
 * Kubernetes liveness probe - app is alive
 */
router.get('/healthz', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/readyz
 * Kubernetes readiness probe - app is ready to serve traffic
 * Uses full system health check to ensure all critical components are available
 */
router.get('/readyz', async (req, res) => {
  try {
    const health = await getSystemHealth();
    
    // Ready only if fully healthy (degraded = not ready for production traffic)
    if (health.overall === 'healthy') {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        reason: health.overall,
        components: {
          database: health.components.database.status,
          redis: health.components.redis.status,
          secrets: Object.entries(health.components.secrets).map(([key, val]) => ({
            name: key,
            status: val.status,
          })),
          invoiceFlow: health.components.invoiceFlow.status,
        },
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/health/sentry-test
 * Test Sentry integration - captures a test message and returns status
 */
router.get('/sentry-test', async (req, res) => {
  try {
    const sentryDsn = process.env.SENTRY_DSN;
    const hasSentry = !!sentryDsn;
    
    if (hasSentry) {
      // Send test event to Sentry
      const eventId = Sentry.captureMessage('🧪 SENTRY TEST: Integration working correctly!', 'info');
      
      req.log.info({ eventId, sentryDsn: sentryDsn.substring(0, 30) + '...' }, 'Sentry test event captured');
      
      res.status(200).json({
        status: 'configured',
        sentryDsnPresent: true,
        sentryDsnPrefix: sentryDsn.substring(0, 30) + '...',
        eventId,
        message: 'Test event sent to Sentry successfully',
        timestamp: new Date().toISOString(),
      });
    } else {
      req.log.warn('Sentry test endpoint called but SENTRY_DSN not configured');
      
      res.status(200).json({
        status: 'not_configured',
        sentryDsnPresent: false,
        message: 'SENTRY_DSN environment variable not found',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
