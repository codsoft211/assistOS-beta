/**
 * Hard Tenant Guard Middleware
 * 
 * EXIGE tenant context e valida membership.
 * Use para rotas CRÍTICAS que manipulam dados sensíveis (financeiro, conversas, webhooks).
 * 
 * Comportamento:
 * - EXIGE tenant de header/query/session
 * - VALIDA que tenant está ativo
 * - EXIGE autenticação (req.user)
 * - VALIDA membership (userTenants)
 * - INJETA: tenantId, userId, userRole, userPermissions, userScopes, environment
 * - REJEITA: 401 (não autenticado), 403 (sem acesso), 404 (tenant inexistente)
 * 
 * Diferença vs tenantMiddleware:
 * - tenantMiddleware: Middleware original (pode ter algumas rotas legacy sem ele)
 * - hardTenantGuard: Middleware ESTRITO para rotas críticas (zero tolerância)
 * 
 * GAP FECHADO: Multi-Tenant Security
 * - Previne cross-tenant data leaks
 * - Valida membership antes de qualquer query
 * - Garante environment correto (sandbox/production isolation)
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { tenants } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import type { Environment } from '../../../shared/types/environment';
import { enrichRequestLogger } from './request-context.js';
import { getUserRoleInTenantSchema } from '../utils/cross-tenant-query.helper';

const DEFAULT_ENVIRONMENT = 'sandbox';

function coerceEnvironment(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  return ['sandbox', 'production'].includes(normalized) ? normalized : fallback;
}

export async function hardTenantGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // CRITICAL: Require authentication FIRST
    if (!req.user || !req.user.id) {
      req.log.warn('Authentication required');
      return res.status(401).json({ 
        error: 'Authentication required to access this resource' 
      });
    }

    const userId = req.user.id;

    // Extract tenant from header, query, or session
    const tenantSlug = req.headers['x-tenant-slug'] as string || req.query.tenantSlug as string;
    const sessionTenantId = (req.session as any)?.passport?.user?.activeTenantId || (req.session as any)?.activeTenantId;

    let tenant: any = null;

    // Try session tenant first (fastest path)
    if (!tenantSlug && sessionTenantId) {
      const [result] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, sessionTenantId))
        .limit(1);
      
      tenant = result;
    }

    // Try tenant slug if provided
    if (!tenant && tenantSlug) {
      const [result] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);
      
      tenant = result;
    }

    // CRITICAL: Tenant not found
    if (!tenant) {
      req.log.warn({ userId, tenantSlug, sessionTenantId }, 'Tenant not found');
      return res.status(404).json({ 
        error: 'Tenant not found' 
      });
    }

    // CRITICAL: Tenant must be active
    if (tenant.status !== 'active') {
      req.log.warn({ userId, tenantId: tenant.id, status: tenant.status }, 'Tenant is not active');
      return res.status(403).json({ 
        error: 'Tenant is not active' 
      });
    }

    // CRITICAL: Validate user membership (prevents cross-tenant access)
    // ✅ UPDATED: Query from tenant schema instead of public schema
    // Don't filter by environment - if user has access in ANY environment, allow them in
    const userTenant = await getUserRoleInTenantSchema(userId, tenant.id);

    if (!userTenant) {
      req.log.warn({ userId, tenantId: tenant.id }, 'User does not have access to tenant (membership denied)');
      return res.status(403).json({ 
        error: 'Access denied to tenant - membership required' 
      });
    }

    // SUCCESS: Inject tenant context + user context + environment
    req.tenantId = tenant.id;
    req.userId = userId;
    req.userRole = userTenant.role;
    req.userPermissions = undefined; // Note: permissions not returned by getUserRoleInTenantSchema
    req.userScopes = undefined; // Note: scopes not returned by getUserRoleInTenantSchema
    req.environment = coerceEnvironment(userTenant.activeEnvironment, DEFAULT_ENVIRONMENT) as Environment;

    // Re-enrich logger with full tenant/user context
    enrichRequestLogger(req);

    req.log.debug({ 
      tenantId: req.tenantId, 
      userId: req.userId, 
      role: req.userRole,
      environment: req.environment 
    }, 'Access granted - context injected');

    next();

  } catch (error: any) {
    req.log.error({ error: error.message }, 'Unexpected error in tenant validation');
    return res.status(500).json({ 
      error: 'Internal server error during tenant validation' 
    });
  }
}
