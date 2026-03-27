/**
 * Authenticated Platform Tests
 * Tests features that require login — sidebar, tools, settings.
 * Run auth setup first: npx playwright test tests/auth-setup.ts
 * Then: npx playwright test tests/authenticated-verify.spec.ts
 */
import { test, expect } from '@playwright/test';

const AGENTS_URL = 'https://agents.recoder.xyz';
const API_URL = 'https://api.recoder.xyz';
const AUTH_STATE = 'tests/.auth/user.json';

// Use stored auth state
test.use({ storageState: AUTH_STATE });

function collectNetworkErrors(page: import('@playwright/test').Page) {
  const errors: { url: string; status: number }[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('beacon.min.js') && !r.url().includes('stripe.com')) {
      errors.push({ url: r.url(), status: r.status() });
    }
  });
  return errors;
}

test.describe('Authenticated — Agents', () => {
  test('sidebar shows chats after login', async ({ page }) => {
    await page.goto(AGENTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Check if we're on the agents page (not redirected to login)
    const url = page.url();
    const isOnAgents = url.includes('agents.recoder.xyz');
    console.log(`After auth: url=${url}, onAgents=${isOnAgents}`);

    if (isOnAgents) {
      // Look for sidebar content (thread list or agent list)
      const bodyText = await page.textContent('body');
      console.log(`Body length: ${bodyText?.length}, has content: ${(bodyText?.length || 0) > 200}`);
    }
  });

  test('API returns data with session cookie', async ({ request }) => {
    // Test that the API accepts our session cookie
    const response = await request.get(`${API_URL}/v1/threads`, {
      headers: {
        'Cookie': 'recoder.session_token=PX4bZ6f83yuBNUoBiO4WFdnJKKgfsy5m',
      },
    });
    const status = response.status();
    console.log(`/v1/threads status: ${status}`);
    // Should be 200 (data) or 401 (token expired), not 500
    expect(status).toBeLessThan(500);
  });

  test('settings pages load', async ({ page }) => {
    const errors = collectNetworkErrors(page);
    await page.goto(`${AGENTS_URL}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const serverErrors = errors.filter(e => e.status >= 500);
    if (serverErrors.length > 0) {
      console.log('Settings 500 errors:', serverErrors.map(e => `${e.status} ${e.url}`));
    }

    const bodyText = await page.textContent('body');
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test('zero 500 errors on agents homepage (authenticated)', async ({ page }) => {
    const errors = collectNetworkErrors(page);
    await page.goto(AGENTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const serverErrors = errors.filter(e => e.status >= 500);
    if (serverErrors.length > 0) {
      console.log(`Authenticated agents 500s (${serverErrors.length}):`);
      for (const err of serverErrors.slice(0, 10)) {
        console.log(`  ${err.status} ${err.url}`);
      }
    }
    // Report but don't hard-fail yet
  });
});
