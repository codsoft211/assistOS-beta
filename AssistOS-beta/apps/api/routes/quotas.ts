import { Router } from 'express';
import { ResourceQuotaService, type ResourceType } from '../services/resource-quota.service';
import { requireAuth } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant-middleware';
import type { Environment } from '../../../shared/types/environment';

const router = Router();
const quotaService = new ResourceQuotaService();

// Apply authentication and tenant middleware to all quota routes
router.use(requireAuth);
router.use(tenantMiddleware);

router.get('/status', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = ((req as any).environment || 'sandbox') as Environment;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const resourceTypes: ResourceType[] = [
      'schemas',
      'workflows',
      'modules',
      'patterns',
      'code_generation',
      'jobs'
    ];

    const quotaStatus = await Promise.all(
      resourceTypes.map(async (resourceType) => {
        const limits = await quotaService.getQuotaLimits(tenantId, resourceType);
        const usage = await quotaService.getCurrentUsage(tenantId, environment, resourceType);

        return {
          resourceType,
          current: usage,
          limit: limits.maxCount,
          percentage: limits.maxCount ? Math.round((usage / limits.maxCount) * 100) : 0,
          available: limits.maxCount ? limits.maxCount - usage : null,
          maxPerDay: limits.maxPerDay,
          maxPerHour: limits.maxPerHour
        };
      })
    );

    return res.json({
      tenantId,
      environment,
      quotas: quotaStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[QuotaRoutes] Error fetching status:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch quota status',
      message: error.message 
    });
  }
});

router.get('/usage/:resourceType', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = ((req as any).environment || 'sandbox') as Environment;
    const resourceType = req.params.resourceType as ResourceType;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const validResourceTypes: ResourceType[] = [
      'schemas',
      'workflows',
      'modules',
      'patterns',
      'code_generation',
      'jobs'
    ];

    if (!validResourceTypes.includes(resourceType)) {
      return res.status(400).json({ 
        error: 'Invalid resource type',
        validTypes: validResourceTypes 
      });
    }

    const limits = await quotaService.getQuotaLimits(tenantId, resourceType);
    const current = await quotaService.getCurrentUsage(tenantId, environment, resourceType);
    const dailyUsage = limits.maxPerDay 
      ? await quotaService.getDailyUsage(tenantId, environment, resourceType)
      : null;
    const hourlyUsage = limits.maxPerHour
      ? await quotaService.getHourlyUsage(tenantId, environment, resourceType)
      : null;

    return res.json({
      tenantId,
      environment,
      resourceType,
      usage: {
        current,
        daily: dailyUsage,
        hourly: hourlyUsage
      },
      limits: {
        maxCount: limits.maxCount,
        maxPerDay: limits.maxPerDay,
        maxPerHour: limits.maxPerHour
      },
      percentage: {
        total: limits.maxCount ? Math.round((current / limits.maxCount) * 100) : 0,
        daily: limits.maxPerDay && dailyUsage 
          ? Math.round((dailyUsage / limits.maxPerDay) * 100) 
          : null,
        hourly: limits.maxPerHour && hourlyUsage
          ? Math.round((hourlyUsage / limits.maxPerHour) * 100)
          : null
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[QuotaRoutes] Error fetching usage:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch resource usage',
      message: error.message 
    });
  }
});

router.get('/overrides', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const { db } = await import('../db');
    const { tenantResourceQuotas } = await import('../../../shared/schema');
    const { eq } = await import('drizzle-orm');

    const overrides = await db
      .select()
      .from(tenantResourceQuotas)
      .where(eq(tenantResourceQuotas.tenantId, tenantId));

    return res.json({
      tenantId,
      overrides: overrides.map(o => ({
        id: o.id,
        resourceType: o.resourceType,
        metric: o.metric,
        limit: o.limit,
        window: o.window,
        reason: o.reason,
        isActive: o.isActive,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt
      })),
      count: overrides.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[QuotaRoutes] Error fetching overrides:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch quota overrides',
      message: error.message 
    });
  }
});

export default router;
