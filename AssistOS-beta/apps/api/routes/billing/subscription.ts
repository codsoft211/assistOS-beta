import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { 
  subscriptionPlans,
  tenantSubscriptions,
  subscriptionPlans as plans,
  users,
  tenantInvitations,
} from "../../../../shared/schema";
import { eq, and, or, asc } from "drizzle-orm";
import { seatTrackingService } from "../../../../packages/services/seat-tracking";
import { creditLifecycleService } from "../../../../packages/services/credit-lifecycle";
import { stripeService } from "../../../../packages/services/stripe";

const router = Router();

/**
 * Helper: Calculate upgrade proration based on plan structure
 * 
 * Plan structure:
 * - Base: 1 paid seat (costs B per seat)
 * - Pro: 1 paid + 1 free seat per block (costs P per block)
 * - Ultra: 1 paid + 3 free seats per block (costs U per block)
 * 
 * Upgrade logic:
 * 1. Calculate how many blocks user has ALREADY PAID FOR on current plan
 * 2. Calculate how many blocks needed for target plan (based on allocated seats)
 * 3. Credit what user already paid
 * 4. Charge difference: (target_blocks × target_price) - credit
 */
function calculateUpgradeProration(params: {
  currentPlanPrice: number;
  currentPlanPayingSeatsIncluded: number;
  currentPlanFreeSeatsIncluded: number;
  currentPayingSeatsAllocated: number; // Extra paid seats beyond included
  currentFreeSeatsAllocated: number; // Extra free seats beyond included
  targetPlanPrice: number;
  targetPlanPayingSeatsIncluded: number;
  targetPlanFreeSeatsIncluded: number;
}): {
  currentBlocksPaid: number;
  blocksNeeded: number;
  totalTargetCost: number;
  creditFromCurrent: number;
  amountToPay: number;
  newPayingSeatsAllocated: number;
  newFreeSeatsAllocated: number;
  totalPayingSeats: number;
  totalFreeSeats: number;
} {
  const {
    currentPlanPrice,
    currentPlanPayingSeatsIncluded,
    currentPlanFreeSeatsIncluded,
    currentPayingSeatsAllocated,
    currentFreeSeatsAllocated,
    targetPlanPrice,
    targetPlanPayingSeatsIncluded,
    targetPlanFreeSeatsIncluded,
  } = params;

  // Calculate total seats user currently has
  const totalCurrentPayingSeats = currentPlanPayingSeatsIncluded + currentPayingSeatsAllocated;
  const totalCurrentFreeSeats = currentPlanFreeSeatsIncluded + currentFreeSeatsAllocated;
  const totalCurrentSeats = totalCurrentPayingSeats + totalCurrentFreeSeats;

  // Calculate how many blocks user has ALREADY PAID FOR
  // Each additional block on current plan costs currentPlanPrice
  const currentSeatsPerBlock = currentPlanPayingSeatsIncluded + currentPlanFreeSeatsIncluded;
  const currentBlocksPaid = 1 + Math.floor(currentPayingSeatsAllocated / currentPlanPayingSeatsIncluded);

  // Calculate how many blocks needed for target plan to accommodate current total seats
  const targetSeatsPerBlock = targetPlanPayingSeatsIncluded + targetPlanFreeSeatsIncluded;
  const blocksNeeded = Math.ceil(totalCurrentSeats / targetSeatsPerBlock);

  // Total cost for target plan
  const totalTargetCost = blocksNeeded * targetPlanPrice;

  // Credit from current plan (what user already paid)
  const creditFromCurrent = currentBlocksPaid * currentPlanPrice;

  // Amount to pay
  const amountToPay = Math.max(0, totalTargetCost - creditFromCurrent);

  // Calculate new seat allocations for target plan
  // Total seats = blocksNeeded × seats per block
  const totalTargetPayingSeats = blocksNeeded * targetPlanPayingSeatsIncluded;
  const totalTargetFreeSeats = blocksNeeded * targetPlanFreeSeatsIncluded;
  
  // Allocated = total - included (what's stored in DB)
  const newPayingSeatsAllocated = totalTargetPayingSeats - targetPlanPayingSeatsIncluded;
  const newFreeSeatsAllocated = totalTargetFreeSeats - targetPlanFreeSeatsIncluded;

  return {
    currentBlocksPaid,
    blocksNeeded,
    totalTargetCost,
    creditFromCurrent,
    amountToPay,
    newPayingSeatsAllocated,
    newFreeSeatsAllocated,
    totalPayingSeats: totalTargetPayingSeats,
    totalFreeSeats: totalTargetFreeSeats,
  };
}

/**
 * Process upgrade directly when amountToPay is 0 (no Stripe checkout needed)
 * This mirrors the webhook logic but executes synchronously
 */
async function processUpgradeDirectly(params: {
  tenantId: string;
  subscriptionId: string;
  planId: number;
  userId?: string;
  prorationData: {
    blocksNeeded: number;
    newPayingSeatsAllocated: number;
    newFreeSeatsAllocated: number;
    totalPayingSeats: number;
    totalFreeSeats: number;
  };
}) {
  const { tenantId, subscriptionId, planId, userId, prorationData } = params;

  // Get plan details
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  // Expire old monthly credits
  try {
    const expireResult = await creditLifecycleService.expireMonthlyCredits({
      tenantId,
      reason: `Plan upgraded to ${plan.name} - removing old monthly credits`,
    });
    console.log(`[Direct Upgrade] Expired ${expireResult.expiredAmount} monthly credits from old plan`);
  } catch (expireError) {
    console.error("[Direct Upgrade] Error expiring old credits:", expireError);
  }

  // Update subscription plan and seat allocations
  await db
    .update(tenantSubscriptions)
    .set({
      subscriptionPlanId: planId,
      payingSeatsAllocated: prorationData.newPayingSeatsAllocated,
      freeSeatsAllocated: prorationData.newFreeSeatsAllocated,
      updatedAt: new Date(),
    })
    .where(eq(tenantSubscriptions.id, subscriptionId));

  console.log(`[Direct Upgrade] Updated subscription to ${plan.name}`);
  console.log(`[Direct Upgrade] Seat allocations: paying=${prorationData.totalPayingSeats} (${prorationData.newPayingSeatsAllocated} extra), free=${prorationData.totalFreeSeats} (${prorationData.newFreeSeatsAllocated} extra)`);

  // Convert excess paying users to free if new plan has fewer paying seats
  try {
    const { userTenants, users } = await import("../../../../shared/schema");
    const currentSeatCount = await seatTrackingService.getCurrentSeatCount(tenantId, "production");
    
    if (currentSeatCount.payingSeats > prorationData.totalPayingSeats) {
      const excessPayingUsers = currentSeatCount.payingSeats - prorationData.totalPayingSeats;
      console.log(`[Direct Upgrade] Found ${excessPayingUsers} excess paying users (${currentSeatCount.payingSeats} > ${prorationData.totalPayingSeats} limit)`);
      
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
      const usersToConvert = payingUsers.slice(prorationData.totalPayingSeats); // Skip the first N (oldest) users
      
      if (usersToConvert.length > 0) {
        console.log(`[Direct Upgrade] Converting ${usersToConvert.length} newest paying users to free:`);
        for (const user of usersToConvert) {
          await seatTrackingService.unmarkUserAsPaying(tenantId, user.userId, "production");
          console.log(`[Direct Upgrade] Converted user ${user.email} (${user.userId}) from paying to free`);
        }
      }
    }
  } catch (userConversionError) {
    console.error("[Direct Upgrade] Error converting excess paying users to free:", userConversionError);
  }

  // Transition pending paid invites to free if target plan has free capacity
  try {
    const currentSeatCount = await seatTrackingService.getCurrentSeatCount(tenantId, "production");
    const currentPayingUsed = currentSeatCount.payingSeats;
    const currentFreeUsed = currentSeatCount.freeSeats;
    
    const availablePayingSeats = prorationData.totalPayingSeats - currentPayingUsed;
    const availableFreeSeats = prorationData.totalFreeSeats - currentFreeUsed;
    
    console.log(`[Direct Upgrade] Seat capacity: paying=${availablePayingSeats}/${prorationData.totalPayingSeats}, free=${availableFreeSeats}/${prorationData.totalFreeSeats}`);
    
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
      console.log(`[Direct Upgrade] Found ${pendingPaidInvites.length} pending paid invites to potentially transition`);
      console.log(`[Direct Upgrade] Current usage: ${currentPayingUsed} paying + ${currentFreeUsed} free = ${currentPayingUsed + currentFreeUsed} total`);
      
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
          console.log(`[Direct Upgrade] Keeping invite ${invite.id} as paid (${payingSeatsFilled}/${availablePayingSeats} paying seats filled)`);
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
          console.log(`[Direct Upgrade] Transitioned invite ${invite.id} from ${invite.seatType} to free (${freeSeatsFilled}/${availableFreeSeats} free seats filled)`);
        } else {
          console.log(`[Direct Upgrade] Cannot accommodate invite ${invite.id} - no capacity available`);
        }
      }
      
      const transitioned = freeSeatsFilled;
      
      if (transitioned > 0) {
        console.log(`[Direct Upgrade] Successfully transitioned ${transitioned} pending paid invites to free`);
      }
      if (payingSeatsFilled > 0) {
        console.log(`[Direct Upgrade] Kept ${payingSeatsFilled} pending paid invites as paid (filling paying seats first)`);
      }
    }
  } catch (inviteError) {
    console.error("[Direct Upgrade] Error transitioning pending invites:", inviteError);
  }

  // Allocate new credits immediately
  if (plan.creditsIncluded && plan.creditsIncluded > 0) {
    const totalCreditsToAdd = plan.creditsIncluded * prorationData.blocksNeeded;

    if (totalCreditsToAdd > 0) {
      try {
        const creditResult = await creditLifecycleService.addMonthlyCredits({
          tenantId,
          subscriptionId,
          amount: totalCreditsToAdd,
          reason: `Plan upgraded to ${plan.name} - ${totalCreditsToAdd} credits allocated immediately (${prorationData.blocksNeeded} blocks)`,
        });

        if (creditResult.success) {
          console.log(`[Direct Upgrade] Added ${totalCreditsToAdd} credits for subscription`);
        } else {
          console.error("[Direct Upgrade] Failed to add credits:", creditResult.error);
        }
      } catch (creditError) {
        console.error("[Direct Upgrade] Error adding credits:", creditError);
      }
    }
  }
}

/**
 * GET /api/billing/subscription/test
 * Test endpoint to verify route is working
 */
router.get("/test", async (req: Request, res: Response) => {
  console.log("[Subscription Test] Route hit!");
  return res.json({ message: "Subscription route is working!", timestamp: new Date().toISOString() });
});

/**
 * GET /api/billing/subscription/plans
 * List all available subscription plans
 */
router.get("/plans", async (req: Request, res: Response) => {
  console.log("[Subscription Plans] Route handler called!");
  console.log("[Subscription Plans] Request URL:", req.url);
  console.log("[Subscription Plans] Request path:", req.path);
  try {
    console.log("[Subscription Plans] Fetching plans from database...");
    
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(subscriptionPlans.id);

    console.log("[Subscription Plans] Found plans:", plans.length);

    return res.json({
      plans: plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        priceMonthlyEuros: plan.priceMonthlyEuros,
        priceModel: plan.priceModel,
        payingUsersIncluded: plan.payingUsersIncluded,
        freeUsersIncluded: plan.freeUsersIncluded,
        creditsIncluded: plan.creditsIncluded,
        description: plan.description,
        isEnterprise: plan.isEnterprise,
      })),
    });
  } catch (error: any) {
    console.error("[Subscription Plans] Error:", error);
    console.error("[Subscription Plans] Error details:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    
    // Check if table doesn't exist
    if (error?.message?.includes('does not exist') || error?.code === '42P01') {
      return res.status(500).json({ 
        error: "Subscription plans table not found",
        message: "Please run the migration to create subscription_plans table",
        details: error.message 
      });
    }
    
    return res.status(500).json({ 
      error: "Failed to fetch subscription plans",
      details: error?.message || "Unknown error"
    });
  }
});

/**
 * GET /api/billing/subscription/subscription
 * Get current tenant subscription
 */
router.get("/subscription", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    const hasScheduledPlanColumns =
      Boolean((tenantSubscriptions as any).scheduledPlanId) &&
      Boolean((tenantSubscriptions as any).scheduledPlanChangeAt);

    const subscriptionFields: Record<string, any> = {
      id: tenantSubscriptions.id,
      status: tenantSubscriptions.status,
      startDate: tenantSubscriptions.startDate,
      endDate: tenantSubscriptions.endDate,
      renewalDate: tenantSubscriptions.renewalDate,
      billingInterval: tenantSubscriptions.billingInterval,
      autoRenew: tenantSubscriptions.autoRenew,
      currentPeriodStart: tenantSubscriptions.currentPeriodStart,
      currentPeriodEnd: tenantSubscriptions.currentPeriodEnd,
      nextPaymentAt: tenantSubscriptions.nextPaymentAt,
      isTrial: tenantSubscriptions.isTrial,
      trialEndsAt: tenantSubscriptions.trialEndsAt,
    };

    if (hasScheduledPlanColumns) {
      subscriptionFields.scheduledPlanId = (tenantSubscriptions as any).scheduledPlanId;
      subscriptionFields.scheduledPlanChangeAt = (tenantSubscriptions as any).scheduledPlanChangeAt;
    }

    const [subscription] = await db
      .select({
        subscription: subscriptionFields,
        subscriptionData: {
          payingSeatsAllocated: tenantSubscriptions.payingSeatsAllocated,
          freeSeatsAllocated: tenantSubscriptions.freeSeatsAllocated,
          creditBalance: tenantSubscriptions.creditBalance,
        },
        plan: {
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          priceMonthlyEuros: subscriptionPlans.priceMonthlyEuros,
          priceModel: subscriptionPlans.priceModel,
          payingUsersIncluded: subscriptionPlans.payingUsersIncluded,
          freeUsersIncluded: subscriptionPlans.freeUsersIncluded,
          creditsIncluded: subscriptionPlans.creditsIncluded,
          creditsPerPayingUser: subscriptionPlans.creditsPerPayingUser,
          description: subscriptionPlans.description,
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

    if (!subscription) {
      return res.json({ subscription: null });
    }

    // Get scheduled plan details if there's a scheduled change
    let scheduledPlan = null;
    const subscriptionData: any = subscription.subscription;
    const scheduledPlanId =
      hasScheduledPlanColumns && subscriptionData?.scheduledPlanId
        ? subscriptionData.scheduledPlanId
        : null;

    if (scheduledPlanId) {
      const [scheduledPlanData] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, scheduledPlanId))
        .limit(1);
      
      if (scheduledPlanData) {
        scheduledPlan = {
          id: scheduledPlanData.id,
          name: scheduledPlanData.name,
          priceMonthlyEuros: scheduledPlanData.priceMonthlyEuros,
          priceModel: scheduledPlanData.priceModel,
          payingUsersIncluded: scheduledPlanData.payingUsersIncluded,
          freeUsersIncluded: scheduledPlanData.freeUsersIncluded,
          creditsIncluded: scheduledPlanData.creditsIncluded,
          description: scheduledPlanData.description,
          isEnterprise: scheduledPlanData.isEnterprise,
        };
      }
    }

    // Get current seat usage (active users)
    const seatCount = await seatTrackingService.getCurrentSeatCount(tenantId);

    // Calculate total credits based on paying seats allocated
    const baseCredits = subscription.plan.creditsIncluded || 0;
    const creditsPerPayingSeat = subscription.plan.creditsPerPayingUser || 0;
    const rawPayingSeatsAllocated = subscription.subscriptionData.payingSeatsAllocated || 0;
    const rawFreeSeatsAllocated = subscription.subscriptionData.freeSeatsAllocated || 0;
    const planPayingIncluded = subscription.plan.payingUsersIncluded || 0;
    const planFreeIncluded = subscription.plan.freeUsersIncluded || 0;

    // Interpret DB values as "extra purchased seats" in case legacy data never seeded base capacity
    const totalPayingCapacity = planPayingIncluded + rawPayingSeatsAllocated;
    const payingSeatsAllocated = Math.max(totalPayingCapacity, seatCount.payingSeats);

    const totalFreeCapacity = planFreeIncluded + rawFreeSeatsAllocated;
    const freeSeatsAllocated = Math.max(totalFreeCapacity, seatCount.freeSeats);
    
    // Total credits = base credits + (extra paying seats * credits per seat)
    const totalCreditsAllocated = baseCredits + (rawPayingSeatsAllocated * creditsPerPayingSeat);

    return res.json({
      subscription: subscriptionData,
      plan: {
        ...subscription.plan,
        totalCreditsAllocated, // Add calculated total credits
      },
      scheduledPlan: scheduledPlan,
      seatUsage: {
        payingSeats: seatCount.payingSeats, // Active paying users
        freeSeats: seatCount.freeSeats, // Active free users
        totalSeats: seatCount.totalSeats, // Total active users
        payingSeatsAllocated, // Total paying seats purchased (including pending invites)
        freeSeatsAllocated,
        payingLimit: subscription.plan.payingUsersIncluded,
        freeLimit: subscription.plan.freeUsersIncluded,
        freeSeatsInUse: seatCount.freeSeats,
      },
    });
  } catch (error) {
    console.error("[Current Subscription] Error:", error);
    return res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

/**
 * GET /api/billing/subscription/upgrade-preview
 * Preview upgrade costs and seat allocations
 */
router.get("/upgrade-preview", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { planId } = req.query;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    if (!planId) {
      return res.status(400).json({ error: "planId query parameter is required" });
    }

    // Get target plan
    const [targetPlan] = await db
      .select()
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.id, parseInt(planId as string)),
          eq(subscriptionPlans.isActive, true)
        )
      )
      .limit(1);

    if (!targetPlan) {
      return res.status(404).json({ error: "Target plan not found" });
    }

    // Get current subscription with allocated seats
    const [currentSubscription] = await db
      .select({
        id: tenantSubscriptions.id,
        payingSeatsAllocated: tenantSubscriptions.payingSeatsAllocated,
        freeSeatsAllocated: tenantSubscriptions.freeSeatsAllocated,
        plan: {
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          priceMonthlyEuros: subscriptionPlans.priceMonthlyEuros,
          payingUsersIncluded: subscriptionPlans.payingUsersIncluded,
          freeUsersIncluded: subscriptionPlans.freeUsersIncluded,
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

    if (!currentSubscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Get current seat usage
    const seatCount = await seatTrackingService.getCurrentSeatCount(tenantId);

    // Calculate proration based on allocated seats (what user paid for)
    const currentPrice = parseFloat(currentSubscription.plan.priceMonthlyEuros || '0');
    const targetPrice = parseFloat(targetPlan.priceMonthlyEuros || '0');

    const proration = calculateUpgradeProration({
      currentPlanPrice: currentPrice,
      currentPlanPayingSeatsIncluded: currentSubscription.plan.payingUsersIncluded || 1,
      currentPlanFreeSeatsIncluded: currentSubscription.plan.freeUsersIncluded || 0,
      currentPayingSeatsAllocated: currentSubscription.payingSeatsAllocated || 0,
      currentFreeSeatsAllocated: currentSubscription.freeSeatsAllocated || 0,
      targetPlanPrice: targetPrice,
      targetPlanPayingSeatsIncluded: targetPlan.payingUsersIncluded || 1,
      targetPlanFreeSeatsIncluded: targetPlan.freeUsersIncluded || 0,
    });

    const totalCurrentPayingSeats = (currentSubscription.plan.payingUsersIncluded || 0) + (currentSubscription.payingSeatsAllocated || 0);
    const totalCurrentFreeSeats = (currentSubscription.plan.freeUsersIncluded || 0) + (currentSubscription.freeSeatsAllocated || 0);

    return res.json({
      currentPlan: {
        id: currentSubscription.plan.id,
        name: currentSubscription.plan.name,
        priceMonthly: currentPrice,
        payingSeatsAllocated: totalCurrentPayingSeats,
        freeSeatsAllocated: totalCurrentFreeSeats,
        activeUsers: seatCount.totalSeats,
        blocksPaid: proration.currentBlocksPaid,
      },
      targetPlan: {
        id: targetPlan.id,
        name: targetPlan.name,
        priceMonthly: targetPrice,
      },
      proration: {
        currentBlocksPaid: proration.currentBlocksPaid,
        blocksNeeded: proration.blocksNeeded,
        totalTargetCost: proration.totalTargetCost,
        creditFromCurrentPlan: proration.creditFromCurrent,
        amountToPay: proration.amountToPay,
        newPayingSeatsAllocated: proration.newPayingSeatsAllocated,
        newFreeSeatsAllocated: proration.newFreeSeatsAllocated,
        totalPayingSeats: proration.totalPayingSeats,
        totalFreeSeats: proration.totalFreeSeats,
      },
      message: proration.amountToPay === 0 
        ? "Your current plan credit covers the upgrade cost"
        : `You will be charged €${proration.amountToPay.toFixed(2)} for the upgrade`,
    });
  } catch (error) {
    console.error("[Upgrade Preview] Error:", error);
    return res.status(500).json({ error: "Failed to calculate upgrade preview" });
  }
});

/**
 * POST /api/billing/subscription/upgrade
 * Upgrade to a new subscription plan
 */
router.post("/upgrade", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { planId } = req.body;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    if (!planId) {
      return res.status(400).json({ error: "planId is required" });
    }

    // Verify plan exists
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.id, planId),
          eq(subscriptionPlans.isActive, true)
        )
      )
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: "Subscription plan not found" });
    }

    // Get current subscription with old plan details
    const [currentSubscription] = await db
      .select({
        id: tenantSubscriptions.id,
        subscriptionPlanId: tenantSubscriptions.subscriptionPlanId,
        oldPlan: {
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          priceMonthlyEuros: subscriptionPlans.priceMonthlyEuros,
          payingUsersIncluded: subscriptionPlans.payingUsersIncluded,
          freeUsersIncluded: subscriptionPlans.freeUsersIncluded,
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
          eq(tenantSubscriptions.tenantId, tenantId),
          eq(tenantSubscriptions.status, 'active')
        )
      )
      .limit(1);

    // Get user email for Stripe customer
    const userId = req.session?.userId || (req as any).userId;
    let userEmail = 'user@example.com';
    let userName = 'User';

    if (userId) {
      const [user] = await db
        .select({
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user) {
        userEmail = user.email;
        userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
      }
    }

    const isUpgrade = !!currentSubscription;

    // REQUIRE Stripe for payment processing
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        error: "Payment processing not configured",
        message: "Stripe payment integration is required. Please contact support.",
      });
    }

    // Validate plan has a price
    const priceEuros = parseFloat(plan.priceMonthlyEuros || '0');
    
    if (!plan.priceMonthlyEuros || priceEuros <= 0) {
      return res.status(400).json({ 
        error: "Plan does not have a valid price",
        message: "This plan requires custom pricing. Please contact support."
      });
    }

    // Get current subscription with allocated seats for proration
    let prorationData = null;
    if (isUpgrade && currentSubscription?.oldPlan) {
      const currentPrice = parseFloat(currentSubscription.oldPlan.priceMonthlyEuros || '0');
      
      // Get full subscription data to access allocated seats
      const [fullSubscription] = await db
        .select({
          payingSeatsAllocated: tenantSubscriptions.payingSeatsAllocated,
          freeSeatsAllocated: tenantSubscriptions.freeSeatsAllocated,
          paymentReference: tenantSubscriptions.paymentReference,
        })
        .from(tenantSubscriptions)
        .where(eq(tenantSubscriptions.id, currentSubscription.id))
        .limit(1);
      
      prorationData = calculateUpgradeProration({
        currentPlanPrice: currentPrice,
        currentPlanPayingSeatsIncluded: currentSubscription.oldPlan.payingUsersIncluded || 1,
        currentPlanFreeSeatsIncluded: currentSubscription.oldPlan.freeUsersIncluded || 0,
        currentPayingSeatsAllocated: fullSubscription?.payingSeatsAllocated || 0,
        currentFreeSeatsAllocated: fullSubscription?.freeSeatsAllocated || 0,
        targetPlanPrice: priceEuros,
        targetPlanPayingSeatsIncluded: plan.payingUsersIncluded || 1,
        targetPlanFreeSeatsIncluded: plan.freeUsersIncluded || 0,
      });

      // If amountToPay is 0, process upgrade directly without Stripe checkout
      // Stripe doesn't support €0 checkout sessions for subscriptions
      if (prorationData.amountToPay === 0 && fullSubscription?.paymentReference) {
        console.log("[Upgrade Subscription] Amount to pay is €0, processing upgrade directly");
        
        try {
          // Get the new plan price ID from Stripe
          const newPrice = await stripeService.getOrCreatePrice({
            planId: plan.id,
            planName: plan.name,
            amount: Math.round(priceEuros * 100),
            currency: 'eur',
            interval: 'month',
          });

          // Update subscription in Stripe with proration_behavior: 'none' to avoid any charge
          // Since amountToPay is 0, we don't want Stripe to prorate or charge anything
          if (stripeService.isConfigured() && fullSubscription.paymentReference) {
            // Use updateSubscriptionPlan with a custom approach for zero-amount upgrades
            // We'll update the subscription but tell Stripe not to prorate
            const stripeSubscription = await stripeService.getSubscription(fullSubscription.paymentReference);
            
            // Import stripe directly for this specific update
            const { stripe } = await import('../../../../packages/services/stripe');
            if (stripe) {
              await stripe.subscriptions.update(fullSubscription.paymentReference, {
                items: [{
                  id: stripeSubscription.items.data[0].id,
                  price: newPrice.id,
                }],
                proration_behavior: 'none', // No proration, no charge
              });
              
              console.log("[Upgrade Subscription] Updated Stripe subscription to new plan with no charge");
            }
          }

          // Process the upgrade directly (same logic as webhook)
          await processUpgradeDirectly({
            tenantId,
            subscriptionId: currentSubscription.id,
            planId: plan.id,
            userId: userId || undefined,
            prorationData,
          });

          return res.json({
            success: true,
            message: "Upgrade completed successfully. No payment required.",
            proration: prorationData,
            upgraded: true,
          });
        } catch (directUpgradeError: any) {
          console.error("[Upgrade Subscription] Direct upgrade error:", directUpgradeError);
          return res.status(500).json({
            error: "Failed to process upgrade",
            details: directUpgradeError.message,
          });
        }
      }
    }

    // Create Stripe Checkout Session (only if amountToPay > 0)
    // All subscription updates happen via webhook after payment succeeds
    const baseUrl = process.env.FRONTEND_URL || req.protocol + '://' + req.get('host');
    const successUrl = `${baseUrl}/billing?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/billing/plans`;

    // Ensure we never create a checkout with €0 for subscriptions
    const amountToCharge = prorationData?.amountToPay || priceEuros;
    if (amountToCharge <= 0) {
      return res.status(400).json({
        error: "Invalid upgrade amount",
        message: "Cannot create checkout session with zero or negative amount. Please contact support.",
      });
    }

      try {
        const checkoutSession = await stripeService.createCheckoutSession({
          tenantId,
          userId: userId || '',
          userEmail,
          userName,
          planId: plan.id,
          planName: plan.name,
          priceEuros: amountToCharge,
          billingInterval: 'monthly',
          successUrl,
          cancelUrl,
          isUpgrade,
          existingSubscriptionId: currentSubscription?.id,
          upgradeMetadata: prorationData ? {
            blocksNeeded: prorationData.blocksNeeded.toString(),
            newPayingSeatsAllocated: prorationData.newPayingSeatsAllocated.toString(),
            newFreeSeatsAllocated: prorationData.newFreeSeatsAllocated.toString(),
            totalPayingSeats: prorationData.totalPayingSeats.toString(),
            totalFreeSeats: prorationData.totalFreeSeats.toString(),
            creditFromCurrent: prorationData.creditFromCurrent.toString(),
          } : undefined,
        });

      return res.json({
        success: true,
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
        message: "Redirect to Stripe checkout",
        proration: prorationData,
      });
    } catch (stripeError: any) {
      console.error("[Upgrade Subscription] Stripe error:", stripeError);
      return res.status(500).json({
        error: "Failed to create checkout session",
        details: stripeError.message,
      });
    }
  } catch (error) {
    console.error("[Upgrade Subscription] Error:", error);
    return res.status(500).json({ error: "Failed to upgrade subscription" });
  }
});

/**
 * POST /api/billing/subscription/cancel
 * Cancel auto-renew for the current subscription
 */
router.post("/cancel", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    const [subscription] = await db
      .select({
        id: tenantSubscriptions.id,
        autoRenew: tenantSubscriptions.autoRenew,
        currentPeriodEnd: tenantSubscriptions.currentPeriodEnd,
        paymentMethod: tenantSubscriptions.paymentMethod,
        paymentReference: tenantSubscriptions.paymentReference,
        metadata: tenantSubscriptions.metadata,
      })
      .from(tenantSubscriptions)
      .where(
        and(
          eq(tenantSubscriptions.tenantId, tenantId),
          eq(tenantSubscriptions.status, "active")
        )
      )
      .limit(1);

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    if (subscription.autoRenew === false) {
      return res.json({
        success: true,
        message: "Subscription is already scheduled to cancel",
        cancelAt: subscription.currentPeriodEnd,
      });
    }

    if (
      subscription.paymentMethod === "stripe" &&
      subscription.paymentReference
    ) {
      try {
        await stripeService.cancelSubscription(
          subscription.paymentReference,
          false
        );
      } catch (error: any) {
        console.error("[Cancel Subscription] Stripe error:", error);
        return res.status(500).json({
          error: "Failed to cancel subscription in Stripe",
          details: error?.message,
        });
      }
    }

    const newMetadata = {
      ...((subscription.metadata as Record<string, any>) || {}),
      cancellationRequestedAt: new Date().toISOString(),
    };

    await db
      .update(tenantSubscriptions)
      .set({
        autoRenew: false,
        metadata: newMetadata,
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.id, subscription.id));

    return res.json({
      success: true,
      message:
        "Subscription will stay active until the end of the current billing period and then be cancelled.",
      cancelAt: subscription.currentPeriodEnd,
    });
  } catch (error: any) {
    console.error("[Cancel Subscription] Error:", error);
    return res
      .status(500)
      .json({ error: "Failed to cancel subscription", details: error?.message });
  }
});

/**
 * POST /api/billing/subscription/downgrade
 * Downgrade to a lower subscription plan (validates seat count)
 */
router.post("/downgrade", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { planId } = req.body;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    if (!planId) {
      return res.status(400).json({ error: "planId is required" });
    }

    // Verify plan exists
    const [newPlan] = await db
      .select()
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.id, planId),
          eq(subscriptionPlans.isActive, true)
        )
      )
      .limit(1);

    if (!newPlan) {
      return res.status(404).json({ error: "Subscription plan not found" });
    }

    // Get current subscription with period end date
    const [currentSubscription] = await db
      .select({
        id: tenantSubscriptions.id,
        currentPeriodEnd: tenantSubscriptions.currentPeriodEnd,
        plan: {
          payingUsersIncluded: subscriptionPlans.payingUsersIncluded,
          freeUsersIncluded: subscriptionPlans.freeUsersIncluded,
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

    if (!currentSubscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Validate seat count against new plan limits
    const seatCount = await seatTrackingService.getCurrentSeatCount(tenantId);

    // Check if downgrade is valid (new plan must support current seats)
    if (newPlan.payingUsersIncluded !== null && seatCount.payingSeats > newPlan.payingUsersIncluded) {
      return res.status(400).json({
        error: "Cannot downgrade: Too many paying seats",
        currentPayingSeats: seatCount.payingSeats,
        newPlanLimit: newPlan.payingUsersIncluded,
        message: `You have ${seatCount.payingSeats} paying seats, but the new plan only allows ${newPlan.payingUsersIncluded}. Please unmark some users as paying before downgrading.`,
      });
    }

    if (newPlan.freeUsersIncluded !== null && seatCount.freeSeats > newPlan.freeUsersIncluded) {
      return res.status(400).json({
        error: "Cannot downgrade: Too many free seats",
        currentFreeSeats: seatCount.freeSeats,
        newPlanLimit: newPlan.freeUsersIncluded,
        message: `You have ${seatCount.freeSeats} free seats, but the new plan only allows ${newPlan.freeUsersIncluded}. Please remove some users before downgrading.`,
      });
    }

    // Schedule the downgrade to take effect at the end of the current billing period
    // This keeps the current plan active until then (like Cursor)
    const changeAt = currentSubscription.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // TODO: Payment integration logic
    // - Calculate prorated refund for unused portion of current plan
    // - Process refund/credit for downgrade
    // - Create invoice adjustment
    // - Note: Refund should be processed when the downgrade actually takes effect

    // Schedule the plan change (don't apply immediately)
    await db
      .update(tenantSubscriptions)
      .set({
        scheduledPlanId: planId,
        scheduledPlanChangeAt: changeAt,
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.id, currentSubscription.id));

    return res.json({
      success: true,
      message: "Downgrade scheduled successfully",
      planId,
      scheduledChangeAt: changeAt,
      currentPlanRemainsActive: true,
      seatValidation: {
        currentPayingSeats: seatCount.payingSeats,
        newPlanPayingLimit: newPlan.payingUsersIncluded,
        currentFreeSeats: seatCount.freeSeats,
        newPlanFreeLimit: newPlan.freeUsersIncluded,
      },
    });
  } catch (error) {
    console.error("[Downgrade Subscription] Error:", error);
    return res.status(500).json({ error: "Failed to downgrade subscription" });
  }
});

export default router;

