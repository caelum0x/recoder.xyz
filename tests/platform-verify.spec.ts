/**
 * Platform Verification Tests
 * Tests every claim in plan.md against actual browser behavior.
 * Run: npx playwright test tests/platform-verify.spec.ts --headed
 */
import { test, expect, type Page } from '@playwright/test';

// Production URLs
const AGENTS_URL = 'https://agents.recoder.xyz';
const API_URL = 'https://api.recoder.xyz';
const WEB_URL = 'https://web.recoder.xyz';
const AGENCY_URL = 'https://agency.recoder.xyz';
const PM_URL = 'https://pm.recoder.xyz';
const OPENCLAW_URL = 'https://openclaw.recoder.xyz';
const APP_URL = 'https://recoder.xyz';

// Helper: collect console errors during a test
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

// Helper: collect failed network requests
function collectNetworkErrors(page: Page): { url: string; status: number }[] {
  const failures: { url: string; status: number }[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('beacon.min.js') && !response.url().includes('stripe.com')) {
      failures.push({ url: response.url(), status: response.status() });
    }
  });
  return failures;
}

// =============================================================================
// 1. BACKEND API HEALTH
// =============================================================================
test.describe('Backend API Health', () => {
  test('GET /v1/health returns 200', async ({ request }) => {
    const response = await request.get(`${API_URL}/v1/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('GET /v1/threads returns 401 (auth required)', async ({ request }) => {
    const response = await request.get(`${API_URL}/v1/threads`);
    expect(response.status()).toBe(401);
  });

  test('GET /v1/agents returns 401 (auth required)', async ({ request }) => {
    const response = await request.get(`${API_URL}/v1/agents`);
    expect(response.status()).toBe(401);
  });

  test('GET /v1/pipelines returns 401 (not 404)', async ({ request }) => {
    const response = await request.get(`${API_URL}/v1/pipelines`);
    expect(response.status()).toBe(401); // was 404 before fix
  });

  test('CORS headers present on SSE endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/v1/notifications/stream`, {
      headers: { 'Origin': AGENTS_URL },
    });
    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBe(AGENTS_URL);
    expect(headers['access-control-allow-credentials']).toBe('true');
    expect(headers['cache-control']).toContain('no-cache');
  });
});

// =============================================================================
// 2. AGENTS (agents.recoder.xyz)
// =============================================================================
test.describe('Agents Frontend', () => {
  test('homepage loads without crash', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const networkErrors = collectNetworkErrors(page);

    await page.goto(AGENTS_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Page should not be blank
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(100);

    // No fatal React errors (crash to blank page)
    const hasFatalError = errors.some(e =>
      e.includes('Minified React error #') && !e.includes('#418') && !e.includes('#423')
    );
    expect(hasFatalError).toBe(false);
  });

  test('sidebar renders with navigation items', async ({ page }) => {
    await page.goto(AGENTS_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Sidebar should have key navigation elements
    const sidebar = page.locator('aside, [data-sidebar], nav').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('settings page loads (not blank)', async ({ page }) => {
    const response = await page.goto(`${AGENTS_URL}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response?.status()).toBeLessThan(500);
    const bodyText = await page.textContent('body');
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test('credentials page does not 500', async ({ page }) => {
    const networkErrors = collectNetworkErrors(page);
    await page.goto(`${AGENTS_URL}/settings/credentials`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for any API calls to fire
    await page.waitForTimeout(3000);
    const composioErrors = networkErrors.filter(e => e.url.includes('composio-profiles') && e.status === 500);
    // Either shows "Coming Soon" (new build) or the composio section (old build)
    // but should NOT have 500 errors crashing the page
    expect(composioErrors.length).toBe(0);
  });

  test('no ERR_HTTP2_PROTOCOL_ERROR on SSE streams', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(AGENTS_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for SSE connections to be attempted
    await page.waitForTimeout(5000);

    const http2Errors = errors.filter(e =>
      e.includes('ERR_HTTP2_PROTOCOL_ERROR') || e.includes('ERR_QUIC_PROTOCOL_ERROR')
    );
    expect(http2Errors.length).toBe(0);
  });

  test('no /v1/accounts 500 errors', async ({ page }) => {
    const networkErrors = collectNetworkErrors(page);

    await page.goto(AGENTS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const accountErrors = networkErrors.filter(e =>
      e.url.includes('/v1/accounts') && e.status === 500
    );
    expect(accountErrors.length).toBe(0);
  });
});

// =============================================================================
// 3. WEB IDE (web.recoder.xyz)
// =============================================================================
test.describe('Web IDE', () => {
  test('homepage responds (may redirect to login)', async ({ page }) => {
    const response = await page.goto(WEB_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // May redirect to login page — that's OK, just shouldn't be 500/502
    const finalUrl = page.url();
    const status = response?.status() ?? 200;
    expect(status).toBeLessThan(500);
    console.log(`Web IDE: status=${status}, redirected to ${finalUrl}`);
  });

  test('docker-backend health check', async ({ request }) => {
    // docker-backend serves at docker.recoder.xyz, proxied through nginx
    const response = await request.get('https://docker.recoder.xyz/health');
    expect(response.status()).toBeLessThan(500);
  });
});

// =============================================================================
// 4. AGENCY (agency.recoder.xyz)
// =============================================================================
test.describe('Agency', () => {
  test('homepage responds (not 502)', async ({ page }) => {
    const response = await page.goto(AGENCY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = response?.status() ?? 200;
    // Accept redirects to login (302→200), but reject 502/503
    expect(status).toBeLessThan(500);
    console.log(`Agency: status=${status}, url=${page.url()}`);
  });
});

// =============================================================================
// 5. PM (pm.recoder.xyz)
// =============================================================================
test.describe('PM', () => {
  test('homepage responds (may redirect to login)', async ({ page }) => {
    const response = await page.goto(PM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = response?.status() ?? 200;
    expect(status).toBeLessThan(500);
    console.log(`PM: status=${status}, url=${page.url()}`);
  });
});

// =============================================================================
// 6. OPENCLAW (openclaw.recoder.xyz)
// =============================================================================
test.describe('OpenClaw', () => {
  test('Control UI loads', async ({ page }) => {
    const response = await page.goto(OPENCLAW_URL, { waitUntil: 'networkidle', timeout: 30000 });
    expect(response?.status()).toBeLessThan(500);

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('gateway WebSocket connection status', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(OPENCLAW_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const bodyText = await page.textContent('body') || '';

    // Log actual connection status for visibility
    const hasTokenMismatch = bodyText.includes('gateway token mismatch');
    const hasPairingRequired = bodyText.includes('pairing required');
    const hasDisconnected = bodyText.includes('disconnected');

    // Report findings (not asserting connected since it depends on config)
    console.log(`OpenClaw status: tokenMismatch=${hasTokenMismatch}, pairingRequired=${hasPairingRequired}, disconnected=${hasDisconnected}`);
  });
});

// =============================================================================
// 7. AUTH (recoder.xyz)
// =============================================================================
test.describe('Auth (recoder.xyz)', () => {
  test('main site loads', async ({ page }) => {
    const response = await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    expect(response?.status()).toBeLessThan(500);
  });
});

// =============================================================================
// 8. CROSS-CUTTING: Console Error Audit
// =============================================================================
test.describe('Console Error Audit', () => {
  const sites = [
    { name: 'Agents', url: AGENTS_URL },
    { name: 'Web IDE', url: WEB_URL },
    { name: 'Agency', url: AGENCY_URL },
    { name: 'PM', url: PM_URL },
  ];

  for (const site of sites) {
    test(`${site.name}: count 500 errors`, async ({ page }) => {
      const networkErrors = collectNetworkErrors(page);

      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      const serverErrors = networkErrors.filter(e => e.status >= 500);

      // Log all 500s for visibility
      if (serverErrors.length > 0) {
        console.log(`\n${site.name} — ${serverErrors.length} server errors:`);
        for (const err of serverErrors.slice(0, 10)) {
          console.log(`  ${err.status} ${err.url}`);
        }
      }

      // We don't hard-fail here, just report
      // Remove this line to make it a hard failure:
      // expect(serverErrors.length).toBe(0);
    });
  }
});
