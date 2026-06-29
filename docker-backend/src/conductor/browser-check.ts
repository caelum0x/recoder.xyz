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
 * Real headless-browser check (optional, lazy): `@recoder/browser-tools` now ships
 * a CJS-consumable `dist` (`dist/index.cjs` + an `exports` map) with `playwright` as
 * an OPTIONAL peer dependency. When a preview URL is present AND both `playwright`
 * and `@recoder/browser-tools` are resolvable+loadable at runtime, this module will
 * OPTIONALLY drive a real Chromium page load (lazy `import()`, never a top-level
 * import) to produce a stronger health signal (the preview actually renders a
 * document, not just answers a socket). If the browser driver is unavailable, the
 * launch fails, or no browser binary is installed, it transparently falls back to
 * the dependency-light Node-`fetch` reachability probe. The Playwright path is
 * NEVER required: the lazy import keeps the conductor's CJS `tsc` build free of the
 * heavy ESM/Playwright dependency, and the contract package
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
 * The minimal shape of `@recoder/browser-tools` + `playwright` that the optional
 * real-page check needs. Kept local + structural so we never take a top-level type
 * dependency on either optional package.
 */
interface LazyBrowserDriver {
  chromium: {
    launch(opts?: { headless?: boolean }): Promise<{
      newPage(): Promise<unknown>;
      close(): Promise<void>;
    }>;
  };
  navigateTo: (
    url: string,
    options: { page: unknown },
  ) => Promise<{ url: string; title: string }>;
}

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

/**
 * Drive a real headless Chromium page load of the preview via `@recoder/browser-tools`
 * (lazy). Returns a typed check result when the page renders, or `null` when the
 * driver is unavailable / the launch fails — in which case the caller falls back to
 * the fetch probe. Never throws. Always closes the browser it opened.
 */
async function probePreviewWithBrowser(
  previewUrl: string,
): Promise<BrowserVerificationCheckResult | null> {
  const driver = await loadBrowserDriver();
  if (!driver) return null;

  let browser: { newPage(): Promise<unknown>; close(): Promise<void> } | undefined;
  try {
    browser = await Promise.race([
      driver.chromium.launch({ headless: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('browser launch timed out')), BROWSER_NAV_TIMEOUT_MS),
      ),
    ]);
    const page = await browser.newPage();
    const nav = await driver.navigateTo(previewUrl, { page });
    return {
      tool: 'recoder.browser.open_preview',
      status: 'passed',
      target: previewUrl,
      expected: 'rendered document',
      actual: nav.title || nav.url || 'rendered',
      message: `Preview rendered in headless browser (title: ${nav.title || '<untitled>'})`,
      metadata: { engine: 'playwright', renderedUrl: nav.url, title: nav.title },
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
 *      load succeeds, use that stronger "preview actually renders" signal.
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
    // degrade-safe and never throw.
    const browserCheck = await probePreviewWithBrowser(previewUrl);
    const check = browserCheck ?? (await probePreview(previewUrl));
    const result = summarizeBrowserVerification({ plan, checks: [check] });
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
