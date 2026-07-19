/**
 * `createBrowserCheckWorkflowHandler` — the FUSION that turns a `browser-check`
 * workflow node into a LIVE browser verification step. It is the concrete
 * `runBrowserCheck` port the {@link import('./agent-os-workflow-runner.driver.js').AgentOsWorkflowRunnerDriver}
 * injects into the frozen `@recoder/agent-workflows` runner, so a stored
 * definition's `browser-check` node actually FIRES the browser-use engine in
 * production instead of throwing "no handler".
 *
 * One node carries a `browserChecks[]` config; each entry runs the OWNED
 * `executeBrowserVerification` executor (navigate → assert expected text →
 * evidence screenshot → verification-summary artifact) through the injected
 * browser-use `EngineClientPort`. An optional `researchTask` runs the sidecar's
 * autonomous `.ext().run_task` loop (`browser_use.Agent`) as a control-plane
 * research/verification step — so autonomous browsing is a real product
 * capability, not a dormant deep-op.
 *
 * TRUTHFUL DEGRADE LAW (never fakes, never blocks the run):
 *  - no engine wired / engine down → the node is a truthful `skipped` with the
 *    real reason; browsing is evidence-gathering, so a missing engine never
 *    hard-fails the workflow.
 *  - a real assertion / navigation failure (engine reachable, page broke) →
 *    the node is `failed` (the verify gate did its job).
 *  - every screenshot + summary artifact the executor captures is attached to
 *    the run as an agent-os `Artifact`, so downstream approval/PR steps see the
 *    evidence.
 */
import type {
  WorkflowNode,
  WorkflowExecutionContext,
  WorkflowNodeHandlerResult,
  WorkflowNodeStatus,
} from '@recoder/agent-workflows';
import type { Artifact } from '@recoder/agent-os';
import type { BrowserVerificationArtifact } from '@recoder/browser-verification';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { BrowserExtPort } from '../../engines/adapters/sidecar/browser-ext.client.js';
import {
  executeBrowserVerification,
  type BrowserVerificationRun,
  type BrowserVerifyAssertion,
} from '../../engines/adapters/sidecar/browser-verification.executor.js';

/** One live browser check parsed from a `browser-check` node's config. */
interface ParsedBrowserCheck {
  readonly url: string;
  readonly taskId?: string;
  readonly assertions: BrowserVerifyAssertion[];
  readonly screenshot: boolean;
}

/** The optional autonomous research/verification step (sidecar `.ext().run_task`). */
interface ParsedResearchTask {
  readonly task: string;
  readonly maxSteps?: number;
}

export interface BrowserCheckWorkflowHandlerDeps {
  /**
   * The browser-use `EngineClientPort` (`engines.client('browser-use')`). Null ⇒
   * every browser check degrades to a truthful `skipped` (never a faked verdict).
   */
  readonly client: EngineClientPort | null;
  /**
   * The deep-op port for the autonomous `run_task` loop. Absent ⇒ derived from
   * `client.ext()` when the adapter exposes it; still absent ⇒ a `researchTask`
   * is a truthful `skipped` sub-step.
   */
  readonly ext?: BrowserExtPort | null;
  /** Injectable clock (defaults to wall-clock ISO) for artifact timestamps. */
  readonly now?: () => string;
}

/** The runner port signature: `(node, context) => Promise<WorkflowNodeHandlerResult>`. */
export type BrowserCheckWorkflowHandler = (
  node: WorkflowNode,
  context: WorkflowExecutionContext,
) => Promise<WorkflowNodeHandlerResult>;

const CREATED_BY = 'agent-os/browser-check';

/**
 * Build the `runBrowserCheck` handler. Pure over its deps — the driver wires one
 * per process and the runner calls it for each `browser-check` node.
 */
export function createBrowserCheckWorkflowHandler(
  deps: BrowserCheckWorkflowHandlerDeps,
): BrowserCheckWorkflowHandler {
  const now = deps.now ?? (() => new Date().toISOString());
  const ext = resolveExt(deps);

  return async (node, context) => {
    const checks = parseBrowserChecks(node.config);
    const research = parseResearchTask(node.config);
    const fallbackTaskId = context.task?.taskId ?? context.workflowRunId;

    if (checks.length === 0 && !research) {
      return {
        status: 'skipped',
        output: {
          reason: 'browser-check node has no browserChecks[] and no researchTask — nothing to verify.',
        },
      };
    }

    // Engine absent ⇒ the whole node is a truthful skip (never a faked pass).
    if (!deps.client) {
      return {
        status: 'skipped',
        output: {
          reason: 'browser-use engine not wired into agent-os — browser verification skipped.',
          browserChecks: checks.length,
          ...(research ? { researchTask: true } : {}),
        },
      };
    }

    const runs: Array<{ url: string; run: BrowserVerificationRun }> = [];
    const artifacts: Artifact[] = [];
    for (const check of checks) {
      const run = await executeBrowserVerification(deps.client, {
        url: check.url,
        taskId: check.taskId ?? fallbackTaskId,
        ...(check.assertions.length > 0 ? { assertions: check.assertions } : {}),
        screenshot: check.screenshot,
      });
      runs.push({ url: check.url, run });
      for (const artifact of run.result.artifacts) {
        artifacts.push(toAgentOsArtifact(artifact, check.taskId ?? fallbackTaskId, context.workflowRunId, now()));
      }
    }

    const researchResult = research ? await runResearch(ext, research) : null;

    return finalize({ node, runs, artifacts, researchResult });
  };
}

/** Resolve the deep-op port: explicit `ext` wins, else `client.ext()` when exposed. */
function resolveExt(deps: BrowserCheckWorkflowHandlerDeps): BrowserExtPort | null {
  if (deps.ext !== undefined) return deps.ext;
  const maybe = deps.client as { ext?: () => BrowserExtPort } | null;
  return maybe && typeof maybe.ext === 'function' ? maybe.ext() : null;
}

/** The autonomous browse step — truthful skip when no deep-op sidecar is wired. */
async function runResearch(
  ext: BrowserExtPort | null,
  research: ParsedResearchTask,
): Promise<{ status: 'completed' | 'skipped' | 'failed'; reason?: string; value?: unknown }> {
  if (!ext) {
    return { status: 'skipped', reason: 'browser-use deep-op sidecar (.ext().run_task) not wired.' };
  }
  const result = await ext.runTask({
    task: research.task,
    ...(research.maxSteps !== undefined ? { maxSteps: research.maxSteps } : {}),
  });
  if (result.ok) return { status: 'completed', value: result.value };
  // A degrade code (engine/sidecar down) is a truthful skip; a real error fails.
  const degraded = result.code === 'unavailable' || result.code === 'disabled';
  return { status: degraded ? 'skipped' : 'failed', reason: result.reason };
}

/**
 * Aggregate every check + the research sub-step into one node result:
 *  - any check whose verification `failed` (engine reachable, page/assert broke),
 *    or a research step that hard-`failed`, → the node is `failed`;
 *  - no real failure but every check was engine-down `skipped` → the node is
 *    `skipped` (nothing was proved — truthful, non-blocking);
 *  - otherwise → `completed`.
 * All captured evidence artifacts ride along regardless of the verdict.
 */
function finalize(input: {
  node: WorkflowNode;
  runs: Array<{ url: string; run: BrowserVerificationRun }>;
  artifacts: Artifact[];
  researchResult: { status: 'completed' | 'skipped' | 'failed'; reason?: string; value?: unknown } | null;
}): WorkflowNodeHandlerResult {
  const checkStatuses = input.runs.map(({ run }) => run.result.status);
  const anyFailed =
    checkStatuses.includes('failed') || input.researchResult?.status === 'failed';
  const anyPassed =
    checkStatuses.includes('passed') || input.researchResult?.status === 'completed';

  let status: WorkflowNodeStatus;
  if (anyFailed) status = 'failed';
  else if (!anyPassed && (input.runs.length > 0 || input.researchResult)) status = 'skipped';
  else status = 'completed';

  const output: Record<string, unknown> = {
    checks: input.runs.map(({ url, run }) => ({
      url,
      status: run.result.status,
      degraded: run.degraded,
      ...(run.reason ? { reason: run.reason } : {}),
      checks: run.result.checks.map((check) => ({
        tool: check.tool,
        status: check.status,
        message: check.message,
      })),
    })),
    evidenceArtifacts: input.artifacts.map((artifact) => artifact.artifactId),
  };
  if (input.researchResult) {
    output.research = {
      status: input.researchResult.status,
      ...(input.researchResult.reason ? { reason: input.researchResult.reason } : {}),
      ...(input.researchResult.value !== undefined ? { value: input.researchResult.value } : {}),
    };
  }
  const firstFailure = firstFailureReason(input);
  return {
    status,
    output,
    ...(input.artifacts.length > 0 ? { artifacts: input.artifacts } : {}),
    ...(status === 'failed' && firstFailure ? { error: firstFailure } : {}),
  };
}

/** The first real failure reason (for the node's `error`) — assertion or research. */
function firstFailureReason(input: {
  runs: Array<{ url: string; run: BrowserVerificationRun }>;
  researchResult: { status: string; reason?: string } | null;
}): string | undefined {
  for (const { url, run } of input.runs) {
    if (run.result.status !== 'failed') continue;
    const failedCheck = run.result.checks.find((check) => check.status === 'failed');
    return `browser-check failed on ${url}: ${failedCheck?.message ?? 'verification failed'}`;
  }
  if (input.researchResult?.status === 'failed') {
    return `browser-check research task failed: ${input.researchResult.reason ?? 'unknown error'}`;
  }
  return undefined;
}

/** Map a lean verification artifact onto the agent-os `Artifact` contract. */
function toAgentOsArtifact(
  artifact: BrowserVerificationArtifact,
  taskId: string,
  runId: string,
  createdAt: string,
): Artifact {
  const url = typeof artifact.metadata?.url === 'string' ? artifact.metadata.url : undefined;
  return {
    artifactId: artifact.artifactId,
    taskId: artifact.taskId ?? taskId,
    runId,
    kind: artifact.kind === 'verification_summary' ? 'verification' : 'screenshot',
    mimeType: artifact.kind === 'screenshot' ? 'image/png' : 'application/json',
    public: false,
    createdAt: artifact.createdAt ?? createdAt,
    createdBy: CREATED_BY,
    ...(artifact.pathOrUrl ? { path: artifact.pathOrUrl } : {}),
    metadata: { summary: artifact.summary, ...(artifact.metadata ?? {}) },
    ...(url ? { provenance: { sourceUrl: url } } : {}),
  };
}

/** Boundary-validate `config.browserChecks[]` — malformed entries are dropped truthfully. */
function parseBrowserChecks(config: Record<string, unknown>): ParsedBrowserCheck[] {
  const raw = config.browserChecks;
  if (!Array.isArray(raw)) return [];
  const parsed: ParsedBrowserCheck[] = [];
  for (const entry of raw) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const url = optionalString(record.url);
    if (!url) continue;
    parsed.push({
      url,
      ...(optionalString(record.taskId) ? { taskId: optionalString(record.taskId) } : {}),
      assertions: parseAssertions(record.assertions),
      screenshot: record.screenshot !== false,
    });
  }
  return parsed;
}

function parseAssertions(raw: unknown): BrowserVerifyAssertion[] {
  if (!Array.isArray(raw)) return [];
  const assertions: BrowserVerifyAssertion[] = [];
  for (const entry of raw) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const expected = optionalString(record.expected);
    if (!expected) continue;
    const target = optionalString(record.target);
    assertions.push({ expected, ...(target ? { target } : {}) });
  }
  return assertions;
}

function parseResearchTask(config: Record<string, unknown>): ParsedResearchTask | null {
  const raw = (config.researchTask ?? null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') return null;
  const task = optionalString(raw.task);
  if (!task) return null;
  const maxSteps =
    typeof raw.maxSteps === 'number' && Number.isFinite(raw.maxSteps) ? raw.maxSteps : undefined;
  return { task, ...(maxSteps !== undefined ? { maxSteps } : {}) };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
