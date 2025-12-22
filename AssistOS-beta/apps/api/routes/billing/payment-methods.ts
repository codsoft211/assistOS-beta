/**
 * Payment Methods API Routes
 * Handles saved payment methods and adding new cards
 */

import { Router, Request, Response } from "express";
import { db } from "../../db";
import { tenantSubscriptions } from "../../../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { stripeService } from "../../../../packages/services/stripe";

const router = Router();

/**
 * GET /api/billing/payment-methods
 * Get customer's saved payment methods
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId;
    const userId = req.session.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get subscription to find Stripe customer ID
    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ),
    });

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    const metadata = (subscription.metadata || {}) as Record<string, any>;
    const stripeCustomerId = metadata?.stripeCustomerId;

    if (!stripeCustomerId) {
      return res.json({ paymentMethods: [], defaultPaymentMethod: null });
    }

    // Get all payment methods with error handling for invalid customer
    let paymentMethods = [];
    let defaultPaymentMethod = null;
    
    try {
      paymentMethods = await stripeService.getCustomerPaymentMethods(stripeCustomerId);
      defaultPaymentMethod = await stripeService.getCustomerDefaultPaymentMethod(stripeCustomerId);
    } catch (stripeError: any) {
      // If customer doesn't exist in Stripe, clear the invalid customer ID and return empty
      if (stripeError.code === 'resource_missing' || stripeError.type === 'StripeInvalidRequestError') {
        console.warn(`[Payment Methods API] Stripe customer ${stripeCustomerId} not found. Clearing invalid customer ID.`);
        
        // Clear the invalid customer ID from subscription metadata
        await db
          .update(tenantSubscriptions)
          .set({
            metadata: sql`jsonb_set(COALESCE(${tenantSubscriptions.metadata}, '{}'::jsonb), '{stripeCustomerId}', 'null'::jsonb)`,
            updatedAt: new Date(),
          })
          .where(eq(tenantSubscriptions.id, subscription.id));
        
        return res.json({ paymentMethods: [], defaultPaymentMethod: null });
      }
      
      // Re-throw other errors
      throw stripeError;
    }

    // Format payment methods for frontend
    const formattedMethods = paymentMethods.map((pm) => {
      const card = pm.card;
      return {
        id: pm.id,
        type: pm.type,
        card: card ? {
          brand: card.brand,
          last4: card.last4,
          expMonth: card.exp_month,
          expYear: card.exp_year,
        } : null,
        isDefault: pm.id === (defaultPaymentMethod?.id || null),
      };
    });

    res.json({
      paymentMethods: formattedMethods,
      defaultPaymentMethod: defaultPaymentMethod ? {
        id: defaultPaymentMethod.id,
        card: defaultPaymentMethod.card ? {
          brand: defaultPaymentMethod.card.brand,
          last4: defaultPaymentMethod.card.last4,
          expMonth: defaultPaymentMethod.card.exp_month,
          expYear: defaultPaymentMethod.card.exp_year,
        } : null,
      } : null,
    });
  } catch (error: any) {
    console.error("[Payment Methods API] Error:", error);
    res.status(500).json({ 
      error: "Failed to fetch payment methods",
      details: error.message 
    });
  }
});

/**
 * POST /api/billing/payment-methods/setup-intent
 * Create a Setup Intent for adding a new payment method
 */
router.post("/setup-intent", async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId;
    const userId = req.session.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get subscription to find Stripe customer ID
    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ),
    });

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    const metadata = (subscription.metadata || {}) as Record<string, any>;
    let stripeCustomerId = metadata?.stripeCustomerId;

    // If no customer ID or invalid, create a new Stripe customer
    if (!stripeCustomerId) {
      console.log("[Payment Methods API] No Stripe customer found, creating new customer");
      
      // Get tenant and user info for customer creation
      const { tenants, users } = await import("../../../../shared/schema");
      
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });
      
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      
      if (!tenant || !user) {
        return res.status(404).json({ error: "Tenant or user not found" });
      }
      
      // Create Stripe customer
      const customer = await stripeService.getOrCreateCustomer(
        tenantId,
        user.email,
        tenant.name
      );
      
      stripeCustomerId = customer.id;
      
      // Save customer ID to subscription
      await db
        .update(tenantSubscriptions)
        .set({
          metadata: sql`jsonb_set(COALESCE(${tenantSubscriptions.metadata}, '{}'::jsonb), '{stripeCustomerId}', ${JSON.stringify(stripeCustomerId)}::jsonb)`,
          updatedAt: new Date(),
        })
        .where(eq(tenantSubscriptions.id, subscription.id));
    }

    let setupIntent;
    try {
      setupIntent = await stripeService.createSetupIntent(stripeCustomerId);
    } catch (stripeError: any) {
      // If customer is invalid, create a new one and retry
      if (stripeError.code === 'resource_missing' || stripeError.type === 'StripeInvalidRequestError') {
        console.warn(`[Payment Methods API] Stripe customer ${stripeCustomerId} not found. Creating new customer.`);
        
        const { tenants, users } = await import("../../../../shared/schema");
        
        const tenant = await db.query.tenants.findFirst({
          where: eq(tenants.id, tenantId),
        });
        
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });
        
        if (!tenant || !user) {
          return res.status(404).json({ error: "Tenant or user not found" });
        }
        
        const customer = await stripeService.getOrCreateCustomer(
          tenantId,
          user.email,
          tenant.name
        );
        
        stripeCustomerId = customer.id;
        
        await db
          .update(tenantSubscriptions)
          .set({
            metadata: sql`jsonb_set(COALESCE(${tenantSubscriptions.metadata}, '{}'::jsonb), '{stripeCustomerId}', ${JSON.stringify(stripeCustomerId)}::jsonb)`,
            updatedAt: new Date(),
          })
          .where(eq(tenantSubscriptions.id, subscription.id));
        
        setupIntent = await stripeService.createSetupIntent(stripeCustomerId);
      } else {
        throw stripeError;
      }
    }

    res.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (error: any) {
    console.error("[Payment Methods API] Error creating setup intent:", error);
    res.status(500).json({ 
      error: "Failed to create setup intent",
      details: error.message 
    });
  }
});

/**
 * POST /api/billing/payment-methods/:id/set-default
 * Set a payment method as default
 */
router.post("/:id/set-default", async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId;
    const userId = req.session.userId;
    const { id: paymentMethodId } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get subscription to find Stripe customer ID
    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ),
    });

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    const metadata = (subscription.metadata || {}) as Record<string, any>;
    const stripeCustomerId = metadata?.stripeCustomerId;

    if (!stripeCustomerId) {
      return res.status(400).json({ error: "No Stripe customer found" });
    }

    // Update customer's default payment method
    const { stripe } = await import("../../../../packages/services/stripe");
    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured" });
    }

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Payment Methods API] Error setting default payment method:", error);
    res.status(500).json({ 
      error: "Failed to set default payment method",
      details: error.message 
    });
  }
});

export default router;

