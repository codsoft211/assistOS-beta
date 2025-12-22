# Gmail OAuth Integration Tests

End-to-end tests for the Gmail OAuth integration using Playwright.

## Test Coverage

### Test Suite: Gmail OAuth Integration

The test suite covers 5 critical scenarios:

1. **Complete OAuth Flow** - Tests the full OAuth connection process
   - User navigates to /comunicacoes
   - Sees empty state (no accounts connected)
   - Clicks "Conectar Gmail"
   - System generates authorization URL
   - Simulates callback with valid code
   - Verifies account appears in list
   - Verifies "Principal" badge is present

2. **Maximum 2 Accounts Limit** - Enforces account limit
   - User already has 2 accounts connected
   - "Conectar Gmail" button is disabled
   - Verifies tooltip or explanatory message

3. **Inactive User Cannot Receive Tokens** (Regression Test)
   - User initiates OAuth flow (state created)
   - User is deactivated (isActive = false) mid-flow
   - OAuth callback rejects with error
   - State is cleaned from database
   - No tokens are persisted

4. **Delete Gmail Account** - Tests account deletion
   - User has 1 account connected
   - Opens dropdown menu
   - Clicks "Remover conta"
   - Verifies account removed from list
   - Verifies empty state appears again

5. **Set Primary Account** - Tests changing primary account
   - User has 2 accounts connected
   - First account is primary
   - Selects second account
   - Clicks "Marcar como principal"
   - Verifies "Principal" badge moved to second account

## Prerequisites

- Application must be running (`npm run dev`)
- Database must be accessible and migrated
- Environment variables configured (especially `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`)

## Running the Tests

### Run all tests
```bash
npx playwright test
```

### Run tests in UI mode (interactive)
```bash
npx playwright test --ui
```

### Run tests in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run specific test file
```bash
npx playwright test tests/gmail-oauth.spec.ts
```

### Run in debug mode
```bash
npx playwright test --debug
```

### Run a specific test by name
```bash
npx playwright test -g "should connect Gmail account via OAuth"
```

## Test Implementation Details

### Mocking Strategy

The tests use a hybrid mocking approach:

1. **OAuth Flow Mocking**: The tests intercept the `/api/gmail/oauth/authorize` endpoint and simulate the OAuth callback without actually contacting Google servers. This allows testing without real Google OAuth credentials.

2. **Database Operations**: Real database operations are performed to ensure data integrity and tenant isolation.

3. **UI Interactions**: Real UI interactions are tested using Playwright selectors based on `data-testid` attributes.

### Test Helpers

The `tests/test-helpers.ts` file provides utility functions:

- `createTestUser()` - Creates a test user with tenant
- `deleteTestUser()` - Cleans up test user and related data
- `loginAsUser()` - Logs in as a specific user
- `createGmailAccount()` - Creates a Gmail account for testing
- `deleteAllGmailAccounts()` - Removes all Gmail accounts
- `createOAuthState()` - Creates OAuth state for testing
- `deactivateUser()` - Deactivates a user
- `countGmailAccounts()` - Counts Gmail accounts
- `oauthStateExists()` - Checks if OAuth state exists

### Data Isolation

- Each test starts with a clean slate (no Gmail accounts)
- Tests use a dedicated test user created in `beforeAll`
- All data is cleaned up in `afterAll`
- Tests are run serially (not in parallel) to avoid database conflicts

## Configuration

The Playwright configuration is in `playwright.config.ts`:

- Tests run serially (workers: 1) to avoid database conflicts
- Server starts automatically before tests
- Screenshots captured on failure
- HTML report generated

## Troubleshooting

### Tests fail with "User not found"
Ensure the database is properly migrated and accessible.

### Tests timeout
Check that the application is running and accessible at `http://localhost:5000`.

### OAuth state errors
This is expected in Test 3, which specifically tests the inactive user scenario.

### Tests fail intermittently
Increase timeouts in the test file if your environment is slow.

## CI/CD Integration

For CI/CD pipelines, use:

```bash
# Install Playwright browsers
npx playwright install --with-deps

# Run tests in CI mode
CI=true npx playwright test
```

## Viewing Test Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

## Test Data Cleanup

Tests automatically clean up their data. However, if tests are interrupted, you may need to manually clean up test users from the database:

```sql
-- Find test users
SELECT * FROM users WHERE email LIKE 'test-%@example.com';

-- Delete test users (cascades to related data)
DELETE FROM users WHERE email LIKE 'test-%@example.com';
```
