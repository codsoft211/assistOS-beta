// AssistBuild Access Control Middleware
// Ensures only owner/configurator roles can access AssistBuild configuration studio

import { Request, Response, NextFunction } from 'express';
import { getUserRoleInTenant } from '../services/tenant.service';
import { db } from '../db';
import { tenantUserRoles, assistbuildRoles } from '../../../shared/schema';
import { and, eq } from 'drizzle-orm';

// Cache for role capabilities (simple in-memory cache - could be Redis in production)
const roleCapabilitiesCache = new Map<string, Set<string>>();

/**
 * Middleware to require configurator access (owner or config role)
 * This is the primary gatekeeper for all AssistBuild endpoints
 */
export async function requireConfigurator(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id || req.session?.userId;
  const tenantId = (req as any).tenantId || req.session?.activeTenantId;

  console.log(`[requireConfigurator] Checking access for user ${userId}, tenant ${tenantId}`);

  if (!userId) {
    console.error(`[requireConfigurator] ❌ No userId found`);
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access AssistBuild',
    });
  }

  if (!tenantId) {
    console.error(`[requireConfigurator] ❌ No tenantId found for user ${userId}`);
    return res.status(400).json({ 
      error: 'No active organization',
      message: 'Please select an organization to continue',
    });
  }

  // Get user's role in active tenant
  const userRole = await getUserRoleInTenant(userId, tenantId);
  console.log(`[requireConfigurator] User ${userId} has role: ${userRole} in tenant ${tenantId}`);

  if (!userRole) {
    console.error(`[requireConfigurator] ❌ No role found for user ${userId} in tenant ${tenantId}`);
    return res.status(403).json({ 
      error: 'No access to this organization',
      message: 'You do not have access to this organization',
    });
  }

  // Only owner and config roles can access AssistBuild
  if (!['owner', 'config'].includes(userRole)) {
    console.error(`[requireConfigurator] ❌ Insufficient permissions: user has role '${userRole}', required: 'owner' or 'config'`);
    return res.status(403).json({
      error: 'Insufficient permissions',
      message: 'Only organization owners and configurators can access AssistBuild',
      required: ['owner', 'config'],
      current: userRole,
    });
  }

  console.log(`[requireConfigurator] ✅ Access granted for user ${userId} with role ${userRole}`);

  // Attach role to request for downstream capability checks
  (req as any).userRole = userRole;
  (req as any).userId = userId;
  
  next();
}

/**
 * Check if user has a specific AssistBuild capability
 * Capabilities: chat:read, chat:write, workflow:manage, team:manage, agent:create, sandbox:access, promote:production
 */
export async function checkCapability(
  userId: string,
  tenantId: string,
  capability: string
): Promise<boolean> {
  // Owners have all capabilities
  const userRole = await getUserRoleInTenant(userId, tenantId);
  if (userRole === 'owner') {
    return true;
  }

  // Check cache first
  const cacheKey = `${userId}:${tenantId}`;
  let capabilities = roleCapabilitiesCache.get(cacheKey);

  if (!capabilities) {
    // Fetch user's roles and capabilities from database
    const userRoles = await db
      .select({
        capabilities: assistbuildRoles.capabilities,
      })
      .from(tenantUserRoles)
      .innerJoin(assistbuildRoles, eq(tenantUserRoles.roleId, assistbuildRoles.id))
      .where(
        and(
          eq(tenantUserRoles.userId, userId),
          eq(tenantUserRoles.tenantId, tenantId)
        )
      );

    // Combine all capabilities
    capabilities = new Set<string>();
    for (const role of userRoles) {
      const roleCaps = role.capabilities as Record<string, boolean> | null;
      if (roleCaps) {
        Object.entries(roleCaps).forEach(([key, value]) => {
          if (value) {
            capabilities!.add(key);
          }
        });
      }
    }

    // Cache for 5 minutes
    roleCapabilitiesCache.set(cacheKey, capabilities);
    setTimeout(() => roleCapabilitiesCache.delete(cacheKey), 5 * 60 * 1000);
  }

  return capabilities.has(capability);
}

/**
 * Middleware to require specific AssistBuild capability
 */
export function requireCapability(capability: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId;
    const tenantId = (req as any).tenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hasCapability = await checkCapability(userId, tenantId, capability);

    if (!hasCapability) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires the '${capability}' capability`,
        required: capability,
      });
    }

    next();
  };
}
