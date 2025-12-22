import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import { registerUser, waitForAuth, waitForUserInfo, getCurrentSession } from './helpers/auth-helpers';
import { cleanupTestData } from './helpers/db-helpers';

test.describe('User Registration Flow', () => {
  test('should successfully register a new user with tenant auto-creation', async ({ page }) => {
    const uniqueId = nanoid(10);
    const email = `test-${uniqueId}@example.com`;
    const organizationName = `Test Organization ${uniqueId}`;

    const userData = await registerUser(page, {
      email,
      firstName: 'John',
      lastName: 'Doe',
      password: 'password123',
      organizationName,
    });

    await waitForAuth(page);

    await waitForUserInfo(page);

    const userMenuButton = page.locator('[data-testid="button-user-menu"]');
    await expect(userMenuButton).toContainText('John');
    await expect(userMenuButton).toContainText(organizationName);

    // Get session to extract user ID and tenant ID for cleanup
    const session = await getCurrentSession(page);
    await cleanupTestData(page, {
      users: [session.user.id],
      tenants: session.activeTenant ? [session.activeTenant.id] : [],
    });
  });

  test('should reject duplicate email registration', async ({ page }) => {
    const uniqueId = nanoid(10);
    const email = `duplicate-${uniqueId}@example.com`;

    await registerUser(page, {
      email,
      firstName: 'First',
      lastName: 'User',
      password: 'password123',
      organizationName: `Org ${uniqueId}`,
    });

    await waitForAuth(page);

    // Get session for cleanup
    const session = await getCurrentSession(page);

    await page.goto('/register');

    await page.fill('[data-testid="input-organization-name"]', `Another Org ${uniqueId}`);
    await page.fill('[data-testid="input-first-name"]', 'Second');
    await page.fill('[data-testid="input-last-name"]', 'User');
    await page.fill('[data-testid="input-email"]', email);
    await page.fill('[data-testid="input-password"]', 'password123');
    await page.fill('[data-testid="input-confirm-password"]', 'password123');

    await page.click('[data-testid="button-register"]');

    await expect(page.locator('text=Email already registered')).toBeVisible({ timeout: 5000 });

    // Cleanup
    await cleanupTestData(page, {
      users: [session.user.id],
      tenants: session.activeTenant ? [session.activeTenant.id] : [],
    });
  });

  test('should reject registration with short password', async ({ page }) => {
    const uniqueId = nanoid(10);
    const email = `short-pass-${uniqueId}@example.com`;

    await page.goto('/register');

    await page.fill('[data-testid="input-organization-name"]', `Org ${uniqueId}`);
    await page.fill('[data-testid="input-first-name"]', 'Test');
    await page.fill('[data-testid="input-last-name"]', 'User');
    await page.fill('[data-testid="input-email"]', email);
    await page.fill('[data-testid="input-password"]', 'short');
    await page.fill('[data-testid="input-confirm-password"]', 'short');

    await page.click('[data-testid="button-register"]');

    await expect(page.locator('text=/Password must be at least/i')).toBeVisible();
  });

  test('should reject registration with mismatched passwords', async ({ page }) => {
    const uniqueId = nanoid(10);
    const email = `mismatch-${uniqueId}@example.com`;

    await page.goto('/register');

    await page.fill('[data-testid="input-organization-name"]', `Org ${uniqueId}`);
    await page.fill('[data-testid="input-first-name"]', 'Test');
    await page.fill('[data-testid="input-last-name"]', 'User');
    await page.fill('[data-testid="input-email"]', email);
    await page.fill('[data-testid="input-password"]', 'password123');
    await page.fill('[data-testid="input-confirm-password"]', 'different123');

    await page.click('[data-testid="button-register"]');

    await expect(page.locator('text=/don\'t match/i')).toBeVisible();
  });

  test('should require organization name', async ({ page }) => {
    const uniqueId = nanoid(10);
    const email = `no-org-${uniqueId}@example.com`;

    await page.goto('/register');

    await page.fill('[data-testid="input-first-name"]', 'Test');
    await page.fill('[data-testid="input-last-name"]', 'User');
    await page.fill('[data-testid="input-email"]', email);
    await page.fill('[data-testid="input-password"]', 'password123');
    await page.fill('[data-testid="input-confirm-password"]', 'password123');

    await page.click('[data-testid="button-register"]');

    await expect(page.locator('text=/organization.*required/i')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/register');

    await page.fill('[data-testid="input-organization-name"]', 'Test Org');
    await page.fill('[data-testid="input-first-name"]', 'Test');
    await page.fill('[data-testid="input-last-name"]', 'User');
    await page.fill('[data-testid="input-email"]', 'invalid-email');
    await page.fill('[data-testid="input-password"]', 'password123');
    await page.fill('[data-testid="input-confirm-password"]', 'password123');

    await page.click('[data-testid="button-register"]');

    await expect(page.locator('text=/invalid.*email/i')).toBeVisible();
  });

  test('should establish session after successful registration', async ({ page }) => {
    const uniqueId = nanoid(10);
    const email = `session-${uniqueId}@example.com`;

    await registerUser(page, {
      email,
      firstName: 'Session',
      lastName: 'Test',
      password: 'password123',
      organizationName: `Session Org ${uniqueId}`,
    });

    await waitForAuth(page);

    await page.reload();

    await waitForUserInfo(page);

    const userMenuButton = page.locator('[data-testid="button-user-menu"]');
    await expect(userMenuButton).toContainText('Session');

    // Get session to extract user ID and tenant ID for cleanup
    const session = await getCurrentSession(page);
    await cleanupTestData(page, {
      users: [session.user.id],
      tenants: session.activeTenant ? [session.activeTenant.id] : [],
    });
  });
});
