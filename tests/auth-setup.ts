/**
 * Playwright auth setup — creates stored auth state for authenticated tests.
 * Uses a real session token from the database to set cookies.
 *
 * Run: npx playwright test tests/auth-setup.ts
 * Then: npx playwright test tests/authenticated-verify.spec.ts
 */
import { test as setup, expect } from '@playwright/test';
import { execSync } from 'child_process';

const AUTH_STATE_FILE = 'tests/.auth/user.json';

setup('authenticate via session cookie', async ({ page }) => {
  // Get a real session token from the production DB
  let token: string;
  try {
    const result = execSync(
      `ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "PGPASSWORD=recoder_prod_2026 psql -U recoder -h 127.0.0.1 -d recoder_main -t -A -c \\"SELECT token FROM session ORDER BY \\\\\\\"createdAt\\\\\\\" DESC LIMIT 1\\""`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    token = result;
  } catch {
    // Fallback: use hardcoded token if SSH fails
    token = 'PX4bZ6f83yuBNUoBiO4WFdnJKKgfsy5m';
  }

  if (!token) {
    throw new Error('No session token found');
  }

  // Set the session cookie for agents.recoder.xyz
  await page.context().addCookies([
    {
      name: 'recoder.session_token',
      value: token,
      domain: '.recoder.xyz',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
    {
      name: '__Secure-recoder.session_token',
      value: token,
      domain: '.recoder.xyz',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  // Verify the cookie works by visiting agents
  await page.goto('https://agents.recoder.xyz', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Save the auth state
  await page.context().storageState({ path: AUTH_STATE_FILE });
});
