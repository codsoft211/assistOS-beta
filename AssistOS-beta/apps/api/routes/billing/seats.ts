import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { 
  userTenants,
  users,
  tenantSubscriptions,
  subscriptionPlans,
} from "../../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { seatTrackingService } from "../../../../packages/services/seat-tracking";
import { creditLifecycleService } from "../../../../packages/services/credit-lifecycle";

const router = Router();

/**
 * GET /api/billing/seats
 * List all users with seat usage information
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || "production";

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    // Get seat limit info
    const seatLimitInfo = await seatTrackingService.getSeatLimitInfo(tenantId, environment);

    // Get all users in tenant
    const tenantUsers = await db
      .select({
        userId: userTenants.userId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: userTenants.role,
        isPaying: userTenants.isPaying,
        joinedAt: userTenants.joinedAt,
      })
      .from(userTenants)
      .innerJoin(users, eq(userTenants.userId, users.id))
      .where(
        and(
          eq(userTenants.tenantId, tenantId),
          eq(userTenants.environment, environment)
        )
      )
      .orderBy(userTenants.joinedAt);

    return res.json({
      seatLimits: {
        payingUsersIncluded: seatLimitInfo.payingUsersIncluded,
        freeUsersIncluded: seatLimitInfo.freeUsersIncluded,
        currentPayingSeats: seatLimitInfo.currentPayingSeats,
        currentFreeSeats: seatLimitInfo.currentFreeSeats,
        remainingPayingSeats: seatLimitInfo.remainingPayingSeats,
        remainingFreeSeats: seatLimitInfo.remainingFreeSeats,
      },
      users: tenantUsers.map(user => ({
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isPaying: user.isPaying,
        joinedAt: user.joinedAt,
      })),
    });
  } catch (error) {
    console.error("[Seat Management] Error:", error);
    return res.status(500).json({ error: "Failed to fetch seat information" });
  }
});

/**
 * POST /api/billing/seats/:userId/mark-paying
 * Mark a user as paying (counts towards paying seat limit)
 */
router.post("/:userId/mark-paying", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || "production";
    const { userId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    // Verify user exists in tenant
    const [userTenant] = await db
      .select()
      .from(userTenants)
      .where(
        and(
          eq(userTenants.tenantId, tenantId),
          eq(userTenants.userId, userId),
          eq(userTenants.environment, environment)
        )
      )
      .limit(1);

    if (!userTenant) {
      return res.status(404).json({ error: "User not found in tenant" });
    }

    // Check if user is already paying
    if (userTenant.isPaying) {
      return res.json({
        success: true,
        message: "User is already marked as paying",
      });
    }

    // Mark user as paying (validates seat limit)
    const result = await seatTrackingService.markUserAsPaying(
      tenantId,
      userId,
      environment
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.error || "Failed to mark user as paying",
      });
    }

    // Get current subscription to add credits for this paying user
    const [subscription] = await db
      .select({
        id: tenantSubscriptions.id,
        plan: {
          creditsIncluded: subscriptionPlans.creditsIncluded,
          name: subscriptionPlans.name,
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

    // Add credits for this paying user (credits = plan_credits_per_user)
    let creditsAdded = 0;
    if (subscription && subscription.plan.creditsIncluded && subscription.plan.creditsIncluded > 0) {
      try {
        const creditResult = await creditLifecycleService.addCreditsForPayingUser({
          tenantId,
          subscriptionId: subscription.id,
          creditsPerUser: subscription.plan.creditsIncluded,
          reason: `Credits added for user marked as paying on ${subscription.plan.name} plan`,
          createdBy: req.session?.userId || (req as any).userId,
        });

        if (creditResult.success) {
          creditsAdded = subscription.plan.creditsIncluded;
        } else {
          console.error("[Mark Paying] Failed to add credits:", creditResult.error);
        }
      } catch (creditError) {
        console.error("[Mark Paying] Error adding credits:", creditError);
        // Don't fail the operation if credit addition fails
      }
    }

    // Get updated seat count
    const seatCount = await seatTrackingService.getCurrentSeatCount(tenantId, environment);

    return res.json({
      success: true,
      message: "User marked as paying successfully",
      creditsAdded: creditsAdded > 0 ? creditsAdded : undefined,
      seatUsage: {
        payingSeats: seatCount.payingSeats,
        freeSeats: seatCount.freeSeats,
        totalSeats: seatCount.totalSeats,
      },
    });
  } catch (error) {
    console.error("[Mark User as Paying] Error:", error);
    return res.status(500).json({ error: "Failed to mark user as paying" });
  }
});

/**
 * DELETE /api/billing/seats/:userId/unmark-paying
 * Unmark a user as paying (moves to free seat)
 */
router.delete("/:userId/unmark-paying", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || "production";
    const { userId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    // Verify user exists in tenant
    const [userTenant] = await db
      .select()
      .from(userTenants)
      .where(
        and(
          eq(userTenants.tenantId, tenantId),
          eq(userTenants.userId, userId),
          eq(userTenants.environment, environment)
        )
      )
      .limit(1);

    if (!userTenant) {
      return res.status(404).json({ error: "User not found in tenant" });
    }

    // Unmark user as paying
    const result = await seatTrackingService.unmarkUserAsPaying(
      tenantId,
      userId,
      environment
    );

    if (!result.success) {
      return res.status(400).json({
        error: "Failed to unmark user as paying",
      });
    }

    // Get updated seat count
    const seatCount = await seatTrackingService.getCurrentSeatCount(tenantId, environment);

    return res.json({
      success: true,
      message: "User unmarked as paying successfully",
      seatUsage: {
        payingSeats: seatCount.payingSeats,
        freeSeats: seatCount.freeSeats,
        totalSeats: seatCount.totalSeats,
      },
    });
  } catch (error) {
    console.error("[Unmark User as Paying] Error:", error);
    return res.status(500).json({ error: "Failed to unmark user as paying" });
  }
});

export default router;

