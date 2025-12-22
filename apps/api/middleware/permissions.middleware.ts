import { Request, Response, NextFunction } from 'express';
import { getUserPermissionsInTenant } from '../permissions';

/**
 * Middleware to populate req.userPermissions for downstream use
 * 
 * Fetches user's permission strings and attaches to request object.
 * Used by LinkResolver and other services that need permission-aware operations.
 * 
 * Usage:
 *   router.use(attachUserPermissions);
 *   // Now all routes have access to (req as any).userPermissions
 * 
 * @returns Express middleware function
 */
export async function attachUserPermissions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.session.userId;
  const tenantId = req.session.activeTenantId;
  
  if (!userId || !tenantId) {
    // No authenticated user - empty permissions
    (req as any).userPermissions = [];
    return next();
  }
  
  try {
    // getUserPermissionsInTenant already returns string[] format
    const userPermissions = await getUserPermissionsInTenant(userId, tenantId);
    
    // Attach to request for downstream handlers
    (req as any).userPermissions = userPermissions;
    
    next();
  } catch (error) {
    console.error('[attachUserPermissions] Error loading permissions:', error);
    // On error, continue with empty permissions (deny by default)
    (req as any).userPermissions = [];
    next();
  }
}

/**
 * Middleware to require specific module permission(s)
 * 
 * Checks if the authenticated user has the required permission(s) in their active tenant.
 * 
 * Usage:
 *   router.get('/suppliers', requirePermission('purchasing.read'), handler);
 *   router.post('/suppliers', requirePermission('purchasing.write'), handler);
 *   router.get('/data', requirePermission(['purchasing.read', 'financial.read']), handler);
 * 
 * @param permission - Single permission string or array of permission strings (user needs at least one)
 * @returns Express middleware function
 */
export function requirePermission(permission: string | string[]) {
  const requiredPermissions = Array.isArray(permission) ? permission : [permission];
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;
    
    if (!userId || !tenantId) {
      console.log('[requirePermission] Missing userId or tenantId in session');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      // Get user's permissions in tenant
      const userPermissions = await getUserPermissionsInTenant(userId, tenantId);
      
      console.log('[requirePermission]', {
        userId,
        tenantId,
        required: requiredPermissions,
        userPermissions: userPermissions.slice(0, 10), // Log first 10 to avoid clutter
        hasMore: userPermissions.length > 10
      });
      
      // Check if user has at least one of the required permissions
      const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));
      
      if (!hasPermission) {
        console.log('[requirePermission] DENIED - User lacks required permissions');
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: requiredPermissions
        });
      }
      
      console.log('[requirePermission] GRANTED - User has required permissions');
      next();
    } catch (error) {
      console.error('[requirePermission] Error checking permissions:', error);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
}
