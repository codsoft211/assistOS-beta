// Team Management API with RBAC Guards
// Implements 4 REST endpoints for team management

import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users, userTenants, tenantInvitations, auditLog, inviteBillingEvents, tenantSubscriptions, subscriptionPlans, tenants } from "../../../shared/schema";
import { eq, and, or, ilike, count, sql } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { realtimeEvents } from "../services/event-emitter";
import { REALTIME_CHANNELS } from "../../../shared/realtime";
import { inviteBillingService } from "../services/invite-billing.service";
import { stripeSeatSyncService } from "../services/stripe-seat-sync.service";
import { seatTrackingService } from "../../../packages/services/seat-tracking";
import { emailService } from "../../../packages/platform/services/EmailService";
import { getUserRoleInTenant } from "../services/tenant.service";
import { tenantSchemaService } from "../services/tenant-schema.service";
import { getUserTenantsAcrossSchemas, getTenantUsersFromSchema } from "../utils/cross-tenant-query.helper";
import { Pool } from "pg";

const router = Router();

// ==================== RBAC MIDDLEWARE ====================

/**
 * requireAdmin middleware
 * Ensures user has 'admin' role in the current tenant
 * Returns 401 if not authenticated, 403 if not admin
 * 
 * Note: Checks all environments - if user has access in ANY environment, allow them in
 */
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  const tenantId = req.session.activeTenantId;
  
  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  // Use getUserRoleInTenant without environment parameter to check all environments
  // This ensures owners/admins in any environment can access the endpoint
  const role = await getUserRoleInTenant(userId, tenantId);
  
  if (!role || !['owner', 'admin'].includes(role)) {
    return res.status(403).json({ error: "Admin or owner access required" });
  }
  
  next();
}

// ==================== VALIDATION SCHEMAS ====================

const inviteSchema = z.object({
  email: z.string().email("Invalid email format"),
  role: z.enum(['user', 'admin']).default('user'),
});

const roleUpdateSchema = z.object({
  role: z.enum(['user', 'admin'], {
    errorMap: () => ({ message: "Role must be 'user' or 'admin'" })
  }),
});

const removeSeatSchema = z.object({
  count: z.number().int().min(1).max(25).optional(),
});

// ==================== ENDPOINTS ====================

/**
 * GET /api/team/billing-summary
 * Get billing summary for current tenant (seats, plan, costs)
 * Auth: Admin/Owner only
 */
router.get("/billing-summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId;
    
    if (!tenantId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const summary = await inviteBillingService.getTenantBillingSummary(tenantId);
    
    if (!summary) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Calculate next seat cost
    const nextSeatCost = summary.seats.freeSeatsAvailable > 0 
      ? 0 
      : summary.plan.pricePerSeat;

    // Get default payment method if subscription exists
    let defaultPaymentMethod = null;
    try {
      const subscription = await db.query.tenantSubscriptions.findFirst({
        where: and(
          eq(tenantSubscriptions.tenantId, tenantId),
          sql`${tenantSubscriptions.status} IN ('active', 'trial')`
        ),
      });

      if (subscription) {
        const metadata = (subscription.metadata || {}) as Record<string, any>;
        const stripeCustomerId = metadata?.stripeCustomerId;
        
        if (stripeCustomerId) {
          try {
            const { stripeService } = await import('../../../packages/services/stripe');
            defaultPaymentMethod = await stripeService.getCustomerDefaultPaymentMethod(stripeCustomerId);
          } catch (stripeError: any) {
            // If customer doesn't exist, clear the invalid ID
            if (stripeError.code === 'resource_missing' || stripeError.type === 'StripeInvalidRequestError') {
              console.warn(`[Team API] Stripe customer ${stripeCustomerId} not found. Clearing invalid customer ID.`);
              await db
                .update(tenantSubscriptions)
                .set({
                  metadata: sql`jsonb_set(COALESCE(${tenantSubscriptions.metadata}, '{}'::jsonb), '{stripeCustomerId}', 'null'::jsonb)`,
                  updatedAt: new Date(),
                })
                .where(eq(tenantSubscriptions.id, subscription.id));
            }
            // Continue without payment method
          }
        }
      }
    } catch (error) {
      console.error("[Team API] Error fetching default payment method:", error);
      // Don't fail the request if payment method fetch fails
    }

    res.json({
      ...summary,
      nextSeatCost,
      canAddFreeSeat: summary.seats.freeSeatsAvailable > 0,
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
    console.error("[Team API] Error fetching billing summary:", error);
    res.status(500).json({ 
      error: "Failed to fetch billing summary",
      details: error.message 
    });
  }
});

/**
 * GET /api/team
 * List team members with pagination and search
 * Auth: All authenticated users (any role)
 * 
 * CRITICAL FIX: Restored SQL LIMIT/OFFSET pagination + separate currentUserRole
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId;
    const userId = req.session.userId;

    console.log('[Team API] GET /api/team called:', {
      userId,
      tenantId,
      hasSession: !!req.session,
      sessionKeys: req.session ? Object.keys(req.session) : [],
    });

    if (!userId || !tenantId) {
      console.error('[Team API] Missing userId or tenantId:', { userId, tenantId });
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Parse query parameters
    const searchQuery = (req.query.query as string) || '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 20));
    const offset = (page - 1) * pageSize;

    // Get tenant schema name
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      console.error('[Team API] No schema found for tenant:', tenantId);
      return res.status(500).json({ error: "Tenant schema not found" });
    }

    // Escape schema name for SQL
    const escapedSchema = `"${schemaName.replace(/"/g, '""')}"`;

    // Build search condition for SQL query
    const searchCondition = searchQuery.trim()
      ? `AND (
          u.first_name ILIKE $${searchQuery ? '3' : '2'} OR
          u.last_name ILIKE $${searchQuery ? '3' : '2'} OR
          u.email ILIKE $${searchQuery ? '3' : '2'}
        )`
      : '';

    // Query active members from tenant schema
    // Query all environments (no environment filter)
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    let activeMembers: any[] = [];
    let totalCount = 0;
    
    try {
      const membersQuery = `
        SELECT 
          ut.user_id as "userId",
          u.email,
          u.first_name as "firstName",
          u.last_name as "lastName",
          ut.role,
          ut.joined_at as "joinedAt",
          ut.invited_by as "invitedBy"
        FROM ${escapedSchema}."user_tenants" ut
        INNER JOIN public."users" u ON u.id = ut.user_id::text
        WHERE ut.tenant_id = $1
          ${searchCondition}
        ORDER BY ut.joined_at
        LIMIT $${searchQuery.trim() ? '4' : '2'} OFFSET $${searchQuery.trim() ? '5' : '3'}
      `;

      const countQuery = `
        SELECT COUNT(*)::int as count
        FROM ${escapedSchema}."user_tenants" ut
        INNER JOIN public."users" u ON u.id = ut.user_id::text
        WHERE ut.tenant_id = $1
          ${searchCondition}
      `;

      const queryParams = searchQuery.trim()
        ? [tenantId, `%${searchQuery}%`, pageSize, offset]
        : [tenantId, pageSize, offset];

      const countParams = searchQuery.trim()
        ? [tenantId, `%${searchQuery}%`]
        : [tenantId];

      const [membersResult, countResult] = await Promise.all([
        pool.query(membersQuery, queryParams),
        pool.query(countQuery, countParams)
      ]);

      const activeMembersRaw = membersResult.rows;
      totalCount = parseInt(countResult.rows[0]?.count || '0', 10);

      // Add id (userId) and status fields manually
      activeMembers = activeMembersRaw.map((member: any) => ({
        id: member.userId, // Use userId as ID for active members
        userId: member.userId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        joinedAt: member.joinedAt,
        invitedBy: member.invitedBy,
      status: 'active' as const,
    }));
    } finally {
      await pool.end();
    }

    // Build search condition for pending invites
    const inviteSearchCondition = searchQuery.trim()
      ? ilike(tenantInvitations.email, `%${searchQuery}%`)
      : undefined;

    // FIX 1: Fetch ALL pending invites (no pagination, separate list)
    // Removed environment filter to show invites from all environments
    const pendingInvitesRaw = await db
      .select({
        id: tenantInvitations.id,
        email: tenantInvitations.email,
        role: tenantInvitations.role,
        joinedAt: tenantInvitations.createdAt,
        invitedBy: tenantInvitations.createdBy,
        seatType: tenantInvitations.seatType,
      })
      .from(tenantInvitations)
      .where(and(
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, 'pending'),
        inviteSearchCondition
      ))
      .orderBy(tenantInvitations.createdAt);

    // Add missing fields manually (avoid Drizzle SQL mixing bug)
    const pendingInvites = pendingInvitesRaw.map(invite => ({
      ...invite,
      userId: null,
      firstName: '',
      lastName: '',
      status: 'pending' as const,
    }));

    // FIX 2: Fetch current user's role separately (NOT from paginated data)
    // Use getUserRoleInTenant without environment parameter to check all environments
    // This ensures we find the user's role regardless of which environment they're in
    const currentUserRole = await getUserRoleInTenant(userId, tenantId);

    console.log('[Team API] Current user role lookup:', {
      userId,
      tenantId,
      currentUserRole,
      isAdmin: currentUserRole === 'admin' || currentUserRole === 'owner',
    });

    // Return paginated active members + all pending invites + current user role
    const response = {
      members: activeMembers,
      pendingInvites: pendingInvites,
      totalCount: totalCount,
      page,
      pageSize,
      currentUserRole: currentUserRole,
    };

    console.log('[Team API] Response:', {
      membersCount: response.members.length,
      pendingInvitesCount: response.pendingInvites.length,
      currentUserRole: response.currentUserRole,
      totalCount: response.totalCount,
    });

    res.json(response);
  } catch (error: any) {
    console.error("[Team API] Error listing members:", error);
    res.status(500).json({ 
      error: "Failed to list team members",
      details: error.message 
    });
  }
});

/**
 * POST /api/team/invite/check
 * Pre-flight check before inviting a member (admin-only)
 * Validates email availability without allocating seats or charging payment
 * Auth: Admin role required (requireAdmin middleware)
 */
router.post("/invite/check", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId!;
    const { email } = inviteSchema.parse(req.body);

    // Check if email already a member
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      // Check all environments to see if user is already a member
      const existingMembership = await getUserRoleInTenant(existingUser.id, tenantId);

      if (existingMembership) {
        return res.status(400).json({ error: "User already a member" });
      }
    }

    // Check if email has pending invitation
    const existingInvite = await db.query.tenantInvitations.findFirst({
      where: and(
        eq(tenantInvitations.email, email),
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, 'pending')
      ),
    });

    if (existingInvite) {
      return res.status(400).json({ error: "Invitation already sent" });
    }

    // Check seat availability
    const availability = await inviteBillingService.checkSeatAvailability(tenantId);
    
    // Check if any capacity is available (paid or free)
    const hasCapacity = availability.canUsePaidSeat || availability.canInviteFree;
    
    // ✅ FIXED: Return 200 with canInvite: false instead of 400 error
    // This allows frontend to handle it gracefully
    if (!hasCapacity) {
      // No capacity available - return success response with canInvite: false
      return res.status(200).json({ 
        canInvite: false,
        requiresAction: true,
        message: "No seat capacity available",
        seatAllocation: {
          willUsePaidSeat: false,
          willUseFreeSeat: false,
          payingSeatsAvailable: availability.payingSeatsAvailable,
          freeSeatsAvailable: availability.freeSeatsAvailable,
          pendingPaidInvites: availability.pendingPaidInvitesCount,
          pendingFreeInvites: availability.pendingFreeInvitesCount,
        },
        details: {
          message: "All seats are occupied or reserved by pending invitations. Please revoke a pending invitation or purchase additional seats.",
          payingSeatsAvailable: availability.payingSeatsAvailable,
          freeSeatsAvailable: availability.freeSeatsAvailable,
          pendingPaidInvites: availability.pendingPaidInvitesCount,
          pendingFreeInvites: availability.pendingFreeInvitesCount,
        }
      });
    }

    // All checks passed - return seat allocation details
    res.status(200).json({ 
      canInvite: true,
      seatAllocation: {
        willUsePaidSeat: availability.canUsePaidSeat,
        willUseFreeSeat: availability.canInviteFree && !availability.canUsePaidSeat,
        payingSeatsAvailable: availability.payingSeatsAvailable,
        freeSeatsAvailable: availability.freeSeatsAvailable,
        pendingPaidInvites: availability.pendingPaidInvitesCount,
        pendingFreeInvites: availability.pendingFreeInvitesCount,
      }
    });
  } catch (error: any) {
    console.error("[Team API] Error checking invite eligibility:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to check invite eligibility",
      details: error.message 
    });
  }
});

/**
 * POST /api/team/invite
 * Invite new team member (admin-only)
 * Auth: Admin role required (requireAdmin middleware)
 */
router.post("/invite", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId!;
    const userId = req.session.userId!;

    // Validate request body
    const { email, role } = inviteSchema.parse(req.body);

    // Check if email already a member
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      // Check all environments to see if user is already a member
      const existingMembership = await getUserRoleInTenant(existingUser.id, tenantId);

      if (existingMembership) {
        return res.status(400).json({ error: "User already a member" });
      }
    }

    // Check if email has pending invitation
    const existingInvite = await db.query.tenantInvitations.findFirst({
      where: and(
        eq(tenantInvitations.email, email),
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, 'pending')
      ),
    });

    if (existingInvite) {
      return res.status(400).json({ error: "Invitation already sent" });
    }

    // ==================== BILLING INTEGRATION ====================
    // Check seat availability and allocate seat (with payment if needed)
    let allocationResult;
    try {
      allocationResult = await inviteBillingService.allocateSeatForInvite(
        tenantId,
        userId,
        email
      );
    } catch (error: any) {
      console.error("[Team API] Seat allocation failed:", error);
      return res.status(400).json({ 
        error: "Seat allocation failed",
        message: error.message 
      });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiry to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation with billing data
    // Use request environment if available, otherwise default to 'production'
    const environment = (req as any).environment || 'production';
    const [invitation] = await db
      .insert(tenantInvitations)
      .values({
        tenantId,
        email,
        role,
        token,
        status: 'pending',
        expiresAt,
        createdBy: userId,
        environment,
        
        // Billing fields
        seatType: allocationResult.seatType,
        requiresPayment: allocationResult.requiresPayment,
        paymentAmount: allocationResult.paymentAmount?.toString(),
        paymentCurrency: allocationResult.paymentCurrency,
        paymentIntentId: allocationResult.paymentIntentId,
        paymentStatus: allocationResult.paymentStatus || (allocationResult.requiresPayment ? 'pending' : 'none'),
        paymentCapturedAt: allocationResult.paymentCapturedAt,
        subscriptionPlanId: allocationResult.subscriptionPlanId,
      })
      .returning();

    // Log billing event
    await db.insert(inviteBillingEvents).values({
      tenantId,
      invitationId: invitation.id,
      eventType: 'invite_created',
      eventData: {
        email,
        role,
        seatType: allocationResult.seatType,
        requiresPayment: allocationResult.requiresPayment,
        paymentAmount: allocationResult.paymentAmount,
        planName: allocationResult.planName,
      },
      actorUserId: userId,
    });

    if (allocationResult.requiresPayment && allocationResult.paymentStatus === 'succeeded') {
      await db.insert(inviteBillingEvents).values({
        tenantId,
        invitationId: invitation.id,
        eventType: 'payment_succeeded',
        eventData: {
          paymentIntentId: allocationResult.paymentIntentId,
          amount: allocationResult.paymentAmount,
          currency: allocationResult.paymentCurrency,
        },
        actorUserId: userId,
      });
    }

    // Log audit event
    // Use request environment if available, otherwise default to 'production'
    const auditEnvironment = (req as any).environment || 'production';
    await db.insert(auditLog).values({
      tenantId,
      actorUserId: userId,
      action: 'team.invite',
      metadata: { 
        email, 
        role,
        requiresPayment: allocationResult.requiresPayment,
        seatType: allocationResult.seatType,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      environment: auditEnvironment,
    });

    // Emit SSE event for real-time team member changes (Phase 4.3)
    try {
      realtimeEvents.emitForTenant(REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED, tenantId, {
        action: 'invite',
        userId,
        tenantId,
        email,
        role,
        requiresPayment: allocationResult.requiresPayment,
      });
    } catch (error) {
      console.error("Failed to emit SSE event for team invite:", error);
      // Continue - don't fail HTTP request
    }

    // Send invitation email
    try {
      console.log("[Team API] Preparing invite email. SMTP host configured:", !!process.env.SMTP_HOST, "user configured:", !!process.env.SMTP_USER);
      // Get tenant info
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      // Get inviter info
      const [inviter] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}` : 'A team member';
      const tenantName = tenant?.name || 'AssistOS';
      
      // Generate invitation URL
      const baseUrl = process.env.APP_URL || 'http://localhost:5000';
      const inviteUrl = `${baseUrl}/accept-invite/${token}`;

      // Check if user already exists
      const isExistingUser = existingUser !== undefined;

      // Send email
      const emailSubject = `You've been invited to join ${tenantName}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Team Invitation</h2>
          <p>Hi,</p>
          <p>${inviterName} has invited you to join <strong>${tenantName}</strong> on AssistOS${isExistingUser ? '' : ' and create your account'}.</p>
          <p>Your role will be: <strong>${role}</strong></p>
          ${allocationResult.requiresPayment ? `<p><em>Note: This is a paid seat. Payment has been processed.</em></p>` : ''}
          <div style="margin: 30px 0;">
            <a href="${inviteUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              ${isExistingUser ? 'Accept Invitation' : 'Create Account & Accept'}
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">This invitation will expire in 7 days.</p>
          <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
        </div>
      `;

      await emailService.sendEmail({
        to: email,
        subject: emailSubject,
        html: emailHtml,
        text: `You've been invited to join ${tenantName}. Visit ${inviteUrl} to accept.`,
      });

      console.log(`[Team API] Invitation email sent to ${email}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("[Team API] Failed to send invitation email:", {
        error: errorMessage,
        stack: errorStack,
        smtpHost: process.env.SMTP_HOST ? "SET" : "NOT SET",
        smtpUser: process.env.SMTP_USER ? "SET" : "NOT SET",
        smtpFrom: process.env.SMTP_FROM ? "SET" : "NOT SET",
      });
      // Continue - don't fail the invitation creation
    }

    // MVP: Log token to console
    console.log(`[Team API] Invitation token for ${email}: ${token}`);
    console.log(`[Team API] Seat type: ${allocationResult.seatType}, Requires payment: ${allocationResult.requiresPayment}`);

    res.json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
      
      // Billing info
      requiresPayment: allocationResult.requiresPayment,
      seatType: allocationResult.seatType,
      paymentAmount: allocationResult.paymentAmount,
      paymentCurrency: allocationResult.paymentCurrency,
      paymentIntentId: allocationResult.paymentIntentId,
      paymentStatus: allocationResult.paymentStatus,
      paymentCapturedAt: allocationResult.paymentCapturedAt,
      planName: allocationResult.planName,
    });
  } catch (error: any) {
    console.error("[Team API] Error inviting member:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to invite member",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/team/:id/role
 * Change team member role (admin-only)
 * Auth: Admin role required (requireAdmin middleware)
 */
router.patch("/:id/role", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId!;
    const currentUserId = req.session.userId!;
    const { id: targetUserId } = req.params;

    // Validate request body
    const { role } = roleUpdateSchema.parse(req.body);

    // Fetch target member details - check all environments
    const memberRole = await getUserRoleInTenant(targetUserId, tenantId);

    if (!memberRole) {
      return res.status(404).json({ error: "Member not found" });
    }

    // Get full member details for role check
    const member = { role: memberRole };

    // Prevent owner demotion
    if (member.role === 'owner') {
      return res.status(403).json({ error: "Cannot change owner role" });
    }

    // Prevent changing own role
    if (targetUserId === currentUserId) {
      return res.status(403).json({ error: "Cannot change your own role" });
    }

    // Update role - update all matching records (userId + tenantId) regardless of environment
    await db
      .update(userTenants)
      .set({ role })
      .where(and(
        eq(userTenants.userId, targetUserId),
        eq(userTenants.tenantId, tenantId)
      ));

    // Log audit event
    // Use request environment if available, otherwise default to 'production'
    const auditEnvironment = (req as any).environment || 'production';
    await db.insert(auditLog).values({
      tenantId,
      actorUserId: currentUserId,
      targetUserId,
      action: 'team.role_change',
      metadata: { targetUserId, newRole: role, oldRole: member.role },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      environment: auditEnvironment,
    });

    // Emit SSE event for real-time team member changes (Phase 4.3)
    try {
      realtimeEvents.emitForTenant(REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED, tenantId, {
        action: 'role_change',
        userId: currentUserId,
        tenantId,
        targetUserId,
        oldRole: member.role,
        newRole: role,
      });
    } catch (error) {
      console.error("Failed to emit SSE event for role change:", error);
      // Continue - don't fail HTTP request
    }

    res.json({
      success: true,
      member: {
        id: targetUserId,
        role,
      },
    });
  } catch (error: any) {
    console.error("[Team API] Error changing role:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to change role",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/team/:id
 * Remove team member OR revoke pending invite (admin-only)
 * Auth: Admin role required (requireAdmin middleware)
 * 
 * CRITICAL FIX: Checks both userTenants AND tenantInvitations
 */
router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId!;
    const currentUserId = req.session.userId!;
    const { id } = req.params;

    // ✅ FIXED: Query tenant-scoped schema instead of public schema
    // First, try to find in tenant-scoped user_tenants (active member by userId)
    const tenantUsers = await getTenantUsersFromSchema(tenantId);
    const memberByUserIdRecord = tenantUsers.find(u => u.userId === id);

    if (memberByUserIdRecord) {
      const memberByUserId = {
        userId: memberByUserIdRecord.userId,
        role: memberByUserIdRecord.role,
        isPaying: memberByUserIdRecord.isPaying || false,
      };
      // Removing active member
      if (memberByUserId.role === 'owner') {
        return res.status(403).json({ error: "Cannot remove owner" });
      }

      // Prevent removing self
      if (memberByUserId.userId === currentUserId) {
        return res.status(403).json({ error: "Cannot remove yourself" });
      }

      // CRITICAL: Check if user has other tenants before removing
      // If this is their only tenant, auto-create a personal tenant to prevent account lockout
      // ✅ FIXED: Use cross-tenant query helper to find user in all tenant schemas
      const userAllTenants = await getUserTenantsAcrossSchemas(id);

      const willBeOrphaned = userAllTenants.length === 1; // Only has this tenant
      let personalTenantCreated = false;
      let personalTenantId: string | null = null;

      if (willBeOrphaned) {
        console.log(`[Team Removal] User ${id} will be orphaned. Creating personal tenant...`);
        
        try {
          // Get user info for tenant creation
          const user = await db.query.users.findFirst({
            where: eq(users.id, id),
          });

          if (!user) {
            return res.status(404).json({ error: "User not found" });
          }

          // Import tenant service to create tenant
          const { createTenant } = await import('../services/tenant.service');
          const { generateUniqueSlug } = await import('../utils/slug');

          // Create personal tenant with user's name
          const personalTenantName = `${user.firstName} ${user.lastName}'s Organization`;
          const baseSlug = `${user.firstName}-${user.lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
          const uniqueSlug = await generateUniqueSlug(baseSlug);

          const personalTenant = await createTenant({
            name: personalTenantName,
            slug: uniqueSlug,
            ownerId: id,
          });

          personalTenantId = personalTenant.id;
          personalTenantCreated = true;

          console.log(`[Team Removal] ✅ Created personal tenant for user ${id}:`, {
            tenantId: personalTenant.id,
            tenantName: personalTenant.name,
            slug: personalTenant.slug,
          });

          // Log audit event for personal tenant creation
          // Use request environment if available, otherwise default to 'production'
          const auditEnvironment = (req as any).environment || 'production';
          await db.insert(auditLog).values({
            tenantId: personalTenant.id,
            actorUserId: id,
            targetUserId: id,
            action: "tenant_auto_created_on_removal",
            metadata: { 
              reason: "User removed from last tenant",
              originalTenantId: tenantId,
              removedBy: currentUserId,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
            environment: auditEnvironment,
          });
        } catch (error: any) {
          console.error(`[Team Removal] Failed to create personal tenant for user ${id}:`, error);
          return res.status(500).json({ 
            error: "Cannot remove user: Failed to create personal tenant",
            details: error.message 
          });
        }
      }

      // Now safe to remove user from current tenant
      // ✅ FIXED: Remove from tenant-scoped schema using raw SQL
      const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
      if (!schemaName) {
        return res.status(500).json({ error: "Tenant schema not found" });
      }
      
      // Remove user from tenant-scoped schema (all environments at once)
      await db.execute(sql`
        DELETE FROM ${sql.identifier(schemaName)}.${sql.identifier('user_tenants')}
        WHERE user_id = ${id} AND tenant_id = ${tenantId}
      `);
      
      console.log(`[Team Removal] ✅ Removed user ${id} from tenant ${tenantId} in tenant-scoped schema`);

      // Note: freeSeatsAllocated only tracks ADDITIONAL purchased free seats,
      // not plan-included free seats, so we don't decrement it when removing free members

      // Log audit event
      // Use request environment if available, otherwise default to 'production'
      const auditEnvironment = (req as any).environment || 'production';
      await db.insert(auditLog).values({
        tenantId,
        actorUserId: currentUserId,
        targetUserId: memberByUserId.userId,
        action: 'team.member_remove',
        metadata: { 
          removedUserId: memberByUserId.userId,
          personalTenantCreated,
          personalTenantId,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        environment: auditEnvironment,
      });

      // Emit SSE event for real-time team member changes (Phase 4.3)
      try {
        realtimeEvents.emitForTenant(REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED, tenantId, {
          action: 'member_remove',
          userId: currentUserId,
          tenantId,
          removedUserId: memberByUserId.userId,
          personalTenantCreated,
        });
      } catch (error) {
        console.error("Failed to emit SSE event for member removal:", error);
        // Continue - don't fail HTTP request
      }

      return res.json({ 
        success: true,
        personalTenantCreated,
        message: personalTenantCreated 
          ? "User removed and personal organization created for them"
          : "User removed successfully"
      });
    }

    // FIX 3: If not found in userTenants, try tenantInvitations (pending invite)
    // Removed environment filter to find invites from all environments
    const [invitation] = await db
      .select({
        id: tenantInvitations.id,
        email: tenantInvitations.email,
        role: tenantInvitations.role,
        seatType: tenantInvitations.seatType,
        requiresPayment: tenantInvitations.requiresPayment,
      })
      .from(tenantInvitations)
      .where(and(
        eq(tenantInvitations.id, id),
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, 'pending')
      ))
      .limit(1);

    if (invitation) {
      if (!invitation.requiresPayment) {
        // Free seat: release allocation via billing service so free seat becomes available again
        try {
          await inviteBillingService.processInviteDeclineOrExpiry(
            id,
            'declined',
            currentUserId,
          );
        } catch (billingError: any) {
          console.error("[Team API] Error releasing free seat on invite revoke:", billingError);
          return res.status(500).json({
            error: "Failed to revoke invite",
            details: billingError.message,
          });
        }
      } else {
        // Paid seat: keep capacity allocated (no refunds). Just remove pending invite record.
        await db
          .delete(tenantInvitations)
          .where(and(
            eq(tenantInvitations.id, id),
            eq(tenantInvitations.tenantId, tenantId)
          ));
      }

      // Log audit event
      // Use request environment if available, otherwise default to 'production'
      const auditEnvironment = (req as any).environment || 'production';
      await db.insert(auditLog).values({
        tenantId,
        actorUserId: currentUserId,
        action: 'team.invite_revoke',
        metadata: { 
          invitationId: id,
          email: invitation.email,
          role: invitation.role,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        environment: auditEnvironment,
      });

      // Emit SSE event for real-time team member changes (Phase 4.3)
      try {
        realtimeEvents.emitForTenant(REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED, tenantId, {
          action: 'invite_revoke',
          userId: currentUserId,
          tenantId,
          invitationId: id,
          email: invitation.email,
        });
      } catch (error) {
        console.error("Failed to emit SSE event for invite revocation:", error);
        // Continue - don't fail HTTP request
      }

      return res.json({ success: true });
    }

    // FIX 3: Not found in either table
    return res.status(404).json({ error: "Member or invitation not found" });
  } catch (error: any) {
    console.error("[Team API] Error removing member/invite:", error);
    res.status(500).json({ 
      error: "Failed to remove member or revoke invitation",
      details: error.message 
    });
  }
});

/**
 * POST /api/team/seats/remove
 * Removes unused paid seat allocations so future billing cycles exclude them
 */
router.post("/seats/remove", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = req.session.activeTenantId!;
    const { count } = removeSeatSchema.parse(req.body ?? {});
    const seatsRequested = count ?? 1;

    const subscription = await db
      .select({
        id: tenantSubscriptions.id,
        payingSeatsAllocated: tenantSubscriptions.payingSeatsAllocated,
        subscriptionPlanId: tenantSubscriptions.subscriptionPlanId,
      })
      .from(tenantSubscriptions)
      .where(and(
        eq(tenantSubscriptions.tenantId, tenantId),
        sql`${tenantSubscriptions.status} IN ('active', 'trial')`
      ))
      .limit(1);

    if (!subscription || subscription.length === 0) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    const currentSubscription = subscription[0];

    if (currentSubscription.payingSeatsAllocated <= 0) {
      return res.status(400).json({ error: "No additional paid seats to remove" });
    }

    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, currentSubscription.subscriptionPlanId),
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    // Get pending paid invites (seats reserved for invitations)
    // Removed environment filter to count invites from all environments
    const pendingPaidInvites = await db
      .select({ id: tenantInvitations.id })
      .from(tenantInvitations)
      .where(and(
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, 'pending'),
        eq(tenantInvitations.requiresPayment, true)
      ));

    const seatsReservedForInvites = pendingPaidInvites.length;

    // Removable seats = total purchased - seats reserved for pending invites
    // We don't care about occupancy - seats are capacity, not usage
    const removableSeats = Math.max(
      0,
      currentSubscription.payingSeatsAllocated - seatsReservedForInvites,
    );

    if (removableSeats <= 0) {
      return res.status(400).json({ 
        error: "No seats available to remove. All purchased seats are reserved for pending invites." 
      });
    }

    const seatsToRemove = Math.min(removableSeats, seatsRequested);

    await db
      .update(tenantSubscriptions)
      .set({
        payingSeatsAllocated: sql`${tenantSubscriptions.payingSeatsAllocated} - ${seatsToRemove}`,
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.id, currentSubscription.id));

    await stripeSeatSyncService.syncTenantSeats(tenantId).catch((error) => {
      console.error("[Team API] Failed to sync Stripe seat quantity after removal:", error);
    });

    return res.json({
      success: true,
      removedSeats: seatsToRemove,
    });
  } catch (error: any) {
    console.error("[Team API] Error removing paid seat:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    res.status(500).json({
      error: "Failed to remove paid seat",
      details: error.message,
    });
  }
});

export default router;
