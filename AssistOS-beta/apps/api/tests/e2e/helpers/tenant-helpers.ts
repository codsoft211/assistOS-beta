import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import { createTestUser, createTestTenant, getUserTenants, type TestTenant, type TestUser } from './db-helpers';
import { loginViaAPI, getCurrentSession, verifyAuthenticated } from './auth-helpers';
import { apiRequest } from './api-helpers';

export interface TenantSetupResult {
  user: TestUser;
  tenants: TestTenant[];
  createdUserIds: string[];
  createdTenantIds: string[];
}

/**
 * Switch tenant via UI interaction.
 */
export async function switchTenant(page: Page, tenantSlug: string) {
  await page.click('[data-testid="button-user-menu"]');

  await page.click('[data-testid="menu-switch-tenant"]');

  await page.click(`[data-testid="menu-tenant-${tenantSlug}"]`);

  await page.waitForLoadState('networkidle');
}

/**
 * Switch tenant via API (more reliable for testing).
 */
export async function switchTenantViaAPI(page: Page, tenantId: string): Promise<void> {
  const response = await apiRequest(page, '/api/auth/switch-tenant', {
    method: 'POST',
    data: { tenantId },
  });

  expect(response.status).toBe(200);
  expect(response.data.id).toBe(tenantId);

  // Verify session was updated
  const session = await getCurrentSession(page);
  expect(session.activeTenant?.id).toBe(tenantId);
}

/**
 * Get current tenant name from UI.
 */
export async function getCurrentTenant(page: Page): Promise<string | null> {
  await page.click('[data-testid="button-user-menu"]');

  const tenantName = await page
    .locator('[data-testid="button-user-menu"] .text-xs.text-muted-foreground')
    .textContent();

  await page.keyboard.press('Escape');

  return tenantName;
}

/**
 * Get current tenant data from API.
 */
export async function getCurrentTenantData(page: Page): Promise<TestTenant | null> {
  const session = await getCurrentSession(page);
  return session.activeTenant ? {
    id: session.activeTenant.id,
    name: session.activeTenant.name,
    slug: session.activeTenant.slug,
    role: session.activeTenant.role,
  } : null;
}

/**
 * Get tenant list from UI.
 */
export async function getTenantList(page: Page): Promise<string[]> {
  await page.click('[data-testid="button-user-menu"]');

  await page.click('[data-testid="menu-switch-tenant"]');

  const tenants = await page.locator('[data-testid^="menu-tenant-"]').allTextContents();

  await page.keyboard.press('Escape');

  return tenants;
}

/**
 * Setup a user with 2 tenants using HTTP fixtures.
 * 
 * CRITICAL: This function now uses page.request for all operations.
 * 1. Register user (creates user + first tenant automatically)
 * 2. Login as that user
 * 3. Create second tenant via API
 * 
 * Returns user, tenants, and tracking IDs for cleanup.
 */
export async function setupUserWith2Tenants(page: Page): Promise<TenantSetupResult> {
  const uniqueId = nanoid(6);

  // 1. Register user via API (automatically creates first tenant)
  const user = await createTestUser(page, {
    email: `user-${uniqueId}@example.com`,
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    organizationName: `Tenant A ${uniqueId}`,
  });

  // Track created user ID for cleanup
  const createdUserIds = [user.id];
  const createdTenantIds = user.tenantId ? [user.tenantId] : [];

  // 2. Login as the created user to establish session
  await loginViaAPI(page, user.email, user.password);

  // 3. Get first tenant (created during registration)
  const userTenantsAfterRegistration = await getUserTenants(page);
  const tenant1 = userTenantsAfterRegistration[0];

  if (!tenant1) {
    throw new Error('First tenant was not created during registration');
  }

  // 4. Create second tenant via API (user is already authenticated)
  const tenant2 = await createTestTenant(page, {
    name: `Tenant B ${uniqueId}`,
  });

  createdTenantIds.push(tenant2.id);

  return {
    user,
    tenants: [tenant1, tenant2],
    createdUserIds,
    createdTenantIds,
  };
}

/**
 * Login and wait for navigation using API authentication.
 * This is more reliable than UI-based login and properly verifies session.
 */
export async function loginAs(page: Page, email: string, password: string = 'password123') {
  await loginViaAPI(page, email, password);

  // Navigate to dashboard
  await page.goto('/chat');
  await page.waitForURL(/\/(chat|dashboard)/);

  // Verify authentication
  const isAuth = await verifyAuthenticated(page);
  expect(isAuth).toBe(true);
}
