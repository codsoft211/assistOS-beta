import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantId?: string;
}

export interface TestTenant {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

export interface TestDataTracker {
  users: string[];
  tenants: string[];
}

/**
 * Create a test user via registration API.
 * 
 * **Important Notes:**
 * - Registration automatically creates a tenant for the user
 * - **First user registered becomes platform admin** (isPlatformAdmin = true)
 * - Platform admin privilege enables privileged cleanup via `/api/admin/cleanup-test-data`
 * - This ensures test cleanup works correctly for the first test that runs
 * 
 * @param page - Playwright page instance
 * @param data - User registration data
 * @returns Created test user with tenant ID
 * 
 * @example
 * ```typescript
 * const user = await createTestUser(page, {
 *   email: 'test@example.com',
 *   password: 'password123',
 *   firstName: 'Test',
 *   lastName: 'User',
 *   organizationName: 'Test Org',
 * });
 * // user.isPlatformAdmin will be true if this is the first user
 * ```
 */
export async function createTestUser(
  page: Page,
  data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }
): Promise<TestUser> {
  const response = await page.request.post('http://0.0.0.0:5000/api/auth/register', {
    data: {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      password: data.password,
      organizationName: data.organizationName,
    },
  });

  expect(response.status()).toBe(201);
  const result = await response.json();

  return {
    id: result.user.id,
    email: result.user.email,
    password: data.password,
    firstName: result.user.firstName,
    lastName: result.user.lastName,
    tenantId: result.tenant.id,
  };
}

/**
 * Create a test tenant via API (requires authenticated session).
 */
export async function createTestTenant(
  page: Page,
  data: {
    name: string;
  }
): Promise<TestTenant> {
  const response = await page.request.post('http://0.0.0.0:5000/api/tenants', {
    data: {
      name: data.name,
    },
  });

  expect(response.status()).toBe(201);
  const result = await response.json();

  return {
    id: result.id,
    name: result.name,
    slug: result.slug,
    role: result.role,
  };
}

/**
 * Get user's tenants via API (requires authenticated session).
 */
export async function getUserTenants(page: Page): Promise<TestTenant[]> {
  const response = await page.request.get('http://0.0.0.0:5000/api/tenants');

  expect(response.status()).toBe(200);
  const tenants = await response.json();

  return tenants.map((t: any) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    role: t.role,
  }));
}

/**
 * Cleanup test user by deleting via API.
 * NOTE: This will also cascade delete associated tenant memberships.
 * 
 * @deprecated Use cleanupTestData instead, which uses the admin cleanup endpoint
 */
export async function cleanupTestUser(page: Page, userId: string) {
  try {
    // First, login as platform admin or use an authenticated context
    // that has permission to delete users
    const response = await page.request.delete(`http://0.0.0.0:5000/api/users/${userId}`);
    
    if (response.status() !== 200 && response.status() !== 204) {
      console.warn(`Failed to delete user ${userId}: ${response.status()}`);
    }
  } catch (error) {
    console.warn(`Error deleting user ${userId}:`, error);
  }
}

/**
 * Cleanup test tenant by deleting via API.
 * NOTE: Since DELETE /api/tenants/:id endpoint may not exist,
 * we rely on CASCADE deletes when users are deleted.
 * If the endpoint exists, this will delete the tenant.
 * 
 * @deprecated Use cleanupTestData instead, which uses the admin cleanup endpoint
 */
export async function cleanupTestTenant(page: Page, tenantId: string) {
  try {
    // Attempt to delete tenant if endpoint exists
    const response = await page.request.delete(`http://0.0.0.0:5000/api/tenants/${tenantId}`);
    
    if (response.status() !== 200 && response.status() !== 204 && response.status() !== 404) {
      console.warn(`Failed to delete tenant ${tenantId}: ${response.status()}`);
    }
  } catch (error) {
    console.warn(`Error deleting tenant ${tenantId}:`, error);
  }
}

/**
 * Comprehensive cleanup for test data using admin endpoint.
 * 
 * This function uses the `/api/admin/cleanup-test-data` endpoint which:
 * - Requires platform admin privileges (first user is automatically platform admin)
 * - Only available in development environment (blocked in production)
 * - Provides privileged cleanup that bypasses normal tenant-level access controls
 * 
 * Cleans up both users and tenants to prevent data pollution between test runs.
 * 
 * **CI Safeguard:**
 * In CI environment (CI=true), cleanup failures are treated as hard errors to prevent
 * data pollution that could break subsequent test runs.
 * 
 * @param page - Playwright page instance with authenticated session
 * @param data - Object containing arrays of user IDs and tenant IDs to delete
 * 
 * @example
 * ```typescript
 * test('my test', async ({ page }) => {
 *   const user = await createTestUser(page, { ... });
 *   try {
 *     // Test logic here
 *   } finally {
 *     await cleanupTestData(page, {
 *       users: [user.id],
 *       tenants: [user.tenantId],
 *     });
 *   }
 * });
 * ```
 */
export async function cleanupTestData(
  page: Page,
  data: { users?: string[]; tenants?: string[] }
): Promise<void> {
  try {
    // Use admin cleanup endpoint with elevated privileges
    const response = await page.request.post('http://0.0.0.0:5000/api/admin/cleanup-test-data', {
      data: {
        users: data.users || [],
        tenants: data.tenants || [],
      },
    });
    
    if (!response.ok()) {
      console.warn(`[Cleanup] Failed with status ${response.status()}`);
      const body = await response.json().catch(() => ({ error: 'Failed to parse response' }));
      console.warn('[Cleanup] Response:', body);
      
      // CI safeguard: Treat non-2xx as hard error to prevent data pollution
      if (process.env.CI) {
        throw new Error(`Cleanup failed: ${JSON.stringify(body)}`);
      }
    } else {
      const results = await response.json();
      console.log('[Cleanup] Results:', results);
      
      // CI safeguard: Treat cleanup errors as hard errors
      if (process.env.CI && results.errors && results.errors.length > 0) {
        throw new Error(`Cleanup had errors: ${results.errors.join(', ')}`);
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    
    // Re-throw in CI to fail the test
    if (process.env.CI) {
      throw error;
    }
  }
}

/**
 * Cleanup all test data (for use in global teardown).
 * WARNING: This is destructive and should only be used in test environments.
 */
export async function cleanupAllTestData(page: Page) {
  console.warn('cleanupAllTestData: This function should only be called in test cleanup');
  // This would require an admin endpoint that doesn't exist yet
  // For now, we rely on individual cleanup functions
}
