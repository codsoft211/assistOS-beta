/**
 * Middleware Barrel Export
 * 
 * Multi-Tenant Security Middlewares:
 * - tenantMiddleware: Original (legacy routes)
 * - softTenantContext: Injeta context sem bloquear (auth, users, public)
 * - hardTenantGuard: Valida membership obrigatoriamente (financeiro, webhooks, critical)
 */

export { tenantMiddleware } from './tenant-middleware';
export { softTenantContext } from './soft-tenant-context';
export { hardTenantGuard } from './hard-tenant-guard';
export { requireAuth } from './auth.middleware';
export { quotaMiddleware } from './quota.middleware';
export { RollbackSnapshots } from './rollback-snapshot.middleware';
