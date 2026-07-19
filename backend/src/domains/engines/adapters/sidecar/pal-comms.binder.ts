/**
 * MCP binder for `recoder.pal-comms` — PAL's agentic-communications capability
 * exposed as agent-callable MCP tools over the REAL external Python pal server's
 * new `agentcomms` tool (multi-model orchestration + conversation threading).
 *
 * Four tools, all delegating to the single deep pal `agentcomms` primitive via the
 * supervised stdio server (`PalMcpAdapter.invoke({ op: 'agentcomms', … })`):
 *
 *  - `pal.route`     → route a prompt to one model (explicit `model`, else the
 *                      first available). The routing primitive.
 *  - `pal.consensus` → query N models with the SAME prompt in parallel and return
 *                      every answer for synthesis.
 *  - `pal.debate`    → consensus with per-model stances (for/against/neutral) — a
 *                      structured adversarial cross-model debate.
 *  - `pal.models`    → list configured providers + available model names
 *                      (discovery for a routing decision). No model call.
 *
 * IDENTITY: these tools are NOT subject-bearing — they invoke shared model
 * providers and an opaque, TTL-bound PAL thread store; they neither read nor
 * mutate any tenant-scoped Recoder state. Like `recoder.browser` and
 * `recoder.pal-plan`, they therefore bind no {@link McpToolCaller} subject. The
 * cross-tenant provision/destroy class stays closed because nothing here touches
 * it. (If a future variant persists per-tenant threads, it MUST thread
 * `callerFromInput` and bind the subject — do not relax this.)
 *
 * TRUTHFUL DEGRADE: the pal venv absent / host transport unwired ⇒ the adapter's
 * `invoke` returns `{ ok:false, reason }`; the handler throws that real reason so
 * the interop host records the error — never a fabricated model answer. No model
 * providers configured ⇒ the pal tool returns a truthful
 * `{"status":"no_models_available"}` payload (surfaced as tool content, not an
 * error). Every call still traverses `authorize → risk → execute → audit`.
 */
import type { McpServerRegistration } from '@recoder/interop';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type { EngineClientPort } from '../../ports/engine-client.port.js';
import type { InvokeResult } from '../../types.js';

/** The pal tool the four MCP tools delegate to (the new engine-dir primitive). */
export const PAL_AGENTCOMMS_OP = 'agentcomms';

/** The local in-proc server registration for `recoder.pal-comms` (backend-owned). */
export const recoderPalCommsServer: McpServerRegistration = {
  serverId: 'recoder.pal-comms',
  // `custom` keeps this decoupled from the registry's built-in kind union while
  // still routing through the interop gate (mirrors `recoder.pal-plan`).
  kind: 'custom',
  displayName: 'Recoder PAL Communications',
  transport: 'http',
  enabled: true,
  toolNames: ['pal.route', 'pal.consensus', 'pal.debate', 'pal.models'],
  metadata: { engine: 'pal-mcp', capability: 'agentic-communications' },
};

/** A single model + optional debate stance for a consensus/debate call. */
export interface PalCommsModelSpec {
  readonly model: string;
  readonly stance?: 'for' | 'against' | 'neutral';
  readonly stancePrompt?: string;
}

/** Fields common to every model-calling pal-comms operation. */
interface PalCommsCommon {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly continuationId?: string;
  readonly createThread?: boolean;
}

export interface PalRouteRequest extends PalCommsCommon {
  /** Route to this model; omitted ⇒ the pal server uses the first available one. */
  readonly model?: string;
}

export interface PalConsensusRequest extends PalCommsCommon {
  /** Models to consult; omitted ⇒ every available model (neutral) for consensus. */
  readonly models?: readonly (string | PalCommsModelSpec)[];
}

/**
 * Build the snake_case `agentcomms` tool arg envelope the pal server expects from
 * a normalized camelCase request. Pure + shared by the adapter's typed methods
 * and the MCP handlers so both paths produce an identical payload.
 */
export function buildAgentCommsArgs(
  operation: 'route' | 'consensus' | 'debate' | 'models',
  request: PalRouteRequest | PalConsensusRequest | Record<string, never>,
): Record<string, unknown> {
  const args: Record<string, unknown> = { operation };
  if (operation === 'models') return args;

  const req = request as PalRouteRequest & PalConsensusRequest;
  args.prompt = req.prompt;
  if (typeof req.systemPrompt === 'string' && req.systemPrompt.trim()) {
    args.system_prompt = req.systemPrompt;
  }
  if (typeof req.temperature === 'number' && Number.isFinite(req.temperature)) {
    args.temperature = req.temperature;
  }
  if (typeof req.continuationId === 'string' && req.continuationId.trim()) {
    args.continuation_id = req.continuationId.trim();
  }
  if (req.createThread === true) args.create_thread = true;

  if (operation === 'route') {
    const model = (request as PalRouteRequest).model;
    if (typeof model === 'string' && model.trim()) {
      args.models = [{ model: model.trim() }];
    }
    return args;
  }

  // consensus | debate
  const specs = normalizeModelSpecs((request as PalConsensusRequest).models);
  if (specs.length > 0) args.models = specs;
  return args;
}

/** Coerce mixed `models` entries into the pal `{model, stance, stance_prompt}` shape. */
function normalizeModelSpecs(
  models: readonly (string | PalCommsModelSpec)[] | undefined,
): Array<Record<string, string>> {
  if (!Array.isArray(models)) return [];
  const out: Array<Record<string, string>> = [];
  for (const entry of models) {
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (name) out.push({ model: name });
      continue;
    }
    if (entry && typeof entry === 'object' && typeof entry.model === 'string' && entry.model.trim()) {
      const spec: Record<string, string> = { model: entry.model.trim() };
      if (entry.stance) spec.stance = entry.stance;
      if (entry.stancePrompt && entry.stancePrompt.trim()) spec.stance_prompt = entry.stancePrompt;
      out.push(spec);
    }
  }
  return out;
}

/**
 * Register the four `recoder.pal-comms` tool handlers over the injected pal
 * client (the `PalMcpAdapter`, as an `EngineClientPort`). The composer passes the
 * returned binder into `InteropHostBundle({ engineBinders })`.
 */
export function palCommsEngineBinder(
  client: EngineClientPort | null,
): (router: McpToolRouter) => void {
  return (router) => {
    router.register(recoderPalCommsServer, 'pal.route', async (input) => {
      const engine = requireClient(client);
      const request: PalRouteRequest = {
        prompt: requireString(input.args.prompt, 'pal.route requires args.prompt'),
        ...pickCommon(input.args),
        ...(optionalString(input.args.model) ? { model: optionalString(input.args.model) } : {}),
      };
      const result = await engine.invoke({ op: PAL_AGENTCOMMS_OP, input: buildAgentCommsArgs('route', request) });
      return toResult('pal.route', result);
    });

    router.register(recoderPalCommsServer, 'pal.consensus', async (input) => {
      const engine = requireClient(client);
      const request: PalConsensusRequest = {
        prompt: requireString(input.args.prompt, 'pal.consensus requires args.prompt'),
        ...pickCommon(input.args),
        ...(input.args.models !== undefined ? { models: parseModels(input.args.models) } : {}),
      };
      const result = await engine.invoke({ op: PAL_AGENTCOMMS_OP, input: buildAgentCommsArgs('consensus', request) });
      return toResult('pal.consensus', result);
    });

    router.register(recoderPalCommsServer, 'pal.debate', async (input) => {
      const engine = requireClient(client);
      const models = parseModels(input.args.models);
      if (models.length === 0) {
        throw new Error('pal.debate requires args.models (one entry per model, with a stance)');
      }
      const request: PalConsensusRequest = {
        prompt: requireString(input.args.prompt, 'pal.debate requires args.prompt'),
        ...pickCommon(input.args),
        models,
      };
      const result = await engine.invoke({ op: PAL_AGENTCOMMS_OP, input: buildAgentCommsArgs('debate', request) });
      return toResult('pal.debate', result);
    });

    router.register(recoderPalCommsServer, 'pal.models', async () => {
      const engine = requireClient(client);
      const result = await engine.invoke({ op: PAL_AGENTCOMMS_OP, input: buildAgentCommsArgs('models', {}) });
      return toResult('pal.models', result);
    });
  };
}

/** The camelCase common fields, defensively picked from raw MCP args. */
function pickCommon(args: Record<string, unknown>): Partial<PalCommsCommon> {
  const common: {
    systemPrompt?: string;
    temperature?: number;
    continuationId?: string;
    createThread?: boolean;
  } = {};
  const systemPrompt = optionalString(args.systemPrompt ?? args.system_prompt);
  if (systemPrompt) common.systemPrompt = systemPrompt;
  const temperature = typeof args.temperature === 'number' ? args.temperature : undefined;
  if (temperature !== undefined) common.temperature = temperature;
  const continuationId = optionalString(args.continuationId ?? args.continuation_id);
  if (continuationId) common.continuationId = continuationId;
  if (args.createThread === true || args.create_thread === true) common.createThread = true;
  return common;
}

/**
 * Boundary-validate a raw `models` arg into typed specs. Accepts an array of
 * model-name strings or `{ model, stance?, stancePrompt? }` objects; a malformed
 * entry throws with the exact problem rather than being silently dropped.
 */
function parseModels(raw: unknown): PalCommsModelSpec[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error('pal-comms args.models must be an array of model names or { model, stance? } objects');
  }
  const specs: PalCommsModelSpec[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (!name) throw new Error('pal-comms args.models contains an empty model name');
      specs.push({ model: name });
      continue;
    }
    const record = (entry ?? {}) as Record<string, unknown>;
    const model = optionalString(record.model);
    if (!model) throw new Error('pal-comms args.models entry requires a non-empty string `model`');
    const stance = optionalString(record.stance);
    if (stance && stance !== 'for' && stance !== 'against' && stance !== 'neutral') {
      throw new Error(`pal-comms model stance must be for|against|neutral (got '${stance}')`);
    }
    const stancePrompt = optionalString(record.stancePrompt ?? record.stance_prompt);
    specs.push({
      model,
      ...(stance ? { stance: stance as PalCommsModelSpec['stance'] } : {}),
      ...(stancePrompt ? { stancePrompt } : {}),
    });
  }
  return specs;
}

function toResult(tool: string, result: InvokeResult<unknown>): { content: unknown; metadata: Record<string, unknown> } {
  if (!result.ok) throw new Error(`${tool} failed: ${result.reason}`);
  return { content: result.value, metadata: { engine: 'pal-mcp', tool, capability: 'agentic-communications' } };
}

function requireClient(client: EngineClientPort | null): EngineClientPort {
  if (!client) {
    throw new Error('pal-mcp engine not bound in the engines composer — pal-comms tools unavailable');
  }
  return client;
}

function requireString(value: unknown, errorMessage: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(errorMessage);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
