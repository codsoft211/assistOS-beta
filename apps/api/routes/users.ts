// Migrated from AssistOS legacy - Phase 4.1
// Source: /tmp/assistos-legacy/server/routes/users.ts

import { Router, Request, Response } from "express";
import { db } from "../db";
import { users, userTenants, tenantInvitations, auditLog, tenantSubscriptions, subscriptionPlans, type UserPreferences } from "../../../shared/schema";
import { eq, and, count } from "drizzle-orm";
import { getUserPermissions, canManageUsers } from "../permissions";
import crypto from "crypto";
import { realtimeEvents } from "../services/event-emitter";
import { REALTIME_CHANNELS } from "../../../shared/realtime";
import { seatTrackingService } from "../../../packages/services/seat-tracking";
import { creditLifecycleService } from "../../../packages/services/credit-lifecycle";

// Normalize legacy preferences to new schema (maps old fields → new structure)
function normalizeLegacyPreferences(prefs: Partial<UserPreferences>): Partial<UserPreferences> {
  const normalized: Partial<UserPreferences> = { ...prefs };
  
  // If notifications exist, normalize legacy fields
  if (normalized.notifications && typeof normalized.notifications === 'object') {
    const notif = normalized.notifications as any;
    
    // Ensure channels object exists
    if (!notif.channels) {
      notif.channels = {};
    }
    
    // Map legacy top-level fields → channels
    if ('email' in notif && typeof notif.email === 'boolean') {
      notif.channels.email = notif.email;
      delete notif.email; // Remove legacy field
    }
    if ('push' in notif && typeof notif.push === 'boolean') {
      notif.channels.push = notif.push;
      delete notif.push;
    }
    if ('slack' in notif && typeof notif.slack === 'boolean') {
      notif.channels.slack = notif.slack;
      delete notif.slack;
    }
    if ('whatsapp' in notif && typeof notif.whatsapp === 'boolean') {
      notif.channels.whatsapp = notif.whatsapp;
      delete notif.whatsapp;
    }
    
    // Ensure events object exists
    if (!notif.events) {
      notif.events = {};
    }
    
    // Update normalized.notifications reference
    normalized.notifications = notif;
  }
  
  // Normalize old 'emailNotifications' → notifications.channels.email
  if ('emailNotifications' in normalized && typeof normalized.emailNotifications === 'boolean') {
    if (!normalized.notifications) {
      normalized.notifications = { 
        channels: { email: true, push: false, slack: false, whatsapp: false }, 
        events: {} 
      } as any;
    }
    const notif = normalized.notifications as any;
    if (!notif.channels) {
      notif.channels = { email: true, push: false, slack: false, whatsapp: false };
    }
    notif.channels.email = normalized.emailNotifications;
    delete normalized.emailNotifications;
    normalized.notifications = notif;
  }
  
  // Normalize old 'desktopNotifications' → notifications.channels.push
  if ('desktopNotifications' in normalized && typeof normalized.desktopNotifications === 'boolean') {
    if (!normalized.notifications) {
      normalized.notifications = { 
        channels: { email: true, push: false, slack: false, whatsapp: false }, 
        events: {} 
      } as any;
    }
    const notif = normalized.notifications as any;
    if (!notif.channels) {
      notif.channels = { email: true, push: false, slack: false, whatsapp: false };
    }
    notif.channels.push = normalized.desktopNotifications;
    delete normalized.desktopNotifications;
    normalized.notifications = notif;
  }
  
  return normalized;
}

// Deep merge helper for nested preferences (preserves nested defaults)
function deepMergePreferences(defaults: UserPreferences, userPrefs: Partial<UserPreferences>): UserPreferences {
  const merged = { ...defaults };
  
  for (const key in userPrefs) {
    const value = userPrefs[key as keyof UserPreferences];
    
    // Deep merge for nested objects (notifications)
    if (key === 'notifications' && value && typeof value === 'object' && !Array.isArray(value)) {
      merged.notifications = {
        channels: {
          ...(defaults.notifications?.channels || {}),
          ...(value.channels || {})
        },
        events: {
          ...(defaults.notifications?.events || {}),
          ...(value.events || {})
        }
      };
    } else {
      // Shallow copy for primitives and arrays
      (merged as any)[key] = value;
    }
  }
  
  return merged;
}

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const permissions = await getUserPermissions(userId, tenantId);
    if (!permissions || !canManageUsers(permissions.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const tenantUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        avatar: users.avatar,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        role: userTenants.role,
        activeEnvironment: userTenants.activeEnvironment,
        joinedAt: userTenants.joinedAt,
      })
      .from(users)
      .innerJoin(userTenants, eq(users.id, userTenants.userId))
      .where(eq(userTenants.tenantId, tenantId));

    res.json(tenantUsers);
  } catch (error: any) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/invite", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const permissions = await getUserPermissions(userId, tenantId);
    if (!permissions || !canManageUsers(permissions.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { email, role, firstName, lastName } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: "Email and role are required" });
    }

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      const existingUserTenant = await db.query.userTenants.findFirst({
        where: and(
          eq(userTenants.userId, existingUser.id),
          eq(userTenants.tenantId, tenantId)
        ),
      });

      if (existingUserTenant) {
        return res.status(400).json({ error: "User already exists in this tenant" });
      }
    }

    const existingInvite = await db.query.tenantInvitations.findFirst({
      where: and(
        eq(tenantInvitations.email, email),
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, "pending")
      ),
    });

    if (existingInvite) {
      return res.status(400).json({ error: "Invitation already sent to this email" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [invitation] = await db
      .insert(tenantInvitations)
      .values({
        tenantId,
        email,
        role,
        token,
        createdBy: userId,
        expiresAt,
        status: "pending",
      })
      .returning();

    await db.insert(auditLog).values({
      tenantId,
      actorUserId: userId,
      action: "user_invited",
      metadata: { email, role, firstName, lastName },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({
      success: true,
      inviteId: invitation.id,
      token: invitation.token,
    });
  } catch (error: any) {
    console.error("Error inviting user:", error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy invite acceptance route disabled; use POST /api/invitations/accept instead.
/*router.post("/accept-invite", async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const invitation = await db.query.tenantInvitations.findFirst({
      where: eq(tenantInvitations.token, token),
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invalid invitation token" });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({ error: "Invitation already used or expired" });
    }

    if (new Date() > invitation.expiresAt) {
      await db
        .update(tenantInvitations)
        .set({ status: "expired" })
        .where(eq(tenantInvitations.id, invitation.id));

      return res.status(400).json({ error: "Invitation has expired" });
    }

    let user = await db.query.users.findFirst({
      where: eq(users.email, invitation.email),
    });

    if (!user) {
      return res.status(400).json({ 
        error: "Please create an account first before accepting the invitation",
        email: invitation.email 
      });
    }

    const existingUserTenant = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, user.id),
        eq(userTenants.tenantId, invitation.tenantId)
      ),
    });

    if (existingUserTenant) {
      return res.status(400).json({ error: "User already belongs to this tenant" });
    }

    // Get current subscription to determine seat policy
    const [subscription] = await db
      .select({
        id: tenantSubscriptions.id,
        subscriptionPlanId: tenantSubscriptions.subscriptionPlanId,
        plan: {
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          payingUsersIncluded: subscriptionPlans.payingUsersIncluded,
          freeUsersIncluded: subscriptionPlans.freeUsersIncluded,
          creditsIncluded: subscriptionPlans.creditsIncluded,
          isEnterprise: subscriptionPlans.isEnterprise,
        },
      })
      .from(tenantSubscriptions)
      .innerJoin(
        subscriptionPlans,
        eq(tenantSubscriptions.subscriptionPlanId, subscriptionPlans.id)
      )
      .where(
        and(
          eq(tenantSubscriptions.tenantId, invitation.tenantId),
          eq(tenantSubscriptions.status, 'active')
        )
      )
      .limit(1);

    // Determine if user should be paying based on seat policy
    let shouldBePaying = false;
    if (subscription) {
      const plan = subscription.plan;
      
      if (plan.name === 'Base') {
        // Base: All users are paying
        shouldBePaying = true;
      } else if (plan.name === 'Pro' || plan.name === 'Ultra') {
        // Pro/Ultra: Check if free seats are available
        const seatCount = await seatTrackingService.getCurrentSeatCount(invitation.tenantId, 'production');
        const freeSeatsUsed = seatCount.freeSeats;
        const freeSeatsLimit = plan.freeUsersIncluded || 0;
        
        // If free seats are available, user is free; otherwise paying
        shouldBePaying = freeSeatsUsed >= freeSeatsLimit;
      } else if (plan.isEnterprise) {
        // Enterprise: Negotiated - default to free, can be changed manually
        shouldBePaying = false;
      }
    }

    // Create user_tenants record
    await db.insert(userTenants).values({
      userId: user.id,
      tenantId: invitation.tenantId,
      role: invitation.role,
      invitedBy: invitation.createdBy,
      isPaying: shouldBePaying,
      environment: 'production',
    });

    // If user is paying, add credits based on plan's credits per user
    if (shouldBePaying && subscription) {
      const creditsPerUser = subscription.plan.creditsIncluded || 0;
      if (creditsPerUser > 0) {
        try {
          await creditLifecycleService.addCreditsForPayingUser({
            tenantId: invitation.tenantId,
            subscriptionId: subscription.id,
            creditsPerUser,
            reason: `Credits added for new paying user on ${subscription.plan.name} plan`,
            createdBy: invitation.createdBy,
          });
        } catch (creditError) {
          console.error("[Accept Invite] Error adding credits for paying user:", creditError);
          // Don't fail the invitation if credit addition fails
        }
      }
    }

    await db.insert(auditLog).values({
      tenantId: invitation.tenantId,
      actorUserId: user.id,
      targetUserId: user.id,
      action: "invite_accepted",
      metadata: {
        invitationId: invitation.id,
        role: invitation.role,
        invitedBy: invitation.createdBy,
        isPaying: shouldBePaying,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    await db
      .update(tenantInvitations)
      .set({ status: "accepted" })
      .where(eq(tenantInvitations.id, invitation.id));

    res.json({
      success: true,
      tenantId: invitation.tenantId,
      role: invitation.role,
      isPaying: shouldBePaying,
    });
  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ error: error.message });
  }
});*/

router.patch("/:userId/role", async (req: Request, res: Response) => {
  try {
    const actorUserId = req.session.userId;
    const tenantId = req.session.activeTenantId;
    const { userId } = req.params;
    const { role } = req.body;

    if (!actorUserId || !tenantId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const permissions = await getUserPermissions(actorUserId, tenantId);
    if (!permissions || !canManageUsers(permissions.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (!role) {
      return res.status(400).json({ error: "Role is required" });
    }

    const targetUserTenant = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId)
      ),
    });

    if (!targetUserTenant) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }

    const oldRole = targetUserTenant.role;

    if (actorUserId === userId && oldRole === "owner") {
      const [ownerCountResult] = await db
        .select({ count: count() })
        .from(userTenants)
        .where(
          and(
            eq(userTenants.tenantId, tenantId),
            eq(userTenants.role, "owner")
          )
        );

      if (ownerCountResult.count <= 1) {
        return res.status(400).json({ 
          error: "Cannot demote yourself. You are the only owner of this tenant" 
        });
      }
    }

    if (oldRole === "owner" && role !== "owner") {
      const [ownerCountResult] = await db
        .select({ count: count() })
        .from(userTenants)
        .where(
          and(
            eq(userTenants.tenantId, tenantId),
            eq(userTenants.role, "owner")
          )
        );

      if (ownerCountResult.count <= 1) {
        return res.status(400).json({ 
          error: "Cannot remove the last owner from the tenant" 
        });
      }
    }

    await db
      .update(userTenants)
      .set({ role })
      .where(
        and(
          eq(userTenants.userId, userId),
          eq(userTenants.tenantId, tenantId)
        )
      );

    await db.insert(auditLog).values({
      tenantId,
      actorUserId,
      targetUserId: userId,
      action: "role_changed",
      metadata: { oldRole, newRole: role },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error changing user role:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:userId/status", async (req: Request, res: Response) => {
  try {
    const actorUserId = req.session.userId;
    const tenantId = req.session.activeTenantId;
    const { userId } = req.params;
    const { isActive } = req.body;

    if (!actorUserId || !tenantId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const permissions = await getUserPermissions(actorUserId, tenantId);
    if (!permissions || !canManageUsers(permissions.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive must be a boolean" });
    }

    const targetUserTenant = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId)
      ),
    });

    if (!targetUserTenant) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }

    await db
      .update(users)
      .set({ isActive })
      .where(eq(users.id, userId));

    await db.insert(auditLog).values({
      tenantId,
      actorUserId,
      targetUserId: userId,
      action: "user_status_changed",
      metadata: { isActive },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error changing user status:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:userId", async (req: Request, res: Response) => {
  try {
    const actorUserId = req.session.userId;
    const tenantId = req.session.activeTenantId;
    const { userId } = req.params;

    if (!actorUserId || !tenantId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const permissions = await getUserPermissions(actorUserId, tenantId);
    if (!permissions || !canManageUsers(permissions.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (actorUserId === userId) {
      return res.status(400).json({ error: "Cannot remove yourself from the tenant" });
    }

    const targetUserTenant = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId)
      ),
    });

    if (!targetUserTenant) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }

    if (targetUserTenant.role === "owner") {
      const [ownerCountResult] = await db
        .select({ count: count() })
        .from(userTenants)
        .where(
          and(
            eq(userTenants.tenantId, tenantId),
            eq(userTenants.role, "owner")
          )
        );

      if (ownerCountResult.count <= 1) {
        return res.status(400).json({ 
          error: "Cannot remove the last owner from the tenant" 
        });
      }
    }

    // CRITICAL: Check if user has other tenants before removing
    // If this is their only tenant, auto-create a personal tenant to prevent account lockout
    const userAllTenants = await db
      .select()
      .from(userTenants)
      .where(eq(userTenants.userId, userId));

    const willBeOrphaned = userAllTenants.length === 1; // Only has this tenant
    let personalTenantCreated = false;
    let personalTenantId: string | null = null;

    if (willBeOrphaned) {
      console.log(`[User Removal] User ${userId} will be orphaned. Creating personal tenant...`);
      
      try {
        // Get user info for tenant creation
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
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
          ownerId: userId,
        });

        personalTenantId = personalTenant.id;
        personalTenantCreated = true;

        console.log(`[User Removal] ✅ Created personal tenant for user ${userId}:`, {
          tenantId: personalTenant.id,
          tenantName: personalTenant.name,
          slug: personalTenant.slug,
        });

        // Log audit event for personal tenant creation
        await db.insert(auditLog).values({
          tenantId: personalTenant.id,
          actorUserId: userId,
          targetUserId: userId,
          action: "tenant_auto_created_on_removal",
          metadata: { 
            reason: "User removed from last tenant",
            originalTenantId: tenantId,
            removedBy: actorUserId,
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });
      } catch (error: any) {
        console.error(`[User Removal] Failed to create personal tenant for user ${userId}:`, error);
        return res.status(500).json({ 
          error: "Cannot remove user: Failed to create personal tenant",
          details: error.message 
        });
      }
    }

    // Now safe to remove user from current tenant
    await db
      .delete(userTenants)
      .where(
        and(
          eq(userTenants.userId, userId),
          eq(userTenants.tenantId, tenantId)
        )
      );

    await db.insert(auditLog).values({
      tenantId,
      actorUserId,
      targetUserId: userId,
      action: "user_removed",
      metadata: { 
        role: targetUserTenant.role,
        personalTenantCreated,
        personalTenantId,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ 
      success: true,
      personalTenantCreated,
      message: personalTenantCreated 
        ? "User removed and personal organization created for them"
        : "User removed successfully"
    });
  } catch (error: any) {
    console.error("Error removing user:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/me/preferences - Get current user's preferences (preferred endpoint)
router.get("/me/preferences", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Normalize legacy preferences, then deep merge with defaults
    const rawPrefs: Partial<UserPreferences> = user.preferences || {};
    const userPrefs = normalizeLegacyPreferences(rawPrefs);
    const defaultPreferences: UserPreferences = {
      autoAlerts: true,
      // emailNotifications/desktopNotifications removed - use notifications.channels instead
      hiddenModules: [],
      sidebarCollapsed: false,
      favoriteModules: [],
      theme: "system",
      language: "pt-PT", // IETF language tag
      aiTone: "formal", // Default AI tone
      notifications: {
        channels: {
          email: true,
          push: false,
          slack: false,
          whatsapp: false,
        },
        events: {},
      },
      defaultView: "list",
      itemsPerPage: 20,
      chatSoundEnabled: false,
      showTypingIndicator: true,
      dashboardWidgets: [],
    };

    const mergedPreferences = deepMergePreferences(defaultPreferences, userPrefs);
    res.json(mergedPreferences);
  } catch (error: any) {
    console.error("Error fetching user preferences:", error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/users/me/preferences - Update current user's preferences (preferred endpoint)
router.patch("/me/preferences", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: "Preferences object is required" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Normalize legacy prefs, then deep merge with defaults, then apply incoming changes
    const rawCurrentPrefs: Partial<UserPreferences> = user.preferences || {};
    const currentPrefs = normalizeLegacyPreferences(rawCurrentPrefs);
    const normalizedIncoming = normalizeLegacyPreferences(preferences);
    const defaultPreferences: UserPreferences = {
      autoAlerts: true,
      emailNotifications: true,
      desktopNotifications: false,
      hiddenModules: [],
      sidebarCollapsed: false,
      favoriteModules: [],
      theme: "system",
      language: "pt-PT",
      aiTone: "formal",
      notifications: {
        channels: { email: true, push: false, slack: false, whatsapp: false },
        events: {},
      },
      defaultView: "list",
      itemsPerPage: 20,
      chatSoundEnabled: false,
      showTypingIndicator: true,
      dashboardWidgets: [],
    };
    
    // Two-stage deep merge: (current + defaults) → (base + incoming)
    const basePrefs = deepMergePreferences(defaultPreferences, currentPrefs);
    const updatedPrefs = deepMergePreferences(basePrefs, normalizedIncoming);

    await db.update(users)
      .set({ 
        preferences: updatedPrefs,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    // Log preference change
    const tenantId = req.session.activeTenantId;
    if (tenantId) {
      await db.insert(auditLog).values({
        tenantId,
        actorUserId: userId,
        targetUserId: userId,
        action: "preferences_updated",
        metadata: { updatedFields: Object.keys(preferences) },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Emit SSE event for real-time preference updates (Phase 4.3)
      try {
        realtimeEvents.emitForTenant(REALTIME_CHANNELS.SETTINGS_USER_PREFERENCES_UPDATED, tenantId, {
          userId,
          tenantId,
          preferences: updatedPrefs,
        });
      } catch (error) {
        console.error("Failed to emit SSE event for preferences update:", error);
        // Continue - don't fail HTTP request
      }
    }

    res.json({
      success: true,
      preferences: updatedPrefs
    });
  } catch (error: any) {
    console.error("Error updating user preferences:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:userId/preferences - Get user preferences (DEPRECATED - use /me/preferences)
router.get("/:userId/preferences", async (req, res) => {
  try {
    const { userId } = req.params;
    const sessionUserId = req.session.userId;

    // Users can only access their own preferences
    if (!sessionUserId || sessionUserId !== userId) {
      return res.status(403).json({ error: "You can only access your own preferences" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return full preferences object with defaults
    const preferences: UserPreferences = user.preferences || {};
    const defaultPreferences: UserPreferences = {
      autoAlerts: true,
      // emailNotifications/desktopNotifications removed - use notifications.channels instead
      hiddenModules: [],
      sidebarCollapsed: false,
      favoriteModules: [],
      theme: "system",
      language: "pt-PT", // IETF language tag
      aiTone: "formal", // Default AI tone
      notifications: {
        channels: {
          email: true,
          push: false,
          slack: false,
          whatsapp: false,
        },
        events: {},
      },
      defaultView: "list",
      itemsPerPage: 20,
      chatSoundEnabled: false,
      showTypingIndicator: true,
      dashboardWidgets: [],
    };

    res.json({ ...defaultPreferences, ...preferences });
  } catch (error: any) {
    console.error("Error fetching user preferences:", error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/users/:userId/preferences - Update user preferences
router.patch("/:userId/preferences", async (req, res) => {
  try {
    const { userId } = req.params;
    const { preferences } = req.body;
    const sessionUserId = req.session.userId;

    // Users can only update their own preferences
    if (!sessionUserId || sessionUserId !== userId) {
      return res.status(403).json({ error: "You can only update your own preferences" });
    }

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: "Preferences object is required" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Merge with existing preferences (partial update)
    const currentPrefs: UserPreferences = user.preferences || {};
    const updatedPrefs: UserPreferences = { ...currentPrefs, ...preferences };

    await db.update(users)
      .set({ 
        preferences: updatedPrefs,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    // Log preference change
    const tenantId = req.session.activeTenantId;
    if (tenantId) {
      await db.insert(auditLog).values({
        tenantId,
        actorUserId: userId,
        targetUserId: userId,
        action: "preferences_updated",
        metadata: { updatedFields: Object.keys(preferences) },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    res.json({
      success: true,
      preferences: updatedPrefs
    });
  } catch (error: any) {
    console.error("Error updating user preferences:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SELF-SERVICE IDENTITY ENDPOINTS (Settings Page) ====================

// GET /api/users/me - Get current user's basic identity
router.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return basic identity only (not full preferences)
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      isActive: user.isActive,
      isPlatformAdmin: user.isPlatformAdmin,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    });
  } catch (error: any) {
    console.error("Error fetching current user:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/me - Update current user's basic identity
router.put("/me", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { firstName, lastName, avatar } = req.body;

    if (!firstName && !lastName && !avatar) {
      return res.status(400).json({ error: "At least one field (firstName, lastName, avatar) is required" });
    }

    const updateData: any = { updatedAt: new Date() };
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (avatar !== undefined) updateData.avatar = avatar; // Allow null to remove avatar

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    // Log identity update
    const tenantId = req.session.activeTenantId;
    if (tenantId) {
      await db.insert(auditLog).values({
        tenantId,
        actorUserId: userId,
        targetUserId: userId,
        action: "identity_updated",
        metadata: { updatedFields: Object.keys(updateData).filter(k => k !== 'updatedAt') },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error updating current user:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/me/profile - Get extended profile (bio, jobTitle, phone, location)
router.get("/me/profile", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      bio: user.bio,
      jobTitle: user.jobTitle,
      phone: user.phone,
      location: user.location,
    });
  } catch (error: any) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/me/profile - Update unified profile (basic + extended fields)
router.put("/me/profile", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { firstName, lastName, bio, jobTitle, phone, location } = req.body;

    if (!firstName && !lastName && !bio && !jobTitle && !phone && !location) {
      return res.status(400).json({ error: "At least one profile field is required" });
    }

    const updateData: any = { updatedAt: new Date() };
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (bio !== undefined) updateData.bio = bio; // Allow null
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    // Log profile update
    const tenantId = req.session.activeTenantId;
    if (tenantId) {
      await db.insert(auditLog).values({
        tenantId,
        actorUserId: userId,
        targetUserId: userId,
        action: "profile_updated",
        metadata: { updatedFields: Object.keys(updateData).filter(k => k !== 'updatedAt') },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    // Fetch updated user data
    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    res.json({ 
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        bio: updatedUser.bio,
        jobTitle: updatedUser.jobTitle,
        phone: updatedUser.phone,
        location: updatedUser.location,
        avatar: updatedUser.avatar,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (error: any) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/preferences - Get user preferences
router.get("/preferences", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Default preferences structure matching frontend schema
    const defaultPreferences: UserPreferences = {
      theme: 'system',
      language: 'pt-PT',
      aiTone: 'formal',
      notifications: {
        channels: {
          email: true,
          push: false,
          slack: false,
          whatsapp: false,
        },
        events: {
          emailReceived: true,
          teamMemberJoined: true,
          taskAssigned: true,
          systemUpdates: false,
        },
      },
    };

    // Deep merge user preferences with defaults
    const userPrefs = user.preferences || {};
    const normalizedPrefs = normalizeLegacyPreferences(userPrefs);
    const mergedPreferences = deepMergePreferences(defaultPreferences, normalizedPrefs);

    res.json(mergedPreferences);
  } catch (error: any) {
    console.error("Error fetching user preferences:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT/PATCH /api/users/preferences - Update user preferences (deep merge)
// Accept both PUT and PATCH for frontend compatibility
const updatePreferencesHandler = async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const updates = req.body;

    // Fetch current user
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Deep merge current preferences with updates
    const currentPrefs = user.preferences || {};
    const normalizedCurrent = normalizeLegacyPreferences(currentPrefs);
    const normalizedUpdates = normalizeLegacyPreferences(updates);
    
    // Merge: preserve existing nested values not in updates
    const mergedPreferences: UserPreferences = {
      ...normalizedCurrent,
      ...normalizedUpdates,
    };

    // Deep merge notifications if both exist
    if (normalizedCurrent.notifications && normalizedUpdates.notifications) {
      mergedPreferences.notifications = {
        channels: {
          ...(normalizedCurrent.notifications.channels || {}),
          ...(normalizedUpdates.notifications.channels || {}),
        },
        events: {
          ...(normalizedCurrent.notifications.events || {}),
          ...(normalizedUpdates.notifications.events || {}),
        },
      };
    }

    // Update database
    await db
      .update(users)
      .set({
        preferences: mergedPreferences,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Emit SSE event for real-time sync (Settings page real-time update)
    try {
      const tenantId = req.session.activeTenantId;
      if (tenantId) {
        realtimeEvents.emitForTenant(REALTIME_CHANNELS.SETTINGS_USER_PREFERENCES_UPDATED, tenantId, {
          userId,
          tenantId,
          preferences: mergedPreferences,
        });
      }
    } catch (error) {
      console.error("Failed to emit SSE event for preferences update:", error);
      // Continue - don't fail HTTP request
    }

    res.json({
      success: true,
      preferences: mergedPreferences,
    });
  } catch (error: any) {
    console.error("Error updating user preferences:", error);
    res.status(500).json({ error: error.message });
  }
};

// Register both PUT and PATCH for frontend compatibility
router.put("/preferences", updatePreferencesHandler);
router.patch("/preferences", updatePreferencesHandler);

export default router;
