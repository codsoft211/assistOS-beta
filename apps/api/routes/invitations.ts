/**
 * Invitation Management Routes
 * 
 * Handles invite acceptance, decline, and expiry with billing integration
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  users, 
  userTenants, 
  tenantInvitations, 
  auditLog,
  tenants,
  tenantSubscriptions,
} from "../../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { inviteBillingService } from "../services/invite-billing.service";
import { realtimeEvents } from "../services/event-emitter";
import { REALTIME_CHANNELS } from "../../../shared/realtime";

const router = Router();

// ==================== VALIDATION SCHEMAS ====================

const acceptInviteSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

const declineInviteSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

// ==================== ROUTES ====================

/**
 * GET /api/invitations/details/:token
 * Get full invitation details including status (public route for UI)
 */
router.get("/details/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const invitation = await db.query.tenantInvitations.findFirst({
      where: eq(tenantInvitations.token, token),
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    // Get tenant info
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, invitation.tenantId),
    });

    // Check if user with this email already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, invitation.email),
    });

    // Return full details including status and user existence
    res.json({
      email: invitation.email,
      role: invitation.role,
      tenantName: tenant?.name || 'Unknown Organization',
      requiresPayment: invitation.requiresPayment || false,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      userExists: !!existingUser, // NEW: Tell frontend if user already exists
    });
  } catch (error: any) {
    console.error("[Invitations API] Error fetching invitation details:", error);
    res.status(500).json({ 
      error: "Failed to fetch invitation details",
      details: error.message 
    });
  }
});

/**
 * GET /api/invitations/:token
 * Get invitation details by token (public route)
 */
router.get("/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const invitation = await db.query.tenantInvitations.findFirst({
      where: eq(tenantInvitations.token, token),
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    // Check if expired
    if (new Date() > new Date(invitation.expiresAt)) {
      return res.status(400).json({ 
        error: "Invitation expired",
        expiredAt: invitation.expiresAt 
      });
    }

    // Check if already used
    if (invitation.status !== 'pending') {
      return res.status(400).json({ 
        error: "Invitation already used",
        status: invitation.status 
      });
    }

    // Get tenant info
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, invitation.tenantId),
    });

    res.json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      tenantId: invitation.tenantId,
      tenantName: tenant?.name,
      expiresAt: invitation.expiresAt,
      requiresPayment: invitation.requiresPayment,
      paymentAmount: invitation.paymentAmount,
      paymentCurrency: invitation.paymentCurrency,
      seatType: invitation.seatType,
    });
  } catch (error: any) {
    console.error("[Invitations API] Error fetching invitation:", error);
    res.status(500).json({ 
      error: "Failed to fetch invitation",
      details: error.message 
    });
  }
});

/**
 * POST /api/invitations/accept
 * Accept an invitation (public route, creates user session)
 */
router.post("/accept", async (req: Request, res: Response) => {
  try {
    const { token } = acceptInviteSchema.parse(req.body);

    // Get invitation
    const invitation = await db.query.tenantInvitations.findFirst({
      where: eq(tenantInvitations.token, token),
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    // Check if expired
    if (new Date() > new Date(invitation.expiresAt)) {
      // Mark as expired and process refund if needed
      await inviteBillingService.processInviteDeclineOrExpiry(
        invitation.id,
        'expired'
      );
      
      return res.status(400).json({ 
        error: "Invitation expired",
        expiredAt: invitation.expiresAt 
      });
    }

    // Check if already used
    if (invitation.status !== 'pending') {
      return res.status(400).json({ 
        error: "Invitation already used",
        status: invitation.status 
      });
    }

    // Ensure payment already handled by tenant owner
    if (invitation.requiresPayment && invitation.paymentStatus !== 'succeeded') {
      return res.status(400).json({
        error: "Payment pending",
        message: "This invitation has not been paid yet. Please contact the tenant owner to complete the payment.",
      });
    }

    // Check if user exists
    let user = await db.query.users.findFirst({
      where: eq(users.email, invitation.email),
    });

    // If user doesn't exist, they need to register via invitation
    if (!user) {
      return res.status(400).json({ 
        error: "User not found",
        message: "Please create an account to accept this invitation",
        email: invitation.email,
        requiresRegistration: true,
      });
    }

    // Check if user already a member
    const existingMembership = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, user.id),
        eq(userTenants.tenantId, invitation.tenantId),
        eq(userTenants.environment, 'production')
      ),
    });

    if (existingMembership) {
      // User is already a member - mark invitation as accepted and return success
      // This handles the case where user was invited but already had access
      
      // Note: freeSeatsAllocated only tracks ADDITIONAL purchased free seats,
      // not plan-included free seats, so we don't need to release anything
      
      await db
        .update(tenantInvitations)
        .set({
          acceptedAt: new Date(),
          status: 'accepted',
        })
        .where(eq(tenantInvitations.id, invitation.id));

      // Log audit event
      await db.insert(auditLog).values({
        tenantId: invitation.tenantId,
        actorUserId: user.id,
        action: 'team.invite_accepted_existing_member',
        metadata: { 
          invitationId: invitation.id,
          email: invitation.email,
          role: invitation.role,
          note: 'User was already a member',
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        environment: 'production',
      });

      // Return success - user can proceed to dashboard with their existing membership
      return res.json({
        success: true,
        message: "You are already a member of this organization",
        userId: user.id,
        tenantId: invitation.tenantId,
        role: existingMembership.role,
        alreadyMember: true,
      });
    }

    // ✅ FIXED: Add user to tenant-scoped schema FIRST, then process acceptance
    // This ensures the user exists when processInviteAcceptance tries to update is_paying
    const { addUserToTenant } = await import('../services/tenant.service');
    const usesPayingSeat = invitation.requiresPayment || invitation.seatType === 'paid';
    
    try {
      // Add user to tenant in tenant-scoped schema
      // Set isPaying flag if this is a paid seat (will be confirmed/updated by processInviteAcceptance)
      await addUserToTenant({
        userId: user.id,
        tenantId: invitation.tenantId,
        role: invitation.role,
        invitedBy: invitation.createdBy,
        environment: 'production',
        isPaying: usesPayingSeat, // Set initial is_paying flag
      });
      console.log(`[Invitations API] Added user ${user.id} to tenant ${invitation.tenantId} in tenant-scoped schema (isPaying: ${usesPayingSeat})`);
    } catch (error: any) {
      console.error("[Invitations API] Failed to add user to tenant:", error);
      return res.status(500).json({ 
        error: "Failed to add user to tenant",
        message: error.message 
      });
    }

    // Process invite acceptance (captures payment, allocates seat, grants credits)
    // This will now update is_paying in the tenant-scoped schema where the user exists
    try {
      await inviteBillingService.processInviteAcceptance(invitation.id, user.id);
    } catch (error: any) {
      console.error("[Invitations API] Invite acceptance processing failed:", error);
      return res.status(500).json({ 
        error: "Failed to process invitation",
        message: error.message 
      });
    }

    // Log audit event
    await db.insert(auditLog).values({
      tenantId: invitation.tenantId,
      actorUserId: user.id,
      action: 'team.invite_accepted',
      metadata: { 
        invitationId: invitation.id,
        email: invitation.email,
        role: invitation.role,
        requiresPayment: invitation.requiresPayment,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      environment: 'production',
    });

    // Emit SSE event
    try {
      realtimeEvents.emitForTenant(
        REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED, 
        invitation.tenantId, 
        {
          action: 'member_added',
          userId: user.id,
          tenantId: invitation.tenantId,
          email: user.email,
          role: invitation.role,
        }
      );
    } catch (error) {
      console.error("Failed to emit SSE event for invite acceptance:", error);
    }

    res.json({
      success: true,
      message: "Invitation accepted successfully",
      userId: user.id,
      tenantId: invitation.tenantId,
      role: invitation.role,
    });
  } catch (error: any) {
    console.error("[Invitations API] Error accepting invitation:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to accept invitation",
      details: error.message 
    });
  }
});

/**
 * POST /api/invitations/decline
 * Decline an invitation (public route)
 */
router.post("/decline", async (req: Request, res: Response) => {
  try {
    const { token } = declineInviteSchema.parse(req.body);

    // Get invitation
    const invitation = await db.query.tenantInvitations.findFirst({
      where: eq(tenantInvitations.token, token),
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    // Check if already used
    if (invitation.status !== 'pending') {
      return res.status(400).json({ 
        error: "Invitation already processed",
        status: invitation.status 
      });
    }

    // Process decline (refunds payment if needed, releases seat)
    try {
      await inviteBillingService.processInviteDeclineOrExpiry(
        invitation.id,
        'declined'
      );
    } catch (error: any) {
      console.error("[Invitations API] Decline processing failed:", error);
      return res.status(500).json({ 
        error: "Failed to process decline",
        message: error.message 
      });
    }

    // Log audit event
    await db.insert(auditLog).values({
      tenantId: invitation.tenantId,
      actorUserId: invitation.createdBy, // Use inviter as actor since invitee might not have account
      action: 'team.invite_declined',
      metadata: { 
        invitationId: invitation.id,
        email: invitation.email,
        requiresPayment: invitation.requiresPayment,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      environment: 'production',
    });

    // Emit SSE event
    try {
      realtimeEvents.emitForTenant(
        REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED, 
        invitation.tenantId, 
        {
          action: 'invite_declined',
          tenantId: invitation.tenantId,
          email: invitation.email,
        }
      );
    } catch (error) {
      console.error("Failed to emit SSE event for invite decline:", error);
    }

    res.json({
      success: true,
      message: "Invitation declined successfully",
    });
  } catch (error: any) {
    console.error("[Invitations API] Error declining invitation:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to decline invitation",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/invitations/:id/revoke
 * Revoke a pending invitation (admin-only)
 * This is different from decline - it's initiated by the inviter
 */
router.delete("/:id/revoke", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Check admin permission
    const membership = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId),
        eq(userTenants.environment, 'production')
      ),
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: "Admin or owner access required" });
    }

    // Get invitation
    const invitation = await db.query.tenantInvitations.findFirst({
      where: and(
        eq(tenantInvitations.id, id),
        eq(tenantInvitations.tenantId, tenantId)
      ),
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ 
        error: "Invitation already processed",
        status: invitation.status 
      });
    }

    // Process as expired (same logic as decline - refund and release seat)
    try {
      await inviteBillingService.processInviteDeclineOrExpiry(
        invitation.id,
        'expired',
        userId
      );
    } catch (error: any) {
      console.error("[Invitations API] Revoke processing failed:", error);
      return res.status(500).json({ 
        error: "Failed to process revocation",
        message: error.message 
      });
    }

    // Log audit event
    await db.insert(auditLog).values({
      tenantId,
      actorUserId: userId,
      action: 'team.invite_revoked',
      metadata: { 
        invitationId: invitation.id,
        email: invitation.email,
        requiresPayment: invitation.requiresPayment,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      environment: 'production',
    });

    // Emit SSE event
    try {
      realtimeEvents.emitForTenant(
        REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED, 
        tenantId, 
        {
          action: 'invite_revoked',
          userId,
          tenantId,
          email: invitation.email,
        }
      );
    } catch (error) {
      console.error("Failed to emit SSE event for invite revocation:", error);
    }

    res.json({
      success: true,
      message: "Invitation revoked successfully",
    });
  } catch (error: any) {
    console.error("[Invitations API] Error revoking invitation:", error);
    res.status(500).json({ 
      error: "Failed to revoke invitation",
      details: error.message 
    });
  }
});

export default router;

