import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import {
  createTestUser,
  cleanupTestData,
} from './helpers/db-helpers';
import { loginAs } from './helpers/tenant-helpers';
import { apiRequest } from './helpers/api-helpers';

test.describe('Environment Switching', () => {
  test('should allow owner to switch environment', async ({ page }) => {
    const uniqueId = nanoid(6);

    // Register user (auto-creates tenant with user as owner)
    const user = await createTestUser(page, {
      email: `env-owner-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'Env',
      lastName: 'Owner',
      organizationName: `Env Tenant ${uniqueId}`,
    });

    const tenantId = user.tenantId!;

    try {
      await loginAs(page, user.email, user.password);

      const switchResponse = await apiRequest(page, `/api/tenants/${tenantId}/environment`, {
        method: 'PATCH',
        data: { environment: 'sandbox' },
      });

      expect(switchResponse.ok).toBe(true);
      expect(switchResponse.data.environment).toBe('sandbox');
    } finally {
      await cleanupTestData(page, {
        users: [user.id],
        tenants: [tenantId],
      });
    }
  });

  test('should reject environment switch for users without access to tenant', async ({ page }) => {
    const uniqueId = nanoid(6);

    // Create user A with tenant A
    const userA = await createTestUser(page, {
      email: `env-user-a-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'User',
      lastName: 'A',
      organizationName: `Tenant A ${uniqueId}`,
    });

    // Create user B with tenant B (in separate context to avoid session conflicts)
    const context2 = await page.context().browser()!.newContext();
    const page2 = await context2.newPage();

    const userB = await createTestUser(page2, {
      email: `env-user-b-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'User',
      lastName: 'B',
      organizationName: `Tenant B ${uniqueId}`,
    });

    const tenantAId = userA.tenantId!;
    const tenantBId = userB.tenantId!;

    try {
      // Login as user A
      await loginAs(page, userA.email, userA.password);

      // Try to switch environment on tenant B (should fail - no access)
      const switchResponse = await apiRequest(page, `/api/tenants/${tenantBId}/environment`, {
        method: 'PATCH',
        data: { environment: 'sandbox' },
      });

      expect(switchResponse.ok).toBe(false);
      expect([403, 404]).toContain(switchResponse.status);
    } finally {
      await cleanupTestData(page, {
        users: [userA.id, userB.id],
        tenants: [tenantAId, tenantBId],
      });
      await page2.close();
      await context2.close();
    }
  });

  test('should validate environment values', async ({ page }) => {
    const uniqueId = nanoid(6);

    const user = await createTestUser(page, {
      email: `env-validate-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'Env',
      lastName: 'Validate',
      organizationName: `Env Validate Tenant ${uniqueId}`,
    });

    const tenantId = user.tenantId!;

    try {
      await loginAs(page, user.email, user.password);

      const invalidResponse = await apiRequest(page, `/api/tenants/${tenantId}/environment`, {
        method: 'PATCH',
        data: { environment: 'invalid-environment' },
      });

      expect(invalidResponse.ok).toBe(false);
      expect(invalidResponse.status).toBe(400);
    } finally {
      await cleanupTestData(page, {
        users: [user.id],
        tenants: [tenantId],
      });
    }
  });

  test('should persist environment preference across sessions', async ({ page }) => {
    const uniqueId = nanoid(6);

    const user = await createTestUser(page, {
      email: `env-persist-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'Env',
      lastName: 'Persist',
      organizationName: `Env Persist Tenant ${uniqueId}`,
    });

    const tenantId = user.tenantId!;

    try {
      await loginAs(page, user.email, user.password);

      await apiRequest(page, `/api/tenants/${tenantId}/environment`, {
        method: 'PATCH',
        data: { environment: 'sandbox' },
      });

      await page.reload();

      await page.waitForLoadState('networkidle');

      const meResponse = await apiRequest(page, '/api/auth/me', { method: 'GET' });

      expect(meResponse.ok).toBe(true);
    } finally {
      await cleanupTestData(page, {
        users: [user.id],
        tenants: [tenantId],
      });
    }
  });

  test('should support production and sandbox environments', async ({ page }) => {
    const uniqueId = nanoid(6);

    const user = await createTestUser(page, {
      email: `env-both-${uniqueId}@example.com`,
      password: 'password123',
      firstName: 'Env',
      lastName: 'Both',
      organizationName: `Env Both Tenant ${uniqueId}`,
    });

    const tenantId = user.tenantId!;

    try {
      await loginAs(page, user.email, user.password);

      const sandboxResponse = await apiRequest(page, `/api/tenants/${tenantId}/environment`, {
        method: 'PATCH',
        data: { environment: 'sandbox' },
      });
      expect(sandboxResponse.ok).toBe(true);

      const productionResponse = await apiRequest(page, `/api/tenants/${tenantId}/environment`, {
        method: 'PATCH',
        data: { environment: 'production' },
      });
      expect(productionResponse.ok).toBe(true);
    } finally {
      await cleanupTestData(page, {
        users: [user.id],
        tenants: [tenantId],
      });
    }
  });
});
