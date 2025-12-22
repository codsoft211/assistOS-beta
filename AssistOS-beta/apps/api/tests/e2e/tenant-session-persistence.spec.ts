import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import { registerUser, waitForAuth, getCurrentSession } from './helpers/auth-helpers';
import { setupUserWith2Tenants, switchTenant } from './helpers/tenant-helpers';
import { cleanupTestData } from './helpers/db-helpers';
import { apiRequest } from './helpers/api-helpers';

test.describe('Tenant Session Persistence', () => {
  test('should persist default tenant after page reload', async ({ page }) => {
    const uniqueId = nanoid(10);
    const email = `persist-${uniqueId}@example.com`;
    const organizationName = `Persist Org ${uniqueId}`;

    // Register user
    await registerUser(page, {
      email,
      firstName: 'Persist',
      lastName: 'User',
      password: 'password123',
      organizationName,
    });

    await waitForAuth(page);

    // Verify initial tenant via API
    const initialSession = await getCurrentSession(page);
    expect(initialSession.activeTenant).toBeTruthy();
    expect(initialSession.activeTenant!.name).toBe(organizationName);

    const initialTenantId = initialSession.activeTenant!.id;

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify tenant persists after reload
    const reloadedSession = await getCurrentSession(page);
    expect(reloadedSession.activeTenant).toBeTruthy();
    expect(reloadedSession.activeTenant!.id).toBe(initialTenantId);
    expect(reloadedSession.activeTenant!.name).toBe(organizationName);

    // Cleanup
    await cleanupTestData(page, {
      users: [initialSession.user.id],
      tenants: [initialTenantId],
    });
  });

  test('should update session data when switching tenants', async ({ page }) => {
    // Setup user with 2 tenants
    const { user, tenants, createdUserIds, createdTenantIds } = await setupUserWith2Tenants(page);

    try {
      // Verify initial session points to first tenant
      const initialSession = await getCurrentSession(page);
      expect(initialSession.activeTenant).toBeTruthy();
      const initialTenantId = initialSession.activeTenant!.id;

      // Switch to second tenant
      await switchTenant(page, tenants[1].slug);
      await page.waitForLoadState('networkidle');

      // Verify session data updated via API call
      const updatedSession = await getCurrentSession(page);
      expect(updatedSession.activeTenant).toBeTruthy();
      expect(updatedSession.activeTenant!.id).toBe(tenants[1].id);
      expect(updatedSession.activeTenant!.id).not.toBe(initialTenantId);

      // Verify the tenant name also updated
      expect(updatedSession.activeTenant!.name).toBe(tenants[1].name);
    } finally {
      await cleanupTestData(page, {
        users: createdUserIds,
        tenants: createdTenantIds,
      });
    }
  });

  test('should maintain tenant context after switching and reloading', async ({ page }) => {
    // Setup user with 2 tenants
    const { user, tenants, createdUserIds, createdTenantIds } = await setupUserWith2Tenants(page);

    try {
      // Switch to second tenant
      await switchTenant(page, tenants[1].slug);
      await page.waitForLoadState('networkidle');

      // Verify switched to second tenant
      const switchedSession = await getCurrentSession(page);
      expect(switchedSession.activeTenant).toBeTruthy();
      expect(switchedSession.activeTenant!.id).toBe(tenants[1].id);

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify tenant context persisted after reload
      const reloadedSession = await getCurrentSession(page);
      expect(reloadedSession.activeTenant).toBeTruthy();
      expect(reloadedSession.activeTenant!.id).toBe(tenants[1].id);
      expect(reloadedSession.activeTenant!.name).toBe(tenants[1].name);

      // Verify user can still access tenant-specific data
      const tenantsResponse = await apiRequest(page, '/api/tenants', { method: 'GET' });
      expect(tenantsResponse.ok).toBe(true);
      expect(tenantsResponse.data).toBeInstanceOf(Array);
    } finally {
      await cleanupTestData(page, {
        users: createdUserIds,
        tenants: createdTenantIds,
      });
    }
  });

  test('should verify session cookie is set after login', async ({ page, context }) => {
    const uniqueId = nanoid(10);
    const email = `cookie-${uniqueId}@example.com`;

    // Register user
    await registerUser(page, {
      email,
      firstName: 'Cookie',
      lastName: 'User',
      password: 'password123',
      organizationName: `Cookie Org ${uniqueId}`,
    });

    await waitForAuth(page);

    // Verify session cookie is set
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(c => c.name === 'connect.sid');
    
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.value).toBeTruthy();

    // Verify the session cookie allows API access
    const session = await getCurrentSession(page);
    expect(session.user).toBeTruthy();
    expect(session.user.email).toBe(email);

    // Cleanup
    await cleanupTestData(page, {
      users: [session.user.id],
      tenants: session.activeTenant ? [session.activeTenant.id] : [],
    });
  });

  test('should verify tenant switching updates activeTenantId in session', async ({ page }) => {
    // Setup user with 2 tenants
    const { user, tenants, createdUserIds, createdTenantIds } = await setupUserWith2Tenants(page);

    try {
      // Get initial activeTenantId
      const initialSession = await getCurrentSession(page);
      expect(initialSession.activeTenant).toBeTruthy();
      const initialActiveTenantId = initialSession.activeTenant!.id;

      // Verify initial tenant
      expect(tenants.map(t => t.id)).toContain(initialActiveTenantId);

      // Switch to the other tenant
      const targetTenant = tenants.find(t => t.id !== initialActiveTenantId)!;
      await switchTenant(page, targetTenant.slug);
      await page.waitForLoadState('networkidle');

      // Verify activeTenantId changed
      const updatedSession = await getCurrentSession(page);
      expect(updatedSession.activeTenant).toBeTruthy();
      expect(updatedSession.activeTenant!.id).toBe(targetTenant.id);
      expect(updatedSession.activeTenant!.id).not.toBe(initialActiveTenantId);

      // Verify user still has access to both tenants
      const tenantsResponse = await apiRequest(page, '/api/tenants', { method: 'GET' });
      expect(tenantsResponse.ok).toBe(true);
      const userTenants = tenantsResponse.data;
      expect(userTenants.length).toBeGreaterThanOrEqual(2);
    } finally {
      await cleanupTestData(page, {
        users: createdUserIds,
        tenants: createdTenantIds,
      });
    }
  });
});
