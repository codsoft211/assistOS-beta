import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { 
  creditPackages,
  creditPackagePurchases,
  users,
} from "../../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { stripeService } from "../../../../packages/services/stripe";

const router = Router();

/**
 * GET /api/billing/packages
 * List all credit packages for the tenant
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    const packages = await db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.status, 'active'))
      .orderBy(desc(creditPackages.createdAt));

    return res.json({
      packages: packages.map(pkg => ({
        id: pkg.id,
        creditsAmount: pkg.creditsAmount,
        priceEuros: pkg.priceEuros,
        paymentMethod: pkg.paymentMethod,
        status: pkg.status,
        createdAt: pkg.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Credit Packages] Error:", error);
    return res.status(500).json({ error: "Failed to fetch credit packages" });
  }
});

/**
 * POST /api/billing/packages/:id/checkout
 * Create Stripe checkout session for a credit package
 */
router.post("/:id/checkout", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const userId = req.session?.userId || (req as any).userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Tenant context required" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        error: "Payment processing not configured",
        message: "Stripe integration is required to purchase credits.",
      });
    }

    const [creditPackage] = await db
      .select()
      .from(creditPackages)
      .where(
        and(
          eq(creditPackages.id, id),
          eq(creditPackages.status, 'active')
        )
      )
      .limit(1);

    if (!creditPackage) {
      return res.status(404).json({ error: "Credit package not found" });
    }

    const rawPrice =
      typeof creditPackage.priceEuros === "string"
        ? parseFloat(creditPackage.priceEuros)
        : Number(creditPackage.priceEuros);

    if (!rawPrice || Number.isNaN(rawPrice) || rawPrice <= 0) {
      return res.status(400).json({
        error: "Invalid package price",
        message: "This package cannot be purchased until a valid price is configured.",
      });
    }

    const [user] = await db
      .select({
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const customerEmail = user?.email || `tenant-${tenantId}@placeholder.com`;
    const customerName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "User";

    const [purchase] = await db
      .insert(creditPackagePurchases)
      .values({
        tenantId,
        packageId: creditPackage.id,
        creditsAmount: creditPackage.creditsAmount,
        priceEuros: creditPackage.priceEuros,
        status: 'pending',
        createdBy: userId,
        metadata: {
          initiatedFrom: 'web',
        },
      })
      .returning();

    const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
    const successUrl = `${baseUrl}/billing?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/billing`;

    try {
      const checkoutSession = await stripeService.createCreditPackageCheckoutSession({
        tenantId,
        userId,
        userEmail: customerEmail,
        userName: customerName,
        packageId: creditPackage.id,
        packageName: `${creditPackage.creditsAmount.toLocaleString("en-US")} Credits`,
        creditsAmount: creditPackage.creditsAmount,
        priceEuros: rawPrice,
        purchaseId: purchase.id,
        successUrl,
        cancelUrl,
      });

      await db
        .update(creditPackagePurchases)
        .set({
          stripeCheckoutSessionId: checkoutSession.id,
          updatedAt: new Date(),
        })
        .where(eq(creditPackagePurchases.id, purchase.id));

      return res.json({
        success: true,
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
        purchaseId: purchase.id,
      });
    } catch (stripeError: any) {
      console.error("[Credit Packages] Stripe checkout error:", stripeError);
      await db
        .update(creditPackagePurchases)
        .set({
          status: 'failed',
          metadata: {
            ...(purchase.metadata || {}),
            stripeError: stripeError.message,
          },
          updatedAt: new Date(),
        })
        .where(eq(creditPackagePurchases.id, purchase.id));

      return res.status(500).json({
        error: "Failed to start checkout",
        message: stripeError.message,
      });
    }
  } catch (error) {
    console.error("[Credit Packages] Checkout error:", error);
    return res.status(500).json({ error: "Failed to start credit purchase" });
  }
});

export default router;

