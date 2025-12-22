/**
 * Plan Configuration Service
 * 
 * Centralized configuration for subscription plans and billing rules
 */

import { db } from '../db';
import { subscriptionPlans } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

export interface PlanConfig {
  id: number;
  name: string;
  priceMonthlyEuros: number;
  payingUsersIncluded: number;
  freeUsersIncluded: number;
  creditsIncluded: number;
  pricePerPayingSeatEuros: number;
  creditsPerPayingUser: number;
  isEnterprise: boolean;
}

export class PlanConfigService {
  private planCache: Map<number, PlanConfig> = new Map();
  private planNameCache: Map<string, PlanConfig> = new Map();
  private lastCacheUpdate: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get plan by ID
   */
  async getPlanById(planId: number): Promise<PlanConfig | null> {
    await this.refreshCacheIfNeeded();
    return this.planCache.get(planId) || null;
  }

  /**
   * Get plan by name
   */
  async getPlanByName(planName: string): Promise<PlanConfig | null> {
    await this.refreshCacheIfNeeded();
    return this.planNameCache.get(planName) || null;
  }

  /**
   * Get all active plans
   */
  async getAllPlans(): Promise<PlanConfig[]> {
    await this.refreshCacheIfNeeded();
    return Array.from(this.planCache.values());
  }

  /**
   * Calculate cost for additional paying seat
   */
  async calculateSeatCost(planId: number): Promise<number> {
    const plan = await this.getPlanById(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Use per-seat price if available, otherwise use monthly price
    return plan.pricePerPayingSeatEuros || plan.priceMonthlyEuros;
  }

  /**
   * Calculate credits to grant for a paying user
   */
  async calculateCreditsForPayingUser(planId: number): Promise<number> {
    const plan = await this.getPlanById(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    return plan.creditsPerPayingUser || plan.creditsIncluded;
  }

  /**
   * Get plan rules summary
   */
  async getPlanRules(planId: number): Promise<{
    canInviteFree: boolean;
    freeSeatsAvailable: number;
    payingSeatCost: number;
    creditsPerPayingUser: number;
  }> {
    const plan = await this.getPlanById(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    return {
      canInviteFree: plan.freeUsersIncluded > 0,
      freeSeatsAvailable: plan.freeUsersIncluded,
      payingSeatCost: plan.pricePerPayingSeatEuros || plan.priceMonthlyEuros,
      creditsPerPayingUser: plan.creditsPerPayingUser || plan.creditsIncluded,
    };
  }

  /**
   * Validate plan configuration
   */
  async validatePlan(planId: number): Promise<{ valid: boolean; errors: string[] }> {
    const plan = await this.getPlanById(planId);
    if (!plan) {
      return { valid: false, errors: ['Plan not found'] };
    }

    const errors: string[] = [];

    if (plan.priceMonthlyEuros <= 0) {
      errors.push('Plan must have a valid monthly price');
    }

    if (plan.payingUsersIncluded < 0) {
      errors.push('Paying users included cannot be negative');
    }

    if (plan.freeUsersIncluded < 0) {
      errors.push('Free users included cannot be negative');
    }

    if (plan.creditsIncluded < 0) {
      errors.push('Credits included cannot be negative');
    }

    if (!plan.pricePerPayingSeatEuros && !plan.priceMonthlyEuros) {
      errors.push('Plan must have either per-seat price or monthly price');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Refresh cache if needed
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    const now = new Date();
    
    if (
      !this.lastCacheUpdate ||
      now.getTime() - this.lastCacheUpdate.getTime() > this.CACHE_TTL_MS
    ) {
      await this.refreshCache();
    }
  }

  /**
   * Refresh plan cache from database
   */
  private async refreshCache(): Promise<void> {
    const plans = await db.query.subscriptionPlans.findMany({
      where: eq(subscriptionPlans.isActive, true),
    });

    this.planCache.clear();
    this.planNameCache.clear();

    for (const plan of plans) {
      const config: PlanConfig = {
        id: plan.id,
        name: plan.name,
        priceMonthlyEuros: parseFloat(plan.priceMonthlyEuros?.toString() || '0'),
        payingUsersIncluded: plan.payingUsersIncluded || 0,
        freeUsersIncluded: plan.freeUsersIncluded || 0,
        creditsIncluded: plan.creditsIncluded || 0,
        pricePerPayingSeatEuros: parseFloat(plan.pricePerPayingSeatEuros?.toString() || '0'),
        creditsPerPayingUser: plan.creditsPerPayingUser || 0,
        isEnterprise: plan.isEnterprise,
      };

      this.planCache.set(config.id, config);
      this.planNameCache.set(config.name, config);
    }

    this.lastCacheUpdate = new Date();
    console.log(`[PlanConfig] Cache refreshed with ${plans.length} plans`);
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache(): void {
    this.planCache.clear();
    this.planNameCache.clear();
    this.lastCacheUpdate = null;
  }
}

export const planConfigService = new PlanConfigService();

// Plan name constants for easy reference
export const PLAN_NAMES = {
  BASE: 'Base',
  PRO: 'Pro',
  ULTRA: 'Ultra',
  ENTERPRISE: 'Enterprise',
} as const;

// Plan rules documentation
export const PLAN_RULES = {
  [PLAN_NAMES.BASE]: {
    description: 'Base plan with 1 paying user, 0 free users',
    payingUsers: 1,
    freeUsers: 0,
    additionalSeatBehavior: 'Each additional user requires payment',
  },
  [PLAN_NAMES.PRO]: {
    description: 'Pro plan with 1 paying user, 1 free user',
    payingUsers: 1,
    freeUsers: 1,
    additionalSeatBehavior: 'First free user is included, then requires payment',
  },
  [PLAN_NAMES.ULTRA]: {
    description: 'Ultra plan with 1 paying user, 3 free users',
    payingUsers: 1,
    freeUsers: 3,
    additionalSeatBehavior: 'First 3 additional users are free, then requires payment',
  },
  [PLAN_NAMES.ENTERPRISE]: {
    description: 'Enterprise plan with custom pricing',
    payingUsers: 'Custom',
    freeUsers: 'Custom',
    additionalSeatBehavior: 'Negotiated pricing',
  },
} as const;

