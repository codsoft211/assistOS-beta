import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[Stripe Service] STRIPE_SECRET_KEY not set - Stripe features will be disabled');
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-11-17.clover',
      typescript: true,
    })
  : null;

export interface CreateCheckoutSessionParams {
  tenantId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  planId: number;
  planName: string;
  priceEuros: number;
  billingInterval: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
  isUpgrade?: boolean;
  existingSubscriptionId?: string; // For upgrades
  upgradeMetadata?: Record<string, string>; // Proration details for upgrades
}

export interface CreateCreditPackageCheckoutSessionParams {
  tenantId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  packageId: string;
  packageName: string;
  creditsAmount: number;
  priceEuros: number;
  purchaseId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
  metadata?: Record<string, string>;
}

/**
 * Stripe Service for subscription management
 */
export class StripeService {
  isConfigured(): boolean {
    return !!stripe;
  }

  /**
   * Create or get Stripe customer for a tenant
   */
  async getOrCreateCustomer(
    tenantId: string,
    email: string,
    name?: string
  ): Promise<Stripe.Customer> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    // Check if customer already exists (search by metadata)
    const existingCustomers = await stripe.customers.search({
      query: `metadata['tenantId']:'${tenantId}'`,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        tenantId,
      },
    });

    return customer;
  }

  private async getOrCreateSeatPrice(params: {
    planId: number;
    planName: string;
    amount: number;
    currency: string;
  }): Promise<Stripe.Price> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const { planId, planName, amount, currency } = params;

    const existingPrices = await stripe.prices.search({
      query: `metadata['planId']:'${planId}' AND metadata['priceType']:'seat' AND active:'true'`,
      limit: 1,
    });

    if (existingPrices.data.length > 0) {
      const price = existingPrices.data[0];
      if (
        price.unit_amount === amount &&
        price.currency === currency &&
        price.recurring?.interval === 'month'
      ) {
        return price;
      }
    }

    return await stripe.prices.create({
      unit_amount: amount,
      currency,
      recurring: {
        interval: 'month',
      },
      product_data: {
        name: `${planName} Additional Seat`,
        metadata: {
          planId: planId.toString(),
          priceType: 'seat',
        },
      },
      metadata: {
        planId: planId.toString(),
        planName,
        priceType: 'seat',
      },
    });
  }

  async syncSeatSubscriptionItem(params: {
    subscriptionId: string;
    planId: number;
    planName: string;
    seatPriceEuros: number;
    quantity: number;
  }): Promise<void> {
    if (!stripe) {
      return;
    }

    const { subscriptionId, planId, planName, seatPriceEuros, quantity } = params;
    const amount = Math.round(seatPriceEuros * 100);

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });

    const seatItem = subscription.items.data.find(
      (item) =>
        item.price?.metadata?.priceType === 'seat' &&
        item.price?.metadata?.planId === planId.toString(),
    );

    const updateItems: Stripe.SubscriptionUpdateParams.Item[] = [];

    if (seatItem) {
      if (quantity <= 0) {
        updateItems.push({
          id: seatItem.id,
          deleted: true,
        });
      } else {
        updateItems.push({
          id: seatItem.id,
          quantity,
        });
      }
    } else if (quantity > 0) {
      const seatPrice = await this.getOrCreateSeatPrice({
        planId,
        planName,
        amount,
        currency: subscription.currency || 'eur',
      });

      updateItems.push({
        price: seatPrice.id,
        quantity,
      });
    }

    if (updateItems.length === 0) {
      return;
    }

    await stripe.subscriptions.update(subscriptionId, {
      items: updateItems,
      proration_behavior: 'none',
    });
  }

  /**
   * Create Stripe Checkout Session for subscription
   */
  async createCheckoutSession(
    params: CreateCheckoutSessionParams
  ): Promise<Stripe.Checkout.Session> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const {
      tenantId,
      userId,
      userEmail,
      userName,
      planId,
      planName,
      priceEuros,
      billingInterval,
      successUrl,
      cancelUrl,
      isUpgrade = false,
      existingSubscriptionId,
      upgradeMetadata,
    } = params;

    // Get or create customer with actual user email
    const customer = await this.getOrCreateCustomer(
      tenantId,
      userEmail || `tenant-${tenantId}@placeholder.com`,
      userName || `Tenant ${tenantId}`
    );

    // Create Stripe Price if it doesn't exist
    // In production, you'd want to create prices in Stripe Dashboard and store price IDs
    // For now, we'll create them on-the-fly
    const price = await this.getOrCreatePrice({
      planId,
      planName,
      amount: Math.round(priceEuros * 100), // Convert to cents
      currency: 'eur',
      interval: billingInterval === 'monthly' ? 'month' : 'year',
    });

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customer.id,
      mode: isUpgrade && existingSubscriptionId ? 'subscription' : 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tenantId,
        userId,
        planId: planId.toString(),
        planName,
        isUpgrade: isUpgrade.toString(),
        existingSubscriptionId: existingSubscriptionId || '',
        ...(upgradeMetadata || {}),
      },
      subscription_data: {
        metadata: {
          tenantId,
          planId: planId.toString(),
          planName,
          ...(upgradeMetadata || {}),
        },
      },
    };

    // If upgrading, set up proration
    if (isUpgrade && existingSubscriptionId) {
      sessionParams.subscription_data = {
        ...sessionParams.subscription_data,
        // Proration is handled automatically by Stripe when switching plans
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return session;
  }

  /**
   * Create Stripe Checkout Session for one-time credit package purchase
   */
  async createCreditPackageCheckoutSession(
    params: CreateCreditPackageCheckoutSessionParams
  ): Promise<Stripe.Checkout.Session> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const {
      tenantId,
      userId,
      userEmail,
      userName,
      packageId,
      packageName,
      creditsAmount,
      priceEuros,
      purchaseId,
      successUrl,
      cancelUrl,
    } = params;

    const customer = await this.getOrCreateCustomer(
      tenantId,
      userEmail || `tenant-${tenantId}@placeholder.com`,
      userName || `Tenant ${tenantId}`
    );

    const price = await this.getOrCreateCreditPackagePrice({
      packageId,
      packageName,
      amount: Math.round(priceEuros * 100),
      currency: 'eur',
    });

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tenantId,
        userId,
        packageId,
        packageName,
        creditsAmount: creditsAmount.toString(),
        purchaseId,
        kind: 'credit_package',
      },
    });

    return session;
  }

  /**
   * Get or create Stripe Price for a plan
   * In production, create prices in Stripe Dashboard and store in database
   */
  async getOrCreatePrice(params: {
    planId: number;
    planName: string;
    amount: number;
    currency: string;
    interval: 'month' | 'year';
  }): Promise<Stripe.Price> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const { planId, planName, amount, currency, interval } = params;

    // Search for existing price by metadata
    const existingPrices = await stripe.prices.search({
      query: `metadata['planId']:'${planId}' AND active:'true'`,
      limit: 1,
    });

    if (existingPrices.data.length > 0) {
      const price = existingPrices.data[0];
      // Verify it matches our requirements
      if (
        price.unit_amount === amount &&
        price.currency === currency &&
        price.recurring?.interval === interval
      ) {
        return price;
      }
    }

    // Create new price
    const price = await stripe.prices.create({
      unit_amount: amount,
      currency,
      recurring: {
        interval,
      },
      product_data: {
        name: `${planName} Plan`,
        metadata: {
          planId: planId.toString(),
        },
      },
      metadata: {
        planId: planId.toString(),
        planName,
      },
    });

    return price;
  }

  private async getOrCreateCreditPackagePrice(params: {
    packageId: string;
    packageName: string;
    amount: number;
    currency: string;
  }): Promise<Stripe.Price> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const { packageId, packageName, amount, currency } = params;

    const existingPrices = await stripe.prices.search({
      query: `metadata['creditPackageId']:'${packageId}' AND active:'true'`,
      limit: 1,
    });

    if (existingPrices.data.length > 0) {
      const price = existingPrices.data[0];
      if (
        price.unit_amount === amount &&
        price.currency === currency &&
        !price.recurring
      ) {
        return price;
      }
    }

    const price = await stripe.prices.create({
      unit_amount: amount,
      currency,
      product_data: {
        name: `${packageName}`,
        metadata: {
          creditPackageId: packageId,
        },
      },
      metadata: {
        creditPackageId: packageId,
        packageName,
      },
    });

    return price;
  }

  /**
   * Retrieve a subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    return await stripe.subscriptions.retrieve(subscriptionId);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelImmediately: boolean = false
  ): Promise<Stripe.Subscription> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    if (cancelImmediately) {
      return await stripe.subscriptions.cancel(subscriptionId);
    } else {
      // Cancel at period end (for downgrades)
      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }

  /**
   * Update subscription to a new plan
   * @param prorateAtPeriodEnd - If true, the change takes effect at period end without proration. If false, prorates immediately.
   */
  async updateSubscriptionPlan(
    subscriptionId: string,
    newPriceId: string,
    prorateAtPeriodEnd: boolean = false
  ): Promise<Stripe.Subscription> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const updateParams: Stripe.SubscriptionUpdateParams = {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
    };

    if (prorateAtPeriodEnd) {
      // For downgrades: change at period end, no proration
      updateParams.proration_behavior = 'none';
      updateParams.billing_cycle_anchor = 'unchanged'; // Keep current billing cycle
    } else {
      // For immediate changes: prorate immediately
      updateParams.proration_behavior = 'always_invoice';
    }

    return await stripe.subscriptions.update(subscriptionId, updateParams);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): Stripe.Event {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    return stripe.webhooks.constructEvent(payload, signature, secret);
  }

  /**
   * Create a payment intent (for invite billing)
   */
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata?: Record<string, string>;
    captureMethod?: 'automatic' | 'manual';
  }): Promise<Stripe.PaymentIntent> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const { amount, currency, metadata, captureMethod = 'manual' } = params;

    return await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
      capture_method: captureMethod,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });
  }

  /**
   * Create and immediately capture an off-session payment intent (used when tenant owner pays for seats)
   */
  async createAndCaptureSeatPayment(params: {
    customerId: string;
    amountInMinorUnits: number;
    currency: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const { customerId, amountInMinorUnits, currency, metadata } = params;

    // Get customer's payment methods
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      throw new Error('Customer not found');
    }

    // Try to get default payment method from invoice settings
    const defaultPaymentMethodId = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
    
    let paymentMethodId: string | undefined;
    
    if (defaultPaymentMethodId) {
      paymentMethodId = typeof defaultPaymentMethodId === 'string' 
        ? defaultPaymentMethodId 
        : defaultPaymentMethodId.id;
    } else {
      // Fallback: get the first available payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1,
      });

      if (paymentMethods.data.length === 0) {
        throw new Error('No payment method on file. Please add a payment method in Billing → Subscription.');
      }

      paymentMethodId = paymentMethods.data[0].id;
    }

    // Create and confirm payment intent with the payment method
    return await stripe.paymentIntents.create({
      amount: amountInMinorUnits,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      metadata,
    });
  }

  /**
   * Capture a payment intent (when invite is accepted)
   */
  async capturePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    return await stripe.paymentIntents.capture(paymentIntentId);
  }

  /**
   * Cancel or refund a payment intent (when invite is declined/expired)
   */
  async cancelOrRefundPaymentIntent(
    paymentIntentId: string
  ): Promise<Stripe.PaymentIntent | Stripe.Refund> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    // Get the payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // If not captured yet, just cancel it
    if (paymentIntent.status === 'requires_capture') {
      return await stripe.paymentIntents.cancel(paymentIntentId);
    }

    // If already captured, create a refund
    if (paymentIntent.status === 'succeeded') {
      return await stripe.refunds.create({
        payment_intent: paymentIntent.id,
        reason: 'requested_by_customer',
      });
    }

    // For other statuses, just return the payment intent
    return paymentIntent;
  }

  /**
   * Confirm a payment intent with payment method
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<Stripe.PaymentIntent> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    return await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  }

  /**
   * Get customer's payment methods
   */
  async getCustomerPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    return paymentMethods.data;
  }

  /**
   * Get customer's default payment method
   */
  async getCustomerDefaultPaymentMethod(customerId: string): Promise<Stripe.PaymentMethod | null> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return null;
    }

    const defaultPaymentMethodId = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
    
    if (!defaultPaymentMethodId) {
      return null;
    }

    const paymentMethodId = typeof defaultPaymentMethodId === 'string' 
      ? defaultPaymentMethodId 
      : defaultPaymentMethodId.id;

    try {
      return await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (error) {
      console.error('[Stripe] Error retrieving default payment method:', error);
      return null;
    }
  }

  /**
   * Create a Setup Intent for adding a new payment method
   */
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    return await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
  }

  /**
   * Attach a payment method to a customer and optionally set as default
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string,
    setAsDefault: boolean = false
  ): Promise<Stripe.PaymentMethod> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    if (setAsDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    return paymentMethod;
  }
}

export const stripeService = new StripeService();

