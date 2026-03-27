import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Collect console errors and network failures
  const errors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200));
  });
  page.on('requestfailed', req => {
    networkErrors.push(`${req.method()} ${req.url().slice(0, 100)} → ${req.failure()?.errorText || 'unknown'}`);
  });

  console.log('=== Testing web.recoder.xyz ===');

  // 1. Visit web.recoder.xyz
  const response = await page.goto('https://web.recoder.xyz/', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => ({ status: () => 0, url: () => e.message }));
  console.log(`Initial load: ${response.status()} → ${page.url()}`);

  // Check if redirected to login
  const url = page.url();
  if (url.includes('auth') || url.includes('signin') || url.includes('login')) {
    console.log('→ Redirected to login page (expected)');
    console.log(`Login URL: ${url}`);

    // Take screenshot
    await page.screenshot({ path: '/tmp/web-ide-login.png', fullPage: true });
    console.log('Screenshot: /tmp/web-ide-login.png');
  }

  console.log('\n=== Testing agents.recoder.xyz ===');

  // 2. Visit agents.recoder.xyz
  const agentsResp = await page.goto('https://agents.recoder.xyz/', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => ({ status: () => 0, url: () => e.message }));
  console.log(`Agents load: ${agentsResp.status()} → ${page.url()}`);
  await page.screenshot({ path: '/tmp/agents-home.png', fullPage: true });
  console.log('Screenshot: /tmp/agents-home.png');

  // Check sidebar items
  const sidebarItems = await page.$$eval('[data-slot="sidebar"] a, [data-slot="sidebar"] button', els =>
    els.map(el => ({ text: el.textContent?.trim().slice(0, 30), href: el.getAttribute('href') || 'button' })).filter(e => e.text)
  ).catch(() => []);
  console.log(`\nSidebar items found: ${sidebarItems.length}`);
  for (const item of sidebarItems.slice(0, 15)) {
    console.log(`  - ${item.text} → ${item.href}`);
  }

  console.log('\n=== Testing API endpoints ===');

  // 3. Test key API endpoints
  const endpoints = [
    '/v1/health',
    '/v1/threads',
    '/v1/agents',
    '/v1/agents/active-runs',
  ];

  for (const ep of endpoints) {
    const apiResp = await page.goto(`https://api.recoder.xyz${ep}`, { waitUntil: 'networkidle', timeout: 10000 }).catch(e => ({ status: () => 0 }));
    console.log(`  ${ep}: ${apiResp.status()}`);
  }

  // Summary
  console.log(`\n=== Errors ===`);
  console.log(`Console errors: ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log(`  ${e}`);
  console.log(`Network failures: ${networkErrors.length}`);
  for (const e of networkErrors.slice(0, 5)) console.log(`  ${e}`);

  await browser.close();
};

run().catch(console.error);
