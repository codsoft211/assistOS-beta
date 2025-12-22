/**
 * Code Generation Quota System
 * 
 * Tier-aware configuration-based quotas for AssistBuild code generation.
 * Prevents resource abuse while allowing flexibility for different tenant tiers.
 * 
 * Architecture: Pure functions that can be easily swapped with DB-backed
 * implementation in the future without touching service layer.
 */

import { db } from '../../db';
import { generatedCode, tenants } from '../../../../shared/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import logger from '../../logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface QuotaLimits {
  maxFilesPerGeneration: number;
  maxTotalSizeBytes: number;
  maxLinesOfCodeAggregate: number;
  maxGenerationsPerDay: number;
}

export interface QuotaCheck {
  allowed: boolean;
  quotaType?: 'file_count' | 'total_size' | 'lines_of_code' | 'daily_generations';
  limit?: number;
  currentUsage?: number;
  resetAt?: Date;
  message?: string;
}

export interface QuotaViolation {
  code: 'quota_exceeded';
  quotaType: string;
  limit: number;
  currentUsage: number;
  resetAt: Date;
  message: string;
}

export type TenantTier = 'default' | 'premium' | 'enterprise';

// ============================================================================
// Quota Configuration - Tier-based Limits
// ============================================================================

export const CODE_GENERATION_QUOTAS: Record<TenantTier, QuotaLimits> = {
  default: {
    maxFilesPerGeneration: 20,
    maxTotalSizeBytes: 500_000, // 500 KB
    maxLinesOfCodeAggregate: 5_000, // 5K LOC
    maxGenerationsPerDay: 30,
  },
  premium: {
    maxFilesPerGeneration: 40,
    maxTotalSizeBytes: 1_000_000, // 1 MB
    maxLinesOfCodeAggregate: 10_000, // 10K LOC
    maxGenerationsPerDay: 100,
  },
  enterprise: {
    maxFilesPerGeneration: 75,
    maxTotalSizeBytes: 2_000_000, // 2 MB
    maxLinesOfCodeAggregate: 15_000, // 15K LOC
    maxGenerationsPerDay: 200,
  },
};

// ============================================================================
// Quota Computation Functions (Pure)
// ============================================================================

/**
 * Get quota limits for a tenant based on their tier
 * Falls back to 'default' tier if tenant tier is not configured
 */
export async function computeQuotaForRequest(tenantId: string): Promise<QuotaLimits> {
  try {
    // Query tenant to get tier information from settings
    const [tenant] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant || !tenant.settings) {
      logger.warn({ tenantId }, '[Quota] Tenant not found or no settings, using default tier');
      return CODE_GENERATION_QUOTAS.default;
    }

    // Extract tier from tenant settings (type-safe access)
    const settings = tenant.settings as any;
    const tier: TenantTier = settings.tier || 'default';

    // Validate tier exists in config
    if (!CODE_GENERATION_QUOTAS[tier]) {
      logger.warn({ tenantId, tier }, '[Quota] Invalid tier in settings, using default');
      return CODE_GENERATION_QUOTAS.default;
    }

    logger.debug({ tenantId, tier }, '[Quota] Computed quota for tenant');
    return CODE_GENERATION_QUOTAS[tier];
  } catch (error) {
    logger.error({ error, tenantId }, '[Quota] Failed to compute quota, using default');
    return CODE_GENERATION_QUOTAS.default;
  }
}

/**
 * Check if code generation request is within quota limits
 * 
 * Validates:
 * 1. File count per generation
 * 2. Total payload size
 * 3. Aggregate lines of code
 * 4. Daily generation count
 * 
 * @returns QuotaCheck with allowed=true if within limits, or details about violation
 */
export async function checkQuota(
  tenantId: string,
  environment: 'sandbox' | 'production',
  files: Record<string, string>
): Promise<QuotaCheck> {
  try {
    const quotaLimits = await computeQuotaForRequest(tenantId);

    // Check 1: File count per generation
    const fileCount = Object.keys(files).length;
    if (fileCount > quotaLimits.maxFilesPerGeneration) {
      return {
        allowed: false,
        quotaType: 'file_count',
        limit: quotaLimits.maxFilesPerGeneration,
        currentUsage: fileCount,
        message: `Demasiados ficheiros (${fileCount}). Limite: ${quotaLimits.maxFilesPerGeneration} ficheiros por geração.`,
      };
    }

    // Check 2: Total payload size (sum of all file contents)
    const totalSize = Object.values(files).reduce((sum, content) => sum + content.length, 0);
    if (totalSize > quotaLimits.maxTotalSizeBytes) {
      const totalSizeKB = Math.round(totalSize / 1000);
      const limitKB = Math.round(quotaLimits.maxTotalSizeBytes / 1000);
      return {
        allowed: false,
        quotaType: 'total_size',
        limit: quotaLimits.maxTotalSizeBytes,
        currentUsage: totalSize,
        message: `Tamanho total demasiado grande (${totalSizeKB}KB). Limite: ${limitKB}KB.`,
      };
    }

    // Check 3: Aggregate lines of code
    const totalLOC = Object.values(files).reduce((sum, content) => {
      return sum + content.split('\n').length;
    }, 0);
    if (totalLOC > quotaLimits.maxLinesOfCodeAggregate) {
      return {
        allowed: false,
        quotaType: 'lines_of_code',
        limit: quotaLimits.maxLinesOfCodeAggregate,
        currentUsage: totalLOC,
        message: `Demasiadas linhas de código (${totalLOC}). Limite: ${quotaLimits.maxLinesOfCodeAggregate} linhas.`,
      };
    }

    // Check 4: Daily generation count (queries generated_code table)
    const dailyCount = await getDailyGenerationCount(tenantId, environment);
    if (dailyCount >= quotaLimits.maxGenerationsPerDay) {
      const resetAt = getNextDayMidnight();
      return {
        allowed: false,
        quotaType: 'daily_generations',
        limit: quotaLimits.maxGenerationsPerDay,
        currentUsage: dailyCount,
        resetAt,
        message: `Limite diário de gerações atingido (${dailyCount}/${quotaLimits.maxGenerationsPerDay}). Redefine às ${resetAt.toLocaleTimeString('pt-PT')}.`,
      };
    }

    // All checks passed
    return { allowed: true };
  } catch (error) {
    logger.error({ error, tenantId }, '[Quota] Failed to check quota');
    // Fail open in case of errors (allow request but log warning)
    return {
      allowed: true,
      message: 'Quota check failed, allowing request (fail-open policy)',
    };
  }
}

/**
 * Get count of code generations for tenant today
 * Queries generated_code table for fallback (no caching for MVP)
 */
async function getDailyGenerationCount(
  tenantId: string,
  environment: 'sandbox' | 'production'
): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of day

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(generatedCode)
      .where(
        and(
          eq(generatedCode.tenantId, tenantId),
          eq(generatedCode.environment, environment),
          gte(generatedCode.createdAt, today)
        )
      );

    return result[0]?.count || 0;
  } catch (error) {
    logger.error({ error, tenantId }, '[Quota] Failed to get daily generation count');
    return 0; // Fail open - allow request
  }
}

/**
 * Get next day midnight (for resetAt calculation)
 */
function getNextDayMidnight(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

// ============================================================================
// Quota Violation Helpers
// ============================================================================

/**
 * Create structured quota violation response
 * Used when quota checks fail
 */
export function createQuotaViolation(check: QuotaCheck): QuotaViolation {
  return {
    code: 'quota_exceeded',
    quotaType: check.quotaType || 'unknown',
    limit: check.limit || 0,
    currentUsage: check.currentUsage || 0,
    resetAt: check.resetAt || getNextDayMidnight(),
    message: check.message || 'Quota exceeded',
  };
}
