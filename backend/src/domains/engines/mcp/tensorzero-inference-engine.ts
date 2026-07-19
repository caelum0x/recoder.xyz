/**
 * `recoder.tensorzero` — the MCP skin over the DEEP inference capabilities the
 * TensorZero embedded gateway (`tensorzero-gateway-napi.node`) gained on top of
 * the single `inference`/`inferenceStream` calls:
 *
 *  - `tensorzero.model_catalog`   → introspect the model/function catalog the
 *    embedded gateway would route (env registry → generated config); needs no
 *    gateway boot, so it stays truthful even when the `.node` is absent.
 *  - `tensorzero.batch_inference` → run many inferences over the EXISTING single
 *    `inference` napi with bounded concurrency, aggregating per-item outcomes.
 *
 * These are DISTINCT, genuinely-new capabilities: single `tensorzero.inference` /
 * `tensorzero.feedback` / `tensorzero.config_validate` / `tensorzero.version`
 * already exist under the `tensorzero` serverId (the napi-engines path). This
 * `recoder.tensorzero` server adds the two NEW deep ops WITHOUT re-advertising the
 * existing ones (no duplicate capability claim). The `@tensorzero` package ships
 * no engine descriptor for these ops, so this backend module defines the server
 * descriptor locally and registers the handlers directly on the shared router
 * over the injected {@link TensorzeroInferencePort} (`TensorzeroNapiAdapter.inference()`).
 *
 * IDENTITY: these tools are NOT tenant-subject-bearing — they operate on a
 * caller-supplied inference body / registry config, never on tenant-partitioned
 * state, so there is no cross-tenant subject to bind (the closed cross-tenant
 * class stays closed: no tenant-keyed data path is introduced here). For the one
 * side-effecting op (`batch_inference` calls model providers) the host-authorized
 * caller IS threaded into the result metadata as `requestedBy` for a truthful
 * audit trail. Every call still traverses interop's `authorize → risk → execute →
 * audit` gate at the host boundary.
 *
 * Truthful degrade: an unbound port (adapter absent) or a `{ ok:false }` from the
 * adapter (no `.node`, unbooted gateway, bad input) throws the real reason — the
 * interop host records it. Nothing is ever fabricated.
 */
import type { McpToolRouter, McpToolResult, McpToolCallInput } from '@recoder/agent-mcp';
import type { McpServerRegistration } from '@recoder/interop';
import type { InvokeResult } from '../types.js';
import type {
  TensorzeroInferencePort,
  TensorzeroInferenceRequest,
} from '../adapters/napi/tensorzero-napi.adapter.js';

/** The in-proc server id for the deep TensorZero inference tools. */
export const TENSORZERO_SERVER_ID = 'recoder.tensorzero';

/**
 * The server descriptor for the gated registry catalog. The serial integrator
 * adds this to `IN_PROC_SERVERS` (registration) + `ENGINE_SERVERS` (owned
 * handlers) so the wiring guard passes and the tools are agent-visible + callable.
 */
export const tensorzeroInferenceMcpServer: McpServerRegistration = {
  serverId: TENSORZERO_SERVER_ID,
  kind: 'custom',
  displayName: 'Recoder TensorZero (catalog/batch)',
  transport: 'http',
  enabled: true,
  toolNames: ['tensorzero.model_catalog', 'tensorzero.batch_inference'],
  metadata: { engine: 'tensorzero' },
};

/**
 * Register the three deep-inference handlers on the shared router over the
 * injected {@link TensorzeroInferencePort}. An absent port (adapter not bound in
 * the composer) still registers handlers that throw a truthful "not bound" — so
 * the tools never 404 and the wiring guard passes; they just report
 * unavailability on call.
 */
export function registerTensorzeroInferenceMcpTools(
  router: McpToolRouter,
  port: TensorzeroInferencePort | null,
): void {
  router.register(tensorzeroInferenceMcpServer, 'tensorzero.model_catalog', async () => {
    const engine = requirePort(port);
    return unwrap(await engine.modelCatalog(), 'tensorzero.model_catalog');
  });

  router.register(tensorzeroInferenceMcpServer, 'tensorzero.batch_inference', async (input) => {
    const engine = requirePort(port);
    const args = input.args ?? {};
    const requests = parseRequests(args.requests);
    const concurrency = optionalNumber(args.concurrency);
    const stopOnError = args.stopOnError === true || args.stop_on_error === true;
    return unwrap(
      await engine.batchInference({
        requests,
        ...(concurrency != null ? { concurrency } : {}),
        ...(stopOnError ? { stopOnError: true } : {}),
      }),
      'tensorzero.batch_inference',
      { requestedBy: requestedBy(input) },
    );
  });
}

/**
 * The `EngineToolBinder` factory the composer passes into
 * `InteropHostBundle({ engineBinders })`. Pass `adapter.inference()` (or null
 * when the tensorzero adapter is not bound).
 */
export function tensorzeroInferenceEngineBinder(
  port: TensorzeroInferencePort | null,
): (router: McpToolRouter) => void {
  return (router) => registerTensorzeroInferenceMcpTools(router, port);
}

/** Map an `InvokeResult` onto the MCP result envelope; a failure throws the reason. */
function unwrap(
  result: InvokeResult<unknown>,
  tool: string,
  extraMeta: Record<string, unknown> = {},
): McpToolResult {
  if (!result.ok) {
    throw new Error(`${tool} failed: ${result.reason}`);
  }
  return {
    content: result.value,
    metadata: { engine: 'tensorzero', tool, ...pruneUndefined(extraMeta) },
  };
}

/**
 * Boundary-validate + normalize the `requests` array for `tensorzero.batch_inference`.
 * Each entry must be a JSON object (a `POST /inference` body). A malformed entry
 * throws with the exact problem — never silently dropped.
 */
function parseRequests(value: unknown): TensorzeroInferenceRequest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('tensorzero.batch_inference requires a non-empty args.requests array of inference bodies');
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`tensorzero.batch_inference args.requests[${index}] must be a JSON object (an inference body)`);
    }
    return entry as TensorzeroInferenceRequest;
  });
}

/**
 * The host-authorized actor for audit attribution. Prefers the edge-bound
 * authenticated principal (`input.caller.userId`) over the caller-controlled
 * `actor.agentId`; returns `'internal'` for a trusted non-edge in-proc call.
 */
function requestedBy(input: McpToolCallInput): string {
  const edge = input as McpToolCallInput & { caller?: { userId?: string } };
  const principal = typeof edge.caller?.userId === 'string' ? edge.caller.userId.trim() : '';
  if (principal) return principal;
  const agentId = typeof input.actor?.agentId === 'string' ? input.actor.agentId.trim() : '';
  return agentId || 'internal';
}

function requirePort(port: TensorzeroInferencePort | null): TensorzeroInferencePort {
  if (!port) {
    throw new Error('tensorzero engine not bound in the engines composer — deep inference tools unavailable');
  }
  return port;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined));
}
