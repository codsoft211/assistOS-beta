import { type Request, type Response, type NextFunction } from 'express';
import { db } from '../db';
import { tenants } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_ENVIRONMENT, coerceEnvironment } from '../../../shared/types/environment';
import type { Environment } from '../../../shared/types/environment';
import { enrichRequestLogger } from './request-context.js';
import { getUserRoleInTenantSchema } from '../utils/cross-tenant-query.helper';

export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Early return if tenant context already set (prevent duplicate execution)
    if ((req as any).tenantId && (req as any).environment) {
      return next();
    }

    // Extract tenant from header, query, or session (passport stores it in user object)
    const tenantSlug = req.headers['x-tenant-slug'] as string || req.query.tenantSlug as string;
    const sessionTenantId = (req.session as any)?.passport?.user?.activeTenantId || (req.session as any)?.activeTenantId;
    
    req.log.debug({ tenantSlug, sessionTenantId }, 'Extracting tenant context');

    // If no slug but we have session tenant ID, use it directly
    if (!tenantSlug && sessionTenantId) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, sessionTenantId))
        .limit(1);

      if (tenant && tenant.status === 'active') {
        req.tenantId = tenant.id;
        req.log.debug({ tenantId: req.tenantId }, 'Tenant context set from session');
        
        // If user is authenticated, check their access and get environment
        if (req.user && req.user.id) {
          const userId = req.user.id;
          // ✅ UPDATED: Query from tenant schema instead of public schema
          // Don't filter by environment - if user has access in ANY environment, allow them in
          const userTenant = await getUserRoleInTenantSchema(userId, tenant.id);

          if (!userTenant) {
            // CRITICAL: User is authenticated but doesn't have access to this tenant
            req.log.warn({ userId, tenantId: tenant.id }, 'User does not have access to tenant (session path)');
            return res.status(403).json({ 
              error: 'Access denied to tenant' 
            });
          }
          
          // User has access - set all the properties
          req.userId = userId;
          req.userRole = userTenant.role;
          req.userPermissions = undefined; // Note: permissions not returned by getUserRoleInTenantSchema
          req.userScopes = undefined; // Note: scopes not returned by getUserRoleInTenantSchema
          
          // Inject environment from userTenants.activeEnvironment
          req.environment = coerceEnvironment(userTenant.activeEnvironment, DEFAULT_ENVIRONMENT);
          
          // Re-enrich logger with full context
          enrichRequestLogger(req);
          
          req.log.debug({ environment: req.environment, userId }, 'Environment injected from user context');
        } else {
          // No authenticated user - default environment
          req.environment = DEFAULT_ENVIRONMENT;
          
          // Re-enrich logger with tenant context only
          enrichRequestLogger(req);
          
          req.log.debug({ environment: req.environment }, 'Environment defaulted (unauthenticated)');
        }
        
        return next();
      }
    }

    if (!tenantSlug) {
      // Some routes don't require tenant (e.g., /api/auth/*, /api/tenants/list)
      // Still set default environment to maintain guarantee that req.environment is always present
      req.environment = DEFAULT_ENVIRONMENT;
      req.log.debug({ environment: req.environment }, 'No tenant info - environment defaulted');
      return next();
    }

    // Find tenant by slug
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      req.log.warn({ tenantSlug }, 'Tenant not found');
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status !== 'active') {
      req.log.warn({ tenantId: tenant.id, status: tenant.status }, 'Tenant is not active');
      return res.status(403).json({ error: 'Tenant is not active' });
    }

    // CRITICAL: Require authentication for tenant access!
    if (!req.user || !req.user.id) {
      req.log.warn({ tenantSlug, tenantId: tenant.id }, 'Authentication required to access tenant via slug');
      return res.status(401).json({ 
        error: 'Authentication required to access tenant' 
      });
    }

    // User is authenticated - attach tenant to request
    req.tenantId = tenant.id;

    // Check user's access to this tenant
    const userId = req.user.id;

    // ✅ UPDATED: Query from tenant schema instead of public schema
    // Don't filter by environment - if user has access in ANY environment, allow them in
    const userTenant = await getUserRoleInTenantSchema(userId, tenant.id);

    // CRITICAL: Deny access if user lacks tenant membership
    if (!userTenant) {
      req.log.warn({ userId, tenantId: tenant.id }, 'User does not have access to tenant (slug path)');
      return res.status(403).json({ 
        error: 'Access denied to tenant' 
      });
    }

    // User has access - attach user tenant info to request
    req.userId = userId;
    req.userRole = userTenant.role;
    req.userPermissions = undefined; // Note: permissions not returned by getUserRoleInTenantSchema
    req.userScopes = undefined; // Note: scopes not returned by getUserRoleInTenantSchema
    
    // Inject environment from userTenants.activeEnvironment
    req.environment = coerceEnvironment(userTenant.activeEnvironment, DEFAULT_ENVIRONMENT);
    
    // Re-enrich logger with full tenant/user context
    enrichRequestLogger(req);
    
    req.log.debug({ environment: req.environment, userId }, 'Environment injected from user context');

    return next();
  } catch (error) {
    req.log.error({ error }, 'Tenant middleware error');
    return res.status(500).json({ error: 'Internal server error' });
  }
}
