import { chromium } from 'playwright';
import fs from 'fs';

const RESULTS = [];
const log = (category, item, status, detail = '') => {
  const line = `[${status}] ${category} > ${item}${detail ? ': ' + detail : ''}`;
  console.log(line);
  RESULTS.push({ category, item, status, detail });
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });

  // ========== 1. AGENTS (agents.recoder.xyz) ==========
  console.log('\n========== AGENTS (agents.recoder.xyz) ==========\n');

  const agentsPage = await context.newPage();
  const consoleErrors = [];
  const networkErrors = [];
  agentsPage.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 150)); });
  agentsPage.on('requestfailed', req => networkErrors.push(`${req.url().slice(0, 80)} → ${req.failure()?.errorText}`));

  // Load agents homepage
  try {
    const resp = await agentsPage.goto('https://agents.recoder.xyz/', { waitUntil: 'networkidle', timeout: 20000 });
    log('Agents', 'Homepage loads', resp.status() === 200 ? 'OK' : 'FAIL', `HTTP ${resp.status()}`);
    await agentsPage.screenshot({ path: '/tmp/test-agents-home.png' });
  } catch (e) {
    log('Agents', 'Homepage loads', 'FAIL', e.message.slice(0, 100));
  }

  // Check sidebar presence
  const sidebarExists = await agentsPage.$('[data-slot="sidebar"], aside, nav').catch(() => null);
  log('Agents', 'Sidebar renders', sidebarExists ? 'OK' : 'FAIL');

  // Check sidebar items by text content
  const sidebarTexts = await agentsPage.$$eval('a, button', els =>
    els.map(el => ({ text: (el.textContent || '').trim(), tag: el.tagName, href: el.getAttribute('href') || '' }))
      .filter(e => e.text && e.text.length < 30)
  ).catch(() => []);

  for (const name of ['Chats', 'Workers', 'Spaces', 'Triggers']) {
    const found = sidebarTexts.find(s => s.text.toLowerCase().includes(name.toLowerCase()));
    if (found) {
      log('Agents', `Sidebar "${name}" exists`, 'OK', `<${found.tag}> href="${found.href}"`);
    } else {
      log('Agents', `Sidebar "${name}" exists`, 'FAIL', 'not found in DOM');
    }
  }

  // Check chat input
  const chatInput = await agentsPage.$('textarea, input[type="text"], [contenteditable]').catch(() => null);
  log('Agents', 'Chat input exists', chatInput ? 'OK' : 'FAIL');

  // Take screenshot of sidebar
  await agentsPage.screenshot({ path: '/tmp/test-agents-sidebar.png' });

  // ========== 2. API ENDPOINTS ==========
  console.log('\n========== API ENDPOINTS ==========\n');

  const apiPage = await context.newPage();

  const endpoints = [
    ['/v1/health', 'Health'],
    ['/v1/threads', 'Threads list'],
    ['/v1/agents', 'Agents list'],
    ['/v1/agents/active-runs', 'Active runs'],
    ['/v1/pipelines', 'Pipelines'],
    ['/v1/triggers', 'Triggers'],
    ['/v1/schedules', 'Schedules'],
    ['/v1/workspaces', 'Workspaces'],
    ['/v1/incidents', 'Incidents'],
    ['/v1/reports/usage-summary', 'Reports'],
    ['/v1/secure-mcp/composio-profiles', 'Credentials (composio)'],
    ['/v1/agent-webhooks/webhooks', 'Webhooks'],
    ['/v1/monitor/health', 'Monitor health'],
  ];

  for (const [ep, label] of endpoints) {
    try {
      const resp = await apiPage.goto(`https://api.recoder.xyz${ep}`, { waitUntil: 'networkidle', timeout: 10000 });
      const status = resp.status();
      const body = await resp.text().catch(() => '');
      const preview = body.slice(0, 80);
      log('API', label, status < 500 ? 'OK' : 'FAIL', `HTTP ${status} — ${preview}`);
    } catch (e) {
      log('API', label, 'FAIL', e.message.slice(0, 80));
    }
  }

  // Test CORS on active-runs from agents origin
  try {
    const corsResp = await apiPage.evaluate(async () => {
      try {
        const r = await fetch('https://api.recoder.xyz/v1/agents/active-runs', {
          credentials: 'include',
          headers: { 'Origin': 'https://agents.recoder.xyz' }
        });
        return { status: r.status, cors: r.headers.get('access-control-allow-origin') || 'none' };
      } catch (e) {
        return { status: 0, cors: 'CORS_BLOCKED: ' + e.message };
      }
    });
    log('API', 'CORS on active-runs', corsResp.status > 0 ? 'OK' : 'FAIL', `status=${corsResp.status} cors=${corsResp.cors}`);
  } catch (e) {
    log('API', 'CORS on active-runs', 'FAIL', e.message.slice(0, 80));
  }

  // ========== 3. AGENCY (agency.recoder.xyz) ==========
  console.log('\n========== AGENCY (agency.recoder.xyz) ==========\n');

  const agencyPage = await context.newPage();
  try {
    const resp = await agencyPage.goto('https://agency.recoder.xyz/', { waitUntil: 'networkidle', timeout: 15000 });
    const url = agencyPage.url();
    const status = resp.status();
    log('Agency', 'Homepage loads', status < 500 ? 'OK' : 'FAIL', `HTTP ${status} → ${url}`);
    await agencyPage.screenshot({ path: '/tmp/test-agency.png' });

    // Check for error page
    const errorText = await agencyPage.$eval('body', el => el.textContent).catch(() => '');
    if (errorText.includes('Something went wrong') || errorText.includes('Error ID')) {
      log('Agency', 'Error page', 'FAIL', 'Shows "Something went wrong" error');
    } else {
      log('Agency', 'Error page', 'OK', 'No error page visible');
    }
  } catch (e) {
    log('Agency', 'Homepage loads', 'FAIL', e.message.slice(0, 100));
  }

  // ========== 4. PM (pm.recoder.xyz) ==========
  console.log('\n========== PM (pm.recoder.xyz) ==========\n');

  const pmPage = await context.newPage();
  try {
    const resp = await pmPage.goto('https://pm.recoder.xyz/', { waitUntil: 'networkidle', timeout: 15000 });
    const url = pmPage.url();
    const status = resp.status();
    log('PM', 'Homepage loads', status < 500 ? 'OK' : 'FAIL', `HTTP ${status} → ${url}`);
    await pmPage.screenshot({ path: '/tmp/test-pm.png' });
  } catch (e) {
    log('PM', 'Homepage loads', 'FAIL', e.message.slice(0, 100));
  }

  // ========== 5. WEB IDE (web.recoder.xyz) ==========
  console.log('\n========== WEB IDE (web.recoder.xyz) ==========\n');

  const webPage = await context.newPage();
  try {
    const resp = await webPage.goto('https://web.recoder.xyz/', { waitUntil: 'networkidle', timeout: 15000 });
    const url = webPage.url();
    const status = resp.status();
    log('Web IDE', 'Homepage loads', status < 500 ? 'OK' : 'FAIL', `HTTP ${status} → ${url}`);
    await webPage.screenshot({ path: '/tmp/test-web.png' });
  } catch (e) {
    log('Web IDE', 'Homepage loads', 'FAIL', e.message.slice(0, 100));
  }

  // ========== 6. OPENCLAW (openclaw.recoder.xyz) ==========
  console.log('\n========== OPENCLAW (openclaw.recoder.xyz) ==========\n');

  const openclawPage = await context.newPage();
  try {
    const resp = await openclawPage.goto('https://openclaw.recoder.xyz/', { waitUntil: 'networkidle', timeout: 15000 });
    const status = resp.status();
    log('OpenClaw', 'Homepage loads', status < 500 ? 'OK' : 'FAIL', `HTTP ${status}`);
    await openclawPage.screenshot({ path: '/tmp/test-openclaw.png' });

    const bodyText = await openclawPage.$eval('body', el => el.textContent.slice(0, 200)).catch(() => '');
    if (bodyText.includes('disconnect') || bodyText.includes('token mismatch') || bodyText.includes('pairing')) {
      log('OpenClaw', 'Gateway connection', 'FAIL', 'Shows disconnect/pairing error');
    } else {
      log('OpenClaw', 'Gateway connection', 'OK', 'No disconnect error visible');
    }
  } catch (e) {
    log('OpenClaw', 'Homepage loads', 'FAIL', e.message.slice(0, 100));
  }

  // ========== SUMMARY ==========
  console.log('\n========== SUMMARY ==========\n');

  const ok = RESULTS.filter(r => r.status === 'OK').length;
  const fail = RESULTS.filter(r => r.status === 'FAIL').length;
  console.log(`Total checks: ${RESULTS.length} | OK: ${ok} | FAIL: ${fail}`);

  console.log('\n--- FAILURES ---');
  for (const r of RESULTS.filter(r => r.status === 'FAIL')) {
    console.log(`  ${r.category} > ${r.item}: ${r.detail}`);
  }

  console.log(`\nConsole errors from agents: ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 5)) console.log(`  ${e}`);

  console.log(`\nNetwork failures from agents: ${networkErrors.length}`);
  for (const e of networkErrors.slice(0, 5)) console.log(`  ${e}`);

  console.log('\nScreenshots saved to /tmp/test-*.png');

  // Write results to JSON
  fs.writeFileSync('/tmp/test-results.json', JSON.stringify(RESULTS, null, 2));

  await browser.close();
};

run().catch(console.error);
