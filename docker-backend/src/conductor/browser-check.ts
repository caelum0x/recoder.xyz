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
 * Why not drive a real headless browser here? `@recoder/recoder-browser-tools`
 * (the Playwright-backed driver) is a source-only ESM package with no built `dist`
 * and a `playwright` peer dependency. Importing it into the conductor's CJS `tsc`
 * build would mix module systems and destabilize the build, so it is intentionally
 * NOT imported. The contract package (`@recoder/browser-verification`) ships a
 * proper built dist and is the safe in-process fusion; the reachability probe is a
 * truthful, dependency-light health signal that the preview output is actually
 * serving. A future Playwright-driven node can replace the probe once
 * recoder-browser-tools publishes a CJS-consumable build.
 *
 * Additive + degrade-safe: this NEVER throws. Any failure (no URL, fetch error,
 * package unavailable) is surfaced as a check status, never as a crash, and never
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

/**
 * Run the browser check for a completed workspace. Resolves the preview URL,
 * probes it, and assembles a typed verification result + summary artifact via the
 * `@recoder/browser-verification` contract package. Degrade-safe: returns
 * `attempted: false` when there is no preview URL or the package is unavailable.
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

    const check = await probePreview(previewUrl);
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
