/**
 * The MERGE TRUST GATE — turns the {@link ConvergenceTrust} score into an
 * enforceable pre-merge decision, so a low-trust converged merge is warned or
 * blocked BEFORE it becomes the customer-visible delivery. Pure + deterministic; a
 * deployment picks the posture via `RECODER_MERGE_TRUST_GATE`:
 *
 *   - `off`   — never blocks/warns on trust.
 *   - `warn`  (default) — never blocks, but attaches a warning + the review flags whenever the
 *               merge is not HIGH trust (the reviewer proceeds informed).
 *   - `block` — REFUSES a LOW-trust merge (a real blocker: verification blocked,
 *               unverifiable, or a mostly-conflicted/LLM-written convergence); a
 *               MEDIUM-trust merge is allowed WITH a warning. An UNJUDGEABLE merge
 *               (crux verification could not run) is ESCALATED to a human instead of
 *               blocked — a merge/reject/escalate safety valve (Baz-style).
 *
 * The gate never fabricates safety: it only ever downgrades a merge from allowed to
 * warned/blocked/escalated, and every refusal carries the trust score's own truthful
 * reasons. An escalate is honest about WHY: we could not judge, so a human decides.
 */
import type { ConvergenceTrust } from './convergence-trust.js';

export type MergeTrustGateMode = 'off' | 'warn' | 'block';

/** The gate outcome. `allow:false` ⇒ the merge is refused with a truthful reason. */
export interface MergeTrustGateDecision {
  readonly allow: boolean;
  /** True only when the gate itself refused a JUDGED-low merge (distinct from a governance deny). */
  readonly blocked: boolean;
  /**
   * True when the gate refused because the merge was UNJUDGEABLE — routed to a human
   * (a merge/reject/ESCALATE safety valve), NOT blocked as if it were bad. Mutually
   * exclusive with `blocked`; in `warn` mode it rides an allowed merge as advice.
   */
  readonly escalated: boolean;
  /** A non-blocking advisory (mode `warn`, or a `block`-mode MEDIUM merge). */
  readonly warning?: string;
  /** The refusal reason when `allow:false` (block or escalate). */
  readonly reason?: string;
  /** The trust tier the decision was made on (echoed for the caller/audit). */
  readonly tier: ConvergenceTrust['tier'];
  readonly score: number;
}

/**
 * Parse `RECODER_MERGE_TRUST_GATE`. Unset/blank ⇒ advisory `warn` (compute trust
 * and surface a low-trust warning, but never block). Explicit `off` disables trust
 * computation at merge; explicit `block` refuses low-trust merges.
 */
export function parseMergeTrustGateMode(raw: string | undefined): MergeTrustGateMode {
  const v = (raw ?? '').toLowerCase().trim();
  if (v === 'off' || v === 'warn' || v === 'block') return v;
  return 'warn';
}

/** Compose the trust summary + its review flags into one advisory line. */
function advisory(trust: ConvergenceTrust): string {
  const flags = trust.reviewFlags.length > 0 ? ` Review: ${trust.reviewFlags.join('; ')}` : '';
  return `${trust.summary}${flags}`;
}

/**
 * Evaluate the merge trust gate. PURE — the caller applies the decision (refuse the
 * merge on `allow:false`, or attach `warning` to the result). `off` always allows
 * with no advisory; `warn` allows but advises on any non-high tier; `block` refuses
 * a low tier and advises a medium one.
 */
export function evaluateMergeTrustGate(
  trust: ConvergenceTrust,
  mode: MergeTrustGateMode,
): MergeTrustGateDecision {
  const base = { tier: trust.tier, score: trust.score } as const;
  if (mode === 'off') {
    return { allow: true, blocked: false, escalated: false, ...base };
  }
  // UNJUDGEABLE (crux verification could not run) ⇒ ESCALATE, never block: in `block`
  // mode refuse-to-a-human (allow:false, escalated) rather than treating it as a bad
  // merge; in `warn` mode allow but advise a human look. An unjudgeable change is not
  // proven bad — so we route it to a person instead of fabricating a pass or a block.
  if (trust.unjudgeable) {
    if (mode === 'block') {
      return {
        allow: false,
        blocked: false,
        escalated: true,
        reason: `merge escalated to human review — trust could not be judged: ${advisory(trust)}`,
        ...base,
      };
    }
    return {
      allow: true,
      blocked: false,
      escalated: true,
      warning: `Escalate to a human — trust could not be judged: ${advisory(trust)}`,
      ...base,
    };
  }
  if (mode === 'block' && trust.tier === 'low') {
    return {
      allow: false,
      blocked: true,
      escalated: false,
      reason: `merge blocked by trust gate — ${advisory(trust)}`,
      ...base,
    };
  }
  // warn mode (any non-high), or block mode on a medium tier ⇒ allow WITH advice.
  if (trust.tier !== 'high') {
    return { allow: true, blocked: false, escalated: false, warning: advisory(trust), ...base };
  }
  return { allow: true, blocked: false, escalated: false, ...base };
}
