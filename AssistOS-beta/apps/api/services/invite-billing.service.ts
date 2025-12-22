/**
 * Invite Billing Service
 * 
 * Handles seat allocation, payment processing, and refunds for team invitations.
 * 
 * Business Rules:
 * - Base Plan: 1 paying user, 0 free users. Each additional user requires payment.
 * - Pro Plan: 1 paying user, 1 free user. Buying additional seats allocates per plan structure (1 paying + 1 free).
 * - Ultra Plan: 1 paying user, 3 free users. Buying additional seats allocates per plan structure (1 paying + 3 free).
 * 
 * Seat Purchase Model:
 * - When you pay the plan price for an additional seat, you get the plan's full allocation
 * - Pro: Pay €X → Get 1 paying + 1 free seat
 * - Ultra: Pay €Y → Get 1 paying + 3 free seats
 * - This means total capacity grows by the plan's structure, not just 1 seat
 * 
 * Billing Model (Replit-style):
 * - Seats represent CAPACITY, not occupancy
 * - When you buy a seat (invite), you pay immediately and get credits
 * - Current billing period: You're billed for ALL allocated seats (base + purchased), regardless of acceptance
 * - Seat removal: Only affects NEXT billing cycle (no refunds for current period)
 * - Renewal: Stripe invoices for base_plan + (allocated_seats * price_per_seat)
 * 
 * Flow:
 * 1. Invite Creation: Check free seats → if available, reserve free seat; otherwise, charge tenant owner off-session and reserve paid seat + free seats per plan
 * 2. Invite Acceptance: Finalize seat (payment already captured for paid seats), grant credits
 * 3. Invite Decline/Expiry: Refund payment (if paid), release provisional seat + associated free seats
 * 4. Seat Removal: Decrement allocation, sync with Stripe for next billing cycle
 */

import { db } from '../db';
import { 
  tenantSubscriptions, 
  subscriptionPlans, 
  tenantInvitations,
  inviteBillingEvents,
  tenantCredits,
  creditTransactions,
  userTenants,
} from '../../../shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { stripeService } from '../../../packages/services/stripe';
import { seatTrackingService } from '../../../packages/services/seat-tracking';
import { stripeSeatSyncService } from './stripe-seat-sync.service';
import { tenantSchemaService } from './tenant-schema.service';
export interface InviteAllocationResult {
  requiresPayment: boolean;
  seatType: 'free' | 'paid' | 'pending-paid';
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentIntentId?: string;
  paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'none';
  paymentCapturedAt?: Date;
  subscriptionPlanId: number;
  planName: string;
  creditsGranted?: number;
}

export interface SeatAvailability {
  freeSeatsAvailable: number;
  payingSeatsAllocated: number;
  payingSeatsProvisional: number;
  totalPayingSeats: number;
  payingSeatsAvailable: number;
  planFreeSeats: number;
  planPayingSeats: number;
  canInviteFree: boolean;
  canUsePaidSeat: boolean;
  pendingFreeInvitesCount: number;
  pendingPaidInvitesCount: number;
}

export class InviteBillingService {
  private ensureStripeCustomerId(subscription: typeof tenantSubscriptions.$inferSelect): string {
    const metadata = (subscription.metadata || {}) as Record<string, any>;
    const stripeCustomerId = metadata?.stripeCustomerId;

    if (!stripeCustomerId) {
      throw new Error('No payment method on file. Please add a payment method in Billing → Subscription.');
    }

    return stripeCustomerId;
  }

  private async chargeSeatPayment(params: {
    tenantId: string;
    invitedBy: string;
    inviteEmail: string;
    plan: typeof subscriptionPlans.$inferSelect;
    subscription: typeof tenantSubscriptions.$inferSelect;
    paymentAmount: number;
  }) {
    const { tenantId, invitedBy, inviteEmail, plan, subscription, paymentAmount } = params;
    const stripeCustomerId = this.ensureStripeCustomerId(subscription);

    let paymentIntent;
    try {
      paymentIntent = await stripeService.createAndCaptureSeatPayment({
        customerId: stripeCustomerId,
        amountInMinorUnits: Math.round(paymentAmount * 100),
        currency: 'eur',
        metadata: {
          tenantId,
          invitedBy,
          inviteEmail,
          planId: plan.id.toString(),
          planName: plan.name,
          type: 'seat_payment',
        },
      });
    } catch (error: any) {
      if (error?.code === 'authentication_required' || error?.code === 'card_declined') {
        throw new Error('Seat payment failed. Please update your saved payment method in Billing → Subscription and try again.');
      }
      console.error('[InviteBilling] Failed to charge seat payment:', error);
      throw new Error(error?.message || 'Failed to charge payment for the new seat.');
    }

    if (paymentIntent.status !== 'succeeded') {
      throw new Error('Payment for additional seat did not succeed. Please try again or update your payment method.');
    }

    return {
      paymentIntentId: paymentIntent.id,
      paymentCapturedAt: new Date(paymentIntent.created * 1000),
      paymentStatus: 'succeeded' as const,
    };
  }

  /**
   * Check seat availability for a tenant
   */
  async checkSeatAvailability(tenantId: string): Promise<SeatAvailability> {
    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ),
    });

    if (!subscription) {
      throw new Error('No active subscription found for tenant');
    }

    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, subscription.subscriptionPlanId),
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    // Get actual current seat usage from userTenants table
    const seatCount = await seatTrackingService.getCurrentSeatCount(tenantId);
    
    // Get pending invitations by seat type
    const pendingFreeInvites = await db.query.tenantInvitations.findMany({
      where: and(
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, 'pending'),
        eq(tenantInvitations.seatType, 'free')
      ),
    });

    const pendingPaidInvites = await db.query.tenantInvitations.findMany({
      where: and(
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, 'pending'),
        sql`${tenantInvitations.seatType} IN ('paid', 'pending-paid')`
      ),
    });

    const payingSeatsAllocated = subscription.payingSeatsAllocated || 0;
    const payingSeatsProvisional = subscription.payingSeatsProvisional || 0;
    const freeSeatsAllocated = subscription.freeSeatsAllocated || 0;
    const planFreeSeats = plan.freeUsersIncluded || 0;
    const planPayingSeats = plan.payingUsersIncluded || 0;

    // Calculate free seats: active free users + pending free invites
    // Total free capacity = plan base + additional purchased free seats
    const totalFreeCapacity = planFreeSeats + freeSeatsAllocated;
    const freeSeatsInUse = seatCount.freeSeats + pendingFreeInvites.length;
    const freeSeatsAvailable = Math.max(0, totalFreeCapacity - freeSeatsInUse);

    // Paying seats availability: total capacity - (active paying users + pending paid invites)
    // ✅ Verified: pendingPaidInvites.length already accounts for all pending paid invites
    // payingSeatsProvisional should match pendingPaidInvites.length (they track the same thing)
    const totalPayingSeats = planPayingSeats + payingSeatsAllocated;
    const payingSeatsInUse = seatCount.payingSeats + pendingPaidInvites.length;
    const payingSeatsAvailable = Math.max(0, totalPayingSeats - payingSeatsInUse);

    const canInviteFree = freeSeatsAvailable > 0;
    const canUsePaidSeat = payingSeatsAvailable > 0;

    return {
      freeSeatsAvailable,
      payingSeatsAllocated,
      payingSeatsProvisional,
      totalPayingSeats,
      payingSeatsAvailable,
      planFreeSeats,
      planPayingSeats,
      canInviteFree,
      canUsePaidSeat,
      pendingFreeInvitesCount: pendingFreeInvites.length,
      pendingPaidInvitesCount: pendingPaidInvites.length,
    };
  }

  /**
   * Allocate a seat for a new invitation
   * Returns payment details if payment is required
   */
  async allocateSeatForInvite(
    tenantId: string,
    invitedBy: string,
    inviteEmail: string
  ): Promise<InviteAllocationResult> {
    // Get subscription and plan details
    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ),
    });

    if (!subscription) {
      throw new Error('No active subscription found for tenant');
    }

    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, subscription.subscriptionPlanId),
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    // Check seat availability
    const availability = await this.checkSeatAvailability(tenantId);

    // PRIORITY 1: Use already-purchased paying seats first (no charge needed)
    if (availability.canUsePaidSeat) {
      await db
        .update(tenantSubscriptions)
        .set({
          payingSeatsProvisional: sql`${tenantSubscriptions.payingSeatsProvisional} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tenantSubscriptions.id, subscription.id));

      return {
        requiresPayment: false,
        seatType: 'paid',
        subscriptionPlanId: plan.id,
        planName: plan.name,
      };
    }

    // PRIORITY 2: Use free seats if available
    if (availability.canInviteFree) {
      // Free seat from plan - no need to increment freeSeatsAllocated
      // (freeSeatsAllocated only tracks ADDITIONAL purchased free seats)
      return {
        requiresPayment: false,
        seatType: 'free',
        subscriptionPlanId: plan.id,
        planName: plan.name,
      };
    }

    // PRIORITY 3: No capacity available - check if we should charge or block
    // Throw error with details about pending invites so frontend can show helpful message

    // No free seats available - requires payment (owner pays immediately)
    const paymentAmount = parseFloat(plan.pricePerPayingSeatEuros?.toString() || plan.priceMonthlyEuros?.toString() || '0');
    
    if (paymentAmount <= 0) {
      throw new Error('Plan does not have valid pricing for additional seats');
    }

    const paymentResult = await this.chargeSeatPayment({
      tenantId,
      invitedBy,
      inviteEmail,
      plan,
      subscription,
      paymentAmount,
    });

    // Grant credits immediately (Replit-style: credits granted when seat is purchased, not when accepted)
    const creditsToGrant = plan.creditsPerPayingUser || plan.creditsIncluded || 0;
    
    if (creditsToGrant > 0) {
      // Get existing credits
      const existingCredits = await db.query.tenantCredits.findFirst({
        where: eq(tenantCredits.tenantId, tenantId),
      });

      const balanceBefore = existingCredits 
        ? (existingCredits.monthlyCredits + existingCredits.packageCredits)
        : 0;

      if (existingCredits) {
        await db
          .update(tenantCredits)
          .set({
            monthlyCredits: sql`${tenantCredits.monthlyCredits} + ${creditsToGrant}`,
            lifetimePurchases: sql`${tenantCredits.lifetimePurchases} + ${creditsToGrant}`,
            lastPurchaseAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tenantCredits.id, existingCredits.id));
      } else {
        await db.insert(tenantCredits).values({
          tenantId,
          monthlyCredits: creditsToGrant,
          packageCredits: 0,
          reserved: 0,
          lifetimeUsage: 0,
          lifetimePurchases: creditsToGrant,
          lastPurchaseAt: new Date(),
        });
      }

      // Log credit transaction
      await db.insert(creditTransactions).values({
        tenantId,
        environment: 'production',
        type: 'purchase',
        amount: creditsToGrant,
        balanceBefore,
        balanceAfter: balanceBefore + creditsToGrant,
        currency: 'EUR',
        description: `Credits granted for paid seat purchase (invite to ${inviteEmail})`,
        paymentMethod: 'stripe',
        paymentReference: paymentResult.paymentIntentId,
        metadata: {
          inviteEmail,
          invitedBy,
          planId: plan.id,
          planName: plan.name,
          seatPurchase: true,
          creditType: 'monthly', // Seat purchase credits are monthly (expiring)
        },
      });
    }

    // Reserve provisional paying seat (awaiting invite acceptance) and record purchased capacity
    // When buying at plan price, allocate seats per plan structure (e.g., Pro = 1 paying + 1 free)
    const freeSeatsPerPlan = plan.freeUsersIncluded || 0;
    
    await db
      .update(tenantSubscriptions)
      .set({
        payingSeatsAllocated: sql`${tenantSubscriptions.payingSeatsAllocated} + 1`,
        payingSeatsProvisional: sql`${tenantSubscriptions.payingSeatsProvisional} + 1`,
        freeSeatsAllocated: sql`${tenantSubscriptions.freeSeatsAllocated} + ${freeSeatsPerPlan}`,
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.id, subscription.id));

    await stripeSeatSyncService.syncTenantSeats(tenantId).catch((error) => {
      console.error("[InviteBilling] Failed to sync Stripe seat quantity:", error);
    });

    return {
      requiresPayment: true,
      seatType: 'pending-paid',
      paymentAmount,
      paymentCurrency: 'EUR',
      paymentIntentId: paymentResult.paymentIntentId,
      paymentStatus: paymentResult.paymentStatus,
      paymentCapturedAt: paymentResult.paymentCapturedAt,
      subscriptionPlanId: plan.id,
      planName: plan.name,
      creditsGranted: creditsToGrant,
    };
  }

  /**
   * Process invite acceptance - capture payment and finalize seat allocation
   */
  async processInviteAcceptance(invitationId: string, userId: string): Promise<void> {
    // Get invitation details
    const invitation = await db.query.tenantInvitations.findFirst({
      where: eq(tenantInvitations.id, invitationId),
    });

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is not pending');
    }

    const tenantId = invitation.tenantId;

    // Get subscription
    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ),
    });

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // Get plan
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, subscription.subscriptionPlanId),
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    // Start transaction
    await db.transaction(async (tx) => {
      const usesPayingSeat = invitation.requiresPayment || invitation.seatType === 'paid';

      if (invitation.requiresPayment && invitation.paymentStatus !== 'succeeded') {
        throw new Error('Seat payment is still pending. Please ask the tenant owner to complete the payment.');
      }

      if (usesPayingSeat && subscription.payingSeatsProvisional > 0) {
        await tx
          .update(tenantSubscriptions)
          .set({
            payingSeatsProvisional: sql`GREATEST(0, ${tenantSubscriptions.payingSeatsProvisional} - 1)`,
            updatedAt: new Date(),
          })
          .where(eq(tenantSubscriptions.id, subscription.id));
      }

      await tx
        .update(tenantInvitations)
        .set({
          acceptedAt: new Date(),
          status: 'accepted',
        })
        .where(eq(tenantInvitations.id, invitationId));

      // Credits were already granted at purchase time (Replit-style)
      // Mark user as paying if this seat consumes paying capacity
      // ✅ UPDATED: Uses tenant-scoped schema update
      if (usesPayingSeat) {
        const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
        if (!schemaName) {
          throw new Error(`No schema found for tenant ${tenantId}`);
        }
        
        // Update in tenant-scoped schema using raw SQL within transaction
        // Update ALL environments where user exists (subscriptions are tenant-wide)
        const updateResult = await tx.execute(sql`
          UPDATE ${sql.identifier(schemaName)}.${sql.identifier('user_tenants')}
          SET is_paying = true
          WHERE user_id = ${userId}
            AND tenant_id = ${tenantId}
          RETURNING environment
        `);
        
        if (updateResult.rows.length === 0) {
          console.warn(`[InviteBilling] User ${userId} not found in tenant-scoped schema for tenant ${tenantId}. User may need to be added first.`);
          // Don't throw error - user might be added in a different transaction
          // The seat tracking will handle this when counting seats
        } else {
          console.log(`[InviteBilling] Marked user ${userId} as paying in ${updateResult.rows.length} environment(s) for tenant ${tenantId}`);
        }
      }

      const inviteAcceptedEvent = usesPayingSeat
        ? {
            eventType: 'invite_accepted',
            eventData: { seatType: 'paid' },
          }
        : {
            eventType: 'invite_accepted',
            eventData: { seatType: 'free' },
          };

      await tx.insert(inviteBillingEvents).values({
        tenantId,
        invitationId,
        ...inviteAcceptedEvent,
        actorUserId: userId,
      });

      // Log seat allocation event
      await tx.insert(inviteBillingEvents).values({
        tenantId,
        invitationId,
        eventType: 'seat_allocated',
        eventData: {
          userId,
          seatType: invitation.seatType,
          isPaying: usesPayingSeat,
        },
        actorUserId: userId,
      });
    });
  }

  /**
   * Process invite decline or expiry - refund payment and release seat
   */
  async processInviteDeclineOrExpiry(
    invitationId: string,
    reason: 'declined' | 'expired',
    actorUserId?: string
  ): Promise<void> {
    // Get invitation details
    const invitation = await db.query.tenantInvitations.findFirst({
      where: eq(tenantInvitations.id, invitationId),
    });

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    const tenantId = invitation.tenantId;

    // Get subscription
    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ),
    });

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // Start transaction
    await db.transaction(async (tx) => {
      // Update invitation status
      const updateData: any = {
        status: reason === 'declined' ? 'declined' : 'expired',
      };

      if (reason === 'declined') {
        updateData.declinedAt = new Date();
      } else {
        updateData.expiredAt = new Date();
      }

      await tx
        .update(tenantInvitations)
        .set(updateData)
        .where(eq(tenantInvitations.id, invitationId));

      // If payment was made or pending, initiate refund
      if (invitation.requiresPayment && invitation.paymentIntentId) {
        try {
          // Cancel or refund the payment intent
          const refund = await stripeService.cancelOrRefundPaymentIntent(
            invitation.paymentIntentId
          );

          // Update invitation with refund info
          await tx
            .update(tenantInvitations)
            .set({
              refundId: refund.id,
              refundStatus: 'succeeded',
              refundInitiatedAt: new Date(),
              refundCompletedAt: new Date(),
            })
            .where(eq(tenantInvitations.id, invitationId));

          // Log billing event
          await tx.insert(inviteBillingEvents).values({
            tenantId,
            invitationId,
            eventType: 'refund_succeeded',
            eventData: {
              refundId: refund.id,
              amount: invitation.paymentAmount,
              currency: invitation.paymentCurrency,
              reason,
            },
            actorUserId,
          });

          // Release provisional seat and purchased capacity
          // Also release free seats that came with the plan purchase
          const plan = await tx.query.subscriptionPlans.findFirst({
            where: eq(subscriptionPlans.id, subscription.subscriptionPlanId),
          });
          const freeSeatsPerPlan = plan?.freeUsersIncluded || 0;
          
          await tx
            .update(tenantSubscriptions)
            .set({
              payingSeatsProvisional: sql`${tenantSubscriptions.payingSeatsProvisional} - 1`,
              payingSeatsAllocated: sql`${tenantSubscriptions.payingSeatsAllocated} - 1`,
              freeSeatsAllocated: sql`GREATEST(0, ${tenantSubscriptions.freeSeatsAllocated} - ${freeSeatsPerPlan})`,
              updatedAt: new Date(),
            })
            .where(eq(tenantSubscriptions.id, subscription.id));

          // Refund credits that were granted at purchase time
          if (invitation.paymentStatus === 'succeeded') {
            const plan = await tx.query.subscriptionPlans.findFirst({
              where: eq(subscriptionPlans.id, subscription.subscriptionPlanId),
            });

            if (plan) {
              const creditsToRefund = plan.creditsPerPayingUser || plan.creditsIncluded || 0;
              
              if (creditsToRefund > 0) {
                const creditsRecord = await tx.query.tenantCredits.findFirst({
                  where: eq(tenantCredits.tenantId, tenantId),
                });

                if (creditsRecord) {
                  const balanceBefore = (creditsRecord.monthlyCredits + creditsRecord.packageCredits);
                  const balanceAfter = Math.max(0, balanceBefore - creditsToRefund);

                  await tx
                    .update(tenantCredits)
                    .set({
                      packageCredits: sql`GREATEST(0, ${tenantCredits.packageCredits} - ${creditsToRefund})`,
                      lifetimePurchases: sql`GREATEST(0, ${tenantCredits.lifetimePurchases} - ${creditsToRefund})`,
                      updatedAt: new Date(),
                    })
                    .where(eq(tenantCredits.id, creditsRecord.id));

                  // Log credit refund transaction
                  await tx.insert(creditTransactions).values({
                    tenantId,
                    environment: 'production',
                    type: 'refund',
                    amount: -creditsToRefund,
                    balanceBefore,
                    balanceAfter,
                    currency: 'EUR',
                    description: `Credits refunded for declined/expired invite (${invitation.email})`,
                    paymentMethod: 'stripe',
                    paymentReference: invitation.paymentIntentId,
                    metadata: {
                      invitationId,
                      inviteEmail: invitation.email,
                      planId: plan.id,
                      planName: plan.name,
                      reason,
                    },
                  });
                }
              }
            }
          }

        } catch (error: any) {
          // Refund failed - log and mark for manual review
          await tx
            .update(tenantInvitations)
            .set({
              refundStatus: 'failed',
              refundInitiatedAt: new Date(),
            })
            .where(eq(tenantInvitations.id, invitationId));

          // Log billing event
          await tx.insert(inviteBillingEvents).values({
            tenantId,
            invitationId,
            eventType: 'refund_failed',
            eventData: {
              error: error.message,
              paymentIntentId: invitation.paymentIntentId,
              reason,
            },
            actorUserId,
          });

          console.error('[InviteBilling] Refund failed:', error);
          // Don't throw - we still want to mark the invite as declined/expired
        }
      } else if (invitation.seatType === 'free') {
        // Free seat from plan - no need to decrement freeSeatsAllocated
        // (freeSeatsAllocated only tracks ADDITIONAL purchased free seats)
      } else if (!invitation.requiresPayment && invitation.seatType === 'paid') {
        // Seat came from previously purchased capacity; release provisional hold
        await tx
          .update(tenantSubscriptions)
          .set({
            payingSeatsProvisional: sql`GREATEST(0, ${tenantSubscriptions.payingSeatsProvisional} - 1)`,
            updatedAt: new Date(),
          })
          .where(eq(tenantSubscriptions.id, subscription.id));
      }

      // Log seat release event
      await tx.insert(inviteBillingEvents).values({
        tenantId,
        invitationId,
        eventType: 'seat_released',
        eventData: {
          seatType: invitation.seatType,
          reason,
        },
        actorUserId,
      });

      // Log invite declined/expired event
      await tx.insert(inviteBillingEvents).values({
        tenantId,
        invitationId,
        eventType: reason === 'declined' ? 'invite_declined' : 'invite_expired',
        eventData: {
          email: invitation.email,
        },
        actorUserId,
      });
    });

    await stripeSeatSyncService.syncTenantSeats(tenantId).catch((error) => {
      console.error("[InviteBilling] Failed to sync Stripe seat quantity after invite decline/expiry:", error);
    });
  }

  /**
   * Get billing summary for a tenant
   */
  async getTenantBillingSummary(tenantId: string) {
    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ),
    });

    if (!subscription) {
      return null;
    }

    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, subscription.subscriptionPlanId),
    });

    if (!plan) {
      return null;
    }

    const availability = await this.checkSeatAvailability(tenantId);
    
    // Get actual seat counts from seat tracking service
    const seatCount = await seatTrackingService.getCurrentSeatCount(tenantId);

    // Get ALL pending paid invites (regardless of payment_status)
    // This ensures we show accurate counts even if DB column is out of sync
    const pendingPaidInvites = await db.query.tenantInvitations.findMany({
      where: and(
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, 'pending'),
        inArray(tenantInvitations.seatType, ['pending-paid', 'paid'])
      ),
    });

    // Calculate actual provisional seats from pending invites
    const actualProvisionalSeats = pendingPaidInvites.length;

    // Get pending invites that still need payment
    const pendingPaymentInvites = pendingPaidInvites.filter(
      invite => invite.paymentStatus === 'pending'
    );

    const totalPendingPayments = pendingPaymentInvites.reduce(
      (sum, invite) => sum + parseFloat(invite.paymentAmount?.toString() || '0'),
      0
    );

    // Calculate active paying seats using actual seat tracking (includes plan included seats)
    const payingSeatsActive = seatCount.payingSeats;
    const freeSeatsInUse = seatCount.freeSeats;
    
    // freeSeatsAllocated in DB = ADDITIONAL purchased free seats (starts at 0)
    // Total free capacity = plan base + additional purchased
    const additionalFreeSeats = subscription.freeSeatsAllocated || 0;
    const totalFreeCapacity = (plan.freeUsersIncluded || 0) + additionalFreeSeats;
    
    const totalPayingCapacity = (plan.payingUsersIncluded || 0) + subscription.payingSeatsAllocated;

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        priceMonthly: plan.priceMonthlyEuros,
        pricePerSeat: plan.pricePerPayingSeatEuros,
        freeSeatsIncluded: plan.freeUsersIncluded,
        payingSeatsIncluded: plan.payingUsersIncluded,
        creditsPerPayingUser: plan.creditsPerPayingUser,
      },
      seats: {
        freeSeatsAllocated: totalFreeCapacity, // TOTAL free capacity (base + purchased)
        freeSeatsInUse, // Actual free users currently active
        freeSeatsAvailable: availability.freeSeatsAvailable,
        payingSeatsActive, // Active paying users (accepted invites)
        payingSeatsAllocated: subscription.payingSeatsAllocated, // Total seats purchased
        payingSeatsProvisional: actualProvisionalSeats, // Pending invites
        totalPayingSeats: totalPayingCapacity, // Total capacity including plan allowance
      },
      credits: {
        balance: subscription.creditBalance,
      },
      pendingInvites: {
        count: pendingPaymentInvites.length,
        totalAmount: totalPendingPayments,
      },
    };
  }
}

export const inviteBillingService = new InviteBillingService();

