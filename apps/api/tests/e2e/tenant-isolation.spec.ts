import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import {
  createTestUser,
  cleanupTestData,
} from './helpers/db-helpers';
import { loginAs } from './helpers/tenant-helpers';
import { apiRequest } from './helpers/api-helpers';

test.describe('Tenant Isolation', () => {
  test('should isolate tenant data - user cannot access other tenant data', async ({ page }) => {
    const uniqueId = nanoid(6);

    // Create userA (registration auto-creates tenantA)
    const userA = await createTestUser(page, {
      email: `user-a-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'User',
      lastName: 'A',
      organizationName: `Tenant A ${uniqueId}`,
    });

    // Create userB in a separate browser context to avoid session conflicts
    // We need to use a new page context for the second user registration
    const context2 = await page.context().browser()!.newContext();
    const page2 = await context2.newPage();

    const userB = await createTestUser(page2, {
      email: `user-b-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'User',
      lastName: 'B',
      organizationName: `Tenant B ${uniqueId}`,
    });

    const tenantAId = userA.tenantId!;
    const tenantBId = userB.tenantId!;

    try {
      // Login as userA on original page
      await loginAs(page, userA.email, userA.password);

      // Verify userA can only see tenantA
      const tenantsResponse = await apiRequest(page, '/api/tenants', { method: 'GET' });

      expect(tenantsResponse.ok).toBe(true);
      expect(tenantsResponse.data).toBeInstanceOf(Array);

      const tenantIds = tenantsResponse.data.map((t: any) => t.id);
      expect(tenantIds).toContain(tenantAId);
      expect(tenantIds).not.toContain(tenantBId);
    } finally {
      // Cleanup
      await cleanupTestData(page, {
        users: [userA.id, userB.id],
        tenants: [tenantAId, tenantBId],
      });
      await page2.close();
      await context2.close();
    }
  });

  test('should prevent cross-tenant data access via API', async ({ page }) => {
    const uniqueId = nanoid(6);

    // Create userA (registration auto-creates tenantA)
    const userA = await createTestUser(page, {
      email: `api-user-a-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'API',
      lastName: 'UserA',
      organizationName: `API Tenant A ${uniqueId}`,
    });

    // Create tenantB in a separate browser context
    const context2 = await page.context().browser()!.newContext();
    const page2 = await context2.newPage();

    const userB = await createTestUser(page2, {
      email: `api-user-b-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'API',
      lastName: 'UserB',
      organizationName: `API Tenant B ${uniqueId}`,
    });

    const tenantAId = userA.tenantId!;
    const tenantBId = userB.tenantId!;

    try {
      // Login as userA
      await loginAs(page, userA.email, userA.password);

      // Try to access tenantB (should fail)
      const unauthorizedResponse = await page.request.get(
        `http://0.0.0.0:5000/api/tenants/${tenantBId}`
      );

      expect(unauthorizedResponse.status()).not.toBe(200);
      expect([401, 403, 404]).toContain(unauthorizedResponse.status());
    } finally {
      await cleanupTestData(page, {
        users: [userA.id, userB.id],
        tenants: [tenantAId, tenantBId],
      });
      await page2.close();
      await context2.close();
    }
  });

  test('should ensure tenant context is set correctly', async ({ page }) => {
    const uniqueId = nanoid(6);

    // Create user (registration auto-creates tenant)
    const user = await createTestUser(page, {
      email: `context-user-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'Context',
      lastName: 'User',
      organizationName: `Context Tenant ${uniqueId}`,
    });

    const tenantId = user.tenantId!;

    try {
      // Login as user
      await loginAs(page, user.email, user.password);

      // Verify tenant context is set correctly
      const meResponse = await apiRequest(page, '/api/auth/me', { method: 'GET' });

      expect(meResponse.ok).toBe(true);
      expect(meResponse.data.activeTenant).toBeDefined();
      expect(meResponse.data.activeTenant.id).toBe(tenantId);
    } finally {
      await cleanupTestData(page, {
        users: [user.id],
        tenants: [tenantId],
      });
    }
  });
});
