/**
 * Quota Service Adapter for AssistBuild AI Tools (GAP #5)
 * 
 * Wraps ResourceQuotaService with conversation-context extraction
 * and returns normalized JSON safe for LLM consumption.
 * 
 * Architecture:
 * - Extracts tenant/environment from AssistBuild session context
 * - Calls ResourceQuotaService for quota operations
 * - Formats responses for AI tool consumption
 * - Handles errors gracefully with user-friendly messages
 */

import { ResourceQuotaService, type ResourceType, type TenantTier } from '../../../../../apps/api/services/resource-quota.service';
import { db } from '../../../../../apps/api/db';
import { tenants, tenantResourceQuotas } from '../../../../../shared/schema';
import { eq } from 'drizzle-orm';
import type { Environment } from '../../../../../shared/types/environment';

const quotaService = new ResourceQuotaService();

/**
 * Tier upgrade recommendations with pricing and features
 */
const TIER_CATALOG = {
  default: {
    name: 'Default',
    price: 'Free',
    features: [
      '10 custom schemas',
      '20 workflows',
      '5 modules',
      '30 code generations/day',
      '50 AssistBuild jobs/day'
    ]
  },
  premium: {
    name: 'Premium',
    price: '$49/mês',
    features: [
      '25 custom schemas',
      '50 workflows',
      '15 modules',
      '100 code generations/day',
      '200 AssistBuild jobs/day',
      'Priority support'
    ]
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    features: [
      '100 custom schemas',
      '200 workflows',
      '50 modules',
      '200 code generations/day',
      '1000 AssistBuild jobs/day',
      'Dedicated support',
      'Guaranteed SLA'
    ]
  }
};

interface QuotaContext {
  tenantId: string;
  environment: Environment;
  tier: TenantTier;
}

/**
 * Extract tenant/environment context from conversation metadata
 */
async function getQuotaContext(metadata: any): Promise<QuotaContext> {
  const tenantId = metadata?.tenantId;
  
  if (!tenantId) {
    throw new Error('Tenant ID is required for quota operations');
  }

  // Get tenant details including tier
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const tier = await quotaService.getTenantTier(tenantId);
  const environment = (metadata?.environment || 'sandbox') as Environment;

  return {
    tenantId,
    environment,
    tier
  };
}

/**
 * Check quota status for all resource types
 */
export async function checkQuotaStatus(metadata: any) {
  try {
    const { tenantId, environment, tier } = await getQuotaContext(metadata);

    const resourceTypes: ResourceType[] = [
      'code_generation',
      'schemas',
      'workflows',
      'modules',
      'patterns',
      'jobs'
    ];

    const quotas = await Promise.all(
      resourceTypes.map(async (resourceType) => {
        const limits = await quotaService.getQuotaLimits(tenantId, resourceType);
        const usage = await quotaService.getCurrentUsage(tenantId, environment, resourceType);

        // Calculate percentage used
        const maxCount = limits.maxCount || 0;
        const percentageUsed = maxCount > 0 ? Math.round((usage / maxCount) * 100) : 0;

        return {
          resourceType,
          usage,
          limits,
          percentageUsed,
          nearLimit: percentageUsed >= 80
        };
      })
    );

    return {
      success: true,
      tier,
      environment,
      quotas,
      summary: {
        total: quotas.length,
        nearLimit: quotas.filter(q => q.nearLimit).length,
        exceeded: quotas.filter(q => q.percentageUsed >= 100).length
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to check quota status'
    };
  }
}

/**
 * Get detailed usage statistics for a specific resource type
 */
export async function getUsageStatistics(
  metadata: any,
  resourceType: ResourceType
) {
  try {
    const { tenantId, environment, tier } = await getQuotaContext(metadata);

    const limits = await quotaService.getQuotaLimits(tenantId, resourceType);
    const usage = await quotaService.getCurrentUsage(tenantId, environment, resourceType);

    // Get daily and hourly usage for rate-limited resources
    const dailyUsage = limits.maxPerDay 
      ? await quotaService.getDailyUsage(tenantId, environment, resourceType)
      : null;
    
    const hourlyUsage = limits.maxPerHour
      ? await quotaService.getHourlyUsage(tenantId, environment, resourceType)
      : null;

    return {
      success: true,
      resourceType,
      tier,
      environment,
      usage: {
        total: usage,
        daily: dailyUsage,
        hourly: hourlyUsage
      },
      limits,
      percentageUsed: limits.maxCount ? Math.round((usage / limits.maxCount) * 100) : 0
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to get usage statistics'
    };
  }
}

/**
 * List custom quota overrides for tenant
 */
export async function listQuotaOverrides(metadata: any) {
  try {
    const { tenantId, tier } = await getQuotaContext(metadata);

    // Query custom overrides directly from DB
    const overrides = await db
      .select()
      .from(tenantResourceQuotas)
      .where(eq(tenantResourceQuotas.tenantId, tenantId));

    return {
      success: true,
      tier,
      overrides: overrides.map(o => ({
        resourceType: o.resourceType,
        metric: o.metric,
        limit: o.limit,
        window: o.window,
        reason: o.reason,
        isActive: o.isActive,
        createdAt: o.createdAt
      })),
      hasCustomQuotas: overrides.length > 0
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to list quota overrides'
    };
  }
}

/**
 * Recommend tier upgrade based on usage patterns
 */
export async function recommendTierUpgrade(metadata: any) {
  try {
    const { tenantId, environment, tier } = await getQuotaContext(metadata);

    // Get current usage across all resource types
    const resourceTypes: ResourceType[] = [
      'code_generation',
      'schemas',
      'workflows',
      'modules',
      'patterns',
      'jobs'
    ];

    const usageData = await Promise.all(
      resourceTypes.map(async (resourceType) => {
        const limits = await quotaService.getQuotaLimits(tenantId, resourceType);
        const usage = await quotaService.getCurrentUsage(tenantId, environment, resourceType);
        const percentageUsed = limits.maxCount ? (usage / limits.maxCount) * 100 : 0;

        return {
          resourceType,
          usage,
          limits,
          percentageUsed
        };
      })
    );

    // Find resources approaching limits (>70%)
    const approaching = usageData.filter(r => r.percentageUsed > 70);
    const exceeded = usageData.filter(r => r.percentageUsed >= 100);

    // Determine if upgrade needed
    const needsUpgrade = exceeded.length > 0 || approaching.length >= 3;

    // Get next tier recommendation
    const tierOrder: TenantTier[] = ['default', 'premium', 'enterprise'];
    const currentIndex = tierOrder.indexOf(tier);
    const nextTier = currentIndex < tierOrder.length - 1 
      ? tierOrder[currentIndex + 1]
      : null;

    const recommendation = needsUpgrade && nextTier
      ? {
          recommended: true,
          currentTier: TIER_CATALOG[tier],
          recommendedTier: TIER_CATALOG[nextTier],
          reasons: [
            ...(exceeded.length > 0 
              ? [`${exceeded.length} resource type(s) reached maximum limit`]
              : []
            ),
            ...(approaching.length >= 3
              ? [`${approaching.length} resource types are approaching limit (>70%)`]
              : []
            )
          ],
          resourcesAffected: [...exceeded, ...approaching].map(r => ({
            type: r.resourceType,
            usage: r.usage,
            limit: r.limits.maxCount,
            percentage: Math.round(r.percentageUsed)
          }))
        }
      : {
          recommended: false,
          currentTier: TIER_CATALOG[tier],
          message: tier === 'enterprise'
            ? 'You are already on Enterprise tier (maximum available)'
            : 'Your current usage is within the limits of the current tier'
        };

    return {
      success: true,
      tier,
      ...recommendation
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate upgrade recommendation'
    };
  }
}
