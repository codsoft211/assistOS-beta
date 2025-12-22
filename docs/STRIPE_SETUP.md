# Stripe Payment Integration Setup

## Environment Variables

Add these to your `.env` file:

```bash
# Stripe API Keys (get from https://dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_...  # Test secret key for backend (development)
# STRIPE_SECRET_KEY=sk_live_...  # Live secret key for backend (production)

STRIPE_PUBLISHABLE_KEY=pk_test_...  # Test publishable key for frontend (development)
# STRIPE_PUBLISHABLE_KEY=pk_live_...  # Live publishable key for frontend (production)

# Stripe Webhook Secret (get from https://dashboard.stripe.com/test/webhooks)
STRIPE_WEBHOOK_SECRET=whsec_...  # Webhook signing secret

# Frontend URL (for redirect URLs)
FRONTEND_URL=http://localhost:5000  # Development
# FRONTEND_URL=https://yourdomain.com  # Production
```

## Stripe Test Cards

Use these test cards in Stripe Checkout:

### Success Cards
- **Visa**: `4242 4242 4242 4242`
- **Mastercard**: `5555 5555 5555 4444`
- **Amex**: `3782 822463 10005`

### Decline Cards
- **Decline**: `4000 0000 0000 0002`
- **Insufficient Funds**: `4000 0000 0000 9995`

**Expiry**: Any future date (e.g., `12/34`)  
**CVC**: Any 3 digits (e.g., `123`)  
**ZIP**: Any 5 digits (e.g., `12345`)

## Webhook Setup

### For Local Development (Stripe CLI)

1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
2. Login: `stripe login`
3. Forward webhooks:
   ```bash
   stripe listen --forward-to localhost:5000/api/stripe/webhook
   ```
4. Copy the webhook signing secret (shown when you run `stripe listen`)
5. Add to `.env`: `STRIPE_WEBHOOK_SECRET=whsec_...`

### For Production

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click "Add endpoint"
3. Set endpoint URL: `https://yourdomain.com/api/billing/stripe/webhook` (or `/api/stripe/webhook`)
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the "Signing secret" and add to `STRIPE_WEBHOOK_SECRET`

## Testing Flow

1. **Upgrade Subscription**:
   - User clicks "Upgrade" on `/billing/plans`
   - API creates Stripe Checkout session
   - Frontend redirects to Stripe Checkout
   - User enters test card details
   - Stripe processes payment
   - Webhook updates subscription in database
   - User redirected back to `/billing?session_id=...`

2. **Webhook Processing**:
   - Stripe sends webhook to `/api/billing/stripe/webhook`
   - Webhook verifies signature
   - Updates `tenant_subscriptions` table
   - Adds credits based on plan
   - Marks users as paying

## API Endpoints

### Create Checkout Session
```
POST /api/billing/subscription/upgrade
Body: { planId: 2 }
Response: { checkoutUrl: "https://checkout.stripe.com/...", sessionId: "cs_..." }
```

### Webhook (Stripe → Your Server)
```
POST /api/billing/stripe/webhook
Headers: { "stripe-signature": "..." }
Body: (raw Stripe event JSON)
```

## Database Schema

The `tenant_subscriptions` table stores:
- `payment_method`: `'stripe'` for Stripe payments
- `payment_reference`: Stripe subscription ID (`sub_...`)
- `metadata`: JSON with `stripeCustomerId`, `stripeSubscriptionId`, etc.

## Troubleshooting

### Webhook not receiving events
- Check webhook URL is correct in Stripe Dashboard
- Verify `STRIPE_WEBHOOK_SECRET` matches the signing secret
- Check server logs for signature verification errors

### Checkout session not created
- Verify `STRIPE_SECRET_KEY` is set
- Check plan has `priceMonthlyEuros` set (not NULL)
- Verify `FRONTEND_URL` is correct

### Subscription not updating after payment
- Check webhook is receiving events (Stripe Dashboard → Webhooks → Events)
- Verify webhook handler is processing events (check server logs)
- Ensure database connection is working

