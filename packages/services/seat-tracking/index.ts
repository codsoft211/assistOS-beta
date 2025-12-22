import { db } from '../../../apps/api/db';
import { 
  userTenants, 
  tenantSubscriptions, 
  subscriptionPlans,
  users,
} from '../../../shared/schema';
import { eq, and, sql, count } from 'drizzle-orm';
import { createTenantQueryBuilder } from '../../../apps/api/utils/tenant-query-builder';
import { getTenantUsersFromSchema } from '../../../apps/api/utils/cross-tenant-query.helper';
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';
import type { Environment } from '../../../shared/types/environment';

// ==================== TYPES ====================

export interface SeatCountResult {
  payingSeats: number;
  freeSeats: number;
  totalSeats: number;
}

export interface SeatLimitInfo {
  payingUsersIncluded: number | null;
  freeUsersIncluded: number | null;
  currentPayingSeats: number;
  currentFreeSeats: number;
  canAddPayingSeat: boolean;
  canAddFreeSeat: boolean;
  remainingPayingSeats: number | null;
  remainingFreeSeats: number | null;
}

export interface EligibleUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isPaying: boolean;
  joinedAt: Date;
}

// ==================== SEAT TRACKING SERVICE ====================

export class SeatTrackingService {
  
  /**
   * Get current seat count for a tenant
   * Counts paying and free seats separately
   * ✅ UPDATED: Uses tenant-scoped schema queries
   * 
   * Note: Since subscriptions are tenant-based (not environment-based),
   * we count unique users across ALL environments. A user marked as paying
   * in any environment counts as a paying seat for the tenant.
   */
  async getCurrentSeatCount(tenantId: string, environment: string = 'production'): Promise<SeatCountResult> {
    // Query from tenant-scoped schema - get ALL users across all environments
    // Since subscriptions are tenant-wide, we count unique users, not per-environment
    const allTenantUsers = await getTenantUsersFromSchema(tenantId);
    
    // Debug logging
    console.log(`[SeatTracking] getCurrentSeatCount for tenant ${tenantId}:`, {
      totalUsersFound: allTenantUsers.length,
      users: allTenantUsers.map(u => ({
        userId: u.userId,
        isPaying: u.isPaying,
        role: u.role
      }))
    });
    
    // Get unique users (a user might exist in multiple environments)
    // For each user, if they're paying in ANY environment, they count as paying
    const userMap = new Map<string, boolean>();
    
    for (const user of allTenantUsers) {
      const existingIsPaying = userMap.get(user.userId);
      // If user exists in multiple environments, they're paying if marked as paying in ANY environment
      const isPaying = existingIsPaying !== undefined 
        ? (existingIsPaying || user.isPaying) 
        : user.isPaying;
      userMap.set(user.userId, isPaying);
    }
    
    // Count unique users
    const uniqueUserCounts = Array.from(userMap.values());
    const payingSeats = uniqueUserCounts.filter(isPaying => isPaying === true).length;
    const freeSeats = uniqueUserCounts.filter(isPaying => isPaying === false).length;
    const totalSeats = uniqueUserCounts.length;

    console.log(`[SeatTracking] Seat count result:`, {
      payingSeats,
      freeSeats,
      totalSeats
    });

    return {
      payingSeats,
      freeSeats,
      totalSeats,
    };
  }

  /**
   * Check if a tenant can add a paying or free seat
   * Validates against subscription plan limits
   */
  async canAddSeat(
    tenantId: string, 
    seatType: 'paying' | 'free',
    environment: string = 'production'
  ): Promise<{ canAdd: boolean; reason?: string; limitInfo?: SeatLimitInfo }> {
    // Get tenant's active subscription
    const [subscription] = await db
      .select({
        subscriptionPlanId: tenantSubscriptions.subscriptionPlanId,
        status: tenantSubscriptions.status,
        plan: {
          payingUsersIncluded: subscriptionPlans.payingUsersIncluded,
          freeUsersIncluded: subscriptionPlans.freeUsersIncluded,
          isEnterprise: subscriptionPlans.isEnterprise,
        },
      })
      .from(tenantSubscriptions)
      .innerJoin(
        subscriptionPlans,
        eq(tenantSubscriptions.subscriptionPlanId, subscriptionPlans.id)
      )
      .where(
        and(
          eq(tenantSubscriptions.tenantId, tenantId),
          eq(tenantSubscriptions.status, 'active')
        )
      )
      .limit(1);

    // If no subscription, check if it's enterprise (negotiated limits)
    if (!subscription) {
      return {
        canAdd: true, // No subscription = no limits (or handle based on business logic)
        reason: 'No active subscription found',
      };
    }

    // Enterprise plans have negotiated limits (null = unlimited)
    if (subscription.plan.isEnterprise) {
      return {
        canAdd: true,
        reason: 'Enterprise plan - negotiated limits',
      };
    }

    // Get current seat count
    const seatCount = await this.getCurrentSeatCount(tenantId, environment);
    
    const limitInfo: SeatLimitInfo = {
      payingUsersIncluded: subscription.plan.payingUsersIncluded,
      freeUsersIncluded: subscription.plan.freeUsersIncluded,
      currentPayingSeats: seatCount.payingSeats,
      currentFreeSeats: seatCount.freeSeats,
      canAddPayingSeat: false,
      canAddFreeSeat: false,
      remainingPayingSeats: null,
      remainingFreeSeats: null,
    };

    if (seatType === 'paying') {
      const limit = subscription.plan.payingUsersIncluded;
      if (limit === null) {
        limitInfo.canAddPayingSeat = true;
        limitInfo.remainingPayingSeats = null;
      } else {
        limitInfo.canAddPayingSeat = seatCount.payingSeats < limit;
        limitInfo.remainingPayingSeats = Math.max(0, limit - seatCount.payingSeats);
      }
      
      return {
        canAdd: limitInfo.canAddPayingSeat,
        reason: limitInfo.canAddPayingSeat 
          ? undefined 
          : `Paying seat limit reached (${seatCount.payingSeats}/${limit})`,
        limitInfo,
      };
    } else {
      const limit = subscription.plan.freeUsersIncluded;
      if (limit === null) {
        limitInfo.canAddFreeSeat = true;
        limitInfo.remainingFreeSeats = null;
      } else {
        limitInfo.canAddFreeSeat = seatCount.freeSeats < limit;
        limitInfo.remainingFreeSeats = Math.max(0, limit - seatCount.freeSeats);
      }
      
      return {
        canAdd: limitInfo.canAddFreeSeat,
        reason: limitInfo.canAddFreeSeat 
          ? undefined 
          : `Free seat limit reached (${seatCount.freeSeats}/${limit})`,
        limitInfo,
      };
    }
  }

  /**
   * Mark a user as paying (counts towards paying seat limit)
   * @param force - If true, bypasses seat limit check (useful for subscription upgrades)
   * ✅ UPDATED: Uses tenant-scoped schema queries
   */
  async markUserAsPaying(
    tenantId: string,
    userId: string,
    environment: string = 'production',
    force: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    // Get schema name for tenant
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      return {
        success: false,
        error: `No schema found for tenant ${tenantId}`,
      };
    }

    // Find user in ALL environments (subscriptions are tenant-based, not environment-based)
    const userEnvsResult = await db.execute(sql`
      SELECT environment, is_paying
      FROM ${sql.identifier(schemaName)}.${sql.identifier('user_tenants')}
      WHERE user_id = ${userId} AND tenant_id = ${tenantId}
      ORDER BY environment
    `);

    if (userEnvsResult.rows.length === 0) {
      return {
        success: false,
        error: `User ${userId} not found in tenant ${tenantId} for any environment`,
      };
    }

    // Check if already marked as paying in any environment
    const alreadyPaying = userEnvsResult.rows.some((r: any) => r.is_paying === true);
    if (alreadyPaying) {
      return { success: true };
    }

    // Check if we can add a paying seat (unless forced)
    // Use production environment for seat limit checks (subscriptions are tenant-wide)
    if (!force) {
      const canAdd = await this.canAddSeat(tenantId, 'paying', 'production' as Environment);
      
      if (!canAdd.canAdd) {
        return {
          success: false,
          error: canAdd.reason || 'Cannot add paying seat - limit reached',
        };
      }
    }

    // Update user in ALL environments where they exist
    // Since subscriptions are tenant-based, mark as paying in all environments
    const updatePromises = userEnvsResult.rows.map(async (row: any) => {
      const userEnv = row.environment as Environment;
      const queryBuilder = createTenantQueryBuilder(tenantId, userEnv);
      return queryBuilder.update(
        'user_tenants',
        { is_paying: true },
        { user_id: userId }
      );
    });

    const updateResults = await Promise.all(updatePromises);
    const totalUpdated = updateResults.reduce((sum, result) => sum + result.length, 0);

    if (totalUpdated === 0) {
      return {
        success: false,
        error: `Failed to update user_tenants record in any environment`,
      };
    }

    console.log(`[SeatTracking] Marked user ${userId} as paying in ${totalUpdated} environment(s) for tenant ${tenantId}`);
    return { success: true };
  }

  /**
   * Unmark a user as paying (moves to free seat)
   * ✅ UPDATED: Uses tenant-scoped schema queries
   */
  async unmarkUserAsPaying(
    tenantId: string,
    userId: string,
    environment: Environment = 'production'
  ): Promise<{ success: boolean }> {
    const queryBuilder = createTenantQueryBuilder(tenantId, environment);
    await queryBuilder.update(
      'user_tenants',
      { is_paying: false },
      { user_id: userId }
      );

    return { success: true };
  }

  /**
   * Get list of users eligible to be marked as paying
   * Returns users who are currently free but could be marked as paying
   * ✅ UPDATED: Uses tenant-scoped schema queries
   */
  async getEligibleUsers(
    tenantId: string,
    environment: string = 'production'
  ): Promise<EligibleUser[]> {
    // Get current seat count and limits
    const seatCount = await this.getCurrentSeatCount(tenantId, environment);
    const canAdd = await this.canAddSeat(tenantId, 'paying', environment);
    
    // If we can't add any more paying seats, return empty
    if (!canAdd.canAdd) {
      return [];
    }

    // Get all free users from tenant-scoped schema
    const tenantUsers = await getTenantUsersFromSchema(tenantId, environment);
    const freeUsers = tenantUsers.filter(u => !u.isPaying);

    // Fetch user details from public schema
    const userIds = freeUsers.map(u => u.userId);
    if (userIds.length === 0) {
      return [];
    }

    const userDetails = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(sql`${users.id} = ANY(${userIds})`);

    // Map tenant users with user details
    return freeUsers
      .map(tenantUser => {
        const userDetail = userDetails.find(u => u.id === tenantUser.userId);
        if (!userDetail) return null;
        
        return {
          userId: tenantUser.userId,
          email: userDetail.email,
          firstName: userDetail.firstName || '',
          lastName: userDetail.lastName || '',
          role: tenantUser.role,
          isPaying: tenantUser.isPaying,
          joinedAt: tenantUser.joinedAt,
        };
      })
      .filter((u): u is EligibleUser => u !== null)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  }

  /**
   * Get detailed seat limit information for a tenant
   */
  async getSeatLimitInfo(
    tenantId: string,
    environment: string = 'production'
  ): Promise<SeatLimitInfo> {
    const seatCount = await this.getCurrentSeatCount(tenantId, environment);
    const canAddPaying = await this.canAddSeat(tenantId, 'paying', environment);
    const canAddFree = await this.canAddSeat(tenantId, 'free', environment);

    return {
      payingUsersIncluded: canAddPaying.limitInfo?.payingUsersIncluded ?? null,
      freeUsersIncluded: canAddFree.limitInfo?.freeUsersIncluded ?? null,
      currentPayingSeats: seatCount.payingSeats,
      currentFreeSeats: seatCount.freeSeats,
      canAddPayingSeat: canAddPaying.canAdd,
      canAddFreeSeat: canAddFree.canAdd,
      remainingPayingSeats: canAddPaying.limitInfo?.remainingPayingSeats ?? null,
      remainingFreeSeats: canAddFree.limitInfo?.remainingFreeSeats ?? null,
    };
  }
}

// Singleton instance
export const seatTrackingService = new SeatTrackingService();

