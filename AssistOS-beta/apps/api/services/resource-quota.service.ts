/**
 * Resource Quota Service (GAP #5)
 * 
 * Centralized quota enforcement for all resource types in AssistOS.
 * Prevents resource abuse across multi-tenant platform with tier-based limits.
 * 
 * Architecture:
 * - Hybrid config: Tier defaults from RESOURCE_QUOTAS + optional DB overrides
 * - Service layer validation + middleware enforcement (defense in depth)
 * - Unified interface across all resource types
 * - Only enforces quotas that have real backing counters (no false coverage)
 * 
 * Supported Resource Types (ALL ENFORCEABLE):
 * - code_generation: Generated code files (count + daily rate limits)
 * - schemas: Database schemas/migrations (count + daily rate limits)
 * - workflows: Tenant workflows (count + complexity limits)
 * - modules: Installed modules (count limits)
 * - patterns: Detected patterns (count + daily rate limits)
 * - jobs: AssistBuild jobs (daily + hourly rate limits)
 * 
 * Planned Future Support:
 * - entities: Dynamic entities within modules (requires module introspection counter)
 */

import { db } from '../db';
import { tenants, tenantResourceQuotas, migrations, tenantWorkflows, modules, detectedPatterns, assistbuildJobs, generatedCode } from '../../../shared/schema';
import { and, eq, gte, count as drizzleCount, sql } from 'drizzle-orm';
import logger from '../logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type TenantTier = 'default' | 'premium' | 'enterprise';

export type ResourceType = 
  | 'code_generation'
  | 'schemas'
  | 'workflows'
  | 'modules'
  // | 'entities' // TODO: Re-enable when entity counter is implemented (requires module introspection)
  | 'patterns'
  | 'jobs';

export type QuotaMetric =
  | 'max_count'           // Total count limit (e.g., max 10 schemas)
  | 'max_per_day'         // Rate limit per day
  | 'max_per_hour'        // Rate limit per hour
  | 'max_size_bytes'      // Size limit (e.g., total storage)
  | 'max_complexity';     // Complexity limit (e.g., max steps per workflow)

export interface ResourceQuota {
  maxCount?: number;
  maxPerDay?: number;
  maxPerHour?: number;
  maxSizeBytes?: number;
  maxComplexity?: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  quotaType?: QuotaMetric;
  limit?: number;
  currentUsage?: number;
  resetAt?: Date;
  message?: string;
}

export interface TierQuotas {
  codeGeneration: ResourceQuota;
  schemas: ResourceQuota;
  workflows: ResourceQuota;
  modules: ResourceQuota;
  // entities: ResourceQuota; // TODO: Re-enable when entity counter is implemented
  patterns: ResourceQuota;
  jobs: ResourceQuota;
}

// ============================================================================
// Quota Configuration - Tier-based Defaults
// ============================================================================

export const RESOURCE_QUOTAS: Record<TenantTier, TierQuotas> = {
  default: {
    codeGeneration: {
      maxCount: 20,           // Max files per generation
      maxSizeBytes: 500_000,  // 500 KB total size
      maxPerDay: 30,          // 30 generations per day
      maxComplexity: 5_000,   // 5K LOC aggregate
    },
    schemas: {
      maxCount: 10,           // Max 10 custom schemas
      maxPerDay: 5,           // Max 5 migrations per day
    },
    workflows: {
      maxCount: 20,           // Max 20 workflows
      maxComplexity: 50,      // Max 50 steps per workflow
    },
    modules: {
      maxCount: 5,            // Max 5 installed modules
    },
    // entities: { // TODO: Re-enable when counter implemented
    //   maxCount: 50,
    //   maxComplexity: 20,
    // },
    patterns: {
      maxCount: 100,          // Max 100 detected patterns
      maxPerDay: 10,          // Max 10 pattern analyses per day
    },
    jobs: {
      maxPerDay: 50,          // Max 50 AssistBuild jobs per day
      maxPerHour: 10,         // Max 10 jobs per hour
    },
  },
  premium: {
    codeGeneration: {
      maxCount: 40,
      maxSizeBytes: 1_000_000, // 1 MB
      maxPerDay: 100,
      maxComplexity: 10_000,   // 10K LOC
    },
    schemas: {
      maxCount: 25,
      maxPerDay: 15,
    },
    workflows: {
      maxCount: 50,
      maxComplexity: 100,
    },
    modules: {
      maxCount: 15,
    },
    // entities: { // TODO: Re-enable when counter implemented
    //   maxCount: 200,
    //   maxComplexity: 50,
    // },
    patterns: {
      maxCount: 500,
      maxPerDay: 50,
    },
    jobs: {
      maxPerDay: 200,
      maxPerHour: 30,
    },
  },
  enterprise: {
    codeGeneration: {
      maxCount: 75,
      maxSizeBytes: 2_000_000, // 2 MB
      maxPerDay: 200,
      maxComplexity: 15_000,   // 15K LOC
    },
    schemas: {
      maxCount: 100,
      maxPerDay: 50,
    },
    workflows: {
      maxCount: 200,
      maxComplexity: 500,
    },
    modules: {
      maxCount: 50,
    },
    // entities: { // TODO: Re-enable when counter implemented
    //   maxCount: 1000,
    //   maxComplexity: 100,
    // },
    patterns: {
      maxCount: 2000,
      maxPerDay: 200,
    },
    jobs: {
      maxPerDay: 1000,
      maxPerHour: 100,
    },
  },
};

// ============================================================================
// ResourceQuotaService - Core Logic
// ============================================================================

export class ResourceQuotaService {
  /**
   * Get tenant tier with fallback to 'default'
   * Checks: tenant.tier column first, then tenant.settings.tier, then default
   */
  async getTenantTier(tenantId: string): Promise<TenantTier> {
    try {
      const [tenant] = await db
        .select({ tier: tenants.tier, settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      if (!tenant) {
        logger.warn({ tenantId }, '[ResourceQuota] Tenant not found, using default tier');
        return 'default';
      }

      // Priority: tier column > settings.tier > default
      if (tenant.tier && ['default', 'premium', 'enterprise'].includes(tenant.tier)) {
        return tenant.tier as TenantTier;
      }

      // Fallback to settings.tier for backwards compatibility
      const settings = tenant.settings as any;
      if (settings?.tier && ['default', 'premium', 'enterprise'].includes(settings.tier)) {
        logger.debug({ tenantId }, '[ResourceQuota] Using settings.tier (legacy)');
        return settings.tier as TenantTier;
      }

      return 'default';
    } catch (error) {
      logger.error({ error, tenantId }, '[ResourceQuota] Failed to get tenant tier');
      return 'default';
    }
  }

  /**
   * Get quota limits for a specific resource type
   * Merges tier defaults with optional DB overrides
   */
  async getQuotaLimits(
    tenantId: string,
    resourceType: ResourceType
  ): Promise<ResourceQuota> {
    const tier = await this.getTenantTier(tenantId);
    const tierDefaults = this.getResourceQuotaForTier(tier, resourceType);

    // Check for custom overrides in DB
    const overrides = await db.query.tenantResourceQuotas.findMany({
      where: and(
        eq(tenantResourceQuotas.tenantId, tenantId),
        eq(tenantResourceQuotas.resourceType, resourceType),
        eq(tenantResourceQuotas.isActive, true)
      ),
    });

    // Merge overrides into tier defaults
    const finalQuota: ResourceQuota = { ...tierDefaults };

    for (const override of overrides) {
      switch (override.metric) {
        case 'max_count':
          finalQuota.maxCount = override.limit;
          break;
        case 'max_per_day':
          finalQuota.maxPerDay = override.limit;
          break;
        case 'max_per_hour':
          finalQuota.maxPerHour = override.limit;
          break;
        case 'max_size_bytes':
          finalQuota.maxSizeBytes = override.limit;
          break;
        case 'max_complexity':
          finalQuota.maxComplexity = override.limit;
          break;
      }
    }

    return finalQuota;
  }

  /**
   * Get tier defaults for a resource type
   */
  private getResourceQuotaForTier(tier: TenantTier, resourceType: ResourceType): ResourceQuota {
    const tierQuotas = RESOURCE_QUOTAS[tier];
    
    switch (resourceType) {
      case 'code_generation': return tierQuotas.codeGeneration;
      case 'schemas': return tierQuotas.schemas;
      case 'workflows': return tierQuotas.workflows;
      case 'modules': return tierQuotas.modules;
      // case 'entities': return tierQuotas.entities; // TODO: Re-enable when counter implemented
      case 'patterns': return tierQuotas.patterns;
      case 'jobs': return tierQuotas.jobs;
      default: 
        logger.warn({ resourceType }, '[ResourceQuota] Unknown resource type, using empty quota');
        return {};
    }
  }

  /**
   * Get current resource usage count for a tenant
   */
  async getCurrentUsage(
    tenantId: string,
    environment: 'sandbox' | 'production',
    resourceType: ResourceType
  ): Promise<number> {
    try {
      switch (resourceType) {
        case 'schemas':
          return await this.getSchemasCount(tenantId, environment);
        case 'workflows':
          return await this.getWorkflowsCount(tenantId, environment);
        case 'modules':
          return await this.getModulesCount(tenantId, environment);
        case 'patterns':
          return await this.getPatternsCount(tenantId, environment);
        case 'code_generation':
          return await this.getCodeGenerationCount(tenantId, environment);
        case 'jobs':
          // Jobs are transient, count is less meaningful (use rate limits instead)
          return 0;
        // case 'entities': // Removed - no enforçable counter yet
        default:
          return 0;
      }
    } catch (error) {
      logger.error({ error, tenantId, resourceType }, '[ResourceQuota] Failed to get current usage');
      return 0;
    }
  }

  /**
   * Check if resource creation is allowed
   */
  async ensureAllowed(
    tenantId: string,
    environment: 'sandbox' | 'production',
    resourceType: ResourceType,
    opts?: {
      incrementBy?: number;  // For batch operations (default: 1)
      complexity?: number;   // For complexity checks
      sizeBytes?: number;    // For size checks
    }
  ): Promise<QuotaCheckResult> {
    const limits = await this.getQuotaLimits(tenantId, resourceType);
    const currentUsage = await this.getCurrentUsage(tenantId, environment, resourceType);
    const incrementBy = opts?.incrementBy || 1;

    // Check max_count limit
    if (limits.maxCount !== undefined) {
      if (currentUsage + incrementBy > limits.maxCount) {
        return {
          allowed: false,
          quotaType: 'max_count',
          limit: limits.maxCount,
          currentUsage,
          message: `Limite de ${resourceType} atingido (${currentUsage}/${limits.maxCount}). Atualize seu plano para criar mais.`,
        };
      }
    }

    // Check max_per_day rate limit
    if (limits.maxPerDay !== undefined) {
      const dailyUsage = await this.getDailyUsage(tenantId, environment, resourceType);
      if (dailyUsage + incrementBy > limits.maxPerDay) {
        const resetAt = this.getNextDayMidnight();
        return {
          allowed: false,
          quotaType: 'max_per_day',
          limit: limits.maxPerDay,
          currentUsage: dailyUsage,
          resetAt,
          message: `Limite diário de ${resourceType} atingido (${dailyUsage}/${limits.maxPerDay}). Redefine às ${resetAt.toLocaleTimeString('pt-PT')}.`,
        };
      }
    }

    // Check max_per_hour rate limit
    if (limits.maxPerHour !== undefined) {
      const hourlyUsage = await this.getHourlyUsage(tenantId, environment, resourceType);
      if (hourlyUsage + incrementBy > limits.maxPerHour) {
        const resetAt = this.getNextHourStart();
        return {
          allowed: false,
          quotaType: 'max_per_hour',
          limit: limits.maxPerHour,
          currentUsage: hourlyUsage,
          resetAt,
          message: `Limite por hora de ${resourceType} atingido (${hourlyUsage}/${limits.maxPerHour}). Tente novamente em ${Math.ceil((resetAt.getTime() - Date.now()) / 60000)} minutos.`,
        };
      }
    }

    // Check max_complexity limit
    if (limits.maxComplexity !== undefined && opts?.complexity !== undefined) {
      if (opts.complexity > limits.maxComplexity) {
        return {
          allowed: false,
          quotaType: 'max_complexity',
          limit: limits.maxComplexity,
          currentUsage: opts.complexity,
          message: `Complexidade demasiado alta (${opts.complexity}). Limite: ${limits.maxComplexity}.`,
        };
      }
    }

    // Check max_size_bytes limit
    if (limits.maxSizeBytes !== undefined && opts?.sizeBytes !== undefined) {
      if (opts.sizeBytes > limits.maxSizeBytes) {
        const sizeMB = (opts.sizeBytes / 1_000_000).toFixed(2);
        const limitMB = (limits.maxSizeBytes / 1_000_000).toFixed(2);
        return {
          allowed: false,
          quotaType: 'max_size_bytes',
          limit: limits.maxSizeBytes,
          currentUsage: opts.sizeBytes,
          message: `Tamanho demasiado grande (${sizeMB}MB). Limite: ${limitMB}MB.`,
        };
      }
    }

    // All checks passed
    return { allowed: true };
  }

  // ============================================================================
  // Usage Counters - Adapter Methods
  // ============================================================================

  private async getSchemasCount(tenantId: string, environment: 'sandbox' | 'production'): Promise<number> {
    const [result] = await db
      .select({ count: drizzleCount() })
      .from(migrations)
      .where(and(
        eq(migrations.tenantId, tenantId),
        eq(migrations.environment, environment)
      ));
    return result?.count || 0;
  }

  private async getWorkflowsCount(tenantId: string, environment: 'sandbox' | 'production'): Promise<number> {
    const [result] = await db
      .select({ count: drizzleCount() })
      .from(tenantWorkflows)
      .where(and(
        eq(tenantWorkflows.tenantId, tenantId),
        eq(tenantWorkflows.environment, environment)
      ));
    return result?.count || 0;
  }

  private async getModulesCount(tenantId: string, environment: 'sandbox' | 'production'): Promise<number> {
    const [result] = await db
      .select({ count: drizzleCount() })
      .from(modules)
      .where(and(
        eq(modules.tenantId, tenantId),
        eq(modules.environment, environment)
      ));
    return result?.count || 0;
  }

  private async getPatternsCount(tenantId: string, environment: 'sandbox' | 'production'): Promise<number> {
    const [result] = await db
      .select({ count: drizzleCount() })
      .from(detectedPatterns)
      .where(and(
        eq(detectedPatterns.tenantId, tenantId),
        eq(detectedPatterns.environment, environment)
      ));
    return result?.count || 0;
  }

  private async getCodeGenerationCount(tenantId: string, environment: 'sandbox' | 'production'): Promise<number> {
    const [result] = await db
      .select({ count: drizzleCount() })
      .from(generatedCode)
      .where(and(
        eq(generatedCode.tenantId, tenantId),
        eq(generatedCode.environment, environment)
      ));
    return result?.count || 0;
  }

  /**
   * Get daily usage for rate-limited resources
   * Public method for monitoring and reporting
   */
  async getDailyUsage(tenantId: string, environment: 'sandbox' | 'production', resourceType: ResourceType): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (resourceType) {
      case 'schemas': {
        const [result] = await db
          .select({ count: drizzleCount() })
          .from(migrations)
          .where(and(
            eq(migrations.tenantId, tenantId),
            eq(migrations.environment, environment),
            gte(migrations.createdAt, today)
          ));
        return result?.count || 0;
      }
      case 'code_generation': {
        const [result] = await db
          .select({ count: drizzleCount() })
          .from(generatedCode)
          .where(and(
            eq(generatedCode.tenantId, tenantId),
            eq(generatedCode.environment, environment),
            gte(generatedCode.createdAt, today)
          ));
        return result?.count || 0;
      }
      case 'patterns': {
        // Count patterns detected today (via analyze-patterns job)
        const [result] = await db
          .select({ count: drizzleCount() })
          .from(detectedPatterns)
          .where(and(
            eq(detectedPatterns.tenantId, tenantId),
            eq(detectedPatterns.environment, environment),
            gte(detectedPatterns.firstSeen, today)
          ));
        return result?.count || 0;
      }
      case 'jobs': {
        const [result] = await db
          .select({ count: drizzleCount() })
          .from(assistbuildJobs)
          .where(and(
            eq(assistbuildJobs.tenantId, tenantId),
            gte(assistbuildJobs.createdAt, today)
          ));
        return result?.count || 0;
      }
      default:
        return 0;
    }
  }

  /**
   * Get hourly usage for rate-limited resources
   * Public method for monitoring and reporting
   */
  async getHourlyUsage(tenantId: string, environment: 'sandbox' | 'production', resourceType: ResourceType): Promise<number> {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    switch (resourceType) {
      case 'jobs': {
        const [result] = await db
          .select({ count: drizzleCount() })
          .from(assistbuildJobs)
          .where(and(
            eq(assistbuildJobs.tenantId, tenantId),
            gte(assistbuildJobs.createdAt, hourAgo)
          ));
        return result?.count || 0;
      }
      default:
        return 0;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private getNextDayMidnight(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  private getNextHourStart(): Date {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0, 0, 0);
    return nextHour;
  }
}

// Singleton instance
export const resourceQuotaService = new ResourceQuotaService();
