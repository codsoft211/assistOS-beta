import { db } from '../../../apps/api/db';
import { 
  tenantCredits, 
  tenantSubscriptions,
  subscriptionPlans,
  creditPackages,
  creditTransactions,
  type TenantCredits,
} from '../../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

// ==================== TYPES ====================

export interface AddMonthlyCreditsParams {
  tenantId: string;
  subscriptionId: string;
  amount: number;
  reason?: string;
  createdBy?: string;
}

export interface AddPackageCreditsParams {
  tenantId: string;
  packageId: string;
  createdBy?: string;
}

export interface AddCreditsForPayingUserParams {
  tenantId: string;
  subscriptionId: string;
  creditsPerUser: number;
  reason?: string;
  createdBy?: string;
}

export interface ExpireMonthlyCreditsParams {
  tenantId: string;
  amount?: number; // If not provided, expires all monthly credits
  reason?: string;
}

export interface ActiveCreditsResult {
  monthlyCredits: number;
  packageCredits: number;
  totalCredits: number;
  reserved: number;
  availableCredits: number; // total - reserved
}

// ==================== CREDIT LIFECYCLE SERVICE ====================

export class CreditLifecycleService {
  
  /**
   * Add monthly credits from subscription renewal
   * Adds credits to monthlyCredits (expiring) and creates audit trail
   */
  async addMonthlyCredits(params: AddMonthlyCreditsParams): Promise<{
    success: boolean;
    newMonthlyCredits: number;
    newTotalCredits: number;
    transactionId?: string;
    error?: string;
  }> {
    return await db.transaction(async (tx) => {
      // Verify subscription exists and is active
      const [subscription] = await tx
        .select({
          id: tenantSubscriptions.id,
          status: tenantSubscriptions.status,
          plan: {
            creditsIncluded: subscriptionPlans.creditsIncluded,
          },
        })
        .from(tenantSubscriptions)
        .innerJoin(
          subscriptionPlans,
          eq(tenantSubscriptions.subscriptionPlanId, subscriptionPlans.id)
        )
        .where(
          and(
            eq(tenantSubscriptions.id, params.subscriptionId),
            eq(tenantSubscriptions.tenantId, params.tenantId),
            eq(tenantSubscriptions.status, 'active')
          )
        )
        .limit(1);

      if (!subscription) {
        return {
          success: false,
          newMonthlyCredits: 0,
          newTotalCredits: 0,
          error: 'Active subscription not found',
        };
      }

      // Lock tenant_credits row
      const [tenantCredit] = await tx
        .select()
        .from(tenantCredits)
        .where(eq(tenantCredits.tenantId, params.tenantId))
        .for('update');

      let creditRecord: TenantCredits;

      // Create if doesn't exist
      if (!tenantCredit) {
        const [newCredit] = await tx
          .insert(tenantCredits)
          .values({
            tenantId: params.tenantId,
            monthlyCredits: 0,
            packageCredits: 0,
            reserved: 0,
            lifetimeUsage: 0,
            lifetimePurchases: 0,
          })
          .returning();
        
        creditRecord = newCredit;
      } else {
        creditRecord = tenantCredit;
      }

      const currentMonthly = creditRecord.monthlyCredits || 0;
      const currentPackage = creditRecord.packageCredits || 0;
      const newMonthlyCredits = currentMonthly + params.amount;
      const newTotalCredits = newMonthlyCredits + currentPackage;

      // Update monthly credits
      await tx
        .update(tenantCredits)
        .set({
          monthlyCredits: newMonthlyCredits,
          lifetimePurchases: sql`${tenantCredits.lifetimePurchases} + ${params.amount}`,
          lastPurchaseAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenantCredits.id, creditRecord.id));

      // Create credit transaction for audit trail
      const [transaction] = await tx.insert(creditTransactions).values({
        tenantId: params.tenantId,
        environment: 'production', // Monthly credits are always production
        type: 'purchase',
        amount: params.amount,
        balanceBefore: currentMonthly + currentPackage,
        balanceAfter: newTotalCredits,
        currency: 'EUR',
        paymentMethod: 'subscription',
        description: params.reason || `Monthly subscription renewal - ${params.amount} credits`,
        metadata: {
          subscriptionId: params.subscriptionId,
          creditType: 'monthly',
        },
        createdBy: params.createdBy,
      }).returning();

      return {
        success: true,
        newMonthlyCredits,
        newTotalCredits,
        transactionId: transaction.id,
      };
    });
  }

  /**
   * Add credits from purchased package
   * Adds credits to packageCredits (non-expiring) and marks package as applied
   */
  async addPackageCredits(params: AddPackageCreditsParams): Promise<{
    success: boolean;
    newPackageCredits: number;
    newTotalCredits: number;
    transactionId?: string;
    error?: string;
  }> {
    return await db.transaction(async (tx) => {
      // Get and lock credit package
      const [creditPackage] = await tx
        .select()
        .from(creditPackages)
        .where(
          and(
            eq(creditPackages.id, params.packageId),
            eq(creditPackages.status, 'active')
          )
        )
        .for('update')
        .limit(1);

      if (!creditPackage) {
        return {
          success: false,
          newPackageCredits: 0,
          newTotalCredits: 0,
          error: 'Active credit package not found',
        };
      }

      // Lock tenant_credits row
      const [tenantCredit] = await tx
        .select()
        .from(tenantCredits)
        .where(eq(tenantCredits.tenantId, params.tenantId))
        .for('update');

      let creditRecord: TenantCredits;

      // Create if doesn't exist
      if (!tenantCredit) {
        const [newCredit] = await tx
          .insert(tenantCredits)
          .values({
            tenantId: params.tenantId,
            monthlyCredits: 0,
            packageCredits: 0,
            reserved: 0,
            lifetimeUsage: 0,
            lifetimePurchases: 0,
          })
          .returning();
        
        creditRecord = newCredit;
      } else {
        creditRecord = tenantCredit;
      }

      const currentMonthly = creditRecord.monthlyCredits || 0;
      const currentPackage = creditRecord.packageCredits || 0;
      const newPackageCredits = currentPackage + creditPackage.creditsAmount;
      const newTotalCredits = currentMonthly + newPackageCredits;

      // Update package credits
      await tx
        .update(tenantCredits)
        .set({
          packageCredits: newPackageCredits,
          lifetimePurchases: sql`${tenantCredits.lifetimePurchases} + ${creditPackage.creditsAmount}`,
          lastPurchaseAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenantCredits.id, creditRecord.id));

      // Create credit transaction for audit trail
      const [transaction] = await tx.insert(creditTransactions).values({
        tenantId: params.tenantId,
        environment: 'production', // Package credits are always production
        type: 'purchase',
        amount: creditPackage.creditsAmount,
        balanceBefore: currentMonthly + currentPackage,
        balanceAfter: newTotalCredits,
        currency: 'EUR',
        paymentMethod: creditPackage.paymentMethod,
        description: `Credit package purchase - ${creditPackage.creditsAmount} credits`,
        metadata: {
          packageId: params.packageId,
          creditType: 'package',
        },
        createdBy: params.createdBy,
      }).returning();

      return {
        success: true,
        newPackageCredits,
        newTotalCredits,
        transactionId: transaction.id,
      };
    });
  }

  /**
   * Expire old monthly credits
   * Removes expired monthly credits (typically at end of billing period)
   */
  async expireMonthlyCredits(params: ExpireMonthlyCreditsParams): Promise<{
    success: boolean;
    expiredAmount: number;
    remainingMonthlyCredits: number;
    transactionId?: string;
    error?: string;
  }> {
    return await db.transaction(async (tx) => {
      // Lock tenant_credits row
      const [tenantCredit] = await tx
        .select()
        .from(tenantCredits)
        .where(eq(tenantCredits.tenantId, params.tenantId))
        .for('update')
        .limit(1);

      if (!tenantCredit) {
        return {
          success: false,
          expiredAmount: 0,
          remainingMonthlyCredits: 0,
          error: 'Tenant credits record not found',
        };
      }

      const currentMonthly = tenantCredit.monthlyCredits || 0;
      const currentPackage = tenantCredit.packageCredits || 0;
      
      // Determine amount to expire
      const amountToExpire = params.amount !== undefined 
        ? Math.min(params.amount, currentMonthly) // Can't expire more than available
        : currentMonthly; // Expire all if not specified

      if (amountToExpire <= 0) {
        return {
          success: true,
          expiredAmount: 0,
          remainingMonthlyCredits: currentMonthly,
        };
      }

      const newMonthlyCredits = currentMonthly - amountToExpire;
      const newTotalCredits = newMonthlyCredits + currentPackage;

      // Update monthly credits (set to new amount)
      await tx
        .update(tenantCredits)
        .set({
          monthlyCredits: newMonthlyCredits,
          updatedAt: new Date(),
        })
        .where(eq(tenantCredits.id, tenantCredit.id));

      // Create credit transaction for audit trail (expiration)
      const [transaction] = await tx.insert(creditTransactions).values({
        tenantId: params.tenantId,
        environment: 'production',
        type: 'adjustment',
        amount: -amountToExpire, // Negative = deduction
        balanceBefore: currentMonthly + currentPackage,
        balanceAfter: newTotalCredits,
        currency: 'EUR',
        description: params.reason || `Monthly credits expired - ${amountToExpire} credits`,
        metadata: {
          creditType: 'monthly',
          expiration: true,
        },
      }).returning();

      return {
        success: true,
        expiredAmount: amountToExpire,
        remainingMonthlyCredits: newMonthlyCredits,
        transactionId: transaction.id,
      };
    });
  }

  /**
   * Get active credits split (monthly vs package)
   * Returns current credit balances with breakdown
   */
  async getActiveCredits(tenantId: string): Promise<ActiveCreditsResult> {
    const [creditRecord] = await db
      .select({
        monthlyCredits: tenantCredits.monthlyCredits,
        packageCredits: tenantCredits.packageCredits,
        reserved: tenantCredits.reserved,
      })
      .from(tenantCredits)
      .where(eq(tenantCredits.tenantId, tenantId))
      .limit(1);

    if (!creditRecord) {
      return {
        monthlyCredits: 0,
        packageCredits: 0,
        totalCredits: 0,
        reserved: 0,
        availableCredits: 0,
      };
    }

    const monthly = creditRecord.monthlyCredits || 0;
    const packageCreds = creditRecord.packageCredits || 0;
    const reserved = creditRecord.reserved || 0;
    const total = monthly + packageCreds;
    const available = Math.max(0, total - reserved);

    return {
      monthlyCredits: monthly,
      packageCredits: packageCreds,
      totalCredits: total,
      reserved,
      availableCredits: available,
    };
  }

  /**
   * Helper: Get credits that will expire soon (within X days)
   * Useful for notifications/warnings
   */
  async getCreditsExpiringSoon(
    tenantId: string,
    daysUntilExpiration: number = 7
  ): Promise<{
    monthlyCredits: number;
    expiresAt?: Date;
  }> {
    const credits = await this.getActiveCredits(tenantId);
    
    // Get subscription renewal date to determine expiration
    const [subscription] = await db
      .select({
        renewalDate: tenantSubscriptions.renewalDate,
        currentPeriodEnd: tenantSubscriptions.currentPeriodEnd,
      })
      .from(tenantSubscriptions)
      .where(
        and(
          eq(tenantSubscriptions.tenantId, tenantId),
          eq(tenantSubscriptions.status, 'active')
        )
      )
      .limit(1);

    const expiresAt = subscription?.currentPeriodEnd || subscription?.renewalDate;

    if (!expiresAt || credits.monthlyCredits === 0) {
      return { monthlyCredits: 0 };
    }

    const expirationDate = new Date(expiresAt);
    const now = new Date();
    const daysUntil = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= daysUntilExpiration) {
      return {
        monthlyCredits: credits.monthlyCredits,
        expiresAt: expirationDate,
      };
    }

    return { monthlyCredits: 0 };
  }

  /**
   * Add credits when a paying user is added to the subscription
   * Credits = creditsPerUser (plan's credits included per paying user)
   * This is called when a new paying user joins the tenant
   */
  async addCreditsForPayingUser(params: AddCreditsForPayingUserParams): Promise<{
    success: boolean;
    newMonthlyCredits: number;
    newTotalCredits: number;
    transactionId?: string;
    error?: string;
  }> {
    return await db.transaction(async (tx) => {
      // Verify subscription exists and is active
      const [subscription] = await tx
        .select({
          id: tenantSubscriptions.id,
          status: tenantSubscriptions.status,
        })
        .from(tenantSubscriptions)
        .where(
          and(
            eq(tenantSubscriptions.id, params.subscriptionId),
            eq(tenantSubscriptions.tenantId, params.tenantId),
            eq(tenantSubscriptions.status, 'active')
          )
        )
        .limit(1);

      if (!subscription) {
        return {
          success: false,
          newMonthlyCredits: 0,
          newTotalCredits: 0,
          error: 'Active subscription not found',
        };
      }

      // Lock tenant_credits row
      const [tenantCredit] = await tx
        .select()
        .from(tenantCredits)
        .where(eq(tenantCredits.tenantId, params.tenantId))
        .for('update');

      let creditRecord: TenantCredits;

      // Create if doesn't exist
      if (!tenantCredit) {
        const [newCredit] = await tx
          .insert(tenantCredits)
          .values({
            tenantId: params.tenantId,
            monthlyCredits: 0,
            packageCredits: 0,
            reserved: 0,
            lifetimeUsage: 0,
            lifetimePurchases: 0,
          })
          .returning();
        
        creditRecord = newCredit;
      } else {
        creditRecord = tenantCredit;
      }

      const currentMonthly = creditRecord.monthlyCredits || 0;
      const currentPackage = creditRecord.packageCredits || 0;
      const newMonthlyCredits = currentMonthly + params.creditsPerUser;
      const newTotalCredits = newMonthlyCredits + currentPackage;

      // Update monthly credits
      await tx
        .update(tenantCredits)
        .set({
          monthlyCredits: newMonthlyCredits,
          lifetimePurchases: sql`${tenantCredits.lifetimePurchases} + ${params.creditsPerUser}`,
          lastPurchaseAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenantCredits.id, creditRecord.id));

      // Create credit transaction for audit trail
      const [transaction] = await tx.insert(creditTransactions).values({
        tenantId: params.tenantId,
        environment: 'production',
        type: 'purchase',
        amount: params.creditsPerUser,
        balanceBefore: currentMonthly + currentPackage,
        balanceAfter: newTotalCredits,
        currency: 'EUR',
        paymentMethod: 'subscription',
        description: params.reason || `Credits added for new paying user - ${params.creditsPerUser} credits`,
        metadata: {
          subscriptionId: params.subscriptionId,
          creditType: 'monthly',
          perUserCredits: true,
        },
        createdBy: params.createdBy,
      }).returning();

      return {
        success: true,
        newMonthlyCredits,
        newTotalCredits,
        transactionId: transaction.id,
      };
    });
  }
}

// Singleton instance
export const creditLifecycleService = new CreditLifecycleService();

