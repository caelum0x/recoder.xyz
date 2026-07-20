/**
 * `pal-consensus.adapter` — binds the {@link ConsensusReviewPort} to the engines
 * domain's REAL `pal-mcp` client (the external Python pal server's multi-model
 * `agentcomms` primitive). This is the concrete adversarial-consensus brain the
 * governance gate consults before finalizing a high-risk `allow`.
 *
 * It talks to the pal client THROUGH the frozen engine seam (`invoke({ op:
 * 'agentcomms', input })`) so governance takes NO dependency on the engines
 * package — bootstrap injects `engines.client('pal-mcp')`, which structurally
 * satisfies {@link PalConsensusInvoker}, after the engines module is built.
 *
 * ADVERSARIAL FRAMING: the review is a `consensus` call across every available
 * model with a hard security-reviewer system prompt that forces each model to
 * emit a machine-parseable `VERDICT: BLOCK|ALLOW`. The parse is DENY-BIASED for a
 * high-risk write — a single credible `BLOCK` from any consulted model
 * recommends `block` (the gate then routes the write to human approval). Ambiguity
 * is NOT a block: an unparseable / no-models / all-allow answer resolves to
 * `abstain`/`allow` so the check never fabricates an objection.
 *
 * DEGRADE LAW: no pal client wired ⇒ `available:false` (the gate skips the review
 * entirely). A thrown/failed call, a timeout, or `no_models_available` ⇒ a
 * truthful `abstain` review (the kernel allow stands). This safety check NEVER
 * blocks a run on its own fault.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  ConsensusReview,
  ConsensusReviewPort,
  ConsensusReviewRequest,
} from '../ports/consensus.port.js';

/** The engine seam's discriminated invoke result (structural, no engines import). */
type InvokeResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string };

/**
 * The minimal shape of the engines `pal-mcp` client this adapter drives — just
 * the frozen `invoke`. `engines.client('pal-mcp')` satisfies it structurally.
 */
export interface PalConsensusInvoker {
  invoke(call: { op: string; input: unknown; timeoutMs?: number }): Promise<InvokeResult>;
}

/** Default wall-clock bound so a slow multi-model call never hangs the gate. */
const DEFAULT_CONSENSUS_TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT =
  'You are an adversarial security reviewer for an autonomous coding agent control plane. ' +
  'A HIGH-RISK write is about to be ALLOWED. Assume the actor may be compromised or mistaken. ' +
  'Judge ONLY whether this specific write is safe to perform unattended right now. ' +
  'Respond on the FIRST line with exactly "VERDICT: BLOCK" (if it should require human approval) ' +
  'or "VERDICT: ALLOW" (if it is clearly safe), then a one-sentence justification. ' +
  'Block only for a concrete, credible risk — not vague caution.';

export interface PalConsensusAdapterDeps {
  /** The engines `pal-mcp` client; null ⇒ the port is permanently `available:false`. */
  readonly pal: PalConsensusInvoker | null;
  readonly logger?: Logger;
  /** Per-review deadline (ms). Defaults to {@link DEFAULT_CONSENSUS_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/**
 * Build the {@link ConsensusReviewPort} over the pal client. When `pal` is null
 * the returned port reports `available:false` and its `review` yields a truthful
 * `abstain` — the gate skips it.
 */
export function createPalConsensusReview(deps: PalConsensusAdapterDeps): ConsensusReviewPort {
  const { pal, logger } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_CONSENSUS_TIMEOUT_MS;

  return {
    available: pal !== null,
    async review(request: ConsensusReviewRequest): Promise<ConsensusReview> {
      if (!pal) return abstain('pal consensus client not wired');
      try {
        // The pal server's `agentcomms` consensus op: models omitted ⇒ every
        // available provider is consulted neutrally. camelCase→snake_case per the
        // pal tool wire convention.
        const result = await pal.invoke({
          op: 'agentcomms',
          timeoutMs,
          input: {
            operation: 'consensus',
            system_prompt: SYSTEM_PROMPT,
            prompt: buildPrompt(request),
          },
        });
        if (!result.ok) {
          logger?.warn({ reason: result.reason, action: request.action }, 'pal consensus call failed — abstaining');
          return abstain(`pal consensus unavailable: ${result.reason}`);
        }
        return parseConsensus(result.value);
      } catch (err) {
        logger?.warn({ err, action: request.action }, 'pal consensus threw — abstaining (kernel verdict stands)');
        return abstain('pal consensus faulted');
      }
    },
  };
}

/** The adversarial prompt describing the exact high-risk write under review. */
function buildPrompt(request: ConsensusReviewRequest): string {
  const target =
    request.target.path ??
    request.target.command ??
    request.target.toolName ??
    request.target.environment ??
    '(unspecified)';
  return [
    `Action: ${request.action}`,
    `Risk tier: ${request.riskTier}`,
    `Target: ${target}`,
    `Actor: ${request.actorId}`,
    request.taskId ? `Task: ${request.taskId}` : undefined,
    `Autonomous (unattended) run: ${request.autonomous ? 'yes' : 'no'}`,
    `Kernel allow reason: ${request.kernelReason}`,
    '',
    'Should this high-risk write proceed unattended, or be escalated to human approval?',
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

/**
 * Parse the pal consensus payload into a recommendation. Deny-biased for a
 * high-risk write: ANY `VERDICT: BLOCK` from a consulted model ⇒ `block`. No
 * models available or an unparseable answer ⇒ `abstain`. All-allow ⇒ `allow`.
 */
function parseConsensus(value: unknown): ConsensusReview {
  const text = stringify(value).toUpperCase();
  const models = extractModels(value);

  if (!text || text.includes('NO_MODELS_AVAILABLE') || text.includes('"STATUS":"NO_MODELS_AVAILABLE"')) {
    return abstain('no models available for consensus');
  }

  const blocked = /VERDICT\s*:\s*BLOCK|RECOMMENDATION\s*:\s*BLOCK/.test(text);
  const allowed = /VERDICT\s*:\s*ALLOW|RECOMMENDATION\s*:\s*ALLOW/.test(text);

  if (blocked) {
    return {
      recommendation: 'block',
      reason: 'adversarial multi-model consensus flagged this high-risk write for human approval',
      models,
      degraded: false,
      engine: 'pal-mcp',
    };
  }
  if (allowed) {
    return {
      recommendation: 'allow',
      reason: 'adversarial multi-model consensus cleared this high-risk write',
      models,
      degraded: false,
      engine: 'pal-mcp',
    };
  }
  // A live answer we could not classify — do NOT invent an objection.
  return {
    recommendation: 'abstain',
    reason: 'consensus answer was inconclusive — keeping the kernel verdict',
    models,
    degraded: true,
    engine: 'pal-mcp',
  };
}

/** A truthful "no opinion" review: the gate keeps the kernel verdict. */
function abstain(reason: string): ConsensusReview {
  return { recommendation: 'abstain', reason, models: [], degraded: true, engine: 'synthetic' };
}

/** Best-effort JSON stringify of an opaque pal payload for token scanning. */
function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** Best-effort extraction of consulted model names from an opaque pal payload. */
function extractModels(value: unknown): readonly string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const responses = record.responses ?? record.models ?? record.results;
  if (!Array.isArray(responses)) return [];
  const names: string[] = [];
  for (const entry of responses) {
    if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).model === 'string') {
      names.push((entry as Record<string, unknown>).model as string);
    } else if (typeof entry === 'string') {
      names.push(entry);
    }
  }
  return names;
}
