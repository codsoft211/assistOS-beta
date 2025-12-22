import { Router, type Request, type Response } from "express";
import express from "express";
import { db } from "../../db";
import {
  tenantSubscriptions,
  subscriptionPlans,
  users,
  creditPackagePurchases,
} from "../../../../shared/schema";
import { eq, and, or, asc } from "drizzle-orm";
import { stripeService, stripe } from "../../../../packages/services/stripe";
import { seatTrackingService } from "../../../../packages/services/seat-tracking";
import { creditLifecycleService } from "../../../../packages/services/credit-lifecycle";
import Stripe from "stripe";

const router = Router();

// Middleware to capture raw body for Stripe webhook signature verification
router.use(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: any) => {
    // Store raw body for signature verification
    (req as any).rawBody = req.body;
    next();
  }
);

// Test endpoint to verify webhook route is accessible
router.get("/webhook/test", async (req: Request, res: Response) => {
  console.log("[Stripe Webhook] Test endpoint hit!");
  return res.json({ 
    message: "Stripe webhook route is accessible",
    timestamp: new Date().toISOString(),
    webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    stripeKeyConfigured: !!process.env.STRIPE_SECRET_KEY,
  });
});

// Stripe webhook endpoint - must be raw body for signature verification
router.post(
  "/webhook",
  async (req: Request, res: Response) => {
    console.log("[Stripe Webhook] POST /webhook received");
    console.log("[Stripe Webhook] Headers:", {
      "stripe-signature": req.headers["stripe-signature"] ? "present" : "missing",
      "content-type": req.headers["content-type"],
    });
    console.log("[Stripe Webhook] Body type:", typeof req.body);
    console.log("[Stripe Webhook] Raw body exists:", !!(req as any).rawBody);

    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    if (!sig) {
      console.error("[Stripe Webhook] No signature header");
      return res.status(400).json({ error: "No signature" });
    }

    let event: Stripe.Event;

    try {
      // Get raw body for signature verification
      const rawBody = (req as any).rawBody || req.body;
      event = stripeService.verifyWebhookSignature(
        rawBody,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log("[Stripe Webhook] Event received:", event.type, event.id);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          try {
            await handleCheckoutCompleted(session);
            console.log("[Stripe Webhook] Successfully processed checkout.session.completed");
          } catch (checkoutError: any) {
            console.error("[Stripe Webhook] Error in handleCheckoutCompleted:", checkoutError);
            console.error("[Stripe Webhook] Error stack:", checkoutError.stack);
            throw checkoutError; // Re-throw to be caught by outer catch
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionUpdated(subscription);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(subscription);
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentSucceeded(invoice);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentFailed(invoice);
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("[Stripe Webhook] Error processing event:", error);
      console.error("[Stripe Webhook] Error stack:", error.stack);
      console.error("[Stripe Webhook] Error details:", {
        message: error.message,
        name: error.name,
        code: error.code,
      });
      res.status(500).json({ 
        error: "Webhook handler failed",
        message: error.message,
        eventType: event.type,
        eventId: event.id,
      });
    }
  }
);

/**
 * Handle checkout.session.completed
 * This is when user completes payment and subscription is created
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log("[Stripe Webhook] Checkout completed:", session.id);
  console.log("[Stripe Webhook] Session metadata:", JSON.stringify(session.metadata, null, 2));
  console.log("[Stripe Webhook] Session subscription:", session.subscription);
  console.log("[Stripe Webhook] Session mode:", session.mode);

  const tenantId = session.metadata?.tenantId;
  const packageId = session.metadata?.packageId;
  const purchaseId = session.metadata?.purchaseId;

  if (packageId && purchaseId) {
    await handleCreditPackagePurchaseCompleted(session);
    return;
  }

  const planId = session.metadata?.planId
    ? parseInt(session.metadata.planId)
    : null;
  const isUpgrade = session.metadata?.isUpgrade === "true";
  const existingSubscriptionId = session.metadata?.existingSubscriptionId;

  console.log("[Stripe Webhook] Extracted data:", {
    tenantId,
    planId,
    isUpgrade,
    existingSubscriptionId,
  });

  if (!tenantId || !planId) {
    console.error("[Stripe Webhook] Missing tenantId or planId in session metadata");
    console.error("[Stripe Webhook] Full session metadata:", session.metadata);
    throw new Error(`Missing tenantId or planId in session metadata. tenantId: ${tenantId}, planId: ${planId}`);
  }

  // Get subscription from Stripe
  // session.subscription can be a string (ID) or a Subscription object
  let subscriptionId: string | null = null;
  
  if (session.subscription) {
    if (typeof session.subscription === "string") {
      subscriptionId = session.subscription;
    } else if (session.subscription && typeof session.subscription === "object" && "id" in session.subscription) {
      subscriptionId = (session.subscription as any).id;
    }
  }

  if (!subscriptionId) {
    console.error("[Stripe Webhook] No subscription ID in checkout session");
    console.error("[Stripe Webhook] Session subscription field:", session.subscription);
    console.error("[Stripe Webhook] Session object keys:", Object.keys(session));
    return;
  }

  console.log("[Stripe Webhook] Fetching Stripe subscription:", subscriptionId);
  
  let stripeSubscription: Stripe.Subscription;
  try {
    stripeSubscription = await stripeService.getSubscription(subscriptionId);
    console.log("[Stripe Webhook] Stripe subscription retrieved:", stripeSubscription.id);
  } catch (subError: any) {
    console.error("[Stripe Webhook] Error fetching subscription:", subError);
    throw subError; // Re-throw to be caught by outer try-catch
  }

  // Get plan details
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);

  if (!plan) {
    console.error("[Stripe Webhook] Plan not found:", planId);
    throw new Error(`Plan not found: ${planId}`);
  }

  // Update or create subscription in our database
  const [currentSubscription] = await db
    .select()
    .from(tenantSubscriptions)
    .where(
      and(
        eq(tenantSubscriptions.tenantId, tenantId),
        eq(tenantSubscriptions.status, "active")
      )
    )
    .limit(1);

  // Extract period dates from Stripe subscription
  // Stripe uses Unix timestamps (seconds), convert to milliseconds for JavaScript Date
  // Use type assertion since Stripe types may not include these fields in TypeScript definitions
  const subAny = stripeSubscription as any;
  const periodStartTimestamp = subAny.current_period_start;
  const periodEndTimestamp = subAny.current_period_end;

  console.log("[Stripe Webhook] Stripe subscription period fields:", {
    current_period_start: periodStartTimestamp,
    current_period_end: periodEndTimestamp,
    type_start: typeof periodStartTimestamp,
    type_end: typeof periodEndTimestamp,
  });

  let currentPeriodStart: Date;
  let currentPeriodEnd: Date;

  if (periodStartTimestamp && typeof periodStartTimestamp === 'number' && periodStartTimestamp > 0) {
    currentPeriodStart = new Date(periodStartTimestamp * 1000);
    if (isNaN(currentPeriodStart.getTime())) {
      console.error("[Stripe Webhook] Invalid currentPeriodStart timestamp:", periodStartTimestamp);
      currentPeriodStart = new Date(); // Fallback to now
    }
  } else {
    console.warn("[Stripe Webhook] Missing or invalid current_period_start, using now");
    currentPeriodStart = new Date();
  }

  if (periodEndTimestamp && typeof periodEndTimestamp === 'number' && periodEndTimestamp > 0) {
    currentPeriodEnd = new Date(periodEndTimestamp * 1000);
    if (isNaN(currentPeriodEnd.getTime())) {
      console.error("[Stripe Webhook] Invalid currentPeriodEnd timestamp:", periodEndTimestamp);
      currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Fallback to 30 days
    }
  } else {
    console.warn("[Stripe Webhook] Missing or invalid current_period_end, using 30 days from now");
    currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  console.log("[Stripe Webhook] Subscription period:", {
    start: currentPeriodStart.toISOString(),
    end: currentPeriodEnd.toISOString(),
  });

  // Set the payment method as default for future charges
  const customerId = stripeSubscription.customer as string;
  const defaultPaymentMethodId = stripeSubscription.default_payment_method as string | null;
  
  if (defaultPaymentMethodId && customerId && stripe) {
    try {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: defaultPaymentMethodId,
        },
      });
      console.log("[Stripe Webhook] Set default payment method:", defaultPaymentMethodId);
    } catch (error) {
      console.error("[Stripe Webhook] Failed to set default payment method:", error);
    }
  } else if (!stripe) {
    console.warn("[Stripe Webhook] Stripe not configured, cannot set default payment method");
  }

  // Extract upgrade metadata if present (to store in subscription for credit allocation)
  const upgradeMetadata: Record<string, string> | undefined = isUpgrade && session.metadata ? 
    (() => {
      const metadata: Record<string, string> = {};
      if (session.metadata.blocksNeeded) metadata.blocksNeeded = session.metadata.blocksNeeded;
      if (session.metadata.newPayingSeatsAllocated) metadata.newPayingSeatsAllocated = session.metadata.newPayingSeatsAllocated;
      if (session.metadata.newFreeSeatsAllocated) metadata.newFreeSeatsAllocated = session.metadata.newFreeSeatsAllocated;
      if (session.metadata.totalPayingSeats) metadata.totalPayingSeats = session.metadata.totalPayingSeats;
      if (session.metadata.totalFreeSeats) metadata.totalFreeSeats = session.metadata.totalFreeSeats;
      if (session.metadata.creditFromCurrent) metadata.creditFromCurrent = session.metadata.creditFromCurrent;
      return Object.keys(metadata).length > 0 ? metadata : undefined;
    })() : undefined;

  const subscriptionData = {
    subscriptionPlanId: planId,
    status: "active" as const,
    paymentMethod: "stripe" as const,
    paymentReference: stripeSubscription.id,
    currentPeriodStart,
    currentPeriodEnd,
    nextPaymentAt: currentPeriodEnd,
    scheduledPlanId: null,
    scheduledPlanChangeAt: null,
    updatedAt: new Date(),
    metadata: {
      stripeCustomerId: stripeSubscription.customer as string,
      stripeSubscriptionId: stripeSubscription.id,
      checkoutSessionId: session.id,
      ...(upgradeMetadata || {}), // Include upgrade metadata for credit allocation in invoice.payment_succeeded
    },
  };

  let dbSubscriptionId: string;

  try {
    if (currentSubscription) {
      // Update existing subscription
      console.log("[Stripe Webhook] Updating existing subscription:", currentSubscription.id);
      await db
        .update(tenantSubscriptions)
        .set(subscriptionData)
        .where(eq(tenantSubscriptions.id, currentSubscription.id));
      dbSubscriptionId = currentSubscription.id;
      console.log("[Stripe Webhook] Subscription updated successfully");
    } else {
      // Create new subscription
      console.log("[Stripe Webhook] Creating new subscription for tenant:", tenantId);
      const [newSubscription] = await db.insert(tenantSubscriptions).values({
        tenantId,
        ...subscriptionData,
        startDate: new Date(),
        billingInterval: "monthly",
        autoRenew: true,
      }).returning();
      dbSubscriptionId = newSubscription.id;
      console.log("[Stripe Webhook] Subscription created successfully:", dbSubscriptionId);
    }
  } catch (dbError: any) {
    console.error("[Stripe Webhook] Database error:", dbError);
    console.error("[Stripe Webhook] Database error details:", {
      message: dbError.message,
      code: dbError.code,
      constraint: dbError.constraint,
    });
    throw dbError;
  }

  // Get userId from session metadata if available
  const userId = session.metadata?.userId;

  console.log("[Stripe Webhook] Processing subscription activation:", {
    tenantId,
    planId,
    isUpgrade,
    dbSubscriptionId,
    userId,
    upgradeMetadata,
  });

  // Handle credits and seats - this is where all the business logic happens
  try {
    await processSubscriptionActivation(
      tenantId,
      planId,
      isUpgrade,
      dbSubscriptionId,
      userId,
      upgradeMetadata
    );
    console.log("[Stripe Webhook] Subscription activation completed successfully");
  } catch (activationError: any) {
    console.error("[Stripe Webhook] Error during subscription activation:", activationError);
    console.error("[Stripe Webhook] Error stack:", activationError.stack);
    // Don't throw - we've already created the subscription, just log the error
  }
}

async function handleCreditPackagePurchaseCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {};
  const tenantId = metadata.tenantId;
  const packageId = metadata.packageId;
  const purchaseId = metadata.purchaseId;

  console.log("[Stripe Webhook] Processing credit package purchase:", {
    tenantId,
    packageId,
    purchaseId,
  });

  if (!tenantId || !packageId || !purchaseId) {
    throw new Error("Missing tenantId/packageId/purchaseId for credit package purchase");
  }

  const [purchase] = await db
    .select()
    .from(creditPackagePurchases)
    .where(eq(creditPackagePurchases.id, purchaseId))
    .limit(1);

  if (!purchase) {
    console.error("[Stripe Webhook] Purchase record not found:", purchaseId);
    return;
  }

  if (purchase.status === "completed") {
    console.log("[Stripe Webhook] Purchase already completed:", purchaseId);
    if (!purchase.stripePaymentIntentId && session.payment_intent) {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || null;
      await db
        .update(creditPackagePurchases)
        .set({
          stripePaymentIntentId: paymentIntentId || undefined,
          stripeCheckoutSessionId: session.id,
          updatedAt: new Date(),
        })
        .where(eq(creditPackagePurchases.id, purchaseId));
    }
    return;
  }

  const result = await creditLifecycleService.addPackageCredits({
    tenantId,
    packageId,
    createdBy: purchase.createdBy || metadata.userId,
  });

  if (!result.success) {
    console.error("[Stripe Webhook] Failed to apply credit package:", result.error);
    await db
      .update(creditPackagePurchases)
      .set({
        status: "failed",
        metadata: {
          ...(purchase.metadata || {}),
          failureReason: result.error || "Failed to apply credits",
        },
        updatedAt: new Date(),
      })
      .where(eq(creditPackagePurchases.id, purchaseId));
    throw new Error(result.error || "Failed to apply credit package");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  await db
    .update(creditPackagePurchases)
    .set({
      status: "completed",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId || undefined,
      creditTransactionId: result.transactionId,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creditPackagePurchases.id, purchaseId));

  console.log("[Stripe Webhook] Credit package applied successfully:", {
    purchaseId,
    transactionId: result.transactionId,
  });
}

/**
 * Handle subscription updated (plan changes, renewals, etc.)
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("[Stripe Webhook] Subscription updated:", subscription.id);

  const tenantId = subscription.metadata?.tenantId;
  if (!tenantId) {
    console.error("[Stripe Webhook] No tenantId in subscription metadata");
    return;
  }

  const [dbSubscription] = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.paymentReference, subscription.id))
    .limit(1);

  if (!dbSubscription) {
    console.error("[Stripe Webhook] Subscription not found in database:", subscription.id);
    return;
  }

    // Update subscription period
    // Stripe uses Unix timestamps (seconds), convert to milliseconds
    // Use type assertion since Stripe types may not include these fields
    const subAny = subscription as any;
    const periodStartTimestamp = subAny.current_period_start;
    const periodEndTimestamp = subAny.current_period_end;

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    if (periodStartTimestamp && typeof periodStartTimestamp === 'number' && periodStartTimestamp > 0) {
      periodStart = new Date(periodStartTimestamp * 1000);
      if (isNaN(periodStart.getTime())) {
        console.error("[Stripe Webhook] Invalid periodStart timestamp:", periodStartTimestamp);
        periodStart = null;
      }
    }

    if (periodEndTimestamp && typeof periodEndTimestamp === 'number' && periodEndTimestamp > 0) {
      periodEnd = new Date(periodEndTimestamp * 1000);
      if (isNaN(periodEnd.getTime())) {
        console.error("[Stripe Webhook] Invalid periodEnd timestamp:", periodEndTimestamp);
        periodEnd = null;
      }
    }

    await db
      .update(tenantSubscriptions)
      .set({
        currentPeriodStart: periodStart || undefined,
        currentPeriodEnd: periodEnd || undefined,
        nextPaymentAt: periodEnd || undefined,
        status: subscription.status === "active" ? "active" : "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.id, dbSubscription.id));
}

/**
 * Handle subscription deleted (cancelled)
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("[Stripe Webhook] Subscription deleted:", subscription.id);

  const [dbSubscription] = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.paymentReference, subscription.id))
    .limit(1);

  if (dbSubscription) {
    await db
      .update(tenantSubscriptions)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        autoRenew: false,
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.id, dbSubscription.id));

    try {
      await creditLifecycleService.expireMonthlyCredits({
        tenantId: dbSubscription.tenantId,
        reason: `Subscription cancelled - expiring remaining credits`,
      });
      console.log(
        "[Stripe Webhook] Expired monthly credits due to cancellation",
        {
          subscriptionId: dbSubscription.id,
        }
      );
    } catch (error: any) {
      console.error(
        "[Stripe Webhook] Failed to expire credits on cancellation:",
        error
      );
    }
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log("[Stripe Webhook] Payment succeeded:", invoice.id);

  // Invoice.subscription can be a string ID or a Subscription object
  // Use type assertion to access subscription field
  const invoiceAny = invoice as any;
  const subscriptionId = invoiceAny.subscription 
    ? (typeof invoiceAny.subscription === 'string' 
        ? invoiceAny.subscription 
        : invoiceAny.subscription?.id)
    : null;
    
  if (!subscriptionId) {
    console.error("[Stripe Webhook] No subscription ID in invoice");
    console.error("[Stripe Webhook] Invoice subscription field:", invoiceAny.subscription);
    return;
  }

  // Extract billing_reason to detect upgrade payments
  const billingReason = invoiceAny.billing_reason || invoice.billing_reason;
  console.log("[Stripe Webhook] Invoice billing_reason:", billingReason);

  const [dbSubscription] = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.paymentReference, subscriptionId))
    .limit(1);

  if (dbSubscription) {
    const isInitialPayment = !dbSubscription.lastPaymentAt;
    const isSubscriptionUpdate = billingReason === 'subscription_update';
    const isSubscriptionCycle = billingReason === 'subscription_cycle';
    const isNewSubscription = billingReason === 'subscription_create';

    console.log("[Stripe Webhook] Payment analysis:", {
      subscriptionId: dbSubscription.id,
      tenantId: dbSubscription.tenantId,
      billingReason,
      isInitialPayment,
      lastPaymentAt: dbSubscription.lastPaymentAt,
    });

    // ALL credit allocation happens here - single source of truth
    // This eliminates race conditions between checkout.session.completed and invoice.payment_succeeded
    if (isInitialPayment || isNewSubscription || isSubscriptionUpdate) {
      // Initial subscription or upgrade: allocate credits based on plan
      console.log("[Stripe Webhook] Processing credit allocation for initial subscription or upgrade");
      try {
        await processInitialOrUpgradeCredits(dbSubscription, invoice, isSubscriptionUpdate);
      } catch (creditError) {
        console.error("[Stripe Webhook] Error processing initial/upgrade credits:", creditError);
      }
    } else if (isSubscriptionCycle) {
      // Monthly renewal: allocate renewal credits
      console.log("[Stripe Webhook] Processing credit allocation for monthly renewal");
      try {
        await processMonthlyRenewalCredits(dbSubscription, invoice);
      } catch (creditError) {
        console.error("[Stripe Webhook] Error processing renewal credits:", creditError);
      }
    }

    // Update lastPaymentAt for all payments
    await db
      .update(tenantSubscriptions)
      .set({
        lastPaymentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.id, dbSubscription.id));
  }
}

/**
 * Process credit allocation for initial subscriptions or upgrades
 * This is the single place where credits are allocated for new subscriptions and upgrades
 */
async function processInitialOrUpgradeCredits(
  subscription: typeof tenantSubscriptions.$inferSelect,
  invoice: Stripe.Invoice,
  isUpgrade: boolean
) {
  const tenantId = subscription.tenantId;
  const planId = subscription.subscriptionPlanId;

  if (!tenantId || !planId) {
    console.warn("[Stripe Webhook] Missing tenant or plan for initial/upgrade credits", {
      subscriptionId: subscription.id,
      tenantId,
      planId,
    });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);

  if (!plan) {
    console.error("[Stripe Webhook] Plan not found for initial/upgrade credits", {
      tenantId,
      planId,
    });
    return;
  }

  // For upgrades, expire old monthly credits
  if (isUpgrade) {
    try {
      const expireResult = await creditLifecycleService.expireMonthlyCredits({
        tenantId,
        reason: `Plan upgraded to ${plan.name} - removing old monthly credits (invoice ${invoice.id})`,
      });
      console.log(`[Stripe Webhook] Expired ${expireResult.expiredAmount} monthly credits from old plan`);
    } catch (expireError) {
      console.error("[Stripe Webhook] Error expiring old credits:", expireError);
    }
  }

  // Calculate credits to add
  // For upgrades, check subscription metadata for blocksNeeded
  const baseCredits = plan.creditsIncluded || 0;
  let totalCreditsToAdd = baseCredits;
  const subscriptionMetadata = (subscription.metadata || {}) as Record<string, any>;
  
  if (isUpgrade && subscriptionMetadata.blocksNeeded && baseCredits > 0) {
    const blocksNeeded = parseInt(subscriptionMetadata.blocksNeeded.toString());
    if (!isNaN(blocksNeeded) && blocksNeeded > 0) {
      totalCreditsToAdd = baseCredits * blocksNeeded;
      console.log(`[Stripe Webhook] Upgrade with ${blocksNeeded} blocks: ${baseCredits} × ${blocksNeeded} = ${totalCreditsToAdd} credits`);
    }
  }

  if (totalCreditsToAdd <= 0) {
    console.log(
      "[Stripe Webhook] No credits to add for initial/upgrade subscription",
      { tenantId, planId, isUpgrade }
    );
    return;
  }

  const creditResult = await creditLifecycleService.addMonthlyCredits({
    tenantId,
    subscriptionId: subscription.id,
    amount: totalCreditsToAdd,
    reason: isUpgrade 
      ? `Plan upgraded to ${plan.name} - ${totalCreditsToAdd} credits allocated (invoice ${invoice.id})`
      : `Subscription activated - ${totalCreditsToAdd} credits for ${plan.name} plan (invoice ${invoice.id})`,
  });

  if (!creditResult.success) {
    console.error("[Stripe Webhook] Failed to add credits for initial/upgrade subscription:", {
      tenantId,
      planId,
      isUpgrade,
      error: creditResult.error,
    });
  } else {
    console.log("[Stripe Webhook] Added credits for initial/upgrade subscription", {
      tenantId,
      planId,
      isUpgrade,
      totalCreditsToAdd,
    });
  }
}

async function processMonthlyRenewalCredits(
  subscription: typeof tenantSubscriptions.$inferSelect,
  invoice: Stripe.Invoice
) {
  const tenantId = subscription.tenantId;
  const planId = subscription.subscriptionPlanId;

  if (!tenantId || !planId) {
    console.warn("[Stripe Webhook] Missing tenant or plan for renewal credits", {
      subscriptionId: subscription.id,
      tenantId,
      planId,
    });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);

  if (!plan) {
    console.error("[Stripe Webhook] Plan not found during renewal credits", {
      tenantId,
      planId,
    });
    return;
  }

  try {
    const expireResult = await creditLifecycleService.expireMonthlyCredits({
      tenantId,
      reason: `Monthly renewal - expiring previous credits (invoice ${invoice.id})`,
    });
    console.log(
      "[Stripe Webhook] Expired monthly credits on renewal",
      expireResult
    );
  } catch (expireError) {
    console.error("[Stripe Webhook] Failed to expire monthly credits:", expireError);
  }

  const seatCount = await seatTrackingService.getCurrentSeatCount(
    tenantId,
    "production"
  );
  const baseCredits = plan.creditsIncluded || 0;
  const perSeatCredits = plan.creditsPerPayingUser || 0;
  
  // If creditsPerPayingUser equals creditsIncluded, each paying user gets that amount
  // Formula: payingSeats × creditsPerPayingUser (matches upgrade logic pattern)
  // If they're different, use: baseCredits + (additional seats × perSeatCredits)
  let totalCreditsToAdd: number;
  if (perSeatCredits === baseCredits && perSeatCredits > 0) {
    // Each paying user gets creditsPerPayingUser (same as creditsIncluded)
    totalCreditsToAdd = seatCount.payingSeats * perSeatCredits;
  } else if (perSeatCredits > 0) {
    // Base credits cover first user, additional users get perSeatCredits
    const additionalSeats = Math.max(0, seatCount.payingSeats - 1);
    totalCreditsToAdd = baseCredits + (additionalSeats * perSeatCredits);
  } else {
    // No per-seat credits, just base credits
    totalCreditsToAdd = baseCredits;
  }

  if (totalCreditsToAdd <= 0) {
    console.log(
      "[Stripe Webhook] No monthly credits to add on renewal",
      { tenantId, planId }
    );
    return;
  }

  const creditResult = await creditLifecycleService.addMonthlyCredits({
    tenantId,
    subscriptionId: subscription.id,
    amount: totalCreditsToAdd,
    reason: `Monthly renewal - ${totalCreditsToAdd} credits added (invoice ${invoice.id})`,
  });

  if (!creditResult.success) {
    console.error("[Stripe Webhook] Failed to add monthly credits on renewal:", {
      tenantId,
      planId,
      error: creditResult.error,
    });
  } else {
    console.log("[Stripe Webhook] Added monthly credits on renewal", {
      tenantId,
      planId,
      totalCreditsToAdd,
    });
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log("[Stripe Webhook] Payment failed:", invoice.id);
  // Could update subscription status or send notification
}

/**
 * Process subscription activation: add credits, mark users as paying
 * For upgrades: immediately allocate new credits based on proration
 */
async function processSubscriptionActivation(
  tenantId: string,
  planId: number,
  isUpgrade: boolean,
  subscriptionId: string,
  userId?: string,
  upgradeMetadata?: Record<string, string>
) {
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);

  if (!plan) {
    console.error("[Stripe Webhook] Plan not found for activation:", planId);
    return;
  }

  // Get current seat count
  const seatCount = await seatTrackingService.getCurrentSeatCount(
    tenantId,
    "production"
  );

  // If upgrade, expire old monthly credits and update seat allocations
  if (isUpgrade) {
    try {
      const expireResult = await creditLifecycleService.expireMonthlyCredits({
        tenantId,
        reason: `Plan upgraded to ${plan.name} - removing old monthly credits`,
      });
      console.log(`[Stripe Webhook] Expired ${expireResult.expiredAmount} monthly credits from old plan`);
    } catch (expireError) {
      console.error("[Stripe Webhook] Error expiring old credits:", expireError);
    }

    // Update seat allocations based on upgrade metadata
    if (upgradeMetadata?.newPayingSeatsAllocated !== undefined && upgradeMetadata?.newFreeSeatsAllocated !== undefined) {
      const newPayingSeatsAllocated = parseInt(upgradeMetadata.newPayingSeatsAllocated);
      const newFreeSeatsAllocated = parseInt(upgradeMetadata.newFreeSeatsAllocated);
      const totalPayingSeats = parseInt(upgradeMetadata.totalPayingSeats || '0');
      const totalFreeSeats = parseInt(upgradeMetadata.totalFreeSeats || '0');
      
      try {
        await db
          .update(tenantSubscriptions)
          .set({
            payingSeatsAllocated: newPayingSeatsAllocated,
            freeSeatsAllocated: newFreeSeatsAllocated,
            updatedAt: new Date(),
          })
          .where(eq(tenantSubscriptions.id, subscriptionId));
        
        console.log(`[Stripe Webhook] Updated seat allocations: paying=${totalPayingSeats} (${newPayingSeatsAllocated} extra), free=${totalFreeSeats} (${newFreeSeatsAllocated} extra)`);
      } catch (seatError) {
        console.error("[Stripe Webhook] Error updating seat allocations:", seatError);
      }

      // Convert excess paying users to free if new plan has fewer paying seats
      try {
        const { userTenants, users } = await import("../../../../shared/schema");
        const currentSeatCount = await seatTrackingService.getCurrentSeatCount(tenantId, "production");
        
        if (currentSeatCount.payingSeats > totalPayingSeats) {
          const excessPayingUsers = currentSeatCount.payingSeats - totalPayingSeats;
          console.log(`[Stripe Webhook] Found ${excessPayingUsers} excess paying users (${currentSeatCount.payingSeats} > ${totalPayingSeats} limit)`);
          
          // Get all paying users, sorted by joinedAt (oldest first - they keep paying status)
          const payingUsers = await db
            .select({
              userId: userTenants.userId,
              joinedAt: userTenants.joinedAt,
              email: users.email,
            })
            .from(userTenants)
            .innerJoin(users, eq(userTenants.userId, users.id))
            .where(
              and(
                eq(userTenants.tenantId, tenantId),
                eq(userTenants.environment, "production"),
                eq(userTenants.isPaying, true)
              )
            )
            .orderBy(asc(userTenants.joinedAt)); // Oldest first
          
          // Convert newest paying users to free (keep oldest ones as paying)
          const usersToConvert = payingUsers.slice(totalPayingSeats); // Skip the first N (oldest) users
          
          if (usersToConvert.length > 0) {
            console.log(`[Stripe Webhook] Converting ${usersToConvert.length} newest paying users to free:`);
            for (const user of usersToConvert) {
              await seatTrackingService.unmarkUserAsPaying(tenantId, user.userId, "production");
              console.log(`[Stripe Webhook] Converted user ${user.email} (${user.userId}) from paying to free`);
            }
          }
        }
      } catch (userConversionError) {
        console.error("[Stripe Webhook] Error converting excess paying users to free:", userConversionError);
      }

      // Transition pending paid invites to free if target plan has free capacity
      try {
        const { tenantInvitations } = await import("../../../../shared/schema");
        
        // Get pending paid invites (seatType can be 'paid' or 'pending-paid')
        const pendingPaidInvites = await db
          .select()
          .from(tenantInvitations)
          .where(
            and(
              eq(tenantInvitations.tenantId, tenantId),
              eq(tenantInvitations.status, 'pending'),
              // Check for both 'paid' and 'pending-paid' seat types
              or(
                eq(tenantInvitations.seatType, 'paid'),
                eq(tenantInvitations.seatType, 'pending-paid')
              )
            )
          );

        if (pendingPaidInvites.length > 0) {
          console.log(`[Stripe Webhook] Found ${pendingPaidInvites.length} pending paid invites to potentially transition`);
          
          // Get current active users
          const currentSeatCount = await seatTrackingService.getCurrentSeatCount(tenantId, "production");
          const currentPayingUsed = currentSeatCount.payingSeats;
          const currentFreeUsed = currentSeatCount.freeSeats;
          
          // Calculate available capacity
          const availablePayingSeats = totalPayingSeats - currentPayingUsed;
          const availableFreeSeats = totalFreeSeats - currentFreeUsed;
          
          console.log(`[Stripe Webhook] Seat capacity: paying=${availablePayingSeats}/${totalPayingSeats}, free=${availableFreeSeats}/${totalFreeSeats}`);
          console.log(`[Stripe Webhook] Current usage: ${currentPayingUsed} paying + ${currentFreeUsed} free = ${currentPayingUsed + currentFreeUsed} total`);
          
          // Prioritize filling paying seats first, only convert to free if no paying capacity
          // Sort invites by creation date (oldest first) to maintain order
          const sortedInvites = [...pendingPaidInvites].sort((a, b) => 
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
          );
          
          let payingSeatsFilled = 0;
          let freeSeatsFilled = 0;
          
          for (const invite of sortedInvites) {
            // First, try to keep as paying if there's paying capacity
            if (availablePayingSeats > payingSeatsFilled) {
              // Keep as paid - no update needed, just track
              payingSeatsFilled++;
              console.log(`[Stripe Webhook] Keeping invite ${invite.id} as paid (${payingSeatsFilled}/${availablePayingSeats} paying seats filled)`);
            } else if (availableFreeSeats > freeSeatsFilled) {
              // Only convert to free if no paying capacity left
              await db
                .update(tenantInvitations)
                .set({
                  seatType: 'free',
                  requiresPayment: false,
                })
                .where(eq(tenantInvitations.id, invite.id));
              
              freeSeatsFilled++;
              console.log(`[Stripe Webhook] Transitioned invite ${invite.id} from ${invite.seatType} to free (${freeSeatsFilled}/${availableFreeSeats} free seats filled)`);
            } else {
              console.log(`[Stripe Webhook] Cannot accommodate invite ${invite.id} - no capacity available`);
            }
          }
          
          const transitioned = freeSeatsFilled;
          
          if (transitioned > 0) {
            console.log(`[Stripe Webhook] Successfully transitioned ${transitioned} pending paid invites to free`);
          } else if (pendingPaidInvites.length > 0) {
            console.warn(`[Stripe Webhook] Could not transition ${pendingPaidInvites.length} paid invites - insufficient free capacity`);
          }
        }
      } catch (inviteError) {
        console.error("[Stripe Webhook] Error transitioning pending invites:", inviteError);
      }
    }
  }

  // Mark the user who initiated the subscription as paying (if userId provided)
  if (userId) {
    try {
      const markResult = await seatTrackingService.markUserAsPaying(
        tenantId,
        userId,
        "production",
        true // force = true to bypass seat limit check
      );
      
      if (markResult.success) {
        console.log("[Stripe Webhook] Marked user as paying:", userId);
      } else {
        console.warn("[Stripe Webhook] Failed to mark user as paying:", markResult.error);
      }
    } catch (seatError) {
      console.error("[Stripe Webhook] Error marking user as paying:", seatError);
    }
  }

  // Also mark the tenant owner as paying (if not already marked)
  // This ensures owners are always marked as paying when they have an active subscription
  try {
    const { getTenantUsersFromSchema } = await import('../../utils/cross-tenant-query.helper');
    const tenantUsers = await getTenantUsersFromSchema(tenantId);
    
    // Find the owner(s) - there might be multiple owners
    const owners = tenantUsers.filter(u => u.role === 'owner');
    
    for (const owner of owners) {
      // Skip if this owner is already the userId (already handled above)
      if (owner.userId === userId) {
        continue;
      }
      
      // Skip if already marked as paying
      if (owner.isPaying) {
        continue;
      }
      
      try {
        const markResult = await seatTrackingService.markUserAsPaying(
          tenantId,
          owner.userId,
          "production",
          true // force = true to bypass seat limit check
        );
        
        if (markResult.success) {
          console.log("[Stripe Webhook] Marked owner as paying:", owner.userId);
        } else {
          console.warn("[Stripe Webhook] Failed to mark owner as paying:", markResult.error);
        }
      } catch (ownerError) {
        console.error("[Stripe Webhook] Error marking owner as paying:", ownerError);
      }
    }
  } catch (ownerLookupError) {
    console.error("[Stripe Webhook] Error looking up tenant owners:", ownerLookupError);
    // Don't fail the subscription activation if owner lookup fails
  }

  // NOTE: Credit allocation has been moved to invoice.payment_succeeded
  // to avoid duplicate allocation and race conditions
  // This function now only handles seat allocation and user marking
}

export default router;

