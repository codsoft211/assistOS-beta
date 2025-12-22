import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { tenantSubscriptions, subscriptionPlans } from "../../../shared/schema";
import { stripeService } from "../../../packages/services/stripe";

class StripeSeatSyncService {
  async syncTenantSeats(tenantId: string): Promise<void> {
    if (!stripeService.isConfigured()) {
      return;
    }

    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`,
      ),
    });

    if (!subscription) {
      return;
    }

    const metadata = (subscription.metadata || {}) as Record<string, any>;
    const stripeSubscriptionId = metadata?.stripeSubscriptionId;

    if (!stripeSubscriptionId) {
      return;
    }

    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, subscription.subscriptionPlanId),
    });

    if (!plan) {
      return;
    }

    const seatPriceEuros = parseFloat(
      plan.pricePerPayingSeatEuros?.toString() ||
        plan.priceMonthlyEuros?.toString() ||
        "0",
    );

    if (!seatPriceEuros || seatPriceEuros <= 0) {
      console.warn(
        "[StripeSeatSync] Missing per-seat price for plan",
        plan.id,
        plan.name,
      );
      return;
    }

    await stripeService.syncSeatSubscriptionItem({
      subscriptionId: stripeSubscriptionId,
      planId: plan.id,
      planName: plan.name,
      seatPriceEuros,
      quantity: subscription.payingSeatsAllocated,
    });
  }
}

export const stripeSeatSyncService = new StripeSeatSyncService();

