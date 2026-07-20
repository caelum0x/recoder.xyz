/**
 * native-workflow — the CONSUMER-owned seam that gives a stored workflow a
 * `tool` node backed by openfang's NATIVE event-driven workflow subsystem
 * (register_workflow / run_workflow inside the kernel `.node`).
 *
 * `WorkflowEnginePort` is declared HERE (the consumer) so this package never
 * imports the backend engines domain: the backend `createOpenfangWorkflowDriver`
 * satisfies it structurally, adapted + injected at the composition root. This is
 * that driver's FIRST real product consumer — a `workflow.run` step can now
 * dispatch a native openfang workflow through the frozen `AgentOsWorkflowRunner`
 * (via its existing `executeTool` port) instead of the subsystem staying dormant.
 *
 * TRUTHFUL DEGRADE LAW (never fakes, never wrongly blocks):
 *  - engine absent / kernel boot failed (`available:false`) → the node is a
 *    truthful `skipped` with the real reason (an unbuilt native addon must not
 *    hard-fail an otherwise-good workflow — mirrors the browser-check handler);
 *  - a value-level engine error (`ok:false`) → the node is `failed` (a real run
 *    failure IS a workflow failure);
 *  - success → `completed`, carrying the native `runId` + `output`.
 * A `tool` node that is NOT marked as a native openfang workflow (no `workflow`
 * config) is a truthful `failed` — this handler owns only native-workflow tool
 * nodes and never fabricates a result for an unrelated tool.
 */
import type { WorkflowNode } from './workflow-definition';
import type {
  WorkflowExecutionContext,
  WorkflowNodeHandlerResult,
} from './workflow-runner';

/**
 * The degrade-safe result union of one native openfang workflow dispatch — the
 * SAME shape the backend `OpenfangWorkflowDriver.registerAndRun` returns, mirrored
 * here so this package stays free of a backend dependency.
 */
export type NativeWorkflowRunResult =
  | { available: false; reason: string }
  | { available: true; ok: true; runId: string; output: string }
  | { available: true; ok: false; error: string };

/**
 * The narrow native-workflow engine slice this package consumes. The backend
 * `createOpenfangWorkflowDriver()` (adapted async at the composition root)
 * satisfies it; degrade law lives in the driver, so this port never throws.
 */
export interface WorkflowEnginePort {
  /**
   * Register a native openfang `Workflow` (JSON) then run it end-to-end with
   * `input`. Register failure short-circuits (no run). Returns the degrade-safe
   * union — never throws.
   */
  registerAndRun(
    workflowJson: string,
    input: string,
  ): Promise<NativeWorkflowRunResult> | NativeWorkflowRunResult;
}

/** The runner port signature: `(node, context) => Promise<WorkflowNodeHandlerResult>`. */
export type NativeWorkflowHandler = (
  node: WorkflowNode,
  context: WorkflowExecutionContext,
) => Promise<WorkflowNodeHandlerResult>;

/** Read a trimmed non-empty string field, or undefined. */
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * A `tool` node is a native openfang workflow when its config carries a
 * `workflow` (or `workflowJson`) JSON string. The optional `input` JSON string
 * defaults to `{}`.
 */
function parseNativeWorkflow(
  config: Record<string, unknown>,
): { workflowJson: string; input: string } | null {
  const workflowJson = optionalString(config.workflow) ?? optionalString(config.workflowJson);
  if (!workflowJson) return null;
  const input = optionalString(config.input) ?? '{}';
  return { workflowJson, input };
}

/**
 * Build the native-openfang-workflow `executeTool` handler. Pure over its port —
 * the composition root wires ONE per process and the runner calls it for every
 * `tool` node. A `tool` node without a native-workflow config is a truthful
 * `failed` (this handler owns only native-workflow tool nodes).
 */
export function createNativeWorkflowHandler(engine: WorkflowEnginePort): NativeWorkflowHandler {
  return async (node) => {
    const parsed = parseNativeWorkflow(node.config);
    if (!parsed) {
      return {
        status: 'failed',
        error:
          `tool node ${node.nodeId} is not a native openfang workflow ` +
          '(no `workflow` config) and no other tool handler is configured',
      };
    }

    const result = await engine.registerAndRun(parsed.workflowJson, parsed.input);

    if (!result.available) {
      // Unbuilt native addon / kernel boot failure — truthful, non-blocking skip.
      return {
        status: 'skipped',
        output: { engine: 'openfang', reason: result.reason },
      };
    }
    if (!result.ok) {
      // A real run failure IS a workflow failure.
      return {
        status: 'failed',
        error: result.error,
        output: { engine: 'openfang', error: result.error },
      };
    }
    return {
      status: 'completed',
      output: { engine: 'openfang', runId: result.runId, output: result.output },
    };
  };
}
