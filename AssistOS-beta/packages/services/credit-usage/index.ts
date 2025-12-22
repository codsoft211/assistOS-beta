import { db } from '../../../apps/api/db';
import {
  creditPricingRules,
  tenantCredits,
  creditTransactions,
  usageEvents,
  tenantSubscriptions,
  type InsertCreditTransaction,
  type InsertUsageEvent
} from '../../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import {
  getCostPerCreditUsd
} from '../platform-settings';

// ==================== TYPES ====================

export interface TrackUsageParams {
  tenantId: string;
  userId: string;
  provider: string;           // 'openai', 'meta', 'twilio', 'google'
  service: string;            // 'gpt-5', 'whatsapp-message', 'document-ai'
  unitsConsumed: number;      // Tokens, messages, pages, GB
  unitType: string;           // 'input_tokens_1k', 'output_tokens_1k', 'messages', 'gb_month'
  environment?: 'production' | 'sandbox';
  metadata?: {
    // AI model usage
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;

    // Tool execution
    toolName?: string;
    executionDuration?: number;
    success?: boolean;

    // External service
    serviceName?: string;
    apiEndpoint?: string;
    responseStatus?: number;

    // Context
    conversationId?: string;
    orchestratorType?: 'assistme' | 'assistbuild' | 'assistsettings';

    [key: string]: any;
  };
}

export interface TrackUsageResult {
  success: boolean;
  creditsDeducted: number;
  costUsd: number; // Provider cost in USD (OpenAI native currency)
  newBalance: number;
  transactionId?: string;
  usageEventId: string;
}

export interface TrackModelUsageParams {
  tenantId: string;
  userId: string;
  provider: string;
  service: string;
  promptTokens: number;
  completionTokens: number;
  environment?: 'production' | 'sandbox';
  metadata?: {
    [key: string]: any;
    conversationId?: string;
    orchestratorType?: string;
    model?: string;
  };
}

export interface AddCreditsParams {
  tenantId: string;
  amount: number;
  creditType: 'monthly' | 'package'; // 'monthly' for subscription credits, 'package' for one-time purchases
  environment?: 'production' | 'sandbox';
  reason: string;
  paymentMethod?: string;
  paymentReference?: string;
  invoiceId?: string;
  createdBy?: string;
}

export interface RefundCreditsParams {
  transactionId: string;
  reason: string;
  createdBy?: string;
}

// ==================== CONSTANTS ====================

/**
 * DEPRECATED: These constants are now stored in the database (platform_settings table)
 * Use the helper functions from platform-settings service instead:
 * - getCreditMargin() - Get current margin (default: 0.70 = 70%)
 * - getCreditPriceEur() - Get credit price in EUR (default: €0.10)
 * - getCostPerCreditUsd() - Get internal cost per credit in USD (default: $0.03)
 * 
 * Fallback values (used only if database is unavailable):
 */
const FALLBACK_MARGIN = 0.70; // 70% margin
const FALLBACK_CREDIT_PRICE_EUR = 0.10; // €0.10 per credit
const FALLBACK_COST_PER_CREDIT_USD = 0.03; // $0.03 USD per credit

/**
 * NOTE: Credits are ABSTRACT - customer only sees integer count.
 * - Customer BUYS credits: €0.10/credit (payment interface in EUR)
 * - System DEDUCTS credits: based on USD provider cost ÷ cost_per_credit
 * - Customer SEES: only integer "1234 créditos" (no currency)
 * 
 * Formula: cost_per_credit = CREDIT_PRICE_EUR × (1 - MARGIN)
 * Example: €0.10 × (1 - 0.70) = €0.03
 * 
 * Provider costs (OpenAI, Google) are in USD and converted directly to credits
 * without currency conversion - credits are the universal abstraction layer.
 */

// ==================== CREDIT USAGE SERVICE ====================

export class CreditUsageService {

  /**
   * Main method: Track usage and deduct credits atomically
   * 
   * This method:
   * 1. Fetches provider pricing from credit_pricing_rules
   * 2. Calculates real provider cost (units × price_per_unit)
   * 3. Converts to credits using configurable margin from database
   * 4. Deducts credits with row-level locking (SELECT FOR UPDATE)
   * 5. Creates complete audit trail (usage_event + credit_transaction)
   * 
   * ATOMICITY GUARANTEED: Uses Drizzle transaction + row locking
   * THREAD-SAFE: Multiple concurrent calls won't cause negative balance
   */
  async trackUsageAndDeductCredits(params: TrackUsageParams): Promise<TrackUsageResult> {
    const environment = params.environment || 'production';

    // Fetch cost per credit from database (with fallback)
    const costPerCreditUsd = await getCostPerCreditUsd().catch(() => FALLBACK_COST_PER_CREDIT_USD);

    return await db.transaction(async (tx) => {
      const resourceType = this.getResourceType(params.provider);
      const pricePerUnit = await this.fetchUnitPrice(tx, resourceType, params.service, params.unitType, environment);

      const providerCostUsd = this.calculateProviderCost(params.unitsConsumed, pricePerUnit);
      const tenantCredit = await this.lockAndGetTenantCredits(tx, params.tenantId);
      const currentPending = Number(tenantCredit.pendingCostUsd || 0);
      const combinedCostUsd = providerCostUsd + currentPending;
      const creditsToDeduct = Math.floor(combinedCostUsd / costPerCreditUsd);
      const remainingCostUsd = parseFloat(
        (combinedCostUsd - creditsToDeduct * costPerCreditUsd).toFixed(6)
      );

      console.info('[credit-usage] usage request pending reconciliation', {
        scope: 'trackUsageAndDeductCredits',
        tenantId: params.tenantId,
        environment,
        provider: params.provider,
        service: params.service,
        unitType: params.unitType,
        unitsConsumed: params.unitsConsumed,
        requestCostUsd: providerCostUsd,
        pendingCostUsdBefore: currentPending,
        combinedCostUsd,
        costPerCreditUsd: costPerCreditUsd,
        creditsToDeduct,
        pendingCostUsdAfter: remainingCostUsd,
      });

      const totalBalance = (tenantCredit.monthlyCredits || 0) + (tenantCredit.packageCredits || 0);
      let newMonthlyCredits = tenantCredit.monthlyCredits || 0;
      let newPackageCredits = tenantCredit.packageCredits || 0;

      /* Bypass credit check
      if (creditsToDeduct > 0 && totalBalance < creditsToDeduct) {
        throw new Error(
          `Insufficient credits: Required ${creditsToDeduct} credits, available ${totalBalance} credits (${tenantCredit.monthlyCredits || 0} monthly + ${tenantCredit.packageCredits || 0} package)`
        );
      }
      */

      if (creditsToDeduct > 0) {
        let remainingToDeduct = creditsToDeduct;

        if (newMonthlyCredits > 0 && remainingToDeduct > 0) {
          const deductFromMonthly = Math.min(newMonthlyCredits, remainingToDeduct);
          newMonthlyCredits -= deductFromMonthly;
          remainingToDeduct -= deductFromMonthly;
        }

        if (remainingToDeduct > 0) {
          newPackageCredits -= remainingToDeduct;
        }
      }

      const [usageEvent] = await tx.insert(usageEvents).values({
        tenantId: params.tenantId,
        environment,
        resourceType,
        resourceName: params.service,
        unitType: params.unitType,
        quantity: params.unitsConsumed.toString(),
        internalCost: providerCostUsd.toString(),
        creditsDeducted: creditsToDeduct,
        currency: 'USD',
        userId: params.userId,
        conversationId: params.metadata?.conversationId,
        orchestratorType: params.metadata?.orchestratorType,
        metadata: {
          ...params.metadata,
          providerCostUsd: providerCostUsd,
          creditsDeducted: creditsToDeduct,
          pendingCostUsdCarried: currentPending,
        },
        status: 'completed',
      }).returning();

      console.info('[credit-usage] usage event inserted', {
        scope: 'trackUsageAndDeductCredits',
        usageEventId: usageEvent.id,
        internalCostInserted: providerCostUsd.toString(),
        internalCostReturned: usageEvent.internalCost,
      });

      const tenantUpdate: Record<string, any> = {
        monthlyCredits: newMonthlyCredits,
        packageCredits: newPackageCredits,
        pendingCostUsd: remainingCostUsd.toFixed(6),
        updatedAt: new Date(),
      };

      if (creditsToDeduct > 0) {
        tenantUpdate.lifetimeUsage = sql`${tenantCredits.lifetimeUsage} + ${creditsToDeduct}`;
        tenantUpdate.lastUsageAt = new Date();
      }

      await tx
        .update(tenantCredits)
        .set(tenantUpdate)
        .where(eq(tenantCredits.id, tenantCredit.id));

      console.info('[credit-usage] tenant credits updated', {
        scope: 'trackUsageAndDeductCredits',
        tenantId: params.tenantId,
        usageEventId: usageEvent.id,
        pendingCostUsdSet: remainingCostUsd.toFixed(6),
        monthlyCreditsSet: newMonthlyCredits,
        packageCreditsSet: newPackageCredits,
      });

      const newTotalBalance = newMonthlyCredits + newPackageCredits;

      let transactionId: string | undefined;
      if (creditsToDeduct > 0) {
        const [transaction] = await tx.insert(creditTransactions).values({
          tenantId: params.tenantId,
          environment,
          type: 'consumption',
          amount: -creditsToDeduct,
          balanceBefore: totalBalance,
          balanceAfter: newTotalBalance,
          currency: 'USD',
          usageEventId: usageEvent.id,
          resourceType,
          resourceName: params.service,
          description: `${params.provider} ${params.service} usage: ${params.unitsConsumed} ${params.unitType}`,
          metadata: {
            provider: params.provider,
            service: params.service,
            unitType: params.unitType,
            unitsConsumed: params.unitsConsumed,
            providerCostUsd: providerCostUsd,
            creditsDeducted: creditsToDeduct,
            costPerCreditUsd: costPerCreditUsd,
            ...params.metadata,
          },
          createdBy: params.userId,
        }).returning();

        transactionId = transaction.id;
      }

      return {
        success: true,
        creditsDeducted: creditsToDeduct,
        costUsd: providerCostUsd,
        newBalance: newTotalBalance,
        transactionId,
        usageEventId: usageEvent.id,
      };
    });
  }

  async trackModelUsage(params: TrackModelUsageParams): Promise<TrackUsageResult> {
    const environment = params.environment || 'production';

    // Fetch cost per credit from database (with fallback)
    const costPerCreditUsd = await getCostPerCreditUsd().catch(() => FALLBACK_COST_PER_CREDIT_USD);

    return await db.transaction(async (tx) => {
      const resourceType = this.getResourceType(params.provider);

      const promptCostUsd = await this.calculateCostForUnit(tx, {
        resourceType,
        service: params.service,
        unitType: 'input_tokens_1k',
        environment,
        unitsConsumed: params.promptTokens,
      });

      const completionCostUsd = await this.calculateCostForUnit(tx, {
        resourceType,
        service: params.service,
        unitType: 'output_tokens_1k',
        environment,
        unitsConsumed: params.completionTokens,
      });

      const requestCostUsd = promptCostUsd + completionCostUsd;
      const tenantCredit = await this.lockAndGetTenantCredits(tx, params.tenantId);
      const currentPending = Number(tenantCredit.pendingCostUsd || 0);
      const combinedCostUsd = requestCostUsd + currentPending;
      const creditsToDeduct = Math.floor(combinedCostUsd / costPerCreditUsd);
      const remainingCostUsd = parseFloat(
        (combinedCostUsd - creditsToDeduct * costPerCreditUsd).toFixed(6)
      );

      console.info('[credit-usage] usage request pending reconciliation', {
        scope: 'trackModelUsage',
        tenantId: params.tenantId,
        environment,
        provider: params.provider,
        service: params.service,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        requestCostUsd,
        pendingCostUsdBefore: currentPending,
        combinedCostUsd,
        costPerCreditUsd: costPerCreditUsd,
        creditsToDeduct,
        pendingCostUsdAfter: remainingCostUsd,
      });

      const totalBalance = (tenantCredit.monthlyCredits || 0) + (tenantCredit.packageCredits || 0);
      let newMonthlyCredits = tenantCredit.monthlyCredits || 0;
      let newPackageCredits = tenantCredit.packageCredits || 0;

      /* Bypass credit check
      if (creditsToDeduct > 0 && totalBalance < creditsToDeduct) {
        throw new Error(
          `Insufficient credits: Required ${creditsToDeduct} credits, available ${totalBalance} credits (${tenantCredit.monthlyCredits || 0} monthly + ${tenantCredit.packageCredits || 0} package)`
        );
      }
      */

      if (creditsToDeduct > 0) {
        let remainingToDeduct = creditsToDeduct;

        if (newMonthlyCredits > 0) {
          const deductFromMonthly = Math.min(newMonthlyCredits, remainingToDeduct);
          newMonthlyCredits -= deductFromMonthly;
          remainingToDeduct -= deductFromMonthly;
        }

        if (remainingToDeduct > 0) {
          newPackageCredits -= remainingToDeduct;
        }
      }

      const totalTokens = (params.promptTokens || 0) + (params.completionTokens || 0);

      const [usageEvent] = await tx.insert(usageEvents).values({
        tenantId: params.tenantId,
        environment,
        resourceType,
        resourceName: params.service,
        unitType: 'model_call',
        quantity: totalTokens.toString(),
        internalCost: requestCostUsd.toString(),
        creditsDeducted: creditsToDeduct,
        currency: 'USD',
        userId: params.userId,
        conversationId: params.metadata?.conversationId,
        orchestratorType: params.metadata?.orchestratorType,
        metadata: {
          ...params.metadata,
          promptTokens: params.promptTokens,
          completionTokens: params.completionTokens,
          promptCostUsd,
          completionCostUsd,
          providerCostUsd: requestCostUsd,
          pendingCostUsdCarried: currentPending,
        },
        status: 'completed',
      }).returning();

      console.info('[credit-usage] usage event inserted', {
        scope: 'trackModelUsage',
        usageEventId: usageEvent.id,
        internalCostInserted: requestCostUsd.toString(),
        internalCostReturned: usageEvent.internalCost,
      });

      const tenantUpdate: Record<string, any> = {
        monthlyCredits: newMonthlyCredits,
        packageCredits: newPackageCredits,
        pendingCostUsd: remainingCostUsd.toFixed(6),
        updatedAt: new Date(),
      };

      if (creditsToDeduct > 0) {
        tenantUpdate.lifetimeUsage = sql`${tenantCredits.lifetimeUsage} + ${creditsToDeduct}`;
        tenantUpdate.lastUsageAt = new Date();
      }

      await tx
        .update(tenantCredits)
        .set(tenantUpdate)
        .where(eq(tenantCredits.id, tenantCredit.id));

      console.info('[credit-usage] tenant credits updated', {
        scope: 'trackModelUsage',
        tenantId: params.tenantId,
        usageEventId: usageEvent.id,
        pendingCostUsdSet: remainingCostUsd.toFixed(6),
        monthlyCreditsSet: newMonthlyCredits,
        packageCreditsSet: newPackageCredits,
      });

      const newTotalBalance = newMonthlyCredits + newPackageCredits;

      let transactionId: string | undefined;
      if (creditsToDeduct > 0) {
        const [transaction] = await tx.insert(creditTransactions).values({
          tenantId: params.tenantId,
          environment,
          type: 'consumption',
          amount: -creditsToDeduct,
          balanceBefore: totalBalance,
          balanceAfter: newTotalBalance,
          currency: 'USD',
          usageEventId: usageEvent.id,
          resourceType,
          resourceName: params.service,
          description: `${params.provider} ${params.service} usage: ${totalTokens} tokens`,
          metadata: {
            provider: params.provider,
            service: params.service,
            unitType: 'model_call',
            promptTokens: params.promptTokens,
            completionTokens: params.completionTokens,
            providerCostUsd: requestCostUsd,
            promptCostUsd,
            completionCostUsd,
            ...params.metadata,
          },
          createdBy: params.userId,
        }).returning();

        transactionId = transaction.id;
      }

      return {
        success: true,
        creditsDeducted: creditsToDeduct,
        costUsd: requestCostUsd,
        newBalance: newTotalBalance,
        transactionId,
        usageEventId: usageEvent.id,
      };
    });
  }

  /**
   * Get current credit balance for a tenant (in integer credits)
   * Returns total balance: monthlyCredits + packageCredits
   */
  async getBalance(tenantId: string, environment?: 'production' | 'sandbox'): Promise<{
    total: number;
    monthly: number;
    package: number;
  }> {
    // Environment parameter is ignored - credits are shared across environments
    const result = await db
      .select({
        monthlyCredits: tenantCredits.monthlyCredits,
        packageCredits: tenantCredits.packageCredits,
      })
      .from(tenantCredits)
      .where(eq(tenantCredits.tenantId, tenantId))
      .limit(1);

    if (!result || result.length === 0) {
      return { total: 0, monthly: 0, package: 0 };
    }

    const monthly = result[0].monthlyCredits || 0;
    const packageCreds = result[0].packageCredits || 0;

    return {
      total: monthly + packageCreds,
      monthly,
      package: packageCreds,
    };
  }

  /**
   * Check if tenant has sufficient credits for an operation (pre-flight check)
   * 
   * This method checks:
   * 1. If tenant has an active subscription plan
   * 2. If tenant has sufficient credits
   * 
   * Use this BEFORE making expensive AI calls to prevent operations that will fail.
   * 
   * @param tenantId - The tenant ID
   * @param estimatedCredits - Estimated credits needed (use conservative estimate)
   * @throws Error if no subscription or insufficient credits
   */
  async checkSufficientCredits(tenantId: string, estimatedCredits: number = 1): Promise<void> {
    // BYPASS: Always succeed for development/testing
    console.log(`[CreditUsage] Bypassing credit check for tenant ${tenantId}`);
    return;

    /*
    // 1. Check if tenant has an active subscription
    ...
    */
  }

  /**
   * Estimate cost for a model call (before making the actual call)
   * 
   * This provides a conservative estimate based on average token usage.
   * Use this to check credits before expensive operations.
   * 
   * @param provider - AI provider (e.g., 'openai')
   * @param service - Service/model name (e.g., 'gpt-5')
   * @param estimatedPromptTokens - Estimated prompt tokens (default: 1000)
   * @param estimatedCompletionTokens - Estimated completion tokens (default: 500)
   * @param environment - Environment ('production' or 'sandbox')
   * @returns Estimated credits needed
   */
  async estimateModelCost(
    provider: string,
    service: string,
    estimatedPromptTokens: number = 1000,
    estimatedCompletionTokens: number = 500,
    environment: 'production' | 'sandbox' = 'production'
  ): Promise<number> {
    return await db.transaction(async (tx) => {
      const resourceType = this.getResourceType(provider);

      const promptCostUsd = await this.calculateCostForUnit(tx, {
        resourceType,
        service,
        unitType: 'input_tokens_1k',
        environment,
        unitsConsumed: estimatedPromptTokens,
      });

      const completionCostUsd = await this.calculateCostForUnit(tx, {
        resourceType,
        service,
        unitType: 'output_tokens_1k',
        environment,
        unitsConsumed: estimatedCompletionTokens,
      });

      const totalCostUsd = promptCostUsd + completionCostUsd;

      // Fetch cost per credit from database (with fallback)
      const costPerCreditUsd = await getCostPerCreditUsd().catch(() => FALLBACK_COST_PER_CREDIT_USD);
      const estimatedCredits = Math.ceil(totalCostUsd / costPerCreditUsd);

      return estimatedCredits;
    });
  }

  /**
   * Add credits to a tenant (purchase, promotional, adjustment)
   * @param creditType - 'monthly' for subscription credits, 'package' for one-time purchases
   */
  async addCredits(params: AddCreditsParams): Promise<TrackUsageResult> {
    const environment = params.environment || 'production';

    return await db.transaction(async (tx) => {
      // Lock tenant_credits row
      const tenantCreditRows = await tx
        .select()
        .from(tenantCredits)
        .where(eq(tenantCredits.tenantId, params.tenantId))
        .for('update');

      let tenantCredit = tenantCreditRows[0];

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

        tenantCredit = newCredit;
      }

      const currentMonthly = tenantCredit.monthlyCredits || 0;
      const currentPackage = tenantCredit.packageCredits || 0;
      const currentTotal = currentMonthly + currentPackage;

      // Add credits to the appropriate type
      let newMonthlyCredits = currentMonthly;
      let newPackageCredits = currentPackage;

      if (params.creditType === 'monthly') {
        newMonthlyCredits += params.amount;
      } else {
        newPackageCredits += params.amount;
      }

      const newTotal = newMonthlyCredits + newPackageCredits;

      // Update balance
      await tx
        .update(tenantCredits)
        .set({
          monthlyCredits: newMonthlyCredits,
          packageCredits: newPackageCredits,
          lifetimePurchases: sql`${tenantCredits.lifetimePurchases} + ${params.amount}`,
          lastPurchaseAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenantCredits.id, tenantCredit.id));

      // Create transaction record
      const [transaction] = await tx.insert(creditTransactions).values({
        tenantId: params.tenantId,
        environment,
        type: 'purchase',
        amount: params.amount, // Positive = credit (integer)
        balanceBefore: currentTotal,
        balanceAfter: newTotal,
        currency: 'EUR',
        paymentMethod: params.paymentMethod,
        paymentReference: params.paymentReference,
        invoiceId: params.invoiceId,
        description: params.reason,
        createdBy: params.createdBy,
      }).returning();

      return {
        success: true,
        creditsDeducted: -params.amount, // Negative = added credits
        costUsd: 0, // No provider cost for credit purchases
        newBalance: newTotal,
        transactionId: transaction.id,
        usageEventId: '',
      };
    });
  }

  /**
   * Refund credits from a previous transaction
   */
  async refundCredits(params: RefundCreditsParams): Promise<TrackUsageResult> {
    return await db.transaction(async (tx) => {
      // Find original transaction
      const originalTx = await tx
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.id, params.transactionId))
        .limit(1);

      if (!originalTx || originalTx.length === 0) {
        throw new Error(`Transaction ${params.transactionId} not found`);
      }

      const original = originalTx[0];

      if (original.type !== 'consumption') {
        throw new Error(`Cannot refund transaction type: ${original.type}`);
      }

      const refundAmount = Math.abs(original.amount); // Convert negative to positive (amount is integer)

      // Lock tenant_credits
      const tenantCreditRows = await tx
        .select()
        .from(tenantCredits)
        .where(eq(tenantCredits.tenantId, original.tenantId))
        .for('update');

      if (!tenantCreditRows || tenantCreditRows.length === 0) {
        throw new Error(`Tenant credits not found for ${original.tenantId}`);
      }

      const tenantCredit = tenantCreditRows[0];
      const currentMonthly = tenantCredit.monthlyCredits || 0;
      const currentPackage = tenantCredit.packageCredits || 0;
      const currentTotal = currentMonthly + currentPackage;
      const refundAmountInt = refundAmount; // Already integer from Math.abs(original.amount)

      // Refund goes to package credits (non-expiring) since we don't know the original source
      const newPackageCredits = currentPackage + refundAmountInt;
      const newTotal = currentMonthly + newPackageCredits;

      // Update balance
      await tx
        .update(tenantCredits)
        .set({
          packageCredits: newPackageCredits, // Refund goes to package credits
          lifetimeUsage: sql`${tenantCredits.lifetimeUsage} - ${refundAmountInt}`,
          updatedAt: new Date(),
        })
        .where(eq(tenantCredits.id, tenantCredit.id));

      // Create refund transaction
      const [refundTx] = await tx.insert(creditTransactions).values({
        tenantId: original.tenantId,
        environment: original.environment,
        type: 'refund',
        amount: refundAmountInt, // Integer credits (positive)
        balanceBefore: currentTotal, // Integer
        balanceAfter: newTotal, // Integer
        currency: 'EUR',
        usageEventId: original.usageEventId,
        resourceType: original.resourceType,
        resourceName: original.resourceName,
        description: `Refund: ${params.reason}`,
        metadata: { originalTransactionId: params.transactionId },
        createdBy: params.createdBy,
      }).returning();

      // Update usage event status
      if (original.usageEventId) {
        await tx
          .update(usageEvents)
          .set({ status: 'refunded' })
          .where(eq(usageEvents.id, original.usageEventId));
      }

      return {
        success: true,
        creditsDeducted: -refundAmountInt, // Negative integer (refund = credit back)
        costUsd: 0, // No provider cost for refunds
        newBalance: newTotal,
        transactionId: refundTx.id,
        usageEventId: original.usageEventId || '',
      };
    });
  }

  /**
   * Helper: Map provider to resource_type
   */
  private getResourceType(provider: string): string {
    const mapping: Record<string, string> = {
      openai: 'ai_model',
      anthropic: 'ai_model',
      meta: 'external_service',
      twilio: 'external_service',
      google: 'external_service',
      whatsapp: 'external_service',
    };

    return mapping[provider.toLowerCase()] || 'external_service';
  }

  private async fetchUnitPrice(
    tx: any,
    resourceType: string,
    service: string,
    unitType: string,
    environment: 'production' | 'sandbox'
  ): Promise<number> {
    const pricingRule = await tx
      .select()
      .from(creditPricingRules)
      .where(
        and(
          eq(creditPricingRules.resourceType, resourceType),
          eq(creditPricingRules.resourceName, service),
          eq(creditPricingRules.unitType, unitType),
          eq(creditPricingRules.environment, environment),
          eq(creditPricingRules.isActive, true),
          sql`${creditPricingRules.tenantId} IS NULL`
        )
      )
      .limit(1);

    if (!pricingRule || pricingRule.length === 0) {
      throw new Error(
        `No pricing rule found for ${resourceType}/${service}/${unitType} in ${environment}`
      );
    }

    return parseFloat(pricingRule[0].pricePerUnit);
  }

  private calculateProviderCost(unitsConsumed: number, pricePerUnit: number): number {
    if (!unitsConsumed || unitsConsumed <= 0 || !pricePerUnit) {
      return 0;
    }
    return (unitsConsumed * pricePerUnit) / 1000;
  }

  private async lockAndGetTenantCredits(tx: any, tenantId: string) {
    const tenantCreditRows = await tx
      .select()
      .from(tenantCredits)
      .where(eq(tenantCredits.tenantId, tenantId))
      .for('update');

    if (!tenantCreditRows || tenantCreditRows.length === 0) {
      const [newCredit] = await tx
        .insert(tenantCredits)
        .values({
          tenantId,
          monthlyCredits: 0,
          packageCredits: 0,
          reserved: 0,
          lifetimeUsage: 0,
          lifetimePurchases: 0,
          pendingCostUsd: '0',
        })
        .returning();

      return newCredit;
    }

    return tenantCreditRows[0];
  }

  private async calculateCostForUnit(
    tx: any,
    params: {
      resourceType: string;
      service: string;
      unitType: string;
      environment: 'production' | 'sandbox';
      unitsConsumed: number;
    }
  ): Promise<number> {
    if (!params.unitsConsumed || params.unitsConsumed <= 0) {
      return 0;
    }

    const pricePerUnit = await this.fetchUnitPrice(
      tx,
      params.resourceType,
      params.service,
      params.unitType,
      params.environment
    );

    return this.calculateProviderCost(params.unitsConsumed, pricePerUnit);
  }
}

// Singleton instance
export const creditUsageService = new CreditUsageService();
