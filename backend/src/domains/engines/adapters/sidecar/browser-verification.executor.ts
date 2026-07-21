/**
 * `executeBrowserVerification` — the verification executor behind the
 * `browser.verify` MCP tool (the GAP-AUDIT "verification executor consuming
 * `@recoder/browser-verification`" item). One verify run is:
 *
 *   navigate (open the page) → assert (expected text present in the extracted
 *   page text) → evidence (a screenshot artifact + a verification-summary
 *   artifact), summarized through the `@recoder/browser-verification` contracts.
 *
 * The page is driven through the injected `EngineClientPort` (the browser-use
 * sidecar adapter), so the run reaches the SUPERVISED sidecar's live HTTP
 * surface (`/navigate`, `/extract`, `/screenshot`) when it is up.
 *
 * TRUTHFUL DEGRADE LAW: the executor NEVER fabricates a verdict.
 *  - engine down (`unavailable` / `disabled`) → every check is `skipped` with
 *    the real reason and the run reports `degraded: true` — never a fake pass.
 *  - an operational navigation/extract failure → the affected checks `failed`
 *    with the real reason (the page was reachable-in-principle but broke).
 *  - a missing screenshot never flips a passing verification: evidence capture
 *    is reported `skipped` truthfully (the assertions carry the verdict).
 */
import {
  createBrowserVerificationPlan,
  createBrowserVerificationSummaryArtifact,
  summarizeBrowserVerification,
  type BrowserVerificationArtifact,
  type BrowserVerificationCheckResult,
  type BrowserVerificationPlan,
  type BrowserVerificationResult,
} from '@recoder/browser-verification';
import type { ExtractResult, NavigateResult, ScreenshotResult } from '@recoder/agent-browser';
import type { EngineClientPort } from '../../ports/engine-client.port.js';

/** One text assertion: `expected` must appear in the page's extracted text. */
export interface BrowserVerifyAssertion {
  readonly expected: string;
  /** Optional human label for what the assertion targets (e.g. a selector hint). */
  readonly target?: string;
}

export interface BrowserVerifyRequest {
  /** The page to verify. */
  readonly url: string;
  /** Task the evidence artifacts belong to (defaults to `adhoc`). */
  readonly taskId?: string;
  /** Text assertions evaluated against the page's extracted visible text. */
  readonly assertions?: readonly BrowserVerifyAssertion[];
  /** Capture an evidence screenshot artifact (default true). */
  readonly screenshot?: boolean;
  /**
   * Per-op browser deadline (ms), threaded into every `client.invoke`. Absent ⇒
   * the adapter's unbounded legacy behavior. A breach surfaces as a `timeout`
   * invoke code, which the executor treats as a degraded skip (a hung page
   * proved nothing) — never a fabricated pass/fail.
   */
  readonly timeoutMs?: number;
}

/** The verification result plus the truthful degrade posture of the run. */
export interface BrowserVerificationRun {
  readonly result: BrowserVerificationResult;
  /** True when the browser engine was unavailable — the run proved NOTHING. */
  readonly degraded: boolean;
  /** The engine's real failure reason when navigation could not complete. */
  readonly reason?: string;
}

const DEFAULT_TASK_ID = 'adhoc';
const ACTUAL_EXCERPT_CHARS = 200;

/**
 * "Proved nothing" invoke codes: the run is a truthful skip, not a pass/fail
 * verdict. Engine down (`unavailable`/`disabled`) and a bounded-deadline breach
 * (`timeout` — a hung page proved nothing about correctness) share this posture.
 */
function isEngineDown(code: string | undefined): boolean {
  return code === 'unavailable' || code === 'disabled' || code === 'timeout';
}

export async function executeBrowserVerification(
  client: EngineClientPort,
  request: BrowserVerifyRequest,
): Promise<BrowserVerificationRun> {
  const taskId = request.taskId ?? DEFAULT_TASK_ID;
  const assertions = request.assertions ?? [];
  const wantScreenshot = request.screenshot !== false;
  const timeoutMs = request.timeoutMs;
  const plan = buildPlan(request.url, taskId, assertions, wantScreenshot);

  const nav = await client.invoke({
    op: 'navigate',
    input: { url: request.url },
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  if (!nav.ok) {
    return finalize(plan, degradedChecks(request.url, assertions, wantScreenshot, nav.reason, nav.code), [], {
      degraded: isEngineDown(nav.code),
      reason: nav.reason,
    });
  }

  const checks: BrowserVerificationCheckResult[] = [openedCheck(request.url, nav.value as Partial<NavigateResult>)];
  const artifacts: BrowserVerificationArtifact[] = [];
  let midRunDownReason: string | null = null;

  if (assertions.length > 0) {
    const asserted = await runAssertions(client, request.url, assertions, timeoutMs);
    checks.push(...asserted.checks);
    if (asserted.engineDownReason) midRunDownReason = asserted.engineDownReason;
  }
  if (wantScreenshot) {
    const evidence = await captureEvidence(client, request.url, taskId, plan.planId, timeoutMs);
    checks.push(evidence.check);
    if (evidence.artifact) artifacts.push(evidence.artifact);
  }
  return finalize(plan, checks, artifacts, {
    degraded: midRunDownReason !== null,
    ...(midRunDownReason ? { reason: midRunDownReason } : {}),
  });
}

function buildPlan(
  url: string,
  taskId: string,
  assertions: readonly BrowserVerifyAssertion[],
  wantScreenshot: boolean,
): BrowserVerificationPlan {
  return createBrowserVerificationPlan({
    taskId,
    previewUrl: url,
    checks: [
      { tool: 'recoder.browser.open_preview', target: url },
      ...assertions.map((assertion) => ({
        tool: 'recoder.browser.assert_text' as const,
        expected: assertion.expected,
        ...(assertion.target ? { target: assertion.target } : {}),
      })),
      ...(wantScreenshot ? [{ tool: 'recoder.browser.screenshot' as const, target: url }] : []),
    ],
  });
}

/** Navigation never ran to completion: every planned check is truthfully non-passed. */
function degradedChecks(
  url: string,
  assertions: readonly BrowserVerifyAssertion[],
  wantScreenshot: boolean,
  reason: string,
  code: string | undefined,
): BrowserVerificationCheckResult[] {
  const engineDown = isEngineDown(code);
  const openStatus = engineDown ? ('skipped' as const) : ('failed' as const);
  const openMessage = engineDown
    ? `browser engine unavailable — verification not run: ${reason}`
    : `navigation failed: ${reason}`;
  return [
    { tool: 'recoder.browser.open_preview', status: openStatus, target: url, message: openMessage },
    ...assertions.map(
      (assertion): BrowserVerificationCheckResult => ({
        tool: 'recoder.browser.assert_text',
        status: 'skipped',
        expected: assertion.expected,
        ...(assertion.target ? { target: assertion.target } : {}),
        message: `not evaluated — page never opened: ${reason}`,
      }),
    ),
    ...(wantScreenshot
      ? [
          {
            tool: 'recoder.browser.screenshot' as const,
            status: 'skipped' as const,
            target: url,
            message: `no evidence captured — page never opened: ${reason}`,
          },
        ]
      : []),
  ];
}

function openedCheck(url: string, nav: Partial<NavigateResult>): BrowserVerificationCheckResult {
  const landed = nav.url ?? url;
  return {
    tool: 'recoder.browser.open_preview',
    status: 'passed',
    target: url,
    ...(nav.title || nav.url ? { actual: [nav.title, nav.url].filter(Boolean).join(' — ') } : {}),
    message: `navigated to ${landed}`,
  };
}

async function runAssertions(
  client: EngineClientPort,
  url: string,
  assertions: readonly BrowserVerifyAssertion[],
  timeoutMs: number | undefined,
): Promise<{ checks: BrowserVerificationCheckResult[]; engineDownReason?: string }> {
  const extract = await client.invoke({
    op: 'extract',
    input: { url },
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  if (!extract.ok) {
    const engineDown = isEngineDown(extract.code);
    const status = engineDown ? ('skipped' as const) : ('failed' as const);
    return {
      checks: assertions.map((assertion) => ({
        tool: 'recoder.browser.assert_text' as const,
        status,
        expected: assertion.expected,
        ...(assertion.target ? { target: assertion.target } : {}),
        message: `text extraction ${engineDown ? 'unavailable' : 'failed'}: ${extract.reason}`,
      })),
      ...(engineDown ? { engineDownReason: extract.reason } : {}),
    };
  }
  const text = String((extract.value as Partial<ExtractResult>).text ?? '');
  const checks = assertions.map((assertion) => {
    const passed = text.includes(assertion.expected);
    return {
      tool: 'recoder.browser.assert_text' as const,
      status: passed ? ('passed' as const) : ('failed' as const),
      expected: assertion.expected,
      actual: excerpt(text, assertion.expected),
      ...(assertion.target ? { target: assertion.target } : {}),
      message: passed
        ? `page text contains ${JSON.stringify(assertion.expected)}`
        : `expected text ${JSON.stringify(assertion.expected)} not found on ${url}`,
    };
  });
  return { checks };
}

async function captureEvidence(
  client: EngineClientPort,
  url: string,
  taskId: string,
  planId: string,
  timeoutMs: number | undefined,
): Promise<{ check: BrowserVerificationCheckResult; artifact?: BrowserVerificationArtifact }> {
  const shot = await client.invoke({
    op: 'screenshot',
    input: { url },
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  const image = shot.ok ? (shot.value as Partial<ScreenshotResult>).imageBase64 : undefined;
  if (!image) {
    const reason = shot.ok ? 'driver returned no image' : shot.reason;
    return {
      check: {
        tool: 'recoder.browser.screenshot',
        status: 'skipped',
        target: url,
        message: `no evidence screenshot: ${reason}`,
      },
    };
  }
  const artifact: BrowserVerificationArtifact = {
    artifactId: `browser_shot_${planId}`,
    taskId,
    kind: 'screenshot',
    summary: `Evidence screenshot of ${url} (base64 PNG, ${image.length} chars)`,
    createdAt: new Date().toISOString(),
    metadata: { url, imageBase64: image },
  };
  return {
    check: {
      tool: 'recoder.browser.screenshot',
      status: 'passed',
      target: url,
      message: 'evidence screenshot captured',
      artifactIds: [artifact.artifactId],
    },
    artifact,
  };
}

/** A bounded slice of the page text around the expected string (or its head). */
function excerpt(text: string, expected: string): string {
  const index = text.indexOf(expected);
  if (index < 0) return text.slice(0, ACTUAL_EXCERPT_CHARS);
  const start = Math.max(0, index - 40);
  return text.slice(start, start + ACTUAL_EXCERPT_CHARS);
}

function finalize(
  plan: BrowserVerificationPlan,
  checks: BrowserVerificationCheckResult[],
  artifacts: BrowserVerificationArtifact[],
  degrade: { degraded: boolean; reason?: string },
): BrowserVerificationRun {
  const interim = summarizeBrowserVerification({ plan, checks, artifacts });
  // A degraded run never claims a pass it did not prove: a real `failed` stands,
  // but a would-be `passed` with unavailable-engine gaps is a truthful `skipped`.
  const status = degrade.degraded && interim.status === 'passed' ? ('skipped' as const) : interim.status;
  const adjusted: BrowserVerificationResult = { ...interim, status };
  const summaryArtifact = createBrowserVerificationSummaryArtifact({
    result: adjusted,
    ...(degrade.degraded && degrade.reason ? { metadata: { degraded: true, reason: degrade.reason } } : {}),
  });
  return {
    result: { ...adjusted, artifacts: [...adjusted.artifacts, summaryArtifact] },
    degraded: degrade.degraded,
    ...(degrade.reason ? { reason: degrade.reason } : {}),
  };
}
