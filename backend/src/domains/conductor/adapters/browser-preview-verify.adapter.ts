/**
 * `createBrowserPreviewVerifier` — the concrete {@link PreviewVerifyPort} that
 * FIRES the OWNED `executeBrowserVerification` executor against a workspace's
 * preview URL through the engines domain's browser-use `EngineClientPort`
 * (`engines.client('browser-use')`). This is the fusion that turns the stored
 * `metadata.previewUrl` into a live navigate → assert → screenshot verification.
 *
 * It depends ONLY on the FROZEN `EngineClientPort` seam (never on the browser-use
 * `dist/`), exactly like {@link import('./code-intel.adapter.js')} depends on the
 * recodergit client. The executor drives the sidecar's `/navigate` `/extract`
 * `/screenshot` surface when it is up.
 *
 * TRUTHFUL DEGRADE LAW: a null client (browser-use not wired) ⇒ a `skipped`
 * outcome with `degraded:true` and the real reason — browsing proved nothing, so
 * a missing Chrome/sidecar is a truthful skip, NEVER a faked pass and NEVER a
 * blocked flow. When the client is present the executor itself enforces the same
 * law (engine-down mid-run ⇒ `skipped` degrade; a real page break ⇒ `failed`).
 */
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { BrowserVerificationRun } from '../../engines/adapters/sidecar/browser-verification.executor.js';
import type { BrowserVerifyRunner } from '../ports/browser-verify.port.js';
import type {
  PreviewEvidenceArtifact,
  PreviewVerification,
  PreviewVerifyCheck,
  PreviewVerifyPort,
  PreviewVerifyRequest,
} from '../ports/preview-verify.port.js';

const NO_ENGINE_REASON =
  'browser-use engine not wired into conductor — preview verification skipped';

/**
 * The bounded per-run browser deadline (ms) applied when the caller passes no
 * `timeoutMs`. This is the hung-page guard: a preview URL that points at a slow
 * or wedged dev server can never stall the fire-and-forget auto-verify (nor the
 * completion hook downstream of it) — the executor's `timeout` invoke code
 * resolves the run to a truthful `skipped(degraded)` within this window.
 */
export const DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS = 15_000;

/**
 * Build the preview verifier over a browser-use client + the injected
 * `BrowserVerifyRunner` (the engines `executeBrowserVerification`, bound at the
 * composition root). Pure over its deps — the composer wires one per process. A
 * null client (or an absent runner) yields the truthful-skip verifier; the
 * conductor holds no cross-domain value edge into the engines executor.
 */
export function createBrowserPreviewVerifier(
  client: EngineClientPort | null,
  runBrowserVerify?: BrowserVerifyRunner,
): PreviewVerifyPort {
  return {
    async verify(request: PreviewVerifyRequest): Promise<PreviewVerification> {
      if (!client || !runBrowserVerify) return skipped(NO_ENGINE_REASON);
      const run = await runBrowserVerify(client, {
        url: request.url,
        ...(request.taskId ? { taskId: request.taskId } : {}),
        ...(request.assertions && request.assertions.length > 0
          ? { assertions: request.assertions }
          : {}),
        ...(request.screenshot !== undefined ? { screenshot: request.screenshot } : {}),
        // Bounded deadline on EVERY navigate/extract/screenshot invoke — the
        // caller's override, else the adapter's default. A breach is a `timeout`
        // invoke code the executor classifies as a degraded skip (never a hang).
        timeoutMs: request.timeoutMs ?? DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS,
      });
      return mapRun(run);
    },
  };
}

/** A truthful no-run outcome (no engine wired) — nothing was proved. */
function skipped(reason: string): PreviewVerification {
  return {
    status: 'skipped',
    degraded: true,
    reason,
    summary: `Browser verification skipped — ${reason}`,
    checks: [],
    artifacts: [],
  };
}

/** Map the executor's `BrowserVerificationRun` onto the lean conductor outcome. */
function mapRun(run: BrowserVerificationRun): PreviewVerification {
  const checks: PreviewVerifyCheck[] = run.result.checks.map((check) => ({
    tool: check.tool,
    status: check.status,
    ...(check.message ? { message: check.message } : {}),
  }));
  const artifacts: PreviewEvidenceArtifact[] = run.result.artifacts
    .filter(
      (artifact): artifact is typeof artifact & { kind: 'screenshot' | 'verification_summary' } =>
        artifact.kind === 'screenshot' || artifact.kind === 'verification_summary',
    )
    .map((artifact) => ({
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      summary: artifact.summary,
      ...(artifact.metadata ? { metadata: artifact.metadata } : {}),
    }));
  const summaryArtifact = run.result.artifacts.find(
    (artifact) => artifact.kind === 'verification_summary',
  );
  return {
    status: run.result.status,
    degraded: run.degraded,
    ...(run.reason ? { reason: run.reason } : {}),
    summary: summaryArtifact?.summary ?? `Browser verification ${run.result.status}`,
    checks,
    artifacts,
  };
}
