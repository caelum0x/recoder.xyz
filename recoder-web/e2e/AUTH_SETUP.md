# E2E Authentication Setup

## Problem

The Recoder Web IDE requires authentication via Better Auth session cookies from the main site (recoder.xyz). E2E tests were failing because they were being redirected to the login page.

## Solution

We've implemented a comprehensive authentication fixture that automatically handles session cookies for all E2E tests.

## What Was Changed

### 1. Created Auth Fixture (`e2e/fixtures/auth.ts`)

A Playwright fixture that:
- Automatically sets up authentication cookies for all page-based tests
- Handles both development and production environments
- Stores auth state for reuse across test runs
- Provides utilities for login, logout, and auth-less testing

**Key Features:**
- In development: Sets mock session cookies (auth is bypassed in app)
- In production/CI: Creates and reuses mock session tokens
- Supports real login flow via `performLogin()` helper
- Provides `testWithoutAuth` for testing unauthenticated behavior

### 2. Updated All Test Files

**Updated to use auth fixture (10 files):**
- `01-basic-flow.spec.ts`
- `02-starters.spec.ts`
- `03-github-import.spec.ts`
- `04-workbench.spec.ts`
- `05-mcp-tools.spec.ts`
- `07-integration.spec.ts`
- `08-project-workflow.spec.ts`
- `09-debug-panel.spec.ts`
- `10-organization.spec.ts`
- `11-package-manager.spec.ts`

**Kept using base Playwright (1 file):**
- `06-api-endpoints.spec.ts` - Uses `request` context for direct API calls

### 3. Updated Configuration

**`playwright.config.ts`:**
- Added comment about auth fixture handling storage state
- Configuration remains compatible with fixture approach

**`.gitignore`:**
- Added `e2e/.auth/` to ignore stored auth state files

### 4. Created Documentation

**`e2e/fixtures/README.md`:**
- Complete guide on using the auth fixture
- Examples for common scenarios
- Troubleshooting tips
- Instructions for extending fixtures

**`e2e/AUTH_SETUP.md`:** (this file)
- Overview of the authentication setup
- Migration guide
- Testing instructions

## How Authentication Works

### Cookie Flow

1. **Main Site (recoder.xyz)**: Better Auth sets session cookie
   - Cookie name: `recoder.session_token`
   - Domain: `.recoder.xyz` (cross-subdomain)
   - HttpOnly, Secure, SameSite=Lax

2. **Web IDE (web.recoder.xyz)**: Reads shared cookie
   - Loader checks for cookie presence
   - Redirects to login if missing (in production)
   - Bypasses auth in development mode

3. **E2E Tests**: Auth fixture provides cookies
   - Sets mock session tokens
   - Tests run as authenticated users
   - No login redirect needed

### Development vs Production

**Development Mode (`NODE_ENV !== 'production'`):**
```typescript
// App behavior: Auth check is bypassed
if (!hasSessionToken && !isDevelopment) {
  return redirect(loginUrl); // Skipped in dev
}

// Fixture behavior: Sets mock cookies anyway for consistency
await setupDevelopmentAuth(context, page);
```

**Production/CI Mode:**
```typescript
// App behavior: Auth required, redirects if missing
if (!hasSessionToken) {
  return redirect(loginUrl);
}

// Fixture behavior: Creates and stores mock session
await createMockSession(context, page);
```

## Usage Examples

### Basic Test (with auth)

```typescript
import { test, expect } from './fixtures/auth';

test('should display dashboard', async ({ page }) => {
  await page.goto('/');
  // Automatically authenticated
  await expect(page.locator('h1')).toContainText('Dashboard');
});
```

### Testing Unauthenticated Behavior

```typescript
import { testWithoutAuth as test, expect } from './fixtures/auth';

test('should redirect to login', async ({ page }) => {
  await page.goto('/');
  // No auth cookies set
  await expect(page).toHaveURL(/auth\/signin/);
});
```

### API Tests (no page context)

```typescript
import { test, expect } from '@playwright/test';

test('should call API', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
});
```

### Real Login Flow (integration tests)

```typescript
import { test, performLogin, expect } from './fixtures/auth';

test('should login with credentials', async ({ page }) => {
  await performLogin(page, 'test@example.com', 'password');
  await page.goto('/');
  await expect(page.locator('[data-user]')).toBeVisible();
});
```

## Running Tests

### Local Development

```bash
# Run all tests (uses development mode)
npm run test:e2e

# Run specific test file
npx playwright test e2e/01-basic-flow.spec.ts

# Run with UI
npx playwright test --ui

# Debug mode
npx playwright test --debug
```

### CI/Production Mode

```bash
# Set production mode
NODE_ENV=production npx playwright test

# Run in CI (automatically uses production mode)
npm run test:e2e:ci
```

## File Structure

```
e2e/
├── .auth/                      # Git-ignored, auto-generated
│   └── user.json              # Stored auth state
├── fixtures/
│   ├── auth.ts                # Auth fixture implementation
│   └── README.md              # Fixture documentation
├── 01-basic-flow.spec.ts      # Test files (use auth fixture)
├── 02-starters.spec.ts
├── ...
├── 06-api-endpoints.spec.ts   # API tests (no auth fixture)
├── AUTH_SETUP.md              # This file
└── ...
```

## Troubleshooting

### Tests Still Redirecting to Login

**Symptom:** Tests navigate to `/auth/signin` instead of staying on the page

**Fix:** Make sure the test imports from the auth fixture:
```typescript
// ❌ Wrong
import { test, expect } from '@playwright/test';

// ✅ Correct
import { test, expect } from './fixtures/auth';
```

### Auth State Not Persisting

**Symptom:** Tests are slow, creating new sessions each time

**Check:**
1. `e2e/.auth/` directory exists and is writable
2. `e2e/.auth/user.json` is being created
3. File permissions allow read/write

**Fix:**
```bash
# Ensure directory exists
mkdir -p e2e/.auth

# Check permissions
ls -la e2e/.auth

# Clear and recreate if needed
rm -rf e2e/.auth
mkdir e2e/.auth
```

### Different Behavior in CI

**Symptom:** Tests pass locally but fail in CI (or vice versa)

**Cause:** Different `NODE_ENV` settings

**Fix:** Explicitly set environment:
```bash
# Run locally like CI
NODE_ENV=production npx playwright test

# Run CI like local (if supported)
NODE_ENV=development npx playwright test
```

### Cookie Domain Mismatch

**Symptom:** Auth cookies not being sent with requests

**Check:** Base URL and cookie domain match
```typescript
// In auth.ts
const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';
const domain = new URL(baseUrl).hostname; // Should be 'localhost'
```

## Best Practices

1. **Use auth fixture by default**: Most tests should use authenticated context
2. **Explicitly test unauth**: Use `testWithoutAuth` for login/redirect tests
3. **API tests separate**: Direct API tests don't need page auth
4. **Don't commit auth state**: The `.auth` directory is git-ignored
5. **Clear state when needed**: Use `clearAuth()` in afterEach if needed

## Security Notes

- Mock session tokens are for **testing only**
- Never commit real credentials or tokens
- Auth state files are git-ignored by default
- In production, consider using proper test accounts

## Future Improvements

- [ ] Add support for different user roles (free, pro, enterprise)
- [ ] Implement proper test account management
- [ ] Add OAuth flow testing if needed
- [ ] Support for multi-user scenarios
- [ ] Automated auth state cleanup

## Related Files

- **App Auth**: `/Users/arhansubasi/recoder.xyz/recoder-web/app/lib/auth/session.server.ts`
- **Main Loader**: `/Users/arhansubasi/recoder.xyz/recoder-web/app/routes/_index.tsx`
- **Playwright Config**: `/Users/arhansubasi/recoder.xyz/recoder-web/playwright.config.ts`

## Support

For questions or issues with the auth setup:
1. Check this documentation
2. Review the fixture code comments
3. Look at test examples in `01-basic-flow.spec.ts`
4. Check Playwright's official auth documentation
