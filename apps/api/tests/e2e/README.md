# E2E Playwright Tests for Multi-Tenant Authentication

This directory contains comprehensive Playwright smoke tests for multi-tenant authentication flows and tenant isolation.

## Test Files

### 1. `auth-registration.spec.ts`
Tests user registration flow including:
- ✅ User + tenant auto-creation
- ✅ Session establishment after registration
- ✅ Email validation (duplicate email rejected)
- ✅ Password validation (min 8 chars, confirmation match)
- ✅ Organization name validation
- ✅ Redirect to chat/dashboard after registration

### 2. `auth-login-logout.spec.ts`
Tests login/logout flows including:
- ✅ Successful login with valid credentials
- ✅ Failed login with invalid credentials
- ✅ Logout clears session
- ✅ Protected routes redirect to login when not authenticated
- ✅ Session persistence across page refreshes
- ✅ Redirect to intended page after login

### 3. `tenant-switching.spec.ts`
Tests tenant switching functionality including:
- ✅ Display all user tenants in switcher
- ✅ Switch between tenants
- ✅ UI reflects current tenant
- ✅ Session persistence after tenant switch
- ✅ Page data reload after switch

### 4. `tenant-isolation.spec.ts`
Tests tenant isolation including:
- ✅ User cannot access other tenant's data
- ✅ Tenant list filtered by user access
- ✅ Cross-tenant API access prevention
- ✅ Tenant context is set correctly

### 5. `environment-switching.spec.ts`
Tests environment switching including:
- ✅ Owner can switch environment (production ↔ sandbox)
- ✅ Non-owner users cannot switch environment (403 error)
- ✅ Environment validation (rejects invalid values)
- ✅ Environment persistence across sessions
- ✅ Support for both production and sandbox environments

## Helper Utilities

### `helpers/auth-helpers.ts`
- `registerUser()` - Register a new user with auto-generated unique email
- `loginUser()` - Login with email and password
- `logoutUser()` - Logout current user
- `waitForAuth()` - Wait for authentication redirect
- `isLoggedIn()` - Check if user is logged in

### `helpers/tenant-helpers.ts`
- `switchTenant()` - Switch active tenant
- `getCurrentTenant()` - Get current active tenant name
- `setupUserWith2Tenants()` - Create test user with 2 tenants
- `loginAs()` - Helper to login as specific user

### `helpers/db-helpers.ts`
- `createTestUser(page, data)` - Create test user via registration API (requires page and data with organizationName)
- `createTestTenant(page, data)` - Create test tenant via API (requires authenticated session)
- `getUserTenants(page)` - Get user's tenants via API
- `cleanupTestUser(page, userId)` - Remove test user by ID
- `cleanupTestTenant(page, tenantId)` - Remove test tenant by ID
- `cleanupTestData(page, { users, tenants })` - Comprehensive cleanup for test data (recommended)

### `helpers/api-helpers.ts`
- `apiRequest()` - Make API request with proper context
- `getCookies()` - Get all cookies from page context
- `getSessionCookie()` - Get session cookie
- `clearSession()` - Clear all cookies/session

## Running Tests

### Prerequisites
```bash
# Install Playwright browsers
npx playwright install chromium

# Ensure development server is running
npm run dev
```

### Run all tests
```bash
npx playwright test
```

### Run specific test file
```bash
npx playwright test auth-registration
```

### Run with UI mode (debugging)
```bash
npx playwright test --ui
```

### Run specific test
```bash
npx playwright test -g "should successfully register"
```

### View test report
```bash
npx playwright show-report
```

## Test Configuration

Configuration is in `playwright.config.ts`:
- **Test directory**: `./apps/api/tests/e2e`
- **Base URL**: `http://0.0.0.0:5000`
- **Workers**: 1 (serial execution to avoid DB conflicts)
- **Browser**: Chromium (Desktop Chrome)
- **Web server**: Auto-starts `npm run dev` before tests

## Database Considerations

- Tests use the **development database** (not production)
- Each test creates unique test data using `nanoid()`
- Tests clean up their own data in `finally` blocks within each test
- Database cleanup helpers ensure no data pollution
- All helper functions now require the `page` argument to make authenticated API calls

## Test Cleanup

Tests use the `/api/admin/cleanup-test-data` endpoint for privileged cleanup.

### Requirements

- **Environment**: Endpoint only available in development (`NODE_ENV !== 'production'`)
- **Privileges**: Requires platform admin privileges
- **First User**: First user registered automatically becomes platform admin

### Cleanup Pattern

The recommended pattern for test cleanup:

**Standard Pattern (user stays logged in):**
```typescript
test('my test', async ({ page }) => {
  // Create test user (first user = platform admin)
  const user = await createTestUser(page, {
    email: 'test@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    organizationName: 'Test Org',
  });
  
  try {
    // Test logic here
    await loginUser(page, user.email, user.password);
    // ... perform test actions ...
  } finally {
    // Cleanup BEFORE logout (while still authenticated)
    await cleanupTestData(page, {
      users: [user.id],
      tenants: [user.tenantId],
    });
  }
});
```

**Pattern for tests that logout (e.g., testing logout functionality):**
```typescript
test('should test logout', async ({ page }) => {
  const user = await createTestUser(page, {
    email: 'test@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    organizationName: 'Test Org',
  });
  
  try {
    // Test logic that includes logout
    await loginUser(page, user.email, user.password);
    await logoutUser(page); // Test logs out user
    
    // Verify logout worked
    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(false);
  } finally {
    // Re-login before cleanup (test left user logged out)
    await loginUser(page, user.email, user.password);
    await waitForAuth(page);
    
    // Cleanup BEFORE final logout (while authenticated)
    await cleanupTestData(page, {
      users: [user.id],
      tenants: [user.tenantId],
    });
  }
});
```

**Key Rules:**
- ✅ Cleanup requires authentication (platform admin privileges)
- ✅ Always cleanup BEFORE logout in finally block
- ✅ If test logs out, re-login before cleanup in finally block
- ✅ First user created is automatically platform admin

### How It Works

1. **Admin Endpoint**: `POST /api/admin/cleanup-test-data`
   - Accepts `users` and `tenants` arrays in request body
   - Requires platform admin authentication
   - Blocked in production environment

2. **Platform Admin Privilege**: 
   - First user registered is automatically platform admin
   - Platform admin can access `/api/admin/*` endpoints
   - Enables privileged cleanup without normal tenant restrictions

3. **Cascade Deletes**:
   - Deleting tenants cascades to user_tenants, environments
   - Deleting users cascades to user_tenants
   - Ensures complete cleanup of test data

### CI Safeguard

In CI environment, cleanup failures are treated as **hard errors** to prevent data pollution:

- Set `CI=true` environment variable to enable
- Non-2xx responses from cleanup endpoint will fail the test
- Cleanup errors in response will fail the test
- Prevents polluted data from breaking subsequent test runs

### Troubleshooting Cleanup

**"Cleanup failed with status 403"**
- Ensure the user has platform admin privileges
- First user should be platform admin automatically
- Check logs: `[Registration] Creating user: { isPlatformAdmin: true }`

**"Cleanup endpoint not available"**
- Verify `NODE_ENV !== 'production'`
- Cleanup endpoint is development/test only

**"Failed to delete tenant/user"**
- Check database constraints and foreign key relationships
- Ensure CASCADE is configured for related tables
- Review cleanup endpoint logs for detailed error messages

## Data-Testid Attributes

Tests rely on `data-testid` attributes in components:

**Registration/Login:**
- `input-email`
- `input-first-name`
- `input-last-name`
- `input-password`
- `input-confirm-password`
- `input-organization-name`
- `button-register`
- `button-login`

**User Menu:**
- `button-user-menu`
- `menu-switch-tenant`
- `menu-tenant-${tenant.slug}`
- `menu-logout`

## Troubleshooting

### Tests fail with "Browser not found"
```bash
npx playwright install chromium
```

### Tests fail with "Database connection error"
Ensure PostgreSQL database is running and DATABASE_URL is set correctly.

### Tests fail with "Port 5000 already in use"
Check if development server is already running. Playwright will reuse existing server.

### Random test failures
Tests are designed to run serially (workers: 1) to avoid DB conflicts. Ensure this setting is not changed.

## CI/CD Integration

Tests are configured for CI with:
- Retries: 2 (in CI mode)
- Screenshots: On failure only
- Traces: On first retry only
- No parallel execution to prevent DB conflicts

## Writing New Tests

1. Use helpers for common operations (login, registration, etc.)
2. Clean up test data in `finally` blocks within each test
3. Use unique identifiers with `nanoid()` to avoid conflicts
4. Verify tenant isolation in multi-tenant scenarios
5. Check both success and error cases
6. Use `data-testid` attributes for element selection

### Example Test Pattern

```typescript
test('should do something', async ({ page }) => {
  const uniqueId = nanoid(6);

  // Create test user (auto-creates tenant as owner)
  const user = await createTestUser(page, {
    email: `test-${uniqueId}@example.com`,
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    organizationName: `Test Org ${uniqueId}`,
  });

  const tenantId = user.tenantId!;

  try {
    // Test logic here
    await loginAs(page, user.email, user.password);
    
    // ... perform test actions ...
    
  } finally {
    // Always cleanup in finally block
    await cleanupTestData(page, {
      users: [user.id],
      tenants: [tenantId],
    });
  }
});
```
