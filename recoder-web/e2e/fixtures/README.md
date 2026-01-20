# E2E Test Fixtures

This directory contains Playwright test fixtures that provide additional functionality for E2E tests.

## Auth Fixture

The `auth.ts` fixture provides authentication handling for all E2E tests.

### How It Works

The Recoder Web IDE requires authentication via Better Auth session cookies from the main site (recoder.xyz). The auth fixture automatically:

1. **In Development Mode** (`NODE_ENV !== 'production'`):
   - Sets mock session cookies
   - Auth checks are bypassed in the app loader
   - Tests can run without a real authentication flow

2. **In Production/CI Mode**:
   - Creates and stores mock session tokens
   - Reuses stored auth state across test runs
   - Simulates authenticated user sessions

### Usage

Import the test and expect from the auth fixture instead of `@playwright/test`:

```typescript
// ❌ Old way (will fail on auth redirect)
import { test, expect } from '@playwright/test';

// ✅ New way (handles auth automatically)
import { test, expect } from './fixtures/auth';

test('my test', async ({ page }) => {
  await page.goto('/');
  // Page will have auth cookies set automatically
});
```

### Testing Without Auth

If you need to test unauthenticated behavior (like login redirects), use the `testWithoutAuth` export:

```typescript
import { testWithoutAuth as test, expect } from './fixtures/auth';

test('should redirect to login when not authenticated', async ({ page }) => {
  await page.goto('/');
  // No auth cookies will be set
  await expect(page).toHaveURL(/auth\/signin/);
});
```

### API Tests

API tests using the `request` context don't need the auth fixture since they make direct HTTP requests. They use the base Playwright test:

```typescript
// For API endpoint tests that don't need page context
import { test, expect } from '@playwright/test';

test('should respond to API', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
});
```

### Auth State Storage

The fixture stores auth state in `e2e/.auth/user.json` for reuse across test runs. This file is:

- **Git-ignored** (contains session tokens)
- **Auto-generated** on first test run
- **Reused** for subsequent runs to speed up tests
- **Automatically cleaned** when needed

### Manual Login Flow (Optional)

For integration tests that need real authentication, use the `performLogin` helper:

```typescript
import { test, performLogin, expect } from './fixtures/auth';

test('should login with real credentials', async ({ page }) => {
  await performLogin(page, 'test@example.com', 'password123');
  // Now authenticated with real session
});
```

### Clearing Auth State

To clear stored auth state:

```typescript
import { test, clearAuth, expect } from './fixtures/auth';

test('should clear auth', async ({ page, context }) => {
  await clearAuth(context);
  // Auth state is cleared
});
```

## Environment Variables

The auth fixture respects these environment variables:

- `NODE_ENV`: Determines if auth is bypassed (development) or enforced (production)
- `PLAYWRIGHT_TEST_BASE_URL`: Base URL for the app (default: http://localhost:5173)
- `MAIN_SITE_URL`: Main site URL for login (default: http://localhost:3000)

## Troubleshooting

### Tests failing with auth redirects

Make sure you're importing from the auth fixture:

```typescript
import { test, expect } from './fixtures/auth';
```

### Auth state not persisting

Check that the `e2e/.auth` directory is writable and not blocked by permissions.

### Different behavior in CI vs local

CI runs in production mode by default. Set `NODE_ENV=development` locally to match CI behavior, or vice versa.

## Adding New Fixtures

To add new fixtures, create them in this directory and extend the base test:

```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  myFixture: async ({}, use) => {
    // Setup
    const fixture = createMyFixture();
    await use(fixture);
    // Teardown
  },
});
```
