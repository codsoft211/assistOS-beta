import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { 
  tenantCredits, 
  usageEvents, 
  creditTransactions, 
  conversations,
  users 
} from "../../../shared/schema";
import { eq, and, gte, lte, desc, sql, between } from "drizzle-orm";

const router = Router();

/**
 * GET /api/credits/analytics
 * 
 * Returns overview metrics:
 * - Current balance
 * - Total spent this month
 * - Most expensive AI model
 * - Average cost per conversation
 * - Total conversations this month
 */
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    // Note: Credits are tracked per tenant regardless of environment (sandbox/production)
    const days = parseInt(req.query.days as string) || 30;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    // Get current balance (no environment filter - credits are shared)
    const [balance] = await db
      .select({
        monthlyCredits: tenantCredits.monthlyCredits,
        packageCredits: tenantCredits.packageCredits,
        reserved: tenantCredits.reserved,
        lifetimeUsage: tenantCredits.lifetimeUsage,
        lifetimePurchases: tenantCredits.lifetimePurchases,
        lowBalanceThreshold: tenantCredits.lowBalanceThreshold,
        lowBalanceNotified: tenantCredits.lowBalanceNotified,
      })
      .from(tenantCredits)
      .where(eq(tenantCredits.tenantId, tenantId));

    const monthly = balance?.monthlyCredits || 0;
    const packageCreds = balance?.packageCredits || 0;
    const totalBalance = monthly + packageCreds;

    // Get date range based on days parameter
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Total spent in the selected period (in credits) - no environment filter, tracks all usage
    const [periodSpend] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${usageEvents.creditsDeducted}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, startDate)
        )
      );

    // Most expensive AI model in the selected period (in credits)
    const [topModel] = await db
      .select({
        resourceName: usageEvents.resourceName,
        totalCredits: sql<number>`SUM(${usageEvents.creditsDeducted})`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, startDate)
        )
      )
      .groupBy(usageEvents.resourceName)
      .orderBy(desc(sql`SUM(${usageEvents.creditsDeducted})`))
      .limit(1);

    // Average credits per conversation
    const [avgCost] = await db
      .select({
        avgCost: sql<number>`COALESCE(AVG(conversation_total), 0)`,
        conversationCount: sql<number>`COUNT(*)`,
      })
      .from(
        db
          .select({
            conversationId: usageEvents.conversationId,
            conversationTotal: sql<number>`SUM(${usageEvents.creditsDeducted})`.as("conversation_total"),
          })
          .from(usageEvents)
          .where(
            and(
              eq(usageEvents.tenantId, tenantId),
              gte(usageEvents.createdAt, startDate)
            )
          )
          .groupBy(usageEvents.conversationId)
          .as("conversation_costs")
      );

    return res.json({
      currentBalance: totalBalance,
      monthlyCredits: monthly,
      packageCredits: packageCreds,
      reserved: balance?.reserved || 0,
      lifetimeUsage: balance?.lifetimeUsage || 0,
      lifetimePurchases: balance?.lifetimePurchases || 0,
      monthlySpend: periodSpend?.total || 0,
      topModel: {
        name: topModel?.resourceName || null,
        credits: topModel?.totalCredits || 0,
      },
      avgCreditsPerConversation: Math.round(avgCost?.avgCost || 0),
      conversationsThisMonth: avgCost?.conversationCount || 0,
      lowBalanceThreshold: balance?.lowBalanceThreshold || 100,
      lowBalanceNotified: balance?.lowBalanceNotified || false,
    });
  } catch (error) {
    console.error("[Credits Analytics] Error:", error);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

/**
 * GET /api/credits/balance
 * 
 * Returns current balance + daily trends (last 30 days)
 */
router.get("/balance", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    // Note: Credits are tracked per tenant regardless of environment (sandbox/production)
    const days = parseInt(req.query.days as string) || 30;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    // Get current balance (no environment filter - credits are shared)
    const [balance] = await db
      .select({
        monthlyCredits: tenantCredits.monthlyCredits,
        packageCredits: tenantCredits.packageCredits,
        reserved: tenantCredits.reserved,
        lifetimeUsage: tenantCredits.lifetimeUsage,
      })
      .from(tenantCredits)
      .where(eq(tenantCredits.tenantId, tenantId));

    const monthly = balance?.monthlyCredits || 0;
    const packageCreds = balance?.packageCredits || 0;
    const totalBalance = monthly + packageCreds;

    // Get daily consumption trend
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const dailyTrend = await db
      .select({
        date: sql<string>`DATE(${usageEvents.createdAt})`,
        creditsUsed: sql<number>`SUM(${usageEvents.creditsDeducted})`,
        eventCount: sql<number>`COUNT(*)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${usageEvents.createdAt})`)
      .orderBy(sql`DATE(${usageEvents.createdAt})`);

    return res.json({
      balance: totalBalance,
      monthlyCredits: monthly,
      packageCredits: packageCreds,
      reserved: balance?.reserved || 0,
      lifetimeUsage: balance?.lifetimeUsage || 0,
      dailyTrend,
    });
  } catch (error) {
    console.error("[Credits Balance] Error:", error);
    return res.status(500).json({ error: "Failed to fetch balance" });
  }
});

/**
 * GET /api/credits/breakdown
 * 
 * Returns cost breakdown by:
 * - AI model (pie chart data)
 * - Top 10 most expensive conversations
 * - Top users by spend
 */
router.get("/breakdown", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    // Note: Credits are tracked per tenant regardless of environment (sandbox/production)
    const days = parseInt(req.query.days as string) || 30;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Breakdown by AI model
    const modelBreakdown = await db
      .select({
        resourceName: usageEvents.resourceName,
        totalCredits: sql<number>`SUM(${usageEvents.creditsDeducted})`,
        totalEvents: sql<number>`COUNT(*)`,
        avgCreditsPerEvent: sql<number>`ROUND(AVG(${usageEvents.creditsDeducted}))`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, startDate)
        )
      )
      .groupBy(usageEvents.resourceName)
      .orderBy(desc(sql`SUM(${usageEvents.creditsDeducted})`));

    // Top 10 most expensive conversations
    const topConversations = await db
      .select({
        conversationId: usageEvents.conversationId,
        conversationTitle: conversations.title,
        totalCredits: sql<number>`SUM(${usageEvents.creditsDeducted})`,
        eventCount: sql<number>`COUNT(*)`,
        lastActivity: sql<string>`MAX(${usageEvents.createdAt})`,
      })
      .from(usageEvents)
      .leftJoin(
        conversations,
        eq(usageEvents.conversationId, conversations.id)
      )
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, startDate)
        )
      )
      .groupBy(usageEvents.conversationId, conversations.title)
      .orderBy(desc(sql`SUM(${usageEvents.creditsDeducted})`))
      .limit(10);

    // Top users by spend
    const topUsers = await db
      .select({
        userId: usageEvents.userId,
        userName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        userEmail: users.email,
        totalCredits: sql<number>`SUM(${usageEvents.creditsDeducted})`,
        eventCount: sql<number>`COUNT(*)`,
      })
      .from(usageEvents)
      .leftJoin(users, eq(usageEvents.userId, users.id))
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, startDate)
        )
      )
      .groupBy(usageEvents.userId, users.firstName, users.lastName, users.email)
      .orderBy(desc(sql`SUM(${usageEvents.creditsDeducted})`))
      .limit(10);

    return res.json({
      modelBreakdown,
      topConversations,
      topUsers,
    });
  } catch (error) {
    console.error("[Credits Breakdown] Error:", error);
    return res.status(500).json({ error: "Failed to fetch breakdown" });
  }
});

/**
 * GET /api/credits/history
 * 
 * Returns paginated transaction history with filters
 */
router.get("/history", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    // Note: Credits are tracked per tenant regardless of environment (sandbox/production)
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    // Build where conditions (no environment filter - all usage per tenant)
    const conditions = [
      eq(usageEvents.tenantId, tenantId),
    ];

    if (startDate) {
      conditions.push(gte(usageEvents.createdAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(usageEvents.createdAt, new Date(endDate)));
    }

    // Get usage events with user and conversation info
    const history = await db
      .select({
        id: usageEvents.id,
        resourceType: usageEvents.resourceType,
        resourceName: usageEvents.resourceName,
        unitType: usageEvents.unitType,
        quantity: usageEvents.quantity,
        internalCost: usageEvents.internalCost,
        creditsDeducted: usageEvents.creditsDeducted,
        userId: usageEvents.userId,
        userName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        userEmail: users.email,
        conversationId: usageEvents.conversationId,
        conversationTitle: conversations.title,
        orchestratorType: usageEvents.orchestratorType,
        createdAt: usageEvents.createdAt,
        metadata: usageEvents.metadata,
      })
      .from(usageEvents)
      .leftJoin(users, eq(usageEvents.userId, users.id))
      .leftJoin(
        conversations,
        eq(usageEvents.conversationId, conversations.id)
      )
      .where(and(...conditions))
      .orderBy(desc(usageEvents.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const [{ count }] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(usageEvents)
      .where(and(...conditions));

    return res.json({
      history,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: offset + limit < count,
      },
    });
  } catch (error) {
    console.error("[Credits History] Error:", error);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
