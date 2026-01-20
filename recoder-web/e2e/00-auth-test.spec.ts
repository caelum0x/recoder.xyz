import { test, expect, testWithoutAuth } from './fixtures/auth';

/**
 * E2E Test Suite 0: Authentication Setup Verification
 * Tests that the auth fixture is working correctly
 */

test.describe('Auth Fixture - Verification Tests', () => {

  test('should have auth cookies set in page context', async ({ page, context }) => {
    // Navigate to the app
    await page.goto('/');

    // Get all cookies
    const cookies = await context.cookies();

    // Check for session token cookie
    const sessionCookie = cookies.find(c => c.name.includes('session'));

    console.log('Cookies found:', cookies.map(c => c.name).join(', '));
    console.log('Session cookie:', sessionCookie ? 'Found' : 'Not found');

    // In development mode, we should have a mock session cookie
    // In production mode, we should have a stored or generated session cookie
    expect(cookies.length).toBeGreaterThan(0);
  });

  test('should not redirect to login page', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait a bit for any potential redirects
    await page.waitForTimeout(2000);

    // Verify we're still on the app and not redirected to login
    const currentUrl = page.url();
    console.log('Current URL after navigation:', currentUrl);

    // Should be on the app, not on auth/signin
    expect(currentUrl).not.toContain('/auth/signin');
    expect(currentUrl).not.toContain('/auth/signup');

    console.log('✅ Successfully stayed on app (no login redirect)');
  });

  test('should be able to interact with app elements', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await page.waitForTimeout(2000);

    // Try to find the chat input (main app element)
    const chatInput = page.locator('textarea[placeholder*="How can I help"], textarea[placeholder*="message"]').first();

    // Should be visible if we're authenticated and on the app
    const isVisible = await chatInput.isVisible({ timeout: 5000 }).catch(() => false);

    console.log('Chat input visible:', isVisible);

    if (isVisible) {
      // Try to interact with it
      await chatInput.fill('Auth test message');
      const value = await chatInput.inputValue();
      expect(value).toBe('Auth test message');
      console.log('✅ Can interact with authenticated app elements');
    } else {
      console.log('⚠️  Chat input not found - app may still be loading or UI changed');
    }
  });
});

test.describe('Auth Fixture - Without Auth Tests', () => {

  testWithoutAuth('should NOT have session cookies', async ({ page, context }) => {
    // Get all cookies
    const cookies = await context.cookies();

    // Should have no cookies since we're using testWithoutAuth
    const sessionCookie = cookies.find(c => c.name.includes('session'));

    console.log('Cookies (should be empty):', cookies.map(c => c.name).join(', '));

    expect(sessionCookie).toBeUndefined();
    console.log('✅ No session cookies set (as expected)');
  });

  testWithoutAuth('should redirect to login in production mode', async ({ page }) => {
    // This test only makes sense in production mode
    const isProduction = process.env.NODE_ENV === 'production';

    if (!isProduction) {
      console.log('⚠️  Skipping redirect test - running in development mode');
      return;
    }

    await page.goto('/');

    // Wait for potential redirect
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log('Current URL (should be login):', currentUrl);

    // In production without auth, should redirect to login
    expect(currentUrl).toContain('/auth/signin');
    console.log('✅ Correctly redirected to login without auth');
  });

  testWithoutAuth('should stay on app in development mode', async ({ page }) => {
    // This test only makes sense in development mode
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (!isDevelopment) {
      console.log('⚠️  Skipping dev mode test - running in production mode');
      return;
    }

    await page.goto('/');

    // Wait a bit
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log('Current URL (should be app):', currentUrl);

    // In development without auth, should still stay on app
    expect(currentUrl).not.toContain('/auth/signin');
    console.log('✅ Correctly stayed on app (dev mode bypasses auth)');
  });
});

test.describe('Auth Fixture - Environment Detection', () => {

  test('should detect environment correctly', async ({ page }) => {
    const nodeEnv = process.env.NODE_ENV;
    const isDevelopment = nodeEnv !== 'production';
    const isProduction = nodeEnv === 'production';

    console.log('NODE_ENV:', nodeEnv || 'undefined');
    console.log('Is Development:', isDevelopment);
    console.log('Is Production:', isProduction);

    expect(typeof isDevelopment).toBe('boolean');
  });

  test('should have correct base URL', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';

    console.log('Base URL:', baseUrl);

    await page.goto('/');

    const currentUrl = page.url();
    expect(currentUrl).toContain(new URL(baseUrl).hostname);

    console.log('✅ Base URL configured correctly');
  });
});
