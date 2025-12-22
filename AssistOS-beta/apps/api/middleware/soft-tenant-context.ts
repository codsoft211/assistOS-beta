/**
 * Soft Tenant Context Middleware
 * 
 * INJETA tenant context sem bloquear requests.
 * Use para rotas que PODEM ter tenant mas não EXIGEM (auth, users, public endpoints).
 * 
 * Comportamento:
 * - Tenta extrair tenant de header/query/session
 * - Se encontrar tenant válido, injeta req.tenantId + req.environment
 * - Se NÃO encontrar, permite request continuar (sem tenant context)
 * - NUNCA retorna 401/403 - sempre chama next()
 * 
 * Diferença vs tenantMiddleware:
 * - tenantMiddleware: BLOQUEIA se tenant não encontrado (401/403)
 * - softTenantContext: PERMITE request sem tenant (graceful fallback)
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { tenants, userTenants } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Environment } from '../../../shared/types/environment';
import { enrichRequestLogger } from './request-context.js';

const DEFAULT_ENVIRONMENT = 'sandbox';

function coerceEnvironment(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  return ['sandbox', 'production'].includes(normalized) ? normalized : fallback;
}

export async function softTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract tenant from header, query, or session
    const tenantSlug = req.headers['x-tenant-slug'] as string || req.query.tenantSlug as string;
    const sessionTenantId = (req.session as any)?.passport?.user?.activeTenantId || (req.session as any)?.activeTenantId;

    // Try session tenant first (fastest path)
    if (!tenantSlug && sessionTenantId) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, sessionTenantId))
        .limit(1);

      if (tenant && tenant.status === 'active') {
        req.tenantId = tenant.id;
        
        // If authenticated user, get environment
        if (req.user && req.user.id) {
          const userId = req.user.id;
          const [userTenant] = await db
            .select()
            .from(userTenants)
            .where(
              and(
                eq(userTenants.userId, userId),
                eq(userTenants.tenantId, tenant.id)
              )
            )
            .limit(1);

          if (userTenant) {
            req.environment = coerceEnvironment(userTenant.activeEnvironment, DEFAULT_ENVIRONMENT) as Environment;
          } else {
            req.environment = DEFAULT_ENVIRONMENT as Environment;
          }
        } else {
          req.environment = DEFAULT_ENVIRONMENT as Environment;
        }
        
        // Re-enrich logger with tenant context
        enrichRequestLogger(req);
        
        req.log.debug({ tenantId: req.tenantId, environment: req.environment }, 'Tenant context injected from session');
        return next();
      }
    }

    // Try tenant slug if provided
    if (tenantSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (tenant && tenant.status === 'active') {
        req.tenantId = tenant.id;

        // If authenticated, get environment
        if (req.user && req.user.id) {
          const userId = req.user.id;
          const [userTenant] = await db
            .select()
            .from(userTenants)
            .where(
              and(
                eq(userTenants.userId, userId),
                eq(userTenants.tenantId, tenant.id)
              )
            )
            .limit(1);

          if (userTenant) {
            req.environment = coerceEnvironment(userTenant.activeEnvironment, DEFAULT_ENVIRONMENT) as Environment;
          } else {
            req.environment = DEFAULT_ENVIRONMENT as Environment;
          }
        } else {
          req.environment = DEFAULT_ENVIRONMENT as Environment;
        }
        
        // Re-enrich logger with tenant context
        enrichRequestLogger(req);
        
        req.log.debug({ tenantId: req.tenantId, environment: req.environment }, 'Tenant context injected from slug');
        return next();
      }
    }

    // No tenant found - continue WITHOUT context (graceful fallback)
    req.log.debug('No tenant context - request allowed to proceed');
    next();
    
  } catch (error: any) {
    req.log.error({ error: error.message }, 'Error extracting tenant context');
    // On error, allow request to proceed (soft failure)
    next();
  }
}
