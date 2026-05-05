import { chromium } from 'playwright';
import {
  addRecoderAuthCookies,
  buildRecoderCookieHeader,
  SESSION_TOKEN,
} from './lib/recoder-auth.mjs';

const WEB_URL = process.env.WEB_URL || 'https://web.recoder.xyz';
const DOCKER_BACKEND_URL = process.env.DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';
const COOKIE_HEADER = buildRecoderCookieHeader();
const PREVIEW_TIMEOUT_MS = Number(process.env.WEB_E2E_TIMEOUT_MS || '120000');

const INITIAL_PROMPT = "Build a simple page with a red heading that says 'Recoder Works' and a paragraph below that says 'Initial pass'.";
const FOLLOWUP_PROMPT = "Change the background to green and add a footer that says 'Built with AI'.";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function progress(message) {
  console.error(`[e2e-web-followup] ${message}`);
}

async function gotoStablePage(page, url, timeoutMs = 60000) {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  await page.waitForLoadState('load', { timeout: Math.min(timeoutMs, 15000) }).catch(() => {});
  return response;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, init = {}, timeoutMs = 20000) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Cookie: COOKIE_HEADER,
          ...(init.headers || {}),
        },
      },
      timeoutMs,
    );

    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchText(url, init = {}, timeoutMs = 20000) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        ...init,
        headers: {
          Cookie: COOKIE_HEADER,
          ...(init.headers || {}),
        },
      },
      timeoutMs,
    );

    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readProjectFile(projectId, path) {
  return fetchText(
    `${DOCKER_BACKEND_URL}/api/file/${encodeURIComponent(projectId)}?path=${encodeURIComponent(path)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SESSION_TOKEN}`,
      },
    },
    15000,
  );
}

async function inspectRenderedPreview(previewPage, previewUrl) {
  try {
    const response = await gotoStablePage(previewPage, previewUrl, 20000);
    await previewPage.locator('body').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const bodyText = await previewPage.textContent('body').catch(() => '');
    return {
      status: response?.status() || null,
      finalUrl: previewPage.url(),
      bodyText: bodyText || '',
    };
  } catch (error) {
    return {
      status: 0,
      finalUrl: previewUrl,
      bodyText: error instanceof Error ? error.message : String(error),
    };
  }
}

async function pollPreviewState(previewPage, projectId, expectedText, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latestHealth = null;
  let latestPreviewRender = null;
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts += 1;
    progress(`poll preview project=${projectId} expected="${expectedText}" attempt=${attempts}`);
    latestHealth = await fetchJson(
      `${DOCKER_BACKEND_URL}/api/preview/${encodeURIComponent(projectId)}/health`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${SESSION_TOKEN}`,
        },
      },
      15000,
    );

    const previewUrl = latestHealth?.body?.previewUrl || null;
    const respondingPort = latestHealth?.body?.ports?.find?.((entry) => entry.responding) || null;

    if (previewUrl && respondingPort) {
      latestPreviewRender = await inspectRenderedPreview(previewPage, previewUrl);
      if (latestPreviewRender.bodyText.includes(expectedText)) {
        return {
          previewUrl,
          port: respondingPort.port,
          health: latestHealth,
          previewRender: latestPreviewRender,
        };
      }
    }

    await sleep(4000);
  }

  return {
    previewUrl: latestHealth?.body?.previewUrl || null,
    port: latestHealth?.body?.ports?.find?.((entry) => entry.responding)?.port || null,
    health: latestHealth,
    previewRender: latestPreviewRender,
  };
}

async function waitForTextareaReady(page, timeoutMs = 60000) {
  await page.waitForFunction(() => {
    const textarea = document.querySelector('textarea');
    return Boolean(textarea && !textarea.disabled);
  }, { timeout: timeoutMs });
}

async function collectPageState(page) {
  return await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    textareaCount: document.querySelectorAll('textarea').length,
    buttonCount: document.querySelectorAll('button').length,
    bodySnippet: (document.body?.innerText || '').slice(0, 1000),
  })).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
}

async function sendPrompt(page, prompt) {
  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 30000 });
  await textarea.focus();
  await textarea.fill(prompt);
  await textarea.press('Enter');
}

async function waitForChatCount(getCount, expectedCount, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getCount() >= expectedCount) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36',
  });
  await addRecoderAuthCookies(context);

  const page = await context.newPage();
  const previewPage = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const chatRequests = [];
  const chatResponses = [];
  let capturedProjectId = null;

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('response', async (response) => {
    if (!response.url().includes('/api/chat') || response.request().method() !== 'POST') {
      return;
    }

    let bodySnippet = '';
    try {
      bodySnippet = (await response.text()).slice(0, 2000);
    } catch {
      // ignore streaming/body read failures
    }

    chatResponses.push({
      status: response.status(),
      url: response.url(),
      bodySnippet,
    });
  });
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));
  page.on('request', (request) => {
    if (!request.url().includes('/api/chat') || request.method() !== 'POST') {
      return;
    }

    try {
      const payload = request.postDataJSON();
      const projectId = payload?.projectId || null;
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const lastUser = [...messages].reverse().find((message) => message?.role === 'user');
      const lastUserText = typeof lastUser?.content === 'string' ? lastUser.content : '';
      if (projectId) {
        capturedProjectId = projectId;
        progress(`captured projectId=${projectId} from /api/chat`);
      }
      chatRequests.push({
        projectId,
        lastUserText,
      });
    } catch {
      // ignore parse failures
    }
  });

  await gotoStablePage(page, WEB_URL, 60000);
  progress('page loaded');
  try {
    await waitForTextareaReady(page, 30000);
  } catch (error) {
    console.log(JSON.stringify({
      webUrl: WEB_URL,
      error: error instanceof Error ? error.message : String(error),
      pageState: await collectPageState(page),
      consoleErrors,
      pageErrors,
    }, null, 2));
    throw error;
  }
  progress('textarea ready for initial prompt');

  const initialRequestCount = chatRequests.length;
  const initialResponseCount = chatResponses.length;

  await sendPrompt(page, INITIAL_PROMPT);
  progress('initial prompt submitted');
  const firstChatRequestSeen = await waitForChatCount(() => chatRequests.length, initialRequestCount + 1, 30000);
  const firstChatResponseSeen = await waitForChatCount(() => chatResponses.length, initialResponseCount + 1, 30000);
  const firstChatResponse = firstChatResponseSeen ? chatResponses[initialResponseCount] : null;
  progress(`initial chat request seen=${firstChatRequestSeen} response status=${firstChatResponse ? firstChatResponse.status : 'none'}`);
  const firstChatText = firstChatResponse?.bodySnippet || '';

  const initialProjectId = await (async () => {
    const deadline = Date.now() + 30000;
    while (!capturedProjectId && Date.now() < deadline) {
      await sleep(500);
    }
    return capturedProjectId || chatRequests.at(-1)?.projectId || null;
  })();

  const initialPreview = initialProjectId
    ? await pollPreviewState(previewPage, initialProjectId, 'Recoder Works', PREVIEW_TIMEOUT_MS)
    : { previewUrl: null, port: null, health: null, previewRender: null };
  progress(`initial preview done responding=${Boolean(initialPreview?.port)} previewUrl=${initialPreview?.previewUrl || 'none'}`);

  const initialFileCandidates = initialProjectId
    ? await Promise.all([
        readProjectFile(initialProjectId, '/src/App.tsx'),
        readProjectFile(initialProjectId, '/src/App.jsx'),
        readProjectFile(initialProjectId, '/app/page.tsx'),
        readProjectFile(initialProjectId, '/index.html'),
      ])
    : [];

  await waitForTextareaReady(page, 120000);
  progress('textarea ready for follow-up prompt');

  const followupRequestCount = chatRequests.length;
  const followupResponseCount = chatResponses.length;

  await sendPrompt(page, FOLLOWUP_PROMPT);
  progress('follow-up prompt submitted');
  const secondChatRequestSeen = await waitForChatCount(() => chatRequests.length, followupRequestCount + 1, 30000);
  const secondChatResponseSeen = await waitForChatCount(() => chatResponses.length, followupResponseCount + 1, 30000);
  const secondChatResponse = secondChatResponseSeen ? chatResponses[followupResponseCount] : null;
  progress(`follow-up chat request seen=${secondChatRequestSeen} response status=${secondChatResponse ? secondChatResponse.status : 'none'}`);
  const secondChatText = secondChatResponse?.bodySnippet || '';

  const projectId = capturedProjectId || chatRequests.at(-1)?.projectId || initialProjectId || null;

  const followupPreview = projectId
    ? await pollPreviewState(previewPage, projectId, 'Built with AI', PREVIEW_TIMEOUT_MS)
    : { previewUrl: null, port: null, health: null, previewRender: null };
  progress(`follow-up preview done responding=${Boolean(followupPreview?.port)} previewUrl=${followupPreview?.previewUrl || 'none'}`);

  const followupFileCandidates = projectId
    ? await Promise.all([
        readProjectFile(projectId, '/src/App.tsx'),
        readProjectFile(projectId, '/src/App.jsx'),
        readProjectFile(projectId, '/src/index.css'),
        readProjectFile(projectId, '/app/page.tsx'),
        readProjectFile(projectId, '/index.html'),
      ])
    : [];

  console.log(JSON.stringify({
    webUrl: WEB_URL,
    dockerBackendUrl: DOCKER_BACKEND_URL,
    projectId,
    firstChatRequestSeen,
    secondChatRequestSeen,
    firstChatResponse,
    secondChatResponse,
    firstChatTextSnippet: firstChatText.slice(0, 3000),
    secondChatTextSnippet: secondChatText.slice(0, 3000),
    firstChatActionCount: (firstChatText.match(/<recoderAction/g) || []).length,
    secondChatActionCount: (secondChatText.match(/<recoderAction/g) || []).length,
    chatRequests,
    initialPreview,
    followupPreview,
    initialFileCandidates: initialFileCandidates.map((entry, index) => ({
      path: ['/src/App.tsx', '/src/App.jsx', '/app/page.tsx', '/index.html'][index],
      status: entry.status,
      snippet: entry.body.slice(0, 300),
    })),
    followupFileCandidates: followupFileCandidates.map((entry, index) => ({
      path: ['/src/App.tsx', '/src/App.jsx', '/src/index.css', '/app/page.tsx', '/index.html'][index],
      status: entry.status,
      snippet: entry.body.slice(0, 300),
    })),
    consoleErrors,
    pageErrors,
  }, null, 2));

  await browser.close();
})();
