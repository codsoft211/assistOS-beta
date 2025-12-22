/**
 * Express Type Extensions for AssistOS
 * 
 * This file extends Express Request interface to include tenant context
 * and environment information that is injected by middleware.
 * 
 * @module apps/api/types/express
 */

import type { Environment } from '../../../shared/types/environment';
import type { Logger } from 'pino';

declare global {
  namespace Express {
    /**
     * Extended Request interface with AssistOS context
     * 
     * Properties injected by middleware:
     * - tenantId: Current tenant (from tenant-middleware.ts)
     * - environment: Current environment (production/sandbox)
     * - userId: Authenticated user ID (from auth middleware)
     * - userRole: User role in tenant
     * - userPermissions: User permissions
     * - userScopes: User scopes
     * - log: Pino logger with request context (from request-context.ts)
     * 
     * @example
     * ```typescript
     * router.get('/data', async (req, res) => {
     *   const { tenantId, environment, userId } = req;
     *   req.log.info({ dataId: 123 }, 'Fetching data');
     *   const data = await service.getData(tenantId, environment);
     *   res.json(data);
     * });
     * ```
     */
    interface Request {
      tenantId?: string;
      environment?: Environment;
      userId?: string;
      userRole?: string;
      userPermissions?: any;
      userScopes?: any;
      id?: string;
      log: Logger;
    }

    /**
     * User object from Passport authentication
     */
    interface User {
      id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
    }
  }
}

export {};
