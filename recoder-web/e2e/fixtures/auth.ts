import { test as base, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * Authentication fixture for E2E tests
 *
 * This fixture provides authenticated page context for tests that require login.
 * It handles session cookies that are shared between the main site (recoder.xyz)
 * and the web IDE (web.recoder.xyz).
 *
 * The app uses Better Auth with cross-subdomain cookies:
 * - Cookie name: recoder.session_token
 * - In development, auth is bypassed automatically
 * - In production/CI, we need to set the cookie
 */

// Path to store the auth state (ES module compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '..', '.auth', 'user.json');

/**
 * Extended test with authentication support
 */
export const test = base.extend({
  /**
   * Authenticated page context
   * This ensures every test page has the required auth cookies
   */
  page: async ({ page, context }, use) => {
    // Check if we're in development mode (should bypass auth)
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (!isDevelopment) {
      // In production/CI, set up auth cookies
      await setupAuthCookies(context, page);
    }

    // For development, cookies are optional since auth is bypassed
    // but we'll add them anyway for consistency
    if (isDevelopment) {
      await setupDevelopmentAuth(context, page);
    }

    await use(page);
  },
});

/**
 * Set up authentication cookies for production/CI environments
 */
async function setupAuthCookies(context: any, page: any) {
  try {
    // Check if we have stored auth state
    if (fs.existsSync(authFile)) {
      // Load existing auth state
      await context.addCookies(JSON.parse(fs.readFileSync(authFile, 'utf-8')));
      console.log('[Auth Fixture] Loaded stored auth state');
    } else {
      // Create mock session token for testing
      await createMockSession(context, page);
    }
  } catch (error) {
    console.error('[Auth Fixture] Error setting up auth cookies:', error);
    // Fallback to mock session
    await createMockSession(context, page);
  }
}

/**
 * Set up auth for development environment
 */
async function setupDevelopmentAuth(context: any, page: any) {
  // In development, auth is bypassed, but we can still set cookies for consistency
  const cookies = [
    {
      name: 'recoder.session_token',
      value: 'dev-test-session-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
      expires: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
    },
  ];

  await context.addCookies(cookies);
  console.log('[Auth Fixture] Set development auth cookies');
}

/**
 * Create a mock session for testing
 */
async function createMockSession(context: any, page: any) {
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';
  const domain = new URL(baseUrl).hostname;

  // Create mock session token
  // In a real scenario, this would be obtained from an actual login flow
  const cookies = [
    {
      name: 'recoder.session_token',
      value: 'mock-e2e-test-session-token-' + Date.now(),
      domain: domain,
      path: '/',
      httpOnly: true,
      secure: baseUrl.startsWith('https'),
      sameSite: 'Lax' as const,
      expires: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days from now
    },
  ];

  await context.addCookies(cookies);

  // Save to file for reuse
  try {
    const authDir = path.dirname(authFile);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    fs.writeFileSync(authFile, JSON.stringify(cookies, null, 2));
    console.log('[Auth Fixture] Created and saved mock session');
  } catch (error) {
    console.warn('[Auth Fixture] Could not save auth state:', error);
  }
}

/**
 * Helper function to perform actual login flow (optional, for integration tests)
 * This would navigate to the main site and perform the login
 */
export async function performLogin(page: any, email: string, password: string) {
  const mainSiteUrl = process.env.MAIN_SITE_URL || 'http://localhost:3000';

  // Navigate to login page
  await page.goto(`${mainSiteUrl}/auth/signin`);

  // Fill login form
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for redirect
  await page.waitForURL(/\//, { timeout: 10000 });

  // Extract cookies
  const cookies = await page.context().cookies();

  // Save auth state
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  fs.writeFileSync(authFile, JSON.stringify(cookies, null, 2));

  console.log('[Auth Fixture] Completed login flow and saved session');

  return cookies;
}

/**
 * Helper to clear auth state
 */
export async function clearAuth(context: any) {
  await context.clearCookies();

  if (fs.existsSync(authFile)) {
    fs.unlinkSync(authFile);
  }

  console.log('[Auth Fixture] Cleared auth state');
}

/**
 * Test suite specifically for unauthenticated scenarios
 * Use this when you want to test behavior without authentication
 */
export const testWithoutAuth = base.extend({
  page: async ({ page, context }, use) => {
    // Explicitly clear any auth cookies
    await context.clearCookies();
    await use(page);
  },
});

export { expect };
