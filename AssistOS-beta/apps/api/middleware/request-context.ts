/**
 * Request Context Middleware (Enhanced for Sprint 1 Gap 3)
 * 
 * Phase 1: Enriches request logger with requestId/correlationId
 * Phase 2 (Lazy Enrichment): Tenant/user context added by tenant middleware
 * Phase 3 (AsyncLocalStorage): Correlation tracking across async boundaries
 * 
 * Why Lazy Enrichment?
 * - This middleware runs BEFORE tenant middleware in the pipeline
 * - At this point, req.tenantId, req.userId, req.environment don't exist yet
 * - Tenant middleware will call enrichRequestLogger() after setting context
 * 
 * Pipeline Order:
 * 1. pino-http (attaches req.log)
 * 2. requestContext (adds correlationId + AsyncLocalStorage) <- YOU ARE HERE
 * 3. tenantMiddleware (adds tenant/user context + re-enriches logger)
 * 4. Route handlers (use fully enriched logger)
 * 
 * AsyncLocalStorage Context:
 * - Enables correlation tracking through services → workers → queue jobs
 * - Access via getRequestContext() or getCorrelationId() anywhere in the call stack
 * - Automatically propagates through async operations
 * 
 * @example
 * ```typescript
 * router.post('/invoices', async (req, res) => {
 *   req.log.info({ invoiceId: 123 }, 'Invoice created');
 *   // Logs: { level: "info", correlationId: "...", tenantId: "...", userId: "...", invoiceId: 123, msg: "Invoice created" }
 * });
 * ```
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';
import { Sentry } from '../sentry.js';
import { randomUUID } from 'crypto';

/**
 * Request Context Interface (Sprint 1 Gap 3)
 * Used for correlation tracking across async boundaries
 */
export interface RequestContext {
  correlationId: string;
  tenantId?: string;
  environment?: 'production' | 'sandbox';
  userId?: number;
}

/**
 * AsyncLocalStorage for request context propagation
 * Enables correlation tracking through the entire call stack
 */
export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get current request context (if available)
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get correlation ID from current context
 * Returns 'unknown' if no context available (fallback for non-HTTP contexts)
 */
export function getCorrelationId(): string {
  return getRequestContext()?.correlationId || 'unknown';
}

/**
 * Helper function to enrich request logger with tenant/user context.
 * Called by tenant middleware AFTER setting req.tenantId, req.userId, etc.
 * 
 * Sprint 1 Gap 3: Also updates AsyncLocalStorage context with tenant/user data
 */
export function enrichRequestLogger(req: Request): void {
  try {
    // Build context object for child logger
    const context: Record<string, any> = {};

    // Add tenant context if available
    if (req.tenantId) {
      context.tenantId = req.tenantId;
    }

    // Add user context if available
    if (req.userId) {
      context.userId = req.userId;
    }

    // Add environment if available
    if (req.environment) {
      context.environment = req.environment;
    }

    // Add user role if available
    if (req.userRole) {
      context.role = req.userRole;
    }

    // Re-create child logger with enriched context
    if (req.log && Object.keys(context).length > 0) {
      req.log = req.log.child(context);
    }

    // Update AsyncLocalStorage context with tenant/user data (Sprint 1 Gap 3)
    const currentContext = getRequestContext();
    if (currentContext) {
      const enrichedContext: RequestContext = {
        ...currentContext,
        tenantId: req.tenantId,
        userId: typeof req.userId === 'number' ? req.userId : (req.userId ? parseInt(String(req.userId)) : undefined),
        environment: req.environment as 'production' | 'sandbox',
      };
      
      // Note: We can't directly update AsyncLocalStorage, but the context object
      // is already being used by downstream code, so we update it in-place
      Object.assign(currentContext, enrichedContext);
    }

    // Persist Sentry context (Sentry v8 API)
    const scope = Sentry.getCurrentScope();
    
    // Set user context
    if (req.userId) {
      scope.setUser({
        id: String(req.userId),
        email: req.user?.email,
      });
    }

    // Set tenant context as tags
    if (req.tenantId) {
      scope.setTag('tenantId', req.tenantId);
    }

    if (req.environment) {
      scope.setTag('environment', req.environment);
    }

    if (req.userRole) {
      scope.setTag('role', req.userRole);
    }

    // Add breadcrumb for enrichment
    scope.addBreadcrumb({
      category: 'context',
      message: 'Request context enriched',
      level: 'debug',
      data: context,
    });
  } catch (error: any) {
    console.error('[RequestContext] Error enriching logger:', error.message);
  }
}

/**
 * Phase 1: Initial request context middleware (Enhanced for Sprint 1 Gap 3)
 * - Adds correlationId (supports x-correlation-id header for distributed tracing)
 * - Creates AsyncLocalStorage context for correlation tracking
 * - Tenant/user context comes later via enrichRequestLogger()
 */
export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Ensure requestId exists (should be set by earlier middleware)
    const requestId = (req as any).id || randomUUID();
    if (!(req as any).id) {
      (req as any).id = requestId;
    }

    // Sprint 1 Gap 3: Support x-correlation-id header for distributed tracing
    const correlationId = (req.headers['x-correlation-id'] as string) || String(requestId);
    
    // Set response header for correlation tracking
    res.setHeader('X-Correlation-Id', correlationId);

    // Create AsyncLocalStorage context (Sprint 1 Gap 3)
    const context: RequestContext = {
      correlationId,
      // Tenant/user will be added later by enrichRequestLogger()
    };

    // Run the rest of the request in AsyncLocalStorage context
    asyncLocalStorage.run(context, () => {
      // Create child logger with correlationId
      if (req.log) {
        req.log = req.log.child({
          requestId: String(requestId),
          correlationId,
        });
      }

      // Set base Sentry context (tenant/user will be added later by enrichRequestLogger)
      const scope = Sentry.getCurrentScope();
      // Set correlation ID for distributed tracing
      scope.setTag('correlationId', correlationId);
      scope.setTag('requestId', String(requestId));

        // Add breadcrumb for this request
        scope.addBreadcrumb({
          type: 'http',
          category: 'request',
          data: {
            method: req.method,
            url: req.url,
            requestId: String(requestId),
            correlationId,
          },
          level: 'info',
        });

      next();
    });
  } catch (error: any) {
    // Fallback: if context enrichment fails, continue anyway
    // Log error but don't block the request
    console.error('[RequestContext] Error enriching context:', error.message);
    next();
  }
}

export default requestContext;
