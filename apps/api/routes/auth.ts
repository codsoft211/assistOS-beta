// Migrated from AssistOS legacy - Phase 4.1
// Source: /tmp/assistos-legacy/server/routes/auth.ts

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import passport from '../config/passport';
import * as authService from '../services/auth.service';
import * as tenantService from '../services/tenant.service';
import { requireRole } from '../middleware/auth.middleware';
import { generateUniqueSlug } from '../utils/slug';
import { insertIntoTenantTable } from '../utils/tenant-db-helper';

const router = Router();

// Extend Express Request type to include session
declare module 'express-session' {
  interface SessionData {
    userId: string;
    activeTenantId: string | null;
  }
}

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  password: z.string().min(6),
  organizationName: z.string().trim().min(1).max(100),
});

const registerViaInviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  password: z.string().min(6),
  invitationToken: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /api/auth/register - Create user + auto-create tenant
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if email already exists
    const existingUser = await authService.getUserByEmail(data.email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if this is the first user - make them platform admin
    const { db } = await import('../db');
    const { users: usersTable } = await import('../../../shared/schema');
    const { count } = await import('drizzle-orm');
    const [{ value: userCount }] = await db.select({ value: count() }).from(usersTable);
    
    const isPlatformAdmin = userCount === 0;
    console.log('[Registration] Creating user:', {
      email: data.email,
      userCount,
      isPlatformAdmin,
      reason: isPlatformAdmin ? 'First user - granting platform admin' : 'Not first user',
    });
    
    // Create user
    const user = await authService.createUser({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      password: data.password,
      isPlatformAdmin,
    });

    // Auto-create tenant with organization name
    const companyName = data.organizationName;
    const baseSlug = data.organizationName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const uniqueSlug = await generateUniqueSlug(baseSlug);

    const tenant = await tenantService.createTenant({
      name: companyName,
      slug: uniqueSlug,
      ownerId: user.id,
    });

    // ✅ CONVERT ONBOARDING CACHE TO TENANT DATA
    // NOTE: Default warehouse is NOT created during signup - it's created when Logistica module is activated
    // Look for cached company info from onboarding conversation
    try {
      const { onboardingCache, companyInfo } = await import('../../../shared/schema');
      const { eq, and, isNull } = await import('drizzle-orm');
      
      // Try to find onboarding cache by sessionId OR userId (for both authenticated and unauthenticated flows)
      const { or } = await import('drizzle-orm');
      let cacheEntry = null;
      const sessionId = req.sessionID;
      const userId = user.id;
      
      if (sessionId || userId) {
        const conditions = [];
        if (sessionId) {
          conditions.push(eq(onboardingCache.sessionId, sessionId));
        }
        if (userId) {
          conditions.push(eq(onboardingCache.userId, userId));
        }
        
        const results = await db.select()
          .from(onboardingCache)
          .where(and(
            or(...conditions),
            isNull(onboardingCache.convertedToTenantId)
          ))
          .limit(1);
        cacheEntry = results[0];
      }
      
      // ✅ ENABLED: Convert onboarding cache to company_info
      if (cacheEntry && cacheEntry.companyInfo) {
        console.log('[Registration] ✅ Converting onboarding cache to company_info', {
          cacheId: cacheEntry.id,
          tenantId: tenant.id
        });
        
        // Create company_info from cache data in tenant schema
        const cachedInfo = cacheEntry.companyInfo as any;
        await insertIntoTenantTable(
          tenant.id,
          'company_info',
          {
            tenant_id: tenant.id,
            name: cachedInfo.companyName || companyName,
            brand_name: cachedInfo.companyName || companyName,
            sector: cachedInfo.industry || cachedInfo.sector,
            business_type: cachedInfo.businessType,
            business_description: cachedInfo.notes,
            onboarding_context: {
              businessType: cachedInfo.businessType,
              conversationSummary: cachedInfo.notes,
            },
            created_at: new Date(),
            updated_at: new Date(),
          }
        );
        
        // Mark cache as converted
        await db.update(onboardingCache)
          .set({ 
            convertedToTenantId: tenant.id,
            updatedAt: new Date()
          })
          .where(eq(onboardingCache.id, cacheEntry.id));
        
        console.log('[Registration] ✅ Successfully converted onboarding cache to company_info');
      } else {
        // No cache found - create minimal company_info with organization name in tenant schema
        console.log('[Registration] No onboarding cache found - creating minimal company_info');
        await insertIntoTenantTable(
          tenant.id,
          'company_info',
          {
            tenant_id: tenant.id,
            name: companyName,
            brand_name: companyName,
            created_at: new Date(),
            updated_at: new Date(),
          }
        );
      }
    } catch (conversionError) {
      console.error('[Registration] Error converting onboarding cache:', conversionError);
      // Don't fail registration if cache conversion fails
      // Try to create minimal company_info as fallback
      try {
        const { companyInfo: companyInfoTable } = await import('../../../shared/schema');
        await db.insert(companyInfoTable).values({
          tenantId: tenant.id,
          name: companyName,
          brandName: companyName,
        });
        console.log('[Registration] Created fallback company_info');
      } catch (fallbackError) {
        console.error('[Registration] Failed to create fallback company_info:', fallbackError);
      }
    }

    // Set session
    req.session.userId = user.id;
    req.session.activeTenantId = tenant.id;

    // CRITICAL: Save session before responding
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          role: 'owner',
        },
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/auth/register-via-invite - Register user via invitation (no tenant creation)
router.post('/register-via-invite', async (req: Request, res: Response) => {
  try {
    const data = registerViaInviteSchema.parse(req.body);

    // Check if email already exists
    const existingUser = await authService.getUserByEmail(data.email);
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Email already registered',
        message: 'This email is already registered. Please log in to accept the invitation.'
      });
    }

    // Verify invitation exists and is valid
    const { db } = await import('../db');
    const { tenantInvitations, tenants } = await import('../../../shared/schema');
    const { eq } = await import('drizzle-orm');

    const invitation = await db.query.tenantInvitations.findFirst({
      where: eq(tenantInvitations.token, data.invitationToken),
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Invitation already used',
        status: invitation.status 
      });
    }

    if (new Date() > new Date(invitation.expiresAt)) {
      return res.status(400).json({ 
        error: 'Invitation expired',
        expiredAt: invitation.expiresAt 
      });
    }

    if (invitation.email !== data.email) {
      return res.status(400).json({ 
        error: 'Email mismatch',
        message: 'The email you provided does not match the invitation email.'
      });
    }

    // Create user WITHOUT creating a tenant
    const user = await authService.createUser({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      password: data.password,
      isPlatformAdmin: false,
    });

    console.log('[Registration via Invite] Created user:', {
      userId: user.id,
      email: user.email,
      invitationToken: data.invitationToken,
      tenantId: invitation.tenantId,
    });

    // Now accept the invitation automatically
    const { inviteBillingService } = await import('../services/invite-billing.service');
    const { userTenants, auditLog } = await import('../../../shared/schema');
    const { realtimeEvents } = await import('../services/event-emitter');
    const { REALTIME_CHANNELS } = await import('../../../shared/realtime');

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
      console.log(`[Registration via Invite] Added user ${user.id} to tenant ${invitation.tenantId} in tenant-scoped schema (isPaying: ${usesPayingSeat})`);
    } catch (error: any) {
      console.error('[Registration via Invite] Failed to add user to tenant:', error);
      return res.status(500).json({ 
        error: 'Failed to add user to tenant',
        message: error.message,
        userId: user.id,
      });
    }

    // Process invite acceptance (captures payment, allocates seat, grants credits)
    // This will now update is_paying in the tenant-scoped schema where the user exists
    try {
      await inviteBillingService.processInviteAcceptance(invitation.id, user.id);
    } catch (error: any) {
      console.error('[Registration via Invite] Invite acceptance processing failed:', error);
      // User is created but invitation acceptance failed
      // They can try to accept the invitation again via login
      return res.status(500).json({ 
        error: 'Failed to process invitation',
        message: error.message,
        userId: user.id,
      });
    }

    // Get tenant info for response
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, invitation.tenantId),
    });

    // Log audit event
    await db.insert(auditLog).values({
      tenantId: invitation.tenantId,
      actorUserId: user.id,
      action: 'team.invite_accepted_via_registration',
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

    // Set session
    req.session.userId = user.id;
    req.session.activeTenantId = invitation.tenantId;

    // CRITICAL: Save session before responding
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
        },
        tenant: {
          id: tenant?.id,
          name: tenant?.name,
          slug: tenant?.slug,
          role: invitation.role,
        },
        message: 'Registration successful and invitation accepted',
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Registration via invite error:', error);
    res.status(500).json({ error: 'Failed to register user via invitation' });
  }
});

// POST /api/auth/login - Email + Password login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await authService.authenticateUser(email, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get user's tenants
    const userTenants = await tenantService.getUserTenants(user.id);

    if (userTenants.length === 0) {
      return res.status(403).json({ error: 'No organization access' });
    }

    // Set session with first tenant as active
    req.session.userId = user.id;
    req.session.activeTenantId = userTenants[0].id;

    console.log('[Login] BEFORE save - Session data:', {
      userId: req.session.userId,
      activeTenantId: req.session.activeTenantId,
      sessionID: req.sessionID
    });

    // CRITICAL: Save session before responding to ensure it's persisted to database
    // Without this, the response may be sent before session is saved, causing 401 errors
    req.session.save((err) => {
      if (err) {
        console.error('[Login] Session save ERROR:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }

      console.log('[Login] AFTER save SUCCESS - Session data:', {
        userId: req.session.userId,
        activeTenantId: req.session.activeTenantId,
        sessionID: req.sessionID
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          lastLogin: user.lastLogin,
        },
        tenants: userTenants,
        activeTenant: {
          id: userTenants[0].id,
          name: userTenants[0].name,
          slug: userTenants[0].slug,
          role: userTenants[0].role,
        },
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof Error && error.message === 'User account is disabled') {
      return res.status(403).json({ error: 'Account is disabled' });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    
    // Clear cookie for both domain configurations (old and new)
    // This ensures logout works regardless of which cookie configuration was used
    const isReplit = !!process.env.REPL_ID || !!process.env.REPL_SLUG;
    const cookieDomain = process.env.SESSION_COOKIE_DOMAIN || (isReplit ? '.riker.replit.dev' : undefined);
    
    // Clear cookie with domain (new configuration)
    if (cookieDomain) {
      res.clearCookie('connect.sid', {
        domain: cookieDomain,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'none'
      });
    }
    
    // Also clear cookie without domain (old configuration - fallback)
    res.clearCookie('connect.sid', {
      path: '/',
    });
    
    res.json({ message: 'Logged out successfully' });
  });
});

// GET /api/auth/me - Get current session info
router.get('/me', async (req: Request, res: Response) => {
  // Disable all caching for this endpoint to ensure environment changes are immediately visible
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await authService.getUserById(req.session.userId);
    
    if (!user || !user.isActive) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Get user's tenants
    const userTenants = await tenantService.getUserTenants(user.id);

    console.log('[Auth API] GET /me - User tenants:', {
      userId: user.id,
      userTenantsCount: userTenants.length,
      userTenants: userTenants.map(t => ({ id: t.id, name: t.name, role: t.role })),
      sessionActiveTenantId: req.session.activeTenantId,
    });

    // Get active tenant info
    let activeTenant: typeof userTenants[0] | null = null;
    if (req.session.activeTenantId) {
      activeTenant = userTenants.find(t => t.id === req.session.activeTenantId) || null;
    }

    // Fallback to first tenant if active tenant not found
    if (!activeTenant && userTenants.length > 0) {
      activeTenant = userTenants[0];
      req.session.activeTenantId = activeTenant.id;
      
      console.log('[Auth API] GET /me - Using fallback tenant:', {
        activeTenantId: activeTenant.id,
        activeTenantName: activeTenant.name,
        activeTenantRole: activeTenant.role,
      });
      
      // CRITICAL: Save session if we changed it
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Failed to save session' });
        }

        const response = {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            avatar: user.avatar,
            isPlatformAdmin: user.isPlatformAdmin,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt,
          },
          tenants: userTenants,
          activeTenant,
        };

        console.log('[Auth API] GET /me - Response (with session save):', {
          activeTenant: activeTenant ? {
            id: activeTenant.id,
            name: activeTenant.name,
            role: activeTenant.role,
          } : null,
        });

        res.json(response);
      });
    } else {
      // No session change, safe to respond immediately
      const response = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          isPlatformAdmin: user.isPlatformAdmin,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
        tenants: userTenants,
        activeTenant,
      };

      console.log('[Auth API] GET /me - Response (no session change):', {
        activeTenant: activeTenant ? {
          id: activeTenant.id,
          name: activeTenant.name,
          role: activeTenant.role,
        } : null,
      });

      res.json(response);
    }
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// POST /api/auth/switch-tenant - Switch active tenant
router.post('/switch-tenant', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { tenantId } = z.object({ tenantId: z.string() }).parse(req.body);

    // Verify user has access to this tenant
    // ✅ UPDATED: Check if user has access in ANY environment (sandbox or production)
    const role = await tenantService.getUserRoleInTenant(req.session.userId, tenantId);
    if (!role) {
      return res.status(403).json({ error: 'No access to this organization' });
    }

    // Update session
    req.session.activeTenantId = tenantId;

    // CRITICAL: Save session before responding
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }

      tenantService.getTenantById(tenantId).then(tenant => {
        res.json({
          id: tenant!.id,
          name: tenant!.name,
          slug: tenant!.slug,
          role,
        });
      }).catch(error => {
        console.error('Get tenant error:', error);
        res.status(500).json({ error: 'Failed to get tenant' });
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data' });
    }
    console.error('Switch tenant error:', error);
    res.status(500).json({ error: 'Failed to switch organization' });
  }
});

// Google OAuth Routes
// GET /api/auth/google - Start Google OAuth flow
router.get('/google', passport.authenticate('google'));

// GET /api/auth/google/callback - Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login?error=oauth_failed',
    session: false,
  }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      
      if (!user || !user.id) {
        return res.redirect('/login?error=no_user');
      }

      // Get user's tenants
      const userTenants = await tenantService.getUserTenants(user.id);

      if (userTenants.length === 0) {
        return res.redirect('/login?error=no_organization');
      }

      // Set session
      req.session.userId = user.id;
      req.session.activeTenantId = userTenants[0].id;

      // Save session and redirect
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('/login?error=session_failed');
        }
        res.redirect('/');
      });
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/login?error=callback_failed');
    }
  }
);

export default router;
