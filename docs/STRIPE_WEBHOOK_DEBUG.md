# Stripe Webhook Debugging Guide

## Issue: Payment succeeded but subscription not updated

### Step 1: Check if webhook is being called

1. **Check server logs** for webhook events:
   ```bash
   # Look for these log messages:
   [Stripe Webhook] POST /webhook received
   [Stripe Webhook] Event received: checkout.session.completed
   ```

2. **Test webhook endpoint**:
   ```bash
   curl http://localhost:5000/api/billing/stripe/webhook/test
   ```
   Should return: `{"message": "Stripe webhook route is accessible", ...}`

### Step 2: Check Stripe Dashboard

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click on your webhook endpoint
3. Check "Events" tab - you should see `checkout.session.completed` events
4. Click on an event to see:
   - **Status**: Should be "Succeeded" (green) or "Failed" (red)
   - **Response**: Check the response body
   - **Request**: Check if the webhook was sent

### Step 3: Check webhook configuration

1. **Webhook URL** must be:
   - Development: `http://localhost:5000/api/billing/stripe/webhook` (use Stripe CLI)
   - Production: `https://yourdomain.com/api/billing/stripe/webhook`

2. **Webhook Secret**:
   - Get from Stripe Dashboard → Webhooks → Your endpoint → "Signing secret"
   - Must match `STRIPE_WEBHOOK_SECRET` in your `.env`

3. **Events to listen for**:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `invoice.payment_succeeded`

### Step 4: Check server logs for errors

Look for these error messages:

```
[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured
[Stripe Webhook] No signature header
[Stripe Webhook] Signature verification failed
[Stripe Webhook] Missing tenantId or planId in session metadata
[Stripe Webhook] No subscription ID in checkout session
[Stripe Webhook] Plan not found
[Stripe Webhook] Error during subscription activation
```

### Step 5: Test webhook locally with Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5000/api/billing/stripe/webhook

# In another terminal, trigger a test event
stripe trigger checkout.session.completed
```

### Step 6: Check database

Query the database to see if subscription was updated:

```sql
SELECT * FROM tenant_subscriptions 
WHERE payment_method = 'stripe' 
ORDER BY updated_at DESC 
LIMIT 5;

SELECT * FROM tenant_credits 
ORDER BY updated_at DESC 
LIMIT 5;
```

### Common Issues

1. **Webhook not receiving events**:
   - Webhook URL not accessible from internet (use Stripe CLI for local dev)
   - Webhook secret mismatch
   - Webhook endpoint not registered before body parser

2. **Signature verification fails**:
   - `STRIPE_WEBHOOK_SECRET` doesn't match Stripe Dashboard
   - Raw body not being captured correctly

3. **Metadata missing**:
   - Check if `tenantId` and `planId` are in checkout session metadata
   - Check server logs for: `[Stripe Webhook] Session metadata: {...}`

4. **Subscription not found**:
   - Check if subscription exists in Stripe
   - Check if `session.subscription` is populated

## Quick Fix Checklist

- [ ] `STRIPE_WEBHOOK_SECRET` is set in `.env`
- [ ] Webhook URL is correct in Stripe Dashboard
- [ ] Webhook endpoint is accessible (test with `/webhook/test`)
- [ ] Events are being sent (check Stripe Dashboard)
- [ ] Server logs show webhook events being received
- [ ] No signature verification errors
- [ ] Metadata contains `tenantId` and `planId`
- [ ] Database subscription table is being updated

