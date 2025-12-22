/**
 * Resource Quota Middleware (GAP #5)
 * 
 * Enforces tier-based resource quotas across all creation endpoints.
 * Works in conjunction with ResourceQuotaService for centralized quota management.
 * 
 * Architecture:
 * - Factory pattern: quotaMiddleware(resourceType) creates type-specific middleware
 * - Defense in depth: Middleware layer + service layer validation
 * - Tenant isolation: Uses req.tenantId and req.environment from tenantMiddleware
 * - Graceful errors: Returns 429 with quota details when limits exceeded
 * 
 * Usage:
 * ```typescript
 * app.post('/api/schemas', 
 *   tenantMiddleware,
 *   quotaMiddleware('schemas'),
 *   async (req, res) => { ... }
 * );
 * ```
 * 
 * Supported Resource Types:
 * - code_generation: Generated code files
 * - schemas: Database schemas/migrations
 * - workflows: Tenant workflows
 * - modules: Installed modules
 * - patterns: Detected patterns
 * - jobs: AssistBuild jobs
 */

import { type Request, type Response, type NextFunction } from 'express';
import { ResourceQuotaService, type ResourceType } from '../services/resource-quota.service';
import logger from '../logger';
import { DEFAULT_ENVIRONMENT, type Environment } from '../../../shared/types/environment';

// Singleton service instance
const quotaService = new ResourceQuotaService();

/**
 * Factory function to create quota middleware for specific resource types
 * 
 * @param resourceType - Type of resource being created
 * @param options - Optional configuration
 * @returns Express middleware function
 */
export function quotaMiddleware(
  resourceType: ResourceType,
  options?: {
    /**
     * Override request metadata (for batch operations)
     * Example: Creating multiple files in code generation
     */
    getMetadata?: (req: Request) => Record<string, any>;
    
    /**
     * Custom error message
     */
    errorMessage?: string;
    
    /**
     * Skip quota check based on request (e.g., system operations)
     */
    skip?: (req: Request) => boolean;
  }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Allow skip function to bypass quota check
      if (options?.skip?.(req)) {
        logger.debug({ resourceType }, '[QuotaMiddleware] Skipping quota check');
        return next();
      }

      // Extract tenant and environment from request
      // CRITICAL: Requires tenantMiddleware to run first
      const tenantId = req.tenantId;
      const environment = (req.environment || DEFAULT_ENVIRONMENT) as Environment;

      // Validate required fields
      if (!tenantId) {
        logger.warn({ resourceType }, '[QuotaMiddleware] Missing tenantId - quota check skipped');
        // Don't block request - tenantMiddleware should handle auth
        return next();
      }

      // Extract metadata from request (if provided)
      const metadata = options?.getMetadata?.(req) || {};

      // Check quota using service layer
      const result = await quotaService.ensureAllowed(
        tenantId,
        environment,
        resourceType,
        metadata
      );

      // If quota exceeded, return 429
      if (!result.allowed) {
        logger.warn({
          tenantId,
          environment,
          resourceType,
          quotaType: result.quotaType,
          currentUsage: result.currentUsage,
          limit: result.limit,
        }, '[QuotaMiddleware] Quota exceeded');

        return res.status(429).json({
          error: options?.errorMessage || 'Resource quota exceeded',
          details: {
            resourceType,
            quotaType: result.quotaType,
            currentUsage: result.currentUsage,
            limit: result.limit,
            resetAt: result.resetAt,
            message: result.message,
          },
        });
      }

      // Quota OK - attach quota info to request for logging/monitoring
      (req as any).quotaInfo = {
        resourceType,
        allowed: true,
        currentUsage: result.currentUsage,
        limit: result.limit,
      };

      logger.debug({
        tenantId,
        environment,
        resourceType,
        currentUsage: result.currentUsage,
        limit: result.limit,
      }, '[QuotaMiddleware] Quota check passed');

      next();
    } catch (error) {
      // Log error but don't block request (fail-open for safety)
      logger.error({ error, resourceType }, '[QuotaMiddleware] Quota check failed with error');
      next();
    }
  };
}

/**
 * Middleware to check quota after operation (for monitoring/logging)
 * Useful for post-creation hooks to track quota usage
 */
export function trackQuotaUsage(resourceType: ResourceType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId;
      const environment = (req.environment || DEFAULT_ENVIRONMENT) as Environment;

      if (!tenantId) {
        return next();
      }

      // Get current usage for logging
      const usage = await quotaService.getCurrentUsage(tenantId, environment, resourceType);
      const limits = await quotaService.getQuotaLimits(tenantId, resourceType);

      logger.info({
        tenantId,
        environment,
        resourceType,
        usage,
        limits,
      }, '[QuotaMiddleware] Resource created - quota usage tracked');

      next();
    } catch (error) {
      logger.error({ error, resourceType }, '[QuotaMiddleware] Quota tracking failed');
      next();
    }
  };
}

/**
 * Middleware to validate quota for batch operations
 * Checks if creating N resources would exceed quota
 * 
 * @param resourceType - Type of resource
 * @param getCount - Function to extract count from request (e.g., req.body.files.length)
 */
export function batchQuotaMiddleware(
  resourceType: ResourceType,
  getCount: (req: Request) => number
) {
  return quotaMiddleware(resourceType, {
    getMetadata: (req) => ({ 
      count: getCount(req),
    }),
    errorMessage: `Batch operation would exceed ${resourceType} quota`,
  });
}

export default quotaMiddleware;
