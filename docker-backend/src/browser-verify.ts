/**
 * @module browser-verify
 *
 * Browser-based self-verification for agent work — the "browser verification"
 * pillar. Given a preview URL and a set of checks, it drives a headless browser
 * to confirm the page actually renders and behaves, returning a structured
 * pass/fail report (HTTP status, console errors, uncaught page errors, failed
 * requests, selector/text assertions) plus a screenshot.
 *
 * Two layers:
 *  - **Deterministic** (`browserVerify`): Puppeteer-driven, no LLM, no extra
 *    deps beyond the existing browser stack. This is the reliable core.
 *  - **AI-driven** (`browserAiVerify`): optional, backed by Stagehand
 *    (browserbase/stagehand). Fail-safe — if Stagehand isn't installed or no
 *    LLM key is set, it reports `available: false` with a truthful reason and
 *    never fakes a pass.
 */

import { createLogger } from './logger';

const logger = createLogger('browser-verify');

// Browser primitives are duck-typed `any` to match the existing puppeteer
// integration style and avoid a hard dependency at type-check time.
type Page = any;
type Browser = any;

// Dynamic import that survives bundlers/tsc when the module may be absent.
const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

let _puppeteer: any | undefined;
async function getPuppeteer(): Promise<any> {
  if (!_puppeteer) {
    const mod = await dynamicImport('puppeteer');
    _puppeteer = mod.default || mod;
  }
  return _puppeteer;
}

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-gpu',
  '--disable-software-rasterizer',
];

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export type VerifyCheck =
  | { type: 'status-ok' }
  | { type: 'console-clean' }
  | { type: 'no-page-errors' }
  | { type: 'no-failed-requests' }
  | { type: 'selector-exists'; selector: string }
  | { type: 'text-contains'; text: string }
  | { type: 'title-contains'; text: string };

export interface VerifyCheckResult {
  type: string;
  passed: boolean;
  detail: string;
}

export interface BrowserVerifyResult {
  url: string;
  passed: boolean;
  httpStatus?: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  checks: VerifyCheckResult[];
  screenshot?: string;
  durationMs: number;
  error?: string;
}

export interface BrowserVerifyParams {
  url: string;
  checks?: VerifyCheck[];
  timeoutMs?: number;
  viewport?: { width: number; height: number };
  /** Extra settle time after load before running checks (ms). */
  settleMs?: number;
}

const DEFAULT_CHECKS: VerifyCheck[] = [
  { type: 'status-ok' },
  { type: 'console-clean' },
  { type: 'no-page-errors' },
];

async function captureScreenshot(page: Page): Promise<string | undefined> {
  try {
    const data = await page.screenshot({ type: 'jpeg', quality: 60, encoding: 'base64' });
    return `data:image/jpeg;base64,${data}`;
  } catch (err) {
    logger.warn({ err }, 'verify screenshot failed');
    return undefined;
  }
}

interface CheckContext {
  page: Page;
  httpStatus?: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  title: string;
  bodyText: string;
}

async function runCheck(check: VerifyCheck, ctx: CheckContext): Promise<VerifyCheckResult> {
  switch (check.type) {
    case 'status-ok': {
      const ok = typeof ctx.httpStatus === 'number' && ctx.httpStatus < 400;
      return { type: check.type, passed: ok, detail: `HTTP ${ctx.httpStatus ?? 'unknown'}` };
    }
    case 'console-clean':
      return {
        type: check.type,
        passed: ctx.consoleErrors.length === 0,
        detail: ctx.consoleErrors.length === 0 ? 'no console errors' : `${ctx.consoleErrors.length} console error(s)`,
      };
    case 'no-page-errors':
      return {
        type: check.type,
        passed: ctx.pageErrors.length === 0,
        detail: ctx.pageErrors.length === 0 ? 'no uncaught errors' : `${ctx.pageErrors.length} uncaught error(s)`,
      };
    case 'no-failed-requests':
      return {
        type: check.type,
        passed: ctx.failedRequests.length === 0,
        detail: ctx.failedRequests.length === 0 ? 'no failed requests' : `${ctx.failedRequests.length} failed request(s)`,
      };
    case 'selector-exists': {
      const found = await ctx.page.$(check.selector).then((el: unknown) => !!el).catch(() => false);
      return { type: check.type, passed: found, detail: found ? `found ${check.selector}` : `missing ${check.selector}` };
    }
    case 'text-contains': {
      const found = ctx.bodyText.toLowerCase().includes(check.text.toLowerCase());
      return { type: check.type, passed: found, detail: found ? `page contains "${check.text}"` : `"${check.text}" not found` };
    }
    case 'title-contains': {
      const found = ctx.title.toLowerCase().includes(check.text.toLowerCase());
      return { type: check.type, passed: found, detail: `title is "${ctx.title}"` };
    }
    default:
      return { type: (check as { type: string }).type, passed: false, detail: 'unknown check' };
  }
}

export async function browserVerify(params: BrowserVerifyParams): Promise<BrowserVerifyResult> {
  const start = Date.now();
  const checks = params.checks && params.checks.length > 0 ? params.checks : DEFAULT_CHECKS;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  let httpStatus: number | undefined;
  let browser: Browser | undefined;

  try {
    const puppeteer = await getPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      args: LAUNCH_ARGS,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    });

    const page = await browser.newPage();
    await page.setViewport(params.viewport ?? DEFAULT_VIEWPORT);

    page.on('console', (msg: any) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err: any) => {
      pageErrors.push(err?.message ?? String(err));
    });
    page.on('requestfailed', (req: any) => {
      const failure = req.failure?.()?.errorText ?? 'failed';
      failedRequests.push(`${req.method?.() ?? 'GET'} ${req.url()} (${failure})`);
    });

    const response = await page.goto(params.url, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    httpStatus = response?.status?.();

    if (params.settleMs && params.settleMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(params.settleMs!, 10_000)));
    }

    const title = await page.title().catch(() => '');
    const bodyText = await page
      .evaluate(() => (typeof document !== 'undefined' ? document.body?.innerText ?? '' : ''))
      .catch(() => '');

    const ctx: CheckContext = { page, httpStatus, consoleErrors, pageErrors, failedRequests, title, bodyText };
    const checkResults: VerifyCheckResult[] = [];
    for (const check of checks) {
      checkResults.push(await runCheck(check, ctx));
    }

    const screenshot = await captureScreenshot(page);
    const passed = checkResults.every((c) => c.passed);

    logger.info({ url: params.url, passed, httpStatus, checks: checkResults.length }, 'browser verify complete');

    return {
      url: params.url,
      passed,
      httpStatus,
      consoleErrors,
      pageErrors,
      failedRequests,
      checks: checkResults,
      screenshot,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    logger.error({ err, url: params.url }, 'browser verify failed');
    return {
      url: params.url,
      passed: false,
      httpStatus,
      consoleErrors,
      pageErrors,
      failedRequests,
      checks: [],
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'browser verify failed',
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// AI-driven verification via Stagehand (optional, fail-safe)
// ---------------------------------------------------------------------------

export interface BrowserAiVerifyResult {
  available: boolean;
  reason?: string;
  url?: string;
  instruction?: string;
  passed?: boolean;
  observations?: unknown;
  durationMs?: number;
}

function resolveLlmKey(): { apiKey?: string; modelName: string } {
  if (process.env.OPENAI_API_KEY) {
    return { apiKey: process.env.OPENAI_API_KEY, modelName: process.env.STAGEHAND_MODEL || 'gpt-4o-mini' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { apiKey: process.env.ANTHROPIC_API_KEY, modelName: process.env.STAGEHAND_MODEL || 'claude-3-5-sonnet-latest' };
  }
  return { apiKey: undefined, modelName: process.env.STAGEHAND_MODEL || 'gpt-4o-mini' };
}

/**
 * Natural-language verification: "is the login form visible and the submit
 * button enabled?". Uses Stagehand to observe the page and decide. Returns
 * `available: false` (never a fake pass) when Stagehand or an LLM key is
 * missing so callers can fall back to {@link browserVerify}.
 */
export async function browserAiVerify(params: {
  url: string;
  instruction: string;
  timeoutMs?: number;
}): Promise<BrowserAiVerifyResult> {
  const { apiKey, modelName } = resolveLlmKey();
  if (!apiKey) {
    return { available: false, reason: 'No LLM key (set OPENAI_API_KEY or ANTHROPIC_API_KEY) for Stagehand verification' };
  }

  let stagehandMod: any;
  try {
    stagehandMod = await dynamicImport('@browserbasehq/stagehand');
  } catch {
    return { available: false, reason: 'Stagehand not installed (run `pnpm add @browserbasehq/stagehand`)' };
  }

  const Stagehand = stagehandMod.Stagehand || stagehandMod.default;
  if (!Stagehand) {
    return { available: false, reason: 'Stagehand export not found' };
  }

  const start = Date.now();
  let stagehand: any;
  try {
    stagehand = new Stagehand({
      env: 'LOCAL',
      modelName,
      modelClientOptions: { apiKey },
      verbose: 0,
    });
    await stagehand.init();
    const page = stagehand.page;
    await page.goto(params.url, { timeout: params.timeoutMs ?? DEFAULT_TIMEOUT_MS });

    // `observe` returns candidate actions/elements matching the instruction;
    // a non-empty result means the described UI was located on the page.
    const observations = await page.observe(params.instruction);
    const passed = Array.isArray(observations) ? observations.length > 0 : !!observations;

    return {
      available: true,
      url: params.url,
      instruction: params.instruction,
      passed,
      observations,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      available: true,
      url: params.url,
      instruction: params.instruction,
      passed: false,
      reason: err instanceof Error ? err.message : 'Stagehand verification failed',
      durationMs: Date.now() - start,
    };
  } finally {
    if (stagehand?.close) {
      await stagehand.close().catch(() => {});
    }
  }
}

export async function browserVerifyHealth(): Promise<{ deterministic: boolean; ai: boolean; reason?: string }> {
  let deterministic = false;
  try {
    await getPuppeteer();
    deterministic = true;
  } catch {
    deterministic = false;
  }
  const { apiKey } = resolveLlmKey();
  let aiAvailable = false;
  if (apiKey) {
    try {
      await dynamicImport('@browserbasehq/stagehand');
      aiAvailable = true;
    } catch {
      aiAvailable = false;
    }
  }
  return {
    deterministic,
    ai: aiAvailable,
    reason: deterministic ? undefined : 'puppeteer not available',
  };
}
