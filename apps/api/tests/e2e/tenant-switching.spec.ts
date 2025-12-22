import { test, expect } from '@playwright/test';
import { loginAs, setupUserWith2Tenants } from './helpers/tenant-helpers';
import { switchTenant, getCurrentTenant } from './helpers/tenant-helpers';
import { cleanupTestData } from './helpers/db-helpers';

test.describe('Tenant Switching Flow', () => {
  test('should allow user to switch between tenants', async ({ page }) => {
    const { user, tenants, createdUserIds, createdTenantIds } = await setupUserWith2Tenants(page);

    try {
      await loginAs(page, user.email, user.password);

      const initialTenant = await getCurrentTenant(page);
      expect(initialTenant).toContain(tenants[0].name);

      await switchTenant(page, tenants[1].slug);

      await page.waitForLoadState('networkidle');

      const newTenant = await getCurrentTenant(page);
      expect(newTenant).toContain(tenants[1].name);
    } finally {
      await cleanupTestData(page, {
        users: createdUserIds,
        tenants: createdTenantIds,
      });
    }
  });

  test('should display all user tenants in switcher', async ({ page }) => {
    const { user, tenants, createdUserIds, createdTenantIds } = await setupUserWith2Tenants(page);

    try {
      await loginAs(page, user.email, user.password);

      await page.click('[data-testid="button-user-menu"]');

      const switchTenantButton = page.locator('[data-testid="menu-switch-tenant"]');
      await expect(switchTenantButton).toBeVisible();

      await switchTenantButton.click();

      for (const tenant of tenants) {
        const tenantOption = page.locator(`[data-testid="menu-tenant-${tenant.slug}"]`);
        await expect(tenantOption).toBeVisible();
        await expect(tenantOption).toContainText(tenant.name);
      }
    } finally {
      await cleanupTestData(page, {
        users: createdUserIds,
        tenants: createdTenantIds,
      });
    }
  });

  test('should update UI to reflect current tenant after switch', async ({ page }) => {
    const { user, tenants, createdUserIds, createdTenantIds } = await setupUserWith2Tenants(page);

    try {
      await loginAs(page, user.email, user.password);

      await switchTenant(page, tenants[1].slug);

      await page.waitForLoadState('networkidle');

      const userMenuButton = page.locator('[data-testid="button-user-menu"]');
      await expect(userMenuButton).toContainText(tenants[1].name);
    } finally {
      await cleanupTestData(page, {
        users: createdUserIds,
        tenants: createdTenantIds,
      });
    }
  });

  test('should maintain session after tenant switch', async ({ page }) => {
    const { user, tenants, createdUserIds, createdTenantIds } = await setupUserWith2Tenants(page);

    try {
      await loginAs(page, user.email, user.password);

      await switchTenant(page, tenants[1].slug);

      await page.reload();

      const currentTenant = await getCurrentTenant(page);
      expect(currentTenant).toContain(tenants[1].name);

      const userMenuButton = page.locator('[data-testid="button-user-menu"]');
      await expect(userMenuButton).toContainText(user.firstName);
    } finally {
      await cleanupTestData(page, {
        users: createdUserIds,
        tenants: createdTenantIds,
      });
    }
  });

  test('should reload page data after tenant switch', async ({ page }) => {
    const { user, tenants, createdUserIds, createdTenantIds } = await setupUserWith2Tenants(page);

    try {
      await loginAs(page, user.email, user.password);

      await page.waitForLoadState('networkidle');

      await switchTenant(page, tenants[1].slug);

      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(1000);

      const currentTenant = await getCurrentTenant(page);
      expect(currentTenant).toContain(tenants[1].name);
    } finally {
      await cleanupTestData(page, {
        users: createdUserIds,
        tenants: createdTenantIds,
      });
    }
  });
});
