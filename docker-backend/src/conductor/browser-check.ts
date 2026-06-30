/**
 * Conductor browser-check — verifies an agent's preview/web output is healthy.
 *
 * This fuses the OWNED `@recoder/browser-verification` contract package onto the
 * real post-run product path. When an agent finishes, the post-run workflow graph
 * (verify -> browser-check -> memory) runs a `browser-check` node that:
 *
 *   1. Resolves the workspace's preview URL (from workspace metadata, set by the
 *      publish / preview surface). When there is no preview URL, the check SKIPS —
 *      most conductor tasks produce code, not a live preview, so a skip is the
 *      common, correct outcome (degrade-safe).
 *   2. When a preview URL exists, it performs a lightweight reachability/health
 *      probe of the URL using Node's built-in `fetch` (no heavy browser runtime),
 *      then assembles a typed `BrowserVerificationResult` + summary artifact using
 *      the contract package's `createBrowserVerificationPlan` /
 *      `summarizeBrowserVerification` / `createBrowserVerificationSummaryArtifact`.
 *
 * Real headless-browser check (optional, lazy): `@recoder/browser-tools` ships a
 * CJS-consumable `dist` (`dist/index.cjs` + an `exports` map) with `playwright` as an
 * OPTIONAL peer dependency. When a preview URL is present AND both `playwright` and
 * `@recoder/browser-tools` are resolvable+loadable at runtime, this module drives a
 * real Chromium page load (lazy `import()`, never a top-level import) and flows the
 * engine's RICHER preview-health capability — not just "did it answer a socket":
 *
 *   - render assert (`recoder.browser.open_preview`): the preview produced a real
 *     document (via the engine's `navigateTo`, yielding the rendered URL + title);
 *   - console / page-error capture (`recoder.browser.console_errors`): listeners are
 *     attached BEFORE navigation, so any `console.error` / uncaught `pageerror` during
 *     load is surfaced as a truthful failed check;
 *   - screenshot evidence (`recoder.browser.screenshot`): a PNG of the loaded preview
 *     captured and embedded (base64, size-capped) as a `screenshot` artifact.
 *
 * If the browser driver is unavailable, the launch fails, or no browser binary is
 * installed, it transparently falls back to the dependency-light Node-`fetch`
 * reachability probe. Each richer signal is independently degrade-safe: a page that
 * cannot emit console events or take a screenshot downgrades that one check to
 * `skipped` (never crashes, never a false failure). The Playwright path is NEVER
 * required: the lazy import keeps the conductor's CJS `tsc` build free of the heavy
 * ESM/Playwright dependency, and the contract package
 * (`@recoder/browser-verification`) remains the only built-in fusion.
 *
 * Additive + degrade-safe: this NEVER throws. Any failure (no URL, fetch error,
 * no playwright, browser launch error, package unavailable) is surfaced as a check
 * status (or a silent fallback to the fetch probe), never as a crash, and never
 * blocks the workspace's transition to awaiting_review.
 */
import { createLogger } from '../logger.js';
import {
  createBrowserVerificationPlan,
  summarizeBrowserVerification,
  createBrowserVerificationSummaryArtifact,
  type BrowserVerificationResult,
  type BrowserVerificationCheckResult,
  type BrowserVerificationArtifact,
} from '@recoder/browser-verification';
import { getWorkspace } from './workspace-service.js';
import { randomUUID } from 'node:crypto';

const logger = createLogger('conductor:browser-check');

/** How long to wait for the preview to respond before treating it as unhealthy. */
const PROBE_TIMEOUT_MS = Number(process.env.CONDUCTOR_BROWSER_CHECK_TIMEOUT_MS) || 8_000;

export interface BrowserCheckOutcome {
  /** Whether a preview URL was found and a check was attempted. */
  attempted: boolean;
  /** The verification result (null when no preview URL / unavailable). */
  result: BrowserVerificationResult | null;
  /** The summary artifact for the result (null when skipped). */
  artifact: BrowserVerificationArtifact | null;
}

/**
 * Resolve a preview URL for a workspace from its metadata. Conductor workspaces do
 * not always have a preview; the publish/preview surface attaches one to
 * `metadata.previewUrl` when the task produced a live web output. Returns
 * undefined when no usable URL is present (the common case).
 */
function resolvePreviewUrl(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) return undefined;
  const candidates = [metadata.previewUrl, metadata.preview_url, metadata.previewURL];
  for (const value of candidates) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Probe the preview URL for reachability. Returns a single check result describing
 * whether the preview responded with a healthy (2xx/3xx) status. Never throws.
 */
async function probePreview(previewUrl: string): Promise<BrowserVerificationCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(previewUrl, { method: 'GET', signal: controller.signal });
    const healthy = response.status >= 200 && response.status < 400;
    return {
      tool: 'recoder.browser.open_preview',
      status: healthy ? 'passed' : 'failed',
      target: previewUrl,
      expected: '2xx/3xx response',
      actual: String(response.status),
      message: healthy
        ? `Preview reachable (HTTP ${response.status})`
        : `Preview returned unhealthy status HTTP ${response.status}`,
      metadata: { httpStatus: response.status },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      tool: 'recoder.browser.open_preview',
      status: 'failed',
      target: previewUrl,
      expected: '2xx/3xx response',
      message: `Preview unreachable: ${reason}`,
      metadata: { error: reason },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** How long to allow the optional Playwright page load before giving up. */
const BROWSER_NAV_TIMEOUT_MS = Number(process.env.CONDUCTOR_BROWSER_CHECK_NAV_TIMEOUT_MS) || PROBE_TIMEOUT_MS;

/**
 * The minimal Playwright `Page` surface the deeper checks OPTIONALLY use. Every
 * member is optional + probed with `typeof` before use so a degraded page (e.g. the
 * `{}` produced by a fake driver, or an older browser-tools build) still drives the
 * core navigate/title signal — the richer console/screenshot checks simply downgrade
 * to `skipped` rather than crash. Structural, so we never type-depend on `playwright`.
 */
interface LazyBrowserPage {
  /** Playwright event emitter — used to collect `console` + `pageerror` events. */
  on?: (event: string, handler: (payload: unknown) => void) => void;
  /** Detach a previously-attached listener (best-effort teardown). */
  off?: (event: string, handler: (payload: unknown) => void) => void;
  /** Capture a screenshot; we request a base64 buffer for artifact embedding. */
  screenshot?: (opts?: {
    fullPage?: boolean;
    type?: 'png' | 'jpeg';
  }) => Promise<Buffer | Uint8Array>;
}

/**
 * The minimal shape of `@recoder/browser-tools` + `playwright` that the optional
 * real-page check needs. Kept local + structural so we never take a top-level type
 * dependency on either optional package.
 */
interface LazyBrowserDriver {
  chromium: {
    launch(opts?: { headless?: boolean }): Promise<{
      newPage(): Promise<LazyBrowserPage>;
      close(): Promise<void>;
    }>;
  };
  navigateTo: (
    url: string,
    options: { page: unknown },
  ) => Promise<{ url: string; title: string }>;
}

/** Cap on screenshot bytes we embed as base64 in an artifact (keep artifacts small). */
const SCREENSHOT_MAX_BYTES = Number(process.env.CONDUCTOR_BROWSER_CHECK_SCREENSHOT_MAX_BYTES) || 2_000_000;

/**
 * Lazily resolve the optional Playwright-backed browser driver. Uses dynamic
 * `import()` so neither `playwright` nor `@recoder/browser-tools` is a top-level
 * import — the conductor build and the common (no-preview / no-playwright) path stay
 * free of the heavy dependency. Returns `null` (never throws) when either package is
 * absent or fails to load, so the caller falls back to the fetch probe.
 *
 * Exported for tests: the lazy-RBT path is exercised by mocking this seam.
 */
export async function loadBrowserDriver(): Promise<LazyBrowserDriver | null> {
  try {
    const [playwright, browserTools] = await Promise.all([
      import('playwright'),
      import('@recoder/browser-tools'),
    ]);
    const chromium = (playwright as { chromium?: LazyBrowserDriver['chromium'] }).chromium;
    const navigateTo = (browserTools as { navigateTo?: LazyBrowserDriver['navigateTo'] }).navigateTo;
    if (!chromium || typeof navigateTo !== 'function') return null;
    return { chromium, navigateTo };
  } catch {
    // playwright / @recoder/browser-tools not installed or not loadable.
    return null;
  }
}

/** A captured browser console / page error, normalized to a single line. */
interface CapturedConsoleError {
  source: 'console' | 'pageerror';
  text: string;
}

/**
 * Attach `console` + `pageerror` listeners to a Playwright page, returning the
 * collected-errors array plus a teardown that detaches the listeners. Degrade-safe:
 * if the page is a degraded fake (no `.on`), this is a no-op returning an empty
 * collector — the console check then reports `skipped`, not `failed`.
 */
function attachConsoleErrorCollector(page: LazyBrowserPage): {
  errors: CapturedConsoleError[];
  supported: boolean;
  detach: () => void;
} {
  const errors: CapturedConsoleError[] = [];
  if (typeof page.on !== 'function') {
    return { errors, supported: false, detach: () => {} };
  }

  const onConsole = (msg: unknown): void => {
    // Playwright ConsoleMessage exposes `.type()` + `.text()`; guard structurally.
    const m = msg as { type?: () => string; text?: () => string };
    try {
      if (typeof m.type === 'function' && m.type() === 'error') {
        errors.push({ source: 'console', text: typeof m.text === 'function' ? m.text() : 'error' });
      }
    } catch {
      // a misbehaving message object must never break the check.
    }
  };
  const onPageError = (err: unknown): void => {
    const reason = err instanceof Error ? err.message : String(err);
    errors.push({ source: 'pageerror', text: reason });
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  return {
    errors,
    supported: true,
    detach: () => {
      try {
        page.off?.('console', onConsole);
        page.off?.('pageerror', onPageError);
      } catch {
        // best-effort detach.
      }
    },
  };
}

/** Build the console-errors check from a (possibly unsupported) collector. */
function buildConsoleErrorCheck(
  previewUrl: string,
  collector: { errors: CapturedConsoleError[]; supported: boolean },
): BrowserVerificationCheckResult {
  if (!collector.supported) {
    return {
      tool: 'recoder.browser.console_errors',
      status: 'skipped',
      target: previewUrl,
      expected: 'no console errors',
      message: 'Console capture unsupported by this browser driver — skipped',
    };
  }
  const count = collector.errors.length;
  const samples = collector.errors.slice(0, 5).map((e) => `[${e.source}] ${e.text}`);
  return {
    tool: 'recoder.browser.console_errors',
    status: count === 0 ? 'passed' : 'failed',
    target: previewUrl,
    expected: 'no console errors',
    actual: String(count),
    message:
      count === 0
        ? 'No console / page errors during preview load'
        : `Preview emitted ${count} console/page error(s): ${samples.join(' | ')}`,
    metadata: { errorCount: count, samples },
  };
}

/**
 * Capture a screenshot of the loaded preview and return a `screenshot` check plus the
 * embedded artifact. Degrade-safe: a page without `.screenshot()` (degraded fake /
 * older driver) yields a `skipped` check and no artifact. Never throws.
 */
async function captureScreenshotArtifact(
  taskId: string,
  previewUrl: string,
  page: LazyBrowserPage,
): Promise<{ check: BrowserVerificationCheckResult; artifact: BrowserVerificationArtifact | null }> {
  if (typeof page.screenshot !== 'function') {
    return {
      check: {
        tool: 'recoder.browser.screenshot',
        status: 'skipped',
        target: previewUrl,
        message: 'Screenshot unsupported by this browser driver — skipped',
      },
      artifact: null,
    };
  }
  try {
    const raw = await page.screenshot({ fullPage: false, type: 'png' });
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const tooLarge = buffer.byteLength > SCREENSHOT_MAX_BYTES;
    const artifactId = `browser_screenshot_${taskId}_${randomUUID()}`;
    const artifact: BrowserVerificationArtifact = {
      artifactId,
      taskId,
      kind: 'screenshot',
      summary: `Preview screenshot (${buffer.byteLength} bytes) for ${previewUrl}`,
      createdAt: new Date().toISOString(),
      // Embed inline only when small enough; otherwise record dimensions/size only.
      pathOrUrl: tooLarge ? undefined : `data:image/png;base64,${buffer.toString('base64')}`,
      metadata: {
        engine: 'playwright',
        byteLength: buffer.byteLength,
        embedded: !tooLarge,
        previewUrl,
      },
    };
    return {
      check: {
        tool: 'recoder.browser.screenshot',
        status: 'passed',
        target: previewUrl,
        actual: `${buffer.byteLength} bytes`,
        message: `Captured preview screenshot (${buffer.byteLength} bytes)`,
        artifactIds: [artifactId],
        metadata: { engine: 'playwright', byteLength: buffer.byteLength, embedded: !tooLarge },
      },
      artifact,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      check: {
        tool: 'recoder.browser.screenshot',
        status: 'skipped',
        target: previewUrl,
        message: `Screenshot capture failed — skipped: ${reason}`,
        metadata: { error: reason },
      },
      artifact: null,
    };
  }
}

/** Result of the real-browser probe: an ordered set of checks + any artifacts. */
interface BrowserProbeOutcome {
  checks: BrowserVerificationCheckResult[];
  artifacts: BrowserVerificationArtifact[];
}

/**
 * Drive a real headless Chromium page load of the preview via `@recoder/browser-tools`
 * (lazy) and flow the engine's RICHER capability: not just "did it render", but
 * genuine preview-health verification — render assert (`open_preview`), console/page
 * error capture (`console_errors`), and a screenshot artifact (`screenshot`). Returns
 * the collected checks + artifacts, or `null` when the driver is unavailable / the
 * launch fails — in which case the caller falls back to the fetch probe. Never throws.
 * Always closes the browser it opened. Each deeper signal is independently
 * degrade-safe: if a capability is missing on the page, that check downgrades to
 * `skipped` rather than failing or crashing.
 */
async function probePreviewWithBrowser(
  previewUrl: string,
  taskId: string,
): Promise<BrowserProbeOutcome | null> {
  const driver = await loadBrowserDriver();
  if (!driver) return null;

  let browser: { newPage(): Promise<LazyBrowserPage>; close(): Promise<void> } | undefined;
  try {
    browser = await Promise.race([
      driver.chromium.launch({ headless: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('browser launch timed out')), BROWSER_NAV_TIMEOUT_MS),
      ),
    ]);
    const page = await browser.newPage();

    // Attach console/page-error capture BEFORE navigation so errors emitted during
    // load are observed. Degrade-safe when the page can't emit.
    const consoleCollector = attachConsoleErrorCollector(page);

    let nav: { url: string; title: string };
    try {
      nav = await driver.navigateTo(previewUrl, { page });
    } finally {
      consoleCollector.detach();
    }

    // 1) Render assert — the preview produced a real document.
    const renderCheck: BrowserVerificationCheckResult = {
      tool: 'recoder.browser.open_preview',
      status: 'passed',
      target: previewUrl,
      expected: 'rendered document',
      actual: nav.title || nav.url || 'rendered',
      message: `Preview rendered in headless browser (title: ${nav.title || '<untitled>'})`,
      metadata: { engine: 'playwright', renderedUrl: nav.url, title: nav.title },
    };

    // 2) Console / page-error assert.
    const consoleCheck = buildConsoleErrorCheck(previewUrl, consoleCollector);

    // 3) Screenshot evidence artifact.
    const { check: screenshotCheck, artifact: screenshotArtifact } = await captureScreenshotArtifact(
      taskId,
      previewUrl,
      page,
    );

    return {
      checks: [renderCheck, consoleCheck, screenshotCheck],
      artifacts: screenshotArtifact ? [screenshotArtifact] : [],
    };
  } catch (err) {
    // Launch / navigation failed under the real browser path. Fall back to fetch
    // (return null) rather than reporting a failure that the lighter probe may pass.
    const reason = err instanceof Error ? err.message : String(err);
    logger.info({ previewUrl, reason }, 'browser-tools page check unavailable — falling back to fetch probe');
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // best-effort cleanup; never let teardown surface as a failure.
      }
    }
  }
}

/**
 * Run the browser check for a completed workspace. Resolves the preview URL,
 * probes it, and assembles a typed verification result + summary artifact via the
 * `@recoder/browser-verification` contract package.
 *
 * Probe selection (degrade-safe, in order):
 *   1. If `playwright` + `@recoder/browser-tools` load AND a real Chromium page
 *      load succeeds, use the richer signal set: render assert + console/page-error
 *      capture + screenshot artifact.
 *   2. Otherwise fall back to the dependency-light Node-`fetch` reachability probe.
 *
 * Returns `attempted: false` when there is no preview URL or the contract package is
 * unavailable. Never throws; never blocks the awaiting_review transition.
 */
export async function runBrowserCheck(workspaceId: string): Promise<BrowserCheckOutcome> {
  try {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) return { attempted: false, result: null, artifact: null };

    const previewUrl = resolvePreviewUrl(workspace.metadata);
    if (!previewUrl) {
      logger.info({ workspaceId }, 'browser check skipped — no preview URL on workspace');
      return { attempted: false, result: null, artifact: null };
    }

    // Build the verification plan using the contract package, then probe.
    const plan = createBrowserVerificationPlan({
      taskId: workspace.taskId,
      previewUrl,
      checks: [{ tool: 'recoder.browser.open_preview', target: previewUrl, expected: 'healthy' }],
    });

    // Prefer a real headless-browser render when playwright + @recoder/browser-tools
    // are available; otherwise fall back to the fetch reachability probe. Both are
    // degrade-safe and never throw. The browser path flows the engine's richer
    // capability (render assert + console errors + screenshot artifact); the fetch
    // path is the dependency-light reachability signal.
    const browserOutcome = await probePreviewWithBrowser(previewUrl, workspace.taskId);
    const checks = browserOutcome?.checks ?? [await probePreview(previewUrl)];
    const probeArtifacts = browserOutcome?.artifacts ?? [];
    const result = summarizeBrowserVerification({ plan, checks, artifacts: probeArtifacts });
    const artifact = createBrowserVerificationSummaryArtifact({ result });

    logger.info(
      { workspaceId, previewUrl, status: result.status },
      'browser check completed for preview output',
    );
    return { attempted: true, result, artifact };
  } catch (err) {
    // Degrade-safe: contract package / fetch unavailable — never block the run.
    logger.warn({ workspaceId, err }, 'browser check unavailable — treating as skipped');
    return { attempted: false, result: null, artifact: null };
  }
}
