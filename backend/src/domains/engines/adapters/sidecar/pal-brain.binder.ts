/**
 * MCP binder for `recoder.pal-brain` — the agent-callable surface over the pal
 * brain FACET's deny-biased consensus/debate VERDICT (`PalBrainService.consensus`
 * / `.debate`). This is a PARALLEL surface to `recoder.pal-comms`, not a
 * replacement (engines-module keeps the two thin surfaces over one frozen pal
 * transport):
 *
 *  - `recoder.pal-comms` (`pal.consensus` / `pal.debate`) returns the RAW,
 *    un-parsed multi-model answers for a caller to synthesize, and THROWS on a
 *    transport fault.
 *  - `recoder.pal-brain` (`pal.consensus_verdict` / `pal.debate_verdict`, HERE)
 *    returns the facet's collapsed deny-biased {@link PalConsensusResult} verdict
 *    (`{ recommendation: 'allow' | 'block' | 'abstain', reason, models, degraded,
 *    engine }`) and ABSTAINS truthfully on any fault (timeout / sidecar down /
 *    unparseable answer) — it never fabricates an objection or an answer.
 *
 * Distinct tool NAMES (`*_verdict`) are deliberate: they avoid colliding with the
 * raw pal-comms tools while exposing the better decision surface an agent wants for
 * a governed "should I proceed?" question. Mirrors the `recoder.pal-plan` precedent
 * (a thin engine binder over the SAME facet's deny-biased `plan()`).
 *
 * IDENTITY: like `recoder.pal-comms` / `recoder.pal-plan`, these tools invoke
 * shared model providers and touch NO tenant-scoped Recoder state, so they bind no
 * subject. TRUTHFUL DEGRADE: the facet itself is degrade-safe (returns a
 * `degraded: true` abstain when the sidecar is down); a null facet (pal brain not
 * constructed at all) throws the real reason rather than a fabricated verdict.
 */
import type { McpServerRegistration } from '@recoder/interop';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type {
  PalConsensusRequest,
  PalConsensusResult,
} from '../../ports/pal-brain.port.js';

/** Tool names for the facet verdict surface (distinct from the raw pal-comms tools). */
export const PAL_CONSENSUS_VERDICT_TOOL = 'pal.consensus_verdict';
export const PAL_DEBATE_VERDICT_TOOL = 'pal.debate_verdict';

/** The local in-proc server registration for `recoder.pal-brain` (backend-owned). */
export const recoderPalBrainServer: McpServerRegistration = {
  serverId: 'recoder.pal-brain',
  // `custom` keeps this decoupled from the registry's built-in kind union while
  // still routing through the interop gate (mirrors `recoder.pal-comms`).
  kind: 'custom',
  displayName: 'Recoder PAL Brain (consensus verdict)',
  transport: 'http',
  enabled: true,
  toolNames: [PAL_CONSENSUS_VERDICT_TOOL, PAL_DEBATE_VERDICT_TOOL],
  metadata: { engine: 'pal-brain', capability: 'consensus-verdict' },
};

/**
 * The narrow facet seam the two tools delegate to — the `PalBrainService`'s
 * degrade-safe sidecar verbs. Injecting only these two async methods keeps the
 * binder decoupled from the full facet interface.
 */
export interface PalVerdictFacet {
  consensus(req: PalConsensusRequest): Promise<PalConsensusResult>;
  debate(req: PalConsensusRequest): Promise<PalConsensusResult>;
}

/**
 * Register the two `recoder.pal-brain` tool handlers over the injected pal brain
 * facet. The composer passes `this.pal()` (the memoized `PalBrainService`), so the
 * verdict tools are a thin surface over the ONE owned pal decision seam.
 */
export function palVerdictEngineBinder(
  facet: PalVerdictFacet | null,
): (router: McpToolRouter) => void {
  return (router) => {
    router.register(recoderPalBrainServer, PAL_CONSENSUS_VERDICT_TOOL, async (input) => {
      const brain = requireFacet(facet);
      const verdict = await brain.consensus(parseVerdictRequest(input.args, PAL_CONSENSUS_VERDICT_TOOL));
      return toVerdictResult(PAL_CONSENSUS_VERDICT_TOOL, verdict);
    });

    router.register(recoderPalBrainServer, PAL_DEBATE_VERDICT_TOOL, async (input) => {
      const brain = requireFacet(facet);
      const verdict = await brain.debate(parseVerdictRequest(input.args, PAL_DEBATE_VERDICT_TOOL));
      return toVerdictResult(PAL_DEBATE_VERDICT_TOOL, verdict);
    });
  };
}

/**
 * Boundary-validate the raw MCP args into a typed {@link PalConsensusRequest}. The
 * facet's request is simpler than pal-comms' (a flat `models: string[]`, no per-
 * model stances — the verdict surface is about the deny-biased recommendation, not
 * stance orchestration). A malformed entry throws with the exact problem.
 */
export function parseVerdictRequest(
  args: Record<string, unknown>,
  tool: string,
): PalConsensusRequest {
  const prompt = optionalString(args.prompt);
  if (!prompt) throw new Error(`${tool} requires a non-empty string args.prompt`);

  const request: {
    prompt: string;
    systemPrompt?: string;
    models?: string[];
    timeoutMs?: number;
  } = { prompt };

  const systemPrompt = optionalString(args.systemPrompt ?? args.system_prompt);
  if (systemPrompt) request.systemPrompt = systemPrompt;

  if (args.models !== undefined) request.models = parseModelNames(args.models, tool);

  const timeoutMs =
    typeof args.timeoutMs === 'number'
      ? args.timeoutMs
      : typeof args.timeout_ms === 'number'
        ? args.timeout_ms
        : undefined;
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    request.timeoutMs = timeoutMs;
  }

  return request;
}

/** Coerce a raw `models` arg into a list of non-empty model-name strings. */
function parseModelNames(raw: unknown, tool: string): string[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${tool} args.models must be an array of model-name strings`);
  }
  const names: string[] = [];
  for (const entry of raw) {
    const name = optionalString(entry);
    if (!name) throw new Error(`${tool} args.models contains an empty or non-string model name`);
    names.push(name);
  }
  return names;
}

/** Surface the deny-biased verdict as MCP tool content (never throws — facet abstains). */
function toVerdictResult(
  tool: string,
  verdict: PalConsensusResult,
): { content: PalConsensusResult; metadata: Record<string, unknown> } {
  return {
    content: verdict,
    metadata: { engine: 'pal-brain', tool, capability: 'consensus-verdict' },
  };
}

function requireFacet(facet: PalVerdictFacet | null): PalVerdictFacet {
  if (!facet) {
    throw new Error('pal-brain facet not bound in the engines composer — pal.*_verdict tools unavailable');
  }
  return facet;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
