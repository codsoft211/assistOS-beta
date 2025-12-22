import { db } from '../db';
import { tenants, userTenants, users, tenantInvitations, tenantStorageProviders, auditLog } from '../../../shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';
// QUARANTINED: onboarding converter moved to _legacy/
// import { onboardingToTenantConverter } from './onboarding-to-tenant-converter';
import { getDefaultScopes } from '../permissions';
import { tenantSchemaService } from './tenant-schema.service';
import { createTenantQueryBuilder } from '../utils/tenant-query-builder';
import { getUserTenantsAcrossSchemas, getUserRoleInTenantSchema, getTenantUsersFromSchema } from '../utils/cross-tenant-query.helper';
import type { Environment } from '../../../shared/types/environment';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry?: string | null;
  logo?: string | null;
  settings?: any;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserTenantRelation {
  userId: string;
  tenantId: string;
  role: string;
  permissions?: any;
  scopes?: any;
  joinedAt: Date;
}

export interface TenantWithRole extends Tenant {
  role: string;
  environment?: string; // User-specific environment setting
  joinedAt?: Date; // When user joined this tenant
  tier?: string; // Tenant tier (default, premium, enterprise)
}

// Create tenant with owner
export async function createTenant(data: {
  name: string;
  slug: string;
  industry?: string;
  ownerId: string;
}): Promise<Tenant> {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: data.name,
      slug: data.slug,
      industry: data.industry || null,
      status: 'active',
    })
    .returning();

  // ✅ AUTOMATIC: Create tenant schema in Supabase
  try {
    const schemaName = await tenantSchemaService.createTenantSchema(tenant.id);
    console.log(`[TenantService] ✅ Created schema ${schemaName} for tenant ${tenant.id}`);
  } catch (error) {
    console.error('[TenantService] ❌ Failed to create tenant schema:', error);
    // Don't fail tenant creation - schema can be created later via AssistBuild
    // But log the error for monitoring
  }

  // Add owner to tenant with default scopes
  // ✅ UPDATED: Use TenantQueryBuilder since user_tenants is in tenant schema
  const queryBuilder = createTenantQueryBuilder(tenant.id, 'sandbox');
  await queryBuilder.insert('user_tenants', {
    user_id: data.ownerId,
    tenant_id: tenant.id,
    role: 'owner',  // FIXED: Tenant creator should be owner
    scopes: getDefaultScopes('owner'),  // Apply default owner scopes
    active_environment: 'sandbox',  // New tenants start in SANDBOX for Configuration Studio
  });

  // Create default storage provider for development
  // CRITICAL: Document uploads require a storage provider configured
  // NOTE: Production should configure shared_gcs/s3/azure manually via ProviderManagement UI
  // TODO: Add backfill script for existing tenants without providers
  // TODO: Add production auto-config when GCS credentials are properly configured
  try {
    await db.insert(tenantStorageProviders).values({
      tenantId: tenant.id,
      providerType: 'local',
      providerName: 'Local Storage (Development)',
      isDefault: true,
      isActive: true,
      priority: 0,
      config: {
        rootPath: './storage', // LocalProvider uses 'rootPath', not 'basePath'
      },
      createdBy: data.ownerId,
    });
    console.log(`[TenantService] Created default local storage provider for tenant ${tenant.id}`);
  } catch (error) {
    console.error('[TenantService] Failed to create default storage provider:', error);
    // Don't fail tenant creation if storage provider creation fails
    // Admin can configure it later via UI
  }

  // QUARANTINED: Onboarding converter disabled
  // ✅ Convert onboarding cache to tenant memory (if exists)
  // try {
  //   await onboardingToTenantConverter.convertOnboardingToTenant(
  //     data.ownerId,
  //     tenant.id
  //   );
  // } catch (error) {
  //   console.error('[TenantService] Failed to convert onboarding cache:', error);
  //   // Don't fail tenant creation if conversion fails
  // }

  return tenant;
}

// Get tenant by ID
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return tenant || null;
}

// Get tenant by slug
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  return tenant || null;
}

// Get all tenants for a user
// ✅ UPDATED: Use cross-tenant query helper since user_tenants is in tenant schemas
export async function getUserTenants(userId: string, environment?: string): Promise<TenantWithRole[]> {
  // Query across all tenant schemas to find user's tenants
  const userTenantRelations = await getUserTenantsAcrossSchemas(userId, environment);
  
  if (userTenantRelations.length === 0) {
    return [];
  }

  // Get tenant details for each tenant ID
  const tenantIds = userTenantRelations.map(r => r.tenantId);
  const tenantDetails = await db
    .select()
    .from(tenants)
    .where(inArray(tenants.id, tenantIds));

  // Combine tenant details with user roles
  const tenantMap = new Map(tenantDetails.map(t => [t.id, t]));
  
  const results: TenantWithRole[] = [];
  
  for (const relation of userTenantRelations) {
    const tenant = tenantMap.get(relation.tenantId);
    if (!tenant) continue;
    
    results.push({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      industry: tenant.industry,
      logo: tenant.logo,
      settings: tenant.settings,
      status: tenant.status,
      environment: relation.activeEnvironment,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      role: relation.role,
      joinedAt: relation.joinedAt,
      tier: (tenant as any).tier || 'default', // Add tier from tenant if available
    });
  }
  
  return results;
}

// Get user's role in tenant
// ✅ UPDATED: Use cross-tenant query helper since user_tenants is in tenant schema
// Don't filter by environment for access checks - if user has access in ANY environment, return their role
export async function getUserRoleInTenant(
  userId: string, 
  tenantId: string,
  environment?: Environment
): Promise<string | null> {
  const result = await getUserRoleInTenantSchema(userId, tenantId, environment);
  return result?.role || null;
}

// Add user to tenant
// ✅ UPDATED: Use TenantQueryBuilder since user_tenants is in tenant schema
export async function addUserToTenant(data: {
  userId: string;
  tenantId: string;
  role: string;
  invitedBy?: string;
  environment?: Environment;
  isPaying?: boolean; // Optional: set is_paying flag on insert
}): Promise<UserTenantRelation> {
  const environment = data.environment || 'production';
  const queryBuilder = createTenantQueryBuilder(data.tenantId, environment);
  
  const relation = await queryBuilder.insert('user_tenants', {
    user_id: data.userId,
    tenant_id: data.tenantId,
    role: data.role,
    scopes: getDefaultScopes(data.role),  // Apply default scopes based on role
    invited_by: data.invitedBy || null,
    active_environment: environment,
    is_paying: data.isPaying || false, // Set is_paying flag if provided
  });

  return {
    userId: relation.user_id,
    tenantId: relation.tenant_id,
    role: relation.role,
    permissions: relation.permissions,
    scopes: relation.scopes,
    joinedAt: relation.joined_at,
  };
}

// Remove user from tenant
// ✅ UPDATED: Use TenantQueryBuilder since user_tenants is in tenant schema
export async function removeUserFromTenant(
  userId: string, 
  tenantId: string,
  environment: Environment = 'production'
): Promise<void> {
  const queryBuilder = createTenantQueryBuilder(tenantId, environment);
  await queryBuilder.delete('user_tenants', {
    user_id: userId,
    tenant_id: tenantId,
  });
}

// Update user role in tenant
// ✅ UPDATED: Use TenantQueryBuilder since user_tenants is in tenant schema
export async function updateUserRoleInTenant(
  userId: string,
  tenantId: string,
  role: string,
  environment: Environment = 'production'
): Promise<void> {
  const queryBuilder = createTenantQueryBuilder(tenantId, environment);
  await queryBuilder.update('user_tenants', { role }, {
    user_id: userId,
    tenant_id: tenantId,
  });
}

// Get all users in a tenant
// ✅ UPDATED: Use cross-tenant query helper and join with users table
export async function getTenantUsers(
  tenantId: string,
  environment: Environment = 'production'
) {
  // Get user IDs and roles from tenant schema
  const tenantUsers = await getTenantUsersFromSchema(tenantId, environment);
  
  if (tenantUsers.length === 0) {
    return [];
  }

  // Get user details from public.users table
  const userIds = tenantUsers.map(u => u.userId);
  const userDetails = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.avatar,
      isActive: users.isActive,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  // Combine user details with roles
  const userMap = new Map(userDetails.map(u => [u.id, u]));
  
  return tenantUsers
    .map(tenantUser => {
      const user = userMap.get(tenantUser.userId);
      if (!user) return null;
      
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isActive: user.isActive,
        role: tenantUser.role,
        joinedAt: tenantUser.joinedAt,
      };
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);
}

// Create invitation
export async function createInvitation(data: {
  tenantId: string;
  email: string;
  role: string;
  createdBy: string;
}): Promise<{ id: string; token: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

  const [invitation] = await db
    .insert(tenantInvitations)
    .values({
      tenantId: data.tenantId,
      email: data.email,
      role: data.role,
      token,
      createdBy: data.createdBy,
      status: 'pending',
      expiresAt,
    })
    .returning({ id: tenantInvitations.id, token: tenantInvitations.token });

  return invitation;
}

// Get invitation by token
export async function getInvitationByToken(token: string) {
  const [invitation] = await db
    .select()
    .from(tenantInvitations)
    .where(eq(tenantInvitations.token, token))
    .limit(1);

  if (!invitation) return null;

  // Check if expired
  if (invitation.expiresAt < new Date()) {
    await db
      .update(tenantInvitations)
      .set({ status: 'expired' })
      .where(eq(tenantInvitations.id, invitation.id));
    return null;
  }

  return invitation;
}

// Accept invitation
export async function acceptInvitation(token: string, userId: string): Promise<void> {
  const invitation = await getInvitationByToken(token);
  if (!invitation || invitation.status !== 'pending') {
    throw new Error('Invalid or expired invitation');
  }

  // Add user to tenant
  await addUserToTenant({
    userId,
    tenantId: invitation.tenantId,
    role: invitation.role,
    invitedBy: invitation.createdBy,
  });

  // Mark invitation as accepted
  await db
    .update(tenantInvitations)
    .set({ status: 'accepted' })
    .where(eq(tenantInvitations.id, invitation.id));
}

// Update tenant
export async function updateTenant(
  tenantId: string,
  updates: Partial<{
    name: string;
    slug: string;
    industry: string;
    logo: string;
    settings: any;
    status: string;
  }>
): Promise<Tenant | null> {
  const allowedUpdates: any = { updatedAt: new Date() };
  
  if (updates.name !== undefined) allowedUpdates.name = updates.name;
  if (updates.slug !== undefined) allowedUpdates.slug = updates.slug;
  if (updates.industry !== undefined) allowedUpdates.industry = updates.industry;
  if (updates.logo !== undefined) allowedUpdates.logo = updates.logo;
  if (updates.settings !== undefined) allowedUpdates.settings = updates.settings;
  if (updates.status !== undefined) allowedUpdates.status = updates.status;

  await db
    .update(tenants)
    .set(allowedUpdates)
    .where(eq(tenants.id, tenantId));

  return getTenantById(tenantId);
}

// Update user's environment for a tenant
export async function updateUserEnvironment(
  userId: string,
  tenantId: string,
  environment: 'sandbox' | 'production'
): Promise<void> {
  await db
    .update(userTenants)
    .set({ activeEnvironment: environment })
    .where(and(
      eq(userTenants.userId, userId),
      eq(userTenants.tenantId, tenantId)
    ));
}

// Get user's current active environment in a tenant
export async function getUserCurrentEnvironment(
  userId: string,
  tenantId: string
): Promise<'sandbox' | 'production'> {
  const [result] = await db
    .select({ activeEnvironment: userTenants.activeEnvironment })
    .from(userTenants)
    .where(and(
      eq(userTenants.userId, userId),
      eq(userTenants.tenantId, tenantId)
    ))
    .limit(1);

  return (result?.activeEnvironment || 'production') as 'sandbox' | 'production';
}

// Check if user can change environment (RBAC)
// Only 'owner' and 'config' roles can change environment
export async function canUserChangeEnvironment(
  userId: string,
  tenantId: string
): Promise<{ canChange: boolean; role: string | null }> {
  const role = await getUserRoleInTenant(userId, tenantId);
  
  if (!role) {
    return { canChange: false, role: null };
  }
  
  // Only owners and configurators can change environment
  const canChange = ['owner', 'config'].includes(role);
  
  return { canChange, role };
}

// Create audit log entry for environment changes
export async function logEnvironmentChange(data: {
  tenantId: string;
  userId: string;
  fromEnvironment: string;
  toEnvironment: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await db.insert(auditLog).values({
    tenantId: data.tenantId,
    actorUserId: data.userId,
    action: 'environment_change',
    metadata: {
      fromEnvironment: data.fromEnvironment,
      toEnvironment: data.toEnvironment,
      timestamp: new Date().toISOString(),
    },
    ipAddress: data.ipAddress || null,
    userAgent: data.userAgent || null,
  });
}
