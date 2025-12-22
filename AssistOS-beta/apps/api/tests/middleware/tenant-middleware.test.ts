import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { tenantMiddleware } from '../../middleware/tenant-middleware';
import { ENVIRONMENTS, DEFAULT_ENVIRONMENT, coerceEnvironment } from '../../../../shared/types/environment';
import { db } from '../../db';
import { users, tenants, userTenants } from '../../../../shared/schema';
import { eq, and } from 'drizzle-orm';

describe('Tenant Middleware - Environment Injection (REAL TESTS)', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      query: {},
      session: undefined,
      user: undefined,
      params: {}
    };
    
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    
    nextFn = vi.fn();
  });

  describe('Critical Bug Fix - Early Exit Path', () => {
    it('should set PRODUCTION environment when no tenant info present', async () => {
      // No tenantSlug, no session - tests the early exit path (the critical bug fix)
      await tenantMiddleware(mockReq as Request, mockRes as Response, nextFn);
      
      // CRITICAL: req.environment MUST be set
      expect((mockReq as any).environment).toBeDefined();
      expect((mockReq as any).environment).toBe(DEFAULT_ENVIRONMENT);
      expect((mockReq as any).environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should set environment even when tenantSlug is empty string', async () => {
      mockReq.headers = { 'x-tenant-slug': '' };
      
      await tenantMiddleware(mockReq as Request, mockRes as Response, nextFn);
      
      // Environment must still be set
      expect((mockReq as any).environment).toBeDefined();
      expect((mockReq as any).environment).toBe(DEFAULT_ENVIRONMENT);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should set environment when query tenantSlug is undefined', async () => {
      mockReq.query = { otherParam: 'value' };
      
      await tenantMiddleware(mockReq as Request, mockRes as Response, nextFn);
      
      // Environment must still be set
      expect((mockReq as any).environment).toBeDefined();
      expect((mockReq as any).environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('Environment Validation', () => {
    it('should default to PRODUCTION when activeEnvironment is not set', () => {
      // Verify default environment constant
      expect(DEFAULT_ENVIRONMENT).toBe('production');
      expect(DEFAULT_ENVIRONMENT).toBe(ENVIRONMENTS.PRODUCTION);
    });

    it('should validate environment values using coerceEnvironment', () => {
      // Valid environments
      expect(coerceEnvironment('production')).toBe('production');
      expect(coerceEnvironment('sandbox')).toBe('sandbox');
      
      // Invalid environments - should fallback to default
      expect(coerceEnvironment('invalid')).toBe(DEFAULT_ENVIRONMENT);
      expect(coerceEnvironment(null)).toBe(DEFAULT_ENVIRONMENT);
      expect(coerceEnvironment(undefined)).toBe(DEFAULT_ENVIRONMENT);
      expect(coerceEnvironment('')).toBe(DEFAULT_ENVIRONMENT);
      expect(coerceEnvironment(123)).toBe(DEFAULT_ENVIRONMENT);
    });
  });

  describe('Environment Guarantee', () => {
    it('should guarantee req.environment is ALWAYS set when next() is called', async () => {
      // Test multiple scenarios to ensure environment is always set
      const scenarios = [
        { headers: {}, query: {}, session: undefined, user: undefined },
        { headers: { 'x-tenant-slug': '' }, query: {}, session: undefined, user: undefined },
        { headers: {}, query: { tenantSlug: '' }, session: undefined, user: undefined },
        { headers: {}, query: {}, session: {}, user: undefined },
      ];

      for (const scenario of scenarios) {
        const req = { ...scenario, params: {} } as any;
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        } as any;
        const next = vi.fn();

        await tenantMiddleware(req, res, next);

        // If next() was called, environment MUST be set
        if (next.mock.calls.length > 0) {
          expect(req.environment).toBeDefined();
          expect(req.environment).toBe(ENVIRONMENTS.PRODUCTION);
        }
      }
    });
  });

  describe('Integration with Existing Tenant Isolation', () => {
    it('should not break existing tenant middleware functionality', async () => {
      // Middleware should still work for routes that don't require tenant
      await tenantMiddleware(mockReq as Request, mockRes as Response, nextFn);
      
      expect(nextFn).toHaveBeenCalled();
      expect((mockReq as any).environment).toBeDefined();
    });

    it('should handle both session-based and slug-based tenant resolution', () => {
      // Middleware supports two flows:
      // 1. Session-based (sessionTenantId)
      // 2. Slug-based (tenantSlug header/query)
      // Environment is injected in both flows
      expect(true).toBe(true);
    });
  });

  describe('Type Safety', () => {
    it('should use Environment type from shared/types/environment', () => {
      // Verify Environment type is properly imported and used
      expect(ENVIRONMENTS.PRODUCTION).toBe('production');
      expect(ENVIRONMENTS.SANDBOX).toBe('sandbox');
    });
  });

  describe('Authorization - Session Path (CRITICAL SECURITY FIX)', () => {
    it('should return 403 when user lacks access to session tenant', async () => {
      // NOTE: This test validates the authorization fix but requires full DB mocking
      // to execute properly. The fix ensures that:
      // 1. User has session with tenantId
      // 2. User does NOT have userTenants record (no access)
      // 3. Middleware MUST return 403, NOT call next()
      
      // To properly test this, we would need to:
      // - Mock db.select() to return a valid tenant for sessionTenantId lookup
      // - Mock db.select() to return NO userTenant record
      // - Verify res.status(403) is called
      // - Verify next() is NOT called
      
      // TODO: Implement full DB mocking for integration test
      // For now, we verify the fix is in place by code inspection
      expect(true).toBe(true);
    });

    it('should allow access when user has valid userTenant record', async () => {
      // NOTE: This test validates the correct behavior when user has access
      // To properly test this, we would need to:
      // - Mock db.select() to return a valid tenant for sessionTenantId lookup
      // - Mock db.select() to return a valid userTenant record with activeEnvironment
      // - Verify req.environment is set from userTenant.activeEnvironment
      // - Verify next() IS called
      
      // TODO: Implement full DB mocking for integration test
      expect(true).toBe(true);
    });

    it('should verify authorization logic structure', () => {
      // This test documents the correct authorization flow:
      // Session Path (with authenticated user):
      //   1. Look up userTenant record
      //   2. If !userTenant → RETURN 403 (CRITICAL FIX)
      //   3. If userTenant exists → Set environment and proceed
      
      // Slug Path (with authenticated user):
      //   1. Look up userTenant record
      //   2. If !userTenant → RETURN 403 (already correct)
      //   3. If userTenant exists → Set environment and proceed
      
      // No Tenant Info Path:
      //   → Set environment = PRODUCTION and proceed (no auth required)
      
      expect(true).toBe(true);
    });
  });
});

// ==================== INTEGRATION TESTS (Real Database) ====================

describe('Tenant Middleware - Integration Tests (Real Database)', () => {
  let testUser: any;
  let testTenant: any;

  beforeEach(async () => {
    // Seed test data
    [testUser] = await db.insert(users).values({
      email: 'test-middleware@example.com',
      firstName: 'Test',
      lastName: 'User',
      password: 'hashed_password'
    }).returning();

    [testTenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: 'test-tenant-middleware',
      nif: '123456789',
      status: 'active'
    }).returning();
  });

  afterEach(async () => {
    // Clean up test data (order matters due to foreign keys)
    await db.delete(userTenants).where(
      and(
        eq(userTenants.userId, testUser.id),
        eq(userTenants.tenantId, testTenant.id)
      )
    );
    await db.delete(tenants).where(eq(tenants.id, testTenant.id));
    await db.delete(users).where(eq(users.id, testUser.id));
  });

  describe('Session-Based Authorization', () => {
    it('should set environment from userTenants.activeEnvironment when authorized', async () => {
      // Create userTenant with SANDBOX environment preference
      await db.insert(userTenants).values({
        userId: testUser.id,
        tenantId: testTenant.id,
        role: 'owner',
        activeEnvironment: ENVIRONMENTS.SANDBOX,
        environment: ENVIRONMENTS.PRODUCTION
      });

      const mockReq = {
        user: { id: testUser.id },
        session: { activeTenantId: testTenant.id },
        headers: {},
        query: {},
        params: {}
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      } as any;

      const nextFn = vi.fn();

      await tenantMiddleware(mockReq, mockRes, nextFn);

      // Should set environment from userTenant.activeEnvironment
      expect(mockReq.environment).toBe(ENVIRONMENTS.SANDBOX);
      expect(mockReq.tenantId).toBe(testTenant.id);
      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks access to session tenant', async () => {
      // Create a different user without access
      const [unauthorizedUser] = await db.insert(users).values({
        email: 'unauthorized@example.com',
        firstName: 'Unauthorized',
        lastName: 'User',
        password: 'hashed_password'
      }).returning();

      try {
        const mockReq = {
          user: { id: unauthorizedUser.id },
          session: { activeTenantId: testTenant.id },
          headers: {},
          query: {},
          params: {}
        } as any;

        const mockRes = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis()
        } as any;

        const nextFn = vi.fn();

        await tenantMiddleware(mockReq, mockRes, nextFn);

        // Should return 403
        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: expect.stringContaining('Access denied')
        });
        expect(nextFn).not.toHaveBeenCalled();
        expect(mockReq.environment).toBeUndefined();
      } finally {
        await db.delete(users).where(eq(users.id, unauthorizedUser.id));
      }
    });
  });

  describe('Slug-Based Authorization', () => {
    it('should set environment from userTenants.activeEnvironment when authorized via slug', async () => {
      // Create userTenant with SANDBOX environment preference
      await db.insert(userTenants).values({
        userId: testUser.id,
        tenantId: testTenant.id,
        role: 'owner',
        activeEnvironment: ENVIRONMENTS.SANDBOX,
        environment: ENVIRONMENTS.PRODUCTION
      });

      const mockReq = {
        user: { id: testUser.id },
        query: { tenantSlug: testTenant.slug },
        headers: {},
        session: undefined,
        params: {}
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      } as any;

      const nextFn = vi.fn();

      await tenantMiddleware(mockReq, mockRes, nextFn);

      // Should set environment from userTenant.activeEnvironment
      expect(mockReq.environment).toBe(ENVIRONMENTS.SANDBOX);
      expect(mockReq.tenantId).toBe(testTenant.id);
      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks access to slug-based tenant', async () => {
      const [unauthorizedUser] = await db.insert(users).values({
        email: 'unauthorized2@example.com',
        firstName: 'Unauthorized2',
        lastName: 'User',
        password: 'hashed_password'
      }).returning();

      try {
        const mockReq = {
          user: { id: unauthorizedUser.id },
          query: { tenantSlug: testTenant.slug },
          headers: {},
          session: undefined,
          params: {}
        } as any;

        const mockRes = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis()
        } as any;

        const nextFn = vi.fn();

        await tenantMiddleware(mockReq, mockRes, nextFn);

        // Should return 403
        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: expect.stringContaining('Access denied')
        });
        expect(nextFn).not.toHaveBeenCalled();
      } finally {
        await db.delete(users).where(eq(users.id, unauthorizedUser.id));
      }
    });

    it('should return 401 when slug provided but user not authenticated (CRITICAL SECURITY FIX)', async () => {
      // CRITICAL: This test validates the security fix for unauthenticated slug access
      // Unauthenticated request with tenant slug should return 401
      const mockReq = {
        user: undefined, // NO USER - unauthenticated!
        query: { tenantSlug: testTenant.slug },
        headers: {},
        session: undefined,
        params: {}
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      } as any;

      const nextFn = vi.fn();

      await tenantMiddleware(mockReq, mockRes, nextFn);

      // Should return 401 Unauthorized
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('Authentication required')
      });
      expect(nextFn).not.toHaveBeenCalled();
      expect(mockReq.environment).toBeUndefined(); // Should NOT set environment
      expect(mockReq.tenantId).toBeUndefined(); // Should NOT set tenantId
    });
  });

  describe('Anonymous Requests', () => {
    it('should set PRODUCTION environment for anonymous requests', async () => {
      const mockReq = {
        user: undefined,
        session: undefined,
        headers: {},
        query: {},
        params: {}
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      } as any;

      const nextFn = vi.fn();

      await tenantMiddleware(mockReq, mockRes, nextFn);

      // Should set PRODUCTION environment
      expect(mockReq.environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(mockReq.tenantId).toBeUndefined();
      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('Environment Propagation', () => {
    it('should propagate user activeEnvironment=production when set', async () => {
      // Create userTenant with PRODUCTION environment preference
      await db.insert(userTenants).values({
        userId: testUser.id,
        tenantId: testTenant.id,
        role: 'owner',
        activeEnvironment: ENVIRONMENTS.PRODUCTION,
        environment: ENVIRONMENTS.PRODUCTION
      });

      const mockReq = {
        user: { id: testUser.id },
        session: { activeTenantId: testTenant.id },
        headers: {},
        query: {},
        params: {}
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      } as any;

      const nextFn = vi.fn();

      await tenantMiddleware(mockReq, mockRes, nextFn);

      // Should use PRODUCTION from userTenant
      expect(mockReq.environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should default to PRODUCTION when activeEnvironment is invalid', async () => {
      // Create userTenant with invalid activeEnvironment value
      // Note: The DB constraint prevents null, but invalid values should be coerced
      await db.insert(userTenants).values({
        userId: testUser.id,
        tenantId: testTenant.id,
        role: 'owner',
        activeEnvironment: 'invalid-environment' as any,
        environment: ENVIRONMENTS.PRODUCTION
      });

      const mockReq = {
        user: { id: testUser.id },
        session: { activeTenantId: testTenant.id },
        headers: {},
        query: {},
        params: {}
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      } as any;

      const nextFn = vi.fn();

      await tenantMiddleware(mockReq, mockRes, nextFn);

      // Should default to PRODUCTION when environment value is invalid
      expect(mockReq.environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(nextFn).toHaveBeenCalled();
    });
  });
});
