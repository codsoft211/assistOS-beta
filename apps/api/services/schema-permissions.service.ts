import { getUserRoleInTenant } from './tenant.service';

/**
 * Check if user can modify tenant schema
 * Only owners and configurators can modify schemas
 */
export async function canModifySchema(
  userId: string,
  tenantId: string
): Promise<{ allowed: boolean; role: string | null; reason?: string }> {
  const role = await getUserRoleInTenant(userId, tenantId);
  
  if (!role) {
    return {
      allowed: false,
      role: null,
      reason: 'User has no role in tenant',
    };
  }
  
  if (!['owner', 'config'].includes(role)) {
    return {
      allowed: false,
      role,
      reason: 'Only owners and configurators can modify tenant schemas',
    };
  }
  
  return {
    allowed: true,
    role,
  };
}
