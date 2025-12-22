import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import { loginUser, logoutUser, waitForAuth, isLoggedIn, getCurrentSession } from './helpers/auth-helpers';
import { createTestUser, cleanupTestData } from './helpers/db-helpers';

test.describe('Login/Logout Flow', () => {
  test('should successfully login with valid credentials', async ({ page }) => {
    const uniqueId = nanoid(10);
    const testEmail = `login-test-${uniqueId}@example.com`;
    const testPassword = 'password123';

    // Create test user
    const user = await createTestUser(page, {
      email: testEmail,
      firstName: 'Login',
      lastName: 'Test',
      password: testPassword,
      organizationName: `Login Org ${uniqueId}`,
    });

    try {
      // Logout from auto-login after registration
      await logoutUser(page);
      await page.waitForURL('**/login');

      // Now test login
      await loginUser(page, testEmail, testPassword);

      await waitForAuth(page);

      const userMenuButton = page.locator('[data-testid="button-user-menu"]');
      await expect(userMenuButton).toContainText('Login');
    } finally {
      await cleanupTestData(page, {
        users: [user.id],
        tenants: user.tenantId ? [user.tenantId] : [],
      });
    }
  });

  test('should reject login with invalid password', async ({ page }) => {
    const uniqueId = nanoid(10);
    const testEmail = `login-invalid-${uniqueId}@example.com`;
    const testPassword = 'password123';

    // Create test user
    const user = await createTestUser(page, {
      email: testEmail,
      firstName: 'Login',
      lastName: 'Test',
      password: testPassword,
      organizationName: `Login Org ${uniqueId}`,
    });

    try {
      // Logout from auto-login after registration
      await logoutUser(page);
      await page.waitForURL('**/login');

      // Try login with wrong password
      await loginUser(page, testEmail, 'wrongpassword');

      await expect(page.locator('text=/invalid.*password/i')).toBeVisible({ timeout: 5000 });

      await expect(page).toHaveURL(/.*\/login/);
    } finally {
      // Re-login before cleanup (test left user logged out)
      await loginUser(page, testEmail, testPassword);
      await waitForAuth(page);
      
      // Cleanup BEFORE logout (while still authenticated)
      await cleanupTestData(page, {
        users: [user.id],
        tenants: user.tenantId ? [user.tenantId] : [],
      });
    }
  });

  test('should reject login with non-existent email', async ({ page }) => {
    await page.goto('/login');

    await loginUser(page, `nonexistent-${nanoid(10)}@example.com`, 'password123');

    await expect(page.locator('text=/invalid.*email.*password/i')).toBeVisible({ timeout: 5000 });
  });

  test('should clear session on logout', async ({ page }) => {
    const uniqueId = nanoid(10);
    const testEmail = `logout-test-${uniqueId}@example.com`;
    const testPassword = 'password123';

    // Create test user
    const user = await createTestUser(page, {
      email: testEmail,
      firstName: 'Logout',
      lastName: 'Test',
      password: testPassword,
      organizationName: `Logout Org ${uniqueId}`,
    });

    try {
      // Logout from auto-login after registration
      await logoutUser(page);
      await page.waitForURL('**/login');

      // Login
      await loginUser(page, testEmail, testPassword);
      await waitForAuth(page);

      // Now test logout
      await logoutUser(page);

      await page.waitForURL('**/login');

      const loggedIn = await isLoggedIn(page);
      expect(loggedIn).toBe(false);
    } finally {
      // Re-login before cleanup (test logged user out)
      await loginUser(page, testEmail, testPassword);
      await waitForAuth(page);
      
      // Cleanup BEFORE logout (while still authenticated)
      await cleanupTestData(page, {
        users: [user.id],
        tenants: user.tenantId ? [user.tenantId] : [],
      });
    }
  });

  test('should persist session across page refreshes', async ({ page }) => {
    const uniqueId = nanoid(10);
    const testEmail = `persist-test-${uniqueId}@example.com`;
    const testPassword = 'password123';

    // Create test user
    const user = await createTestUser(page, {
      email: testEmail,
      firstName: 'Persist',
      lastName: 'Test',
      password: testPassword,
      organizationName: `Persist Org ${uniqueId}`,
    });

    try {
      // Logout from auto-login after registration
      await logoutUser(page);
      await page.waitForURL('**/login');

      // Login
      await loginUser(page, testEmail, testPassword);
      await waitForAuth(page);

      // Test session persistence
      await page.reload();

      const loggedIn = await isLoggedIn(page);
      expect(loggedIn).toBe(true);

      const userMenuButton = page.locator('[data-testid="button-user-menu"]');
      await expect(userMenuButton).toContainText('Persist');
    } finally {
      await cleanupTestData(page, {
        users: [user.id],
        tenants: user.tenantId ? [user.tenantId] : [],
      });
    }
  });

  test('should redirect to login when accessing protected routes while not authenticated', async ({ page }) => {
    await page.goto('/dashboard');

    await page.waitForURL(/.*\/login/);
  });

  test('should redirect to intended page after login', async ({ page }) => {
    const uniqueId = nanoid(10);
    const testEmail = `redirect-test-${uniqueId}@example.com`;
    const testPassword = 'password123';

    // Create test user
    const user = await createTestUser(page, {
      email: testEmail,
      firstName: 'Redirect',
      lastName: 'Test',
      password: testPassword,
      organizationName: `Redirect Org ${uniqueId}`,
    });

    try {
      // Logout from auto-login after registration
      await logoutUser(page);
      await page.waitForURL('**/login');

      // Try to access protected route
      await page.goto('/dashboard');

      await page.waitForURL(/.*\/login/);

      // Login
      await loginUser(page, testEmail, testPassword);

      await page.waitForURL(/\/(chat|dashboard)/);
    } finally {
      await cleanupTestData(page, {
        users: [user.id],
        tenants: user.tenantId ? [user.tenantId] : [],
      });
    }
  });
});
