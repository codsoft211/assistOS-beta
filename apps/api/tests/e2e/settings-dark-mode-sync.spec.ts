import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import { registerUser, waitForAuth, getCurrentSession } from './helpers/auth-helpers';
import { cleanupTestData } from './helpers/db-helpers';

/**
 * E2E Test: Settings Chat↔Visual Dark Mode Sync
 * 
 * This test validates the real-time synchronization between:
 * 1. Chat interface (assistSettings agent)
 * 2. Visual settings panel (PreferenciasSettings component)
 * 3. Database persistence (users.preferences.theme)
 * 
 * Flow:
 * - User sends "enable dark mode" via chat
 * - AssistSettings tool executes update_user_preferences
 * - SSE event broadcasts settings:user.preferences.updated
 * - Visual panel auto-updates to show dark theme selected
 * - Database persists theme = 'dark' in users.preferences JSON
 */
test.describe('Settings Chat↔Visual Dark Mode Sync', () => {
  test('User enables dark mode via chat → visual panel updates → DB persists', async ({ page }) => {
    // ==================== STEP 1: SETUP - Register User ====================
    const uniqueId = nanoid(10);
    const email = `darkmode-test-${uniqueId}@example.com`;
    const organizationName = `DarkMode Test Org ${uniqueId}`;

    const userData = await registerUser(page, {
      email,
      firstName: 'Dark',
      lastName: 'Mode',
      password: 'password123',
      organizationName,
    });

    // Wait for auth redirect
    await waitForAuth(page);

    // Get session to extract user ID for DB verification
    const session = await getCurrentSession(page);
    const userId = session.user.id;

    console.log(`[Test] Registered user: ${email}, ID: ${userId}`);

    try {
      // ==================== STEP 2: Navigate to Settings ====================
      console.log('[Test] Navigating to /settings...');
      await page.goto('/settings');

      // Wait for PreferenciasSettings panel to load (default view)
      await page.waitForSelector('[data-testid="preferencias-settings"]', {
        timeout: 10000,
      });

      console.log('[Test] Settings page loaded successfully');

      // ==================== STEP 3: Verify Initial State ====================
      // Check that theme is NOT already set to dark (should be system or light by default)
      const initialDarkRadio = page.locator('[data-testid="radio-theme-dark"]');
      const isInitiallyChecked = await initialDarkRadio.isChecked();
      
      console.log(`[Test] Initial dark theme state: ${isInitiallyChecked ? 'checked' : 'unchecked'}`);

      // ==================== STEP 4: Send Chat Message ====================
      console.log('[Test] Sending chat message: "enable dark mode"...');

      const chatInput = page.locator('[data-testid="input-settings-message"]');
      await chatInput.waitFor({ state: 'visible', timeout: 5000 });

      await chatInput.fill('enable dark mode');

      const sendButton = page.locator('[data-testid="button-send-settings-message"]');
      await sendButton.click();

      console.log('[Test] Chat message sent, waiting for assistant response...');

      // ==================== STEP 5: Wait for SSE Event & Visual Update ====================
      // The SSE event (settings:user.preferences.updated) should trigger the visual panel to update.
      // We poll for the dark radio button to become checked (with generous timeout for SSE propagation).
      
      console.log('[Test] Waiting for dark theme radio to be checked (SSE event should trigger this)...');

      await expect(initialDarkRadio).toBeChecked({
        timeout: 15000, // 15 seconds to account for:
                        // - AI processing time (1-3s)
                        // - Tool execution (1-2s)
                        // - SSE propagation (1-2s)
                        // - UI update (instant)
      });

      console.log('[Test] ✅ Visual panel updated: dark theme is now selected');

      // Additional verification: Check that light and system are NOT checked
      const lightRadio = page.locator('[data-testid="radio-theme-light"]');
      const systemRadio = page.locator('[data-testid="radio-theme-system"]');

      await expect(lightRadio).not.toBeChecked();
      await expect(systemRadio).not.toBeChecked();

      console.log('[Test] ✅ Verified: only dark theme is selected');

      // ==================== STEP 6: Verify Database Persistence via API ====================
      console.log('[Test] Fetching user preferences via API to verify theme = "dark"...');

      // Small delay to ensure DB write completed (should be instant, but adding safety margin)
      await page.waitForTimeout(500);

      const response = await page.request.get('/api/users/preferences');
      expect(response.ok()).toBeTruthy();

      const preferences = await response.json();
      console.log('[Test] User preferences from API:', JSON.stringify(preferences, null, 2));

      // Verify theme = 'dark'
      expect(preferences.theme).toBe('dark');

      console.log('[Test] ✅ API verified: preferences.theme = "dark"');

      // ==================== SUCCESS ====================
      console.log('[Test] ✅ All checks passed! Chat↔Visual↔DB sync working correctly.');

    } finally {
      // ==================== CLEANUP ====================
      console.log('[Test] Cleaning up test data...');

      await cleanupTestData(page, {
        users: [userId],
        tenants: session.activeTenant ? [session.activeTenant.id] : [],
      });

      console.log('[Test] Cleanup completed');
    }
  });

  test('User switches from dark to light via chat → visual panel updates → DB persists', async ({ page }) => {
    // ==================== STEP 1: SETUP - Register User ====================
    const uniqueId = nanoid(10);
    const email = `lightmode-test-${uniqueId}@example.com`;
    const organizationName = `LightMode Test Org ${uniqueId}`;

    await registerUser(page, {
      email,
      firstName: 'Light',
      lastName: 'Mode',
      password: 'password123',
      organizationName,
    });

    await waitForAuth(page);

    const session = await getCurrentSession(page);
    const userId = session.user.id;

    console.log(`[Test] Registered user: ${email}, ID: ${userId}`);

    try {
      // ==================== STEP 2: Navigate to Settings ====================
      await page.goto('/settings');
      await page.waitForSelector('[data-testid="preferencias-settings"]', { timeout: 10000 });

      // ==================== STEP 3: First, Enable Dark Mode ====================
      console.log('[Test] Enabling dark mode first...');

      const chatInput = page.locator('[data-testid="input-settings-message"]');
      await chatInput.waitFor({ state: 'visible' });

      await chatInput.fill('enable dark mode');
      await page.locator('[data-testid="button-send-settings-message"]').click();

      const darkRadio = page.locator('[data-testid="radio-theme-dark"]');
      await expect(darkRadio).toBeChecked({ timeout: 15000 });

      console.log('[Test] ✅ Dark mode enabled');

      // ==================== STEP 4: Switch to Light Mode via Chat ====================
      console.log('[Test] Switching to light mode...');

      await chatInput.fill('change theme to light');
      await page.locator('[data-testid="button-send-settings-message"]').click();

      // ==================== STEP 5: Verify Visual Panel Updates ====================
      const lightRadio = page.locator('[data-testid="radio-theme-light"]');
      await expect(lightRadio).toBeChecked({ timeout: 15000 });

      // Verify dark is no longer checked
      await expect(darkRadio).not.toBeChecked();

      console.log('[Test] ✅ Visual panel updated: light theme is now selected');

      // ==================== STEP 6: Verify Database via API ====================
      await page.waitForTimeout(500);

      const response = await page.request.get('/api/users/preferences');
      expect(response.ok()).toBeTruthy();

      const preferences = await response.json();
      expect(preferences.theme).toBe('light');

      console.log('[Test] ✅ API verified: preferences.theme = "light"');

    } finally {
      await cleanupTestData(page, {
        users: [userId],
        tenants: session.activeTenant ? [session.activeTenant.id] : [],
      });
    }
  });

  test('User sets system theme via chat → visual panel updates → DB persists', async ({ page }) => {
    // ==================== STEP 1: SETUP - Register User ====================
    const uniqueId = nanoid(10);
    const email = `systemmode-test-${uniqueId}@example.com`;
    const organizationName = `SystemMode Test Org ${uniqueId}`;

    await registerUser(page, {
      email,
      firstName: 'System',
      lastName: 'Mode',
      password: 'password123',
      organizationName,
    });

    await waitForAuth(page);

    const session = await getCurrentSession(page);
    const userId = session.user.id;

    try {
      // ==================== STEP 2: Navigate to Settings ====================
      await page.goto('/settings');
      await page.waitForSelector('[data-testid="preferencias-settings"]', { timeout: 10000 });

      // ==================== STEP 3: Set System Theme via Chat ====================
      console.log('[Test] Setting system theme...');

      const chatInput = page.locator('[data-testid="input-settings-message"]');
      await chatInput.waitFor({ state: 'visible' });

      await chatInput.fill('use system theme');
      await page.locator('[data-testid="button-send-settings-message"]').click();

      // ==================== STEP 4: Verify Visual Panel ====================
      const systemRadio = page.locator('[data-testid="radio-theme-system"]');
      await expect(systemRadio).toBeChecked({ timeout: 15000 });

      console.log('[Test] ✅ Visual panel updated: system theme is now selected');

      // ==================== STEP 5: Verify Database via API ====================
      await page.waitForTimeout(500);

      const response = await page.request.get('/api/users/preferences');
      expect(response.ok()).toBeTruthy();

      const preferences = await response.json();
      expect(preferences.theme).toBe('system');

      console.log('[Test] ✅ API verified: preferences.theme = "system"');

    } finally {
      await cleanupTestData(page, {
        users: [userId],
        tenants: session.activeTenant ? [session.activeTenant.id] : [],
      });
    }
  });
});
