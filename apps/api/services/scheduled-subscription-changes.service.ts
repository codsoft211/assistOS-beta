import cron from 'node-cron';
import { db } from '../db';
import {
  tenantSubscriptions,
  subscriptionPlans,
  tenantCredits,
} from '../../../shared/schema';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { stripeService } from '../../../packages/services/stripe';
import { creditLifecycleService } from '../../../packages/services/credit-lifecycle';
import { seatTrackingService } from '../../../packages/services/seat-tracking';
import logger from '../logger';

/**
 * ScheduledSubscriptionChangesService
 * 
 * Processes scheduled subscription plan changes (downgrades).
 * 
 * Features:
 * - Checks for subscriptions with scheduledPlanChangeAt <= now
 * - Updates Stripe subscription to new plan
 * - Updates database subscription
 * - Handles credit expiration and recalculation
 * 
 * Runs every hour to check for scheduled changes
 */
export class ScheduledSubscriptionChangesService {
  private isRunning = false;

  /**
   * Start the scheduled subscription changes cron job
   * 
   * Runs every hour to check for subscriptions that need plan changes
   */
  start(): void {
    // Run every hour at minute 0 (e.g., 1:00, 2:00, 3:00)
    cron.schedule('0 * * * *', async () => {
      await this.processScheduledChanges();
    });

    logger.info('[ScheduledSubscriptionChanges] Service started (cron: 0 * * * *)');
  }

  /**
   * Process all scheduled subscription plan changes that are due
   */
  async processScheduledChanges(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[ScheduledSubscriptionChanges] Already running, skipping');
      return;
    }

    this.isRunning = true;
    const now = new Date();

    try {
      logger.info('[ScheduledSubscriptionChanges] Checking for scheduled plan changes...');

      // Find all subscriptions with scheduled plan changes that are due
      const scheduledSubscriptions = await db
        .select({
          subscription: tenantSubscriptions,
          newPlan: subscriptionPlans,
        })
        .from(tenantSubscriptions)
        .innerJoin(
          subscriptionPlans,
          eq(tenantSubscriptions.scheduledPlanId, subscriptionPlans.id)
        )
        .where(
          and(
            eq(tenantSubscriptions.status, 'active'),
            isNotNull(tenantSubscriptions.scheduledPlanId),
            isNotNull(tenantSubscriptions.scheduledPlanChangeAt),
            lte(tenantSubscriptions.scheduledPlanChangeAt, now)
          )
        );

      if (scheduledSubscriptions.length === 0) {
        logger.info('[ScheduledSubscriptionChanges] No scheduled plan changes found');
        this.isRunning = false;
        return;
      }

      logger.info(
        { count: scheduledSubscriptions.length },
        '[ScheduledSubscriptionChanges] Found scheduled plan changes to process'
      );

      for (const { subscription, newPlan } of scheduledSubscriptions) {
        try {
          await this.processScheduledChange(subscription, newPlan);
        } catch (error: any) {
          logger.error(
            { subscriptionId: subscription.id, error: error.message },
            '[ScheduledSubscriptionChanges] Failed to process scheduled change'
          );
          // Continue with other subscriptions even if one fails
        }
      }

      logger.info(
        { processed: scheduledSubscriptions.length },
        '[ScheduledSubscriptionChanges] Finished processing scheduled changes'
      );
    } catch (error: any) {
      logger.error(
        { error: error.message, stack: error.stack },
        '[ScheduledSubscriptionChanges] Error processing scheduled changes'
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single scheduled subscription plan change
   */
  private async processScheduledChange(
    subscription: typeof tenantSubscriptions.$inferSelect,
    newPlan: typeof subscriptionPlans.$inferSelect
  ): Promise<void> {
    const subscriptionId = subscription.id;
    const tenantId = subscription.tenantId;
    const stripeSubscriptionId = subscription.paymentReference;

    logger.info(
      {
        subscriptionId,
        tenantId,
        currentPlanId: subscription.subscriptionPlanId,
        newPlanId: newPlan.id,
        scheduledChangeAt: subscription.scheduledPlanChangeAt,
      },
      '[ScheduledSubscriptionChanges] Processing scheduled plan change'
    );

    // Step 1: Update Stripe subscription if payment method is Stripe
    if (subscription.paymentMethod === 'stripe' && stripeSubscriptionId) {
      try {
        // Get the new plan's Stripe price ID
        const newPrice = await stripeService.getOrCreatePrice({
          planId: newPlan.id,
          planName: newPlan.name,
          amount: Math.round(parseFloat(newPlan.priceMonthlyEuros || '0') * 100), // Convert to cents
          currency: 'eur',
          interval: subscription.billingInterval === 'monthly' ? 'month' : 'year',
        });

        // Update Stripe subscription to new plan
        // Use prorateAtPeriodEnd: true to change at period end without proration
        // This ensures the downgrade takes effect at the scheduled time
        await stripeService.updateSubscriptionPlan(
          stripeSubscriptionId,
          newPrice.id,
          true // prorateAtPeriodEnd = true (change at period end, no immediate charge)
        );

        logger.info(
          { stripeSubscriptionId, newPriceId: newPrice.id },
          '[ScheduledSubscriptionChanges] Stripe subscription updated'
        );
      } catch (stripeError: any) {
        logger.error(
          { stripeSubscriptionId, error: stripeError.message },
          '[ScheduledSubscriptionChanges] Failed to update Stripe subscription'
        );
        // Continue with database update even if Stripe update fails
      }
    }

    // Step 2: Expire old monthly credits (from current plan)
    try {
      const expireResult = await creditLifecycleService.expireMonthlyCredits({
        tenantId,
        reason: `Plan downgraded from ${subscription.subscriptionPlanId} to ${newPlan.id} - removing old monthly credits`,
      });
      logger.info(
        { expiredAmount: expireResult.expiredAmount },
        '[ScheduledSubscriptionChanges] Expired old monthly credits'
      );
    } catch (expireError: any) {
      logger.error(
        { error: expireError.message },
        '[ScheduledSubscriptionChanges] Failed to expire old credits'
      );
      // Continue even if credit expiration fails
    }

    // Step 3: Update database subscription to new plan
    await db
      .update(tenantSubscriptions)
      .set({
        subscriptionPlanId: newPlan.id,
        scheduledPlanId: null, // Clear scheduled plan
        scheduledPlanChangeAt: null, // Clear scheduled change date
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.id, subscriptionId));

    // Step 4: Add new monthly credits based on new plan and current paying users
    const seatCount = await seatTrackingService.getCurrentSeatCount(tenantId, 'production');
    
    if (newPlan.creditsIncluded && newPlan.creditsIncluded > 0) {
      const totalCreditsToAdd = seatCount.payingSeats * newPlan.creditsIncluded;

      if (totalCreditsToAdd > 0) {
        try {
          const creditResult = await creditLifecycleService.addMonthlyCredits({
            tenantId,
            subscriptionId,
            amount: totalCreditsToAdd,
            reason: `Plan changed to ${newPlan.name} - ${totalCreditsToAdd} credits for ${seatCount.payingSeats} paying users`,
            createdBy: null, // System-initiated
          });

          logger.info(
            {
              creditsAdded: totalCreditsToAdd,
              payingSeats: seatCount.payingSeats,
            },
            '[ScheduledSubscriptionChanges] Added new monthly credits'
          );
        } catch (creditError: any) {
          logger.error(
            { error: creditError.message },
            '[ScheduledSubscriptionChanges] Failed to add new credits'
          );
          // Continue even if credit addition fails
        }
      }
    }

    logger.info(
      { subscriptionId, newPlanId: newPlan.id },
      '[ScheduledSubscriptionChanges] ✅ Successfully processed scheduled plan change'
    );
  }
}

export const scheduledSubscriptionChangesService = new ScheduledSubscriptionChangesService();

