// Migrated from AssistOS legacy - Phase 4.0
// Source: /tmp/assistos-legacy/server/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { getUserById } from '../services/auth.service';
import { getUserRoleInTenant } from '../services/tenant.service';

// Middleware to require authentication
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // CRITICAL: Bypass authentication for health check endpoints
  // Health checks must be unauthenticated for load balancers, K8s probes, monitoring systems
  if (req.baseUrl === '/api/health' || req.path.startsWith('/health')) {
    return next();
  }
  
  // CRITICAL: Bypass authentication for public invitation routes
  // Invitation routes must be accessible before user registration/login
  if (req.baseUrl === '/api/invitations' || req.path.startsWith('/invitations/')) {
    console.log('[requireAuth] Bypassing auth for public invitation route:', req.path);
    return next();
  }
  
  // CRITICAL: Test mode bypass - allow test auth headers to simulate authentication
  if (process.env.NODE_ENV === 'test') {
    const testUserId = req.headers['x-test-user-id'];
    const testTenantId = req.headers['x-test-tenant-id'];
    
    if (testUserId && testTenantId) {
      // Simulate authenticated session for tests
      req.session.userId = testUserId as string;
      req.session.activeTenantId = testTenantId as string;
      (req as any).tenantId = testTenantId;
      (req as any).user = { id: testUserId };
      return next();
    }
  }
  
  console.log('[requireAuth] Session check:', {
    hasSession: !!req.session,
    userId: req.session?.userId,
    activeTenantId: req.session?.activeTenantId,
    sessionID: req.sessionID,
    path: req.path
  });

  if (!req.session.userId) {
    console.log('[requireAuth] NO userId in session - returning 401');
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify user still exists and is active
  const user = await getUserById(req.session.userId);
  if (!user) {
    console.log('[requireAuth] User not found in DB - destroying session');
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'User not found' });
  }

  if (!user.isActive) {
    console.log('[requireAuth] User is inactive - destroying session');
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'Account is disabled' });
  }

  console.log('[requireAuth] SUCCESS - User authenticated:', user.id);
  // Attach user to request for downstream handlers (include activeTenantId from session)
  (req as any).user = { 
    ...user, 
    activeTenantId: req.session.activeTenantId 
  };
  next();
}

// Middleware to require specific role(s) in active tenant
export function requireRole(roles: string | string[]) {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.session.activeTenantId) {
      return res.status(400).json({ error: 'No active organization' });
    }

    const user = await getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.isActive) {
      req.session.destroy(() => {});
      return res.status(403).json({ error: 'Account is disabled' });
    }

    // Get user's role in active tenant
    const userRole = await getUserRoleInTenant(req.session.userId, req.session.activeTenantId);
    
    if (!userRole) {
      return res.status(403).json({ error: 'No access to this organization' });
    }

    if (!roleArray.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: roleArray,
        current: userRole,
      });
    }

    // Attach user and role to request (include activeTenantId from session)
    (req as any).user = { 
      ...user, 
      role: userRole,
      activeTenantId: req.session.activeTenantId 
    };
    (req as any).role = userRole; // Keep for backward compatibility
    next();
  };
}

// Middleware to check if user is admin in active tenant
export function requireAdmin() {
  return requireRole('admin');
}

// Middleware to check if user is admin or config in active tenant
export function requireAdminOrConfig() {
  return requireRole(['admin', 'config']);
}

// Middleware to check if user is a platform administrator
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'User not found' });
  }

  if (!user.isActive) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'Account is disabled' });
  }

  if (!user.isPlatformAdmin) {
    return res.status(403).json({ 
      error: 'Platform administrator access required',
      message: 'This feature is only available to platform administrators',
    });
  }

  // Attach user to request (include activeTenantId from session)
  (req as any).user = { 
    ...user, 
    activeTenantId: req.session.activeTenantId 
  };
  next();
}

// Optional auth - doesn't fail if not authenticated
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return next(); // Continue without auth
  }

  try {
    const user = await getUserById(req.session.userId);
    if (user && user.isActive) {
      (req as any).user = { 
        ...user, 
        activeTenantId: req.session.activeTenantId 
      };
    }
  } catch (error) {
    console.error('[optionalAuth] Error loading user:', error);
  }

  next();
}
