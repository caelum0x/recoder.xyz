/**
 * openfang-workflow — the in-process driver over openfang's NATIVE event-driven
 * agent-workflow subsystem (Wave: openfang-manifest-workflow fusion).
 *
 * openfang ships a real workflow engine compiled into the `.node`: a `Workflow`
 * is registered (`register_workflow`) and executed end-to-end (`run_workflow`),
 * driving agent turns / triggers / events INSIDE the kernel. Until now that
 * subsystem was only reachable as two raw napi ops (`registerWorkflow` /
 * `runWorkflow` in the openfang-napi adapter). This driver promotes it to a
 * first-class, degrade-safe control-plane capability the agent-workflows seam can
 * consume WITHOUT importing an engine internal:
 *
 *   - `register(workflowJson)` — register a native openfang `Workflow`, returns its id.
 *   - `run(workflowId, input)` — execute a registered workflow, returns `{ runId, output }`.
 *   - `registerAndRun(workflowJson, input)` — the common one-shot: register then run.
 *
 * DEGRADE-SAFE LAW (same as launchOpenfangRun): engine absent / kernel boot failed
 * ⇒ a truthful `{ available:false, reason }` — no throw across the seam, never a
 * fabricated run. A value-level engine error ⇒ `{ available:true, ok:false, error }`;
 * a napi throw is folded into the same shape. Callers can always trust the result
 * union, so an unbuilt addon never blocks a control-plane flow.
 *
 * `register_workflow`/`run_workflow` are genuine napi `async fn`s (same fix as
 * `runAgent` in openfang-runtime.ts, 2026-10-24) — a `run_workflow` that drives
 * several agent turns in sequence runs on the addon's own worker pool and does
 * NOT hold the Node event loop for its duration. `register`/`run`/`registerAndRun`
 * below are therefore `async` and must be awaited by callers.
 */
import { createLogger } from '../../shared/logger.js';
import { getOpenfangEngine, type OpenfangEngineInstance } from './openfang-native.js';

const logger = createLogger('conductor:openfang-workflow');

/** Injectable seams (tests). Production callers pass nothing. */
export interface OpenfangWorkflowDeps {
  /** Engine resolver — defaults to the degrade-safe getOpenfangEngine(). */
  engine?: () => OpenfangEngineInstance | undefined;
}

/** Result of registering a native openfang workflow. */
export type OpenfangWorkflowRegisterResult =
  | { available: false; reason: string }
  | { available: true; ok: true; workflowId: string }
  | { available: true; ok: false; error: string };

/** Result of running a registered native openfang workflow. */
export type OpenfangWorkflowRunResult =
  | { available: false; reason: string }
  | { available: true; ok: true; runId: string; output: string }
  | { available: true; ok: false; error: string };

/**
 * The native-workflow driver surface. A degrade-safe facade over openfang's
 * `register_workflow` / `run_workflow` napi exports.
 */
export interface OpenfangWorkflowDriver {
  /** Truthful engine readiness (never throws; a boot failure ⇒ false). */
  available(): boolean;
  /** Register a native openfang `Workflow` (JSON). Degrade-safe result union. */
  register(workflowJson: string): Promise<OpenfangWorkflowRegisterResult>;
  /** Run a registered workflow end-to-end. Degrade-safe result union. */
  run(workflowId: string, input: string): Promise<OpenfangWorkflowRunResult>;
  /** One-shot: register then run. Register failure short-circuits (no run attempt). */
  registerAndRun(workflowJson: string, input: string): Promise<OpenfangWorkflowRunResult>;
}

const ENGINE_ABSENT =
  'openfang native engine unavailable — addon not built or kernel boot failed. ' +
  'Build with: cd backend/engines/rust/openfang && cargo build -p openfang-napi --release';

/** Parse an engine JSON reply; a parse failure becomes a truthful error value. */
function parseEngineJson(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { ok: false, error: `engine returned non-object JSON: ${raw.slice(0, 200)}` };
  } catch {
    return { ok: false, error: `engine returned invalid JSON: ${raw.slice(0, 200)}` };
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the native openfang workflow driver. Fully degrade-safe: nothing boots
 * here — the engine is resolved lazily on the first `register`/`run` call.
 */
export function createOpenfangWorkflowDriver(
  deps: OpenfangWorkflowDeps = {},
): OpenfangWorkflowDriver {
  const resolveEngine = deps.engine ?? getOpenfangEngine;

  async function register(workflowJson: string): Promise<OpenfangWorkflowRegisterResult> {
    const engine = resolveEngine();
    if (!engine) return { available: false, reason: ENGINE_ABSENT };
    if (typeof engine.registerWorkflow !== 'function') {
      return { available: true, ok: false, error: 'engine lacks registerWorkflow' };
    }
    try {
      const parsed = parseEngineJson(await engine.registerWorkflow(workflowJson));
      if (parsed.ok === true && typeof parsed.workflow_id === 'string') {
        return { available: true, ok: true, workflowId: parsed.workflow_id };
      }
      const error = typeof parsed.error === 'string' ? parsed.error : 'registerWorkflow failed';
      return { available: true, ok: false, error };
    } catch (err) {
      return { available: true, ok: false, error: `registerWorkflow threw: ${message(err)}` };
    }
  }

  async function run(workflowId: string, input: string): Promise<OpenfangWorkflowRunResult> {
    const engine = resolveEngine();
    if (!engine) return { available: false, reason: ENGINE_ABSENT };
    if (typeof engine.runWorkflow !== 'function') {
      return { available: true, ok: false, error: 'engine lacks runWorkflow' };
    }
    try {
      const parsed = parseEngineJson(await engine.runWorkflow(workflowId, input));
      if (parsed.ok === true && typeof parsed.run_id === 'string') {
        const output = typeof parsed.output === 'string' ? parsed.output : '';
        return { available: true, ok: true, runId: parsed.run_id, output };
      }
      const error = typeof parsed.error === 'string' ? parsed.error : 'runWorkflow failed';
      return { available: true, ok: false, error };
    } catch (err) {
      return { available: true, ok: false, error: `runWorkflow threw: ${message(err)}` };
    }
  }

  return {
    available(): boolean {
      try {
        return resolveEngine() !== undefined;
      } catch (err) {
        logger.warn({ err }, 'openfang engine probe threw — reporting unavailable');
        return false;
      }
    },

    register,
    run,

    async registerAndRun(workflowJson: string, input: string): Promise<OpenfangWorkflowRunResult> {
      const registered = await register(workflowJson);
      if (registered.available === false) return registered;
      if (registered.ok === false) return { available: true, ok: false, error: registered.error };
      return run(registered.workflowId, input);
    },
  };
}
