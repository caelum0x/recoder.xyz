import { chromium } from 'playwright';
import {
  addRecoderAuthCookies,
  buildRecoderCookieHeader,
  SESSION_TOKEN,
} from './lib/recoder-auth.mjs';
import crypto from 'node:crypto';

const WEB_URL = process.env.WEB_URL || 'https://web.recoder.xyz';
const DOCKER_BACKEND_URL = process.env.DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';
const TIMEOUT_MS = Number(process.env.WEB_E2E_TIMEOUT_MS || '45000');
const PROJECT_NAME = `codex-web-${Date.now()}`;
const FRAMEWORK = process.env.WEB_E2E_FRAMEWORK || 'vite';
const TEMPLATE_ID = process.env.WEB_E2E_TEMPLATE_ID || 'vite-react-ts';
const COOKIE_HEADER = buildRecoderCookieHeader();
const PROJECT_ID = crypto.randomUUID();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gotoStablePage(page, url, timeoutMs = 60000) {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  await page.waitForLoadState('load', { timeout: Math.min(timeoutMs, 15000) }).catch(() => {});
  return response;
}

async function collectPageState(page) {
  return await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    bodySnippet: (document.body?.innerText || '').slice(0, 1000),
  })).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
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

async function pollPreviewHealth(projectId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;

  while (Date.now() < deadline) {
    latest = await fetchJson(`${DOCKER_BACKEND_URL}/api/preview/${projectId}/health`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SESSION_TOKEN}`,
      },
    });
    const ports = latest?.body?.ports || [];
    const responding = ports.find((port) => port.responding);
    const previewUrl = latest?.body?.previewUrl || null;

    if (responding && previewUrl) {
      return {
        previewUrl,
        port: responding.port,
        health: latest,
      };
    }

    await sleep(3000);
  }

  return {
    previewUrl: null,
    port: null,
    health: latest,
  };
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
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));

  try {
    await gotoStablePage(page, WEB_URL, 60000);
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          webUrl: WEB_URL,
          dockerBackendUrl: DOCKER_BACKEND_URL,
          projectName: PROJECT_NAME,
          projectId: PROJECT_ID,
          gotoError: error instanceof Error ? error.message : String(error),
          pageState: await collectPageState(page),
          consoleErrors,
          pageErrors,
        },
        null,
        2,
      ),
    );
    throw error;
  }

  const createSandbox = await fetchJson(`${WEB_URL}/api/create-sandbox`, {
    method: 'POST',
    body: JSON.stringify({
      projectId: PROJECT_ID,
      framework: FRAMEWORK,
      templateId: TEMPLATE_ID,
    }),
  });

  const sandboxId = createSandbox.body?.sandboxId || null;
  const containerId = createSandbox.body?.containerId || null;
  const initialPreviewUrl = createSandbox.body?.previewUrl || createSandbox.body?.url || null;

  const startDevServer = createSandbox.ok
    ? await fetchJson(`${DOCKER_BACKEND_URL}/api/dev-server/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SESSION_TOKEN}`,
        },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          framework: FRAMEWORK,
        }),
      }, 65000)
    : null;

  const previewHealth =
    createSandbox.ok
      ? await pollPreviewHealth(PROJECT_ID, TIMEOUT_MS)
      : { previewUrl: null, port: null, health: null };
  const previewLookup =
    createSandbox.ok
      ? await fetchJson(
          `${DOCKER_BACKEND_URL}/api/preview/${encodeURIComponent(PROJECT_ID)}/url`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${SESSION_TOKEN}`,
            },
          },
        )
      : null;

  const finalPreviewUrl =
    previewHealth.previewUrl || previewLookup?.body?.url || initialPreviewUrl;

  let previewFetch = null;
  if (finalPreviewUrl) {
    const response = await fetchWithTimeout(finalPreviewUrl, {}, 15000).catch(() => null);
    previewFetch = {
      status: response?.status || null,
      finalUrl: response?.url || finalPreviewUrl,
      contentType: response?.headers?.get?.('content-type') || null,
    };
  }

  console.log(
    JSON.stringify(
      {
        webUrl: WEB_URL,
        dockerBackendUrl: DOCKER_BACKEND_URL,
        projectName: PROJECT_NAME,
        projectId: PROJECT_ID,
        createSandbox,
        sandboxId,
        containerId,
        initialPreviewUrl,
        startDevServer,
        previewHealth,
        previewLookup,
        finalPreviewUrl,
        previewFetch,
        consoleErrors,
        pageErrors,
      },
      null,
      2,
    ),
  );

  await browser.close();
})();
