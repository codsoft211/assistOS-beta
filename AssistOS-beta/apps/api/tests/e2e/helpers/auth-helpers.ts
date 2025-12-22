import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import { apiRequest, verifySessionCookie } from './api-helpers';

export interface SessionData {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    lastLogin?: Date;
  };
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
  activeTenant: {
    id: string;
    name: string;
    slug: string;
    role: string;
  } | null;
}

export async function registerUser(
  page: Page,
  data: {
    email?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
    organizationName?: string;
  } = {}
) {
  const email = data.email || `test-${nanoid(10)}@example.com`;
  const firstName = data.firstName || 'Test';
  const lastName = data.lastName || 'User';
  const password = data.password || 'password123';
  const organizationName = data.organizationName || `Test Org ${nanoid(6)}`;

  await page.goto('/register');

  await page.fill('[data-testid="input-organization-name"]', organizationName);
  await page.fill('[data-testid="input-first-name"]', firstName);
  await page.fill('[data-testid="input-last-name"]', lastName);
  await page.fill('[data-testid="input-email"]', email);
  await page.fill('[data-testid="input-password"]', password);
  await page.fill('[data-testid="input-confirm-password"]', password);

  await page.click('[data-testid="button-register"]');

  return { email, firstName, lastName, password, organizationName };
}

export async function loginUser(
  page: Page,
  email: string,
  password: string
) {
  await page.goto('/login');

  await page.fill('[data-testid="input-email"]', email);
  await page.fill('[data-testid="input-password"]', password);

  await page.click('[data-testid="button-login"]');
}

/**
 * Login via API (more reliable for testing).
 * This bypasses the UI and directly authenticates via the API.
 */
export async function loginViaAPI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  const response = await apiRequest(page, '/api/auth/login', {
    method: 'POST',
    data: { email, password },
  });

  expect(response.status).toBe(200);
  expect(response.data.user).toBeDefined();
  expect(response.data.activeTenant).toBeDefined();

  // Verify session cookie was set
  const hasSession = await verifySessionCookie(page);
  expect(hasSession).toBe(true);
}

export async function logoutUser(page: Page) {
  await page.click('[data-testid="button-user-menu"]');
  await page.click('[data-testid="menu-logout"]');
}

/**
 * Logout via API (more reliable for testing).
 */
export async function logoutViaAPI(page: Page): Promise<void> {
  await apiRequest(page, '/api/auth/logout', {
    method: 'POST',
  });
}

export async function waitForAuth(page: Page, expectedUrl: string | RegExp = '/chat') {
  if (typeof expectedUrl === 'string') {
    await page.waitForURL(`**${expectedUrl}`);
  } else {
    await page.waitForURL(expectedUrl);
  }
}

export async function waitForUserInfo(page: Page) {
  await page.waitForSelector('[data-testid="button-user-menu"]', { state: 'visible' });
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector('[data-testid="button-user-menu"]', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function getUserInfo(page: Page) {
  await page.click('[data-testid="button-user-menu"]');

  const userName = await page.locator('[data-testid="button-user-menu"]').textContent();

  await page.keyboard.press('Escape');

  return { userName };
}

/**
 * Get current session data via API.
 * Returns user, tenants, and activeTenant information.
 */
export async function getCurrentSession(page: Page): Promise<SessionData> {
  const response = await apiRequest(page, '/api/auth/me', {
    method: 'GET',
  });

  expect(response.status).toBe(200);
  expect(response.data.user).toBeDefined();

  return response.data as SessionData;
}

/**
 * Verify that the user is authenticated and has a valid session.
 */
export async function verifyAuthenticated(page: Page): Promise<boolean> {
  try {
    const session = await getCurrentSession(page);
    return !!session.user && !!session.activeTenant;
  } catch {
    return false;
  }
}

/**
 * Get the active tenant ID from the current session.
 */
export async function getActiveTenantId(page: Page): Promise<string | null> {
  try {
    const session = await getCurrentSession(page);
    return session.activeTenant?.id || null;
  } catch {
    return null;
  }
}
