import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });

  console.log('\n========== AGENCY (agency.recoder.xyz) ==========\n');
  const agency = await ctx.newPage();
  await agency.goto('https://agency.recoder.xyz/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  console.log('URL:', agency.url());
  const agencyTitle = await agency.title();
  console.log('Title:', agencyTitle);

  // Check if login page has form fields
  const loginInputs = await agency.$$eval('input', els => els.map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder })));
  console.log('Login inputs:', JSON.stringify(loginInputs.slice(0, 5)));

  // Check for error messages
  const agencyErrors = await agency.$eval('body', el => {
    const text = el.textContent || '';
    if (text.includes('Something went wrong')) return 'ERROR PAGE';
    if (text.includes('503')) return '503 ERROR';
    if (text.includes('500')) return '500 ERROR';
    return 'OK';
  }).catch(() => 'FAILED');
  console.log('Error check:', agencyErrors);

  // Check if copilot button exists
  const copilotBtn = await agency.$('button:has-text("copilot"), [aria-label*="copilot"], [data-testid*="copilot"]');
  console.log('Copilot visible (unauthenticated):', copilotBtn ? 'YES' : 'NO (needs login)');
  await agency.screenshot({ path: '/tmp/real-agency.png' });

  console.log('\n========== PM (pm.recoder.xyz) ==========\n');
  const pm = await ctx.newPage();
  await pm.goto('https://pm.recoder.xyz/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  console.log('URL:', pm.url());
  const pmTitle = await pm.title();
  console.log('Title:', pmTitle);

  // Check for error messages
  const pmErrors = await pm.$eval('body', el => {
    const text = el.textContent || '';
    if (text.includes('Something went wrong')) return 'ERROR PAGE';
    if (text.includes('Server Components')) return 'SERVER COMPONENT CRASH';
    if (text.includes('500')) return '500 ERROR';
    return 'OK - ' + text.slice(0, 100);
  }).catch(() => 'FAILED');
  console.log('Error check:', pmErrors);
  await pm.screenshot({ path: '/tmp/real-pm.png' });

  console.log('\n========== WEB IDE (web.recoder.xyz) ==========\n');
  const web = await ctx.newPage();
  await web.goto('https://web.recoder.xyz/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  console.log('URL:', web.url());
  const webTitle = await web.title();
  console.log('Title:', webTitle);
  await web.screenshot({ path: '/tmp/real-web.png' });

  console.log('\n========== OPENCLAW (openclaw.recoder.xyz) ==========\n');
  const oc = await ctx.newPage();
  await oc.goto('https://openclaw.recoder.xyz/', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  console.log('URL:', oc.url());

  // Check for disconnect error
  const ocStatus = await oc.$eval('body', el => {
    const text = el.textContent || '';
    if (text.includes('disconnected') || text.includes('token mismatch')) return 'DISCONNECTED: ' + text.match(/disconnected.*?\)/)?.[0];
    if (text.includes('Connected')) return 'CONNECTED';
    return text.slice(0, 200);
  }).catch(() => 'FAILED');
  console.log('Status:', ocStatus);
  await oc.screenshot({ path: '/tmp/real-openclaw.png' });

  console.log('\n========== RECODER.XYZ (main) ==========\n');
  const main = await ctx.newPage();
  await main.goto('https://recoder.xyz/', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  console.log('URL:', main.url());

  // Check for sign out link
  const signOutLink = await main.$('a[href*="signout"], a:has-text("Sign Out"), button:has-text("Sign Out")');
  console.log('Sign Out visible:', signOutLink ? 'YES' : 'NO');

  // Check for Launch Web IDE button
  const launchBtn = await main.$('a:has-text("Web IDE"), button:has-text("Web IDE"), a:has-text("Launch")');
  console.log('Launch Web IDE button:', launchBtn ? 'YES' : 'NO');

  // Check page content
  const mainContent = await main.$eval('body', el => el.textContent?.slice(0, 300) || '').catch(() => '');
  console.log('Page content preview:', mainContent.replace(/\s+/g, ' ').slice(0, 200));
  await main.screenshot({ path: '/tmp/real-main.png' });

  console.log('\n========== AGENTS (agents.recoder.xyz) ==========\n');
  const agents = await ctx.newPage();
  const agentsResp = await agents.goto('https://agents.recoder.xyz/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => ({ status: () => 0 }));
  console.log('Status:', agentsResp.status?.() ?? 'timeout');
  console.log('URL:', agents.url());

  if (agentsResp.status?.() === 200) {
    // Check for tool icons
    const toolIcons = await agents.$$eval('button, a, [role="button"]', els =>
      els.map(e => e.textContent?.trim()).filter(t => t && ['Slides', 'Data', 'Docs', 'Canvas', 'Video', 'Research', 'Image'].some(tool => t.includes(tool)))
    );
    console.log('Tool buttons:', toolIcons);

    // Check chat input
    const chatInput = await agents.$('textarea');
    console.log('Chat input:', chatInput ? 'EXISTS' : 'MISSING');

    // Check sidebar
    const sidebarLinks = await agents.$$eval('nav a, aside a', els => els.map(e => ({ text: e.textContent?.trim().slice(0, 20), href: e.href })).slice(0, 10));
    console.log('Sidebar links:', sidebarLinks.length);
  } else {
    console.log('Agents is DOWN (build in progress)');
  }
  await agents.screenshot({ path: '/tmp/real-agents.png' });

  await browser.close();
  console.log('\n========== SCREENSHOTS ==========');
  console.log('/tmp/real-agency.png');
  console.log('/tmp/real-pm.png');
  console.log('/tmp/real-web.png');
  console.log('/tmp/real-openclaw.png');
  console.log('/tmp/real-main.png');
  console.log('/tmp/real-agents.png');
};

run().catch(console.error);
