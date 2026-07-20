/**
 * `ConsensusReviewPort` — the ADVERSARIAL multi-model second opinion the gate
 * consults BEFORE it finalizes a HIGH-RISK `allow`. This is the pal fusion seam:
 * on a high-risk write that the kernel is about to allow, the gate runs an
 * adversarial cross-model consensus/debate (pal's real multi-model brain) as an
 * EXTRA check — a single credible objection escalates the write to human
 * approval rather than letting an autonomous high-risk allow slip through.
 *
 * DECOUPLING: governance defines this port; the concrete adapter
 * ({@link ../adapters/pal-consensus.adapter.ts}) bridges it to the engines
 * domain's `pal-mcp` client. The gate depends ONLY on this interface, so it
 * never imports the engines package or loads a model provider.
 *
 * DEGRADE LAW (non-negotiable): this is a SAFETY check that MUST NEVER block a
 * run on its own faults. `available === false`, a thrown call, or an
 * unparseable/abstaining model answer all resolve to `abstain` — the gate keeps
 * the kernel's own verdict (the allow stands). ONLY an explicit `block`
 * recommendation downgrades the allow (to `needs_approval`, never a silent deny),
 * and that downgrade is sealed into the audit chain as evidence.
 */
import type { GovernanceAction, GateTarget, RiskTier } from '../types.js';

/** The adversarial consensus recommendation. `abstain` == "no opinion, keep the kernel verdict". */
export type ConsensusRecommendation = 'allow' | 'block' | 'abstain';

/** The high-risk allow the gate is about to grant, handed to the consensus brain. */
export interface ConsensusReviewRequest {
  /** The dotted `resource.verb` being allowed (e.g. `branch.push`, `pr.merge`). */
  readonly action: GovernanceAction;
  /** The kernel's risk tier for this write (only `high`/`critical` reach here). */
  readonly riskTier: RiskTier;
  /** The canonical actor id proposing the write. */
  readonly actorId: string;
  /** The task this write belongs to, when correlated. */
  readonly taskId?: string;
  /** The run this write belongs to, when correlated. */
  readonly runId?: string;
  /** The concrete target of the write (path/command/tool/env). */
  readonly target: GateTarget;
  /** The kernel's own reason for allowing — context for the adversarial review. */
  readonly kernelReason: string;
  /** Whether the surrounding run is in an explicitly autonomous (unattended) mode. */
  readonly autonomous: boolean;
}

/** The adversarial multi-model verdict the gate folds back into its decision. */
export interface ConsensusReview {
  /** The recommendation. `block` downgrades the allow → `needs_approval`. */
  readonly recommendation: ConsensusRecommendation;
  /** A human-readable synthesis of why the models blocked/allowed/abstained. */
  readonly reason: string;
  /** The model names actually consulted (empty when none were available). */
  readonly models: readonly string[];
  /** True whenever the review did not come from a live multi-model call. */
  readonly degraded: boolean;
  /** Which engine answered (e.g. `pal-mcp`, or `synthetic` on a truthful skip). */
  readonly engine: string;
}

/**
 * The port the gate consults. `available` is a cheap, non-throwing probe the
 * gate reads FIRST so it can skip the review (and the audit noise) when the
 * consensus brain is not wired at all.
 */
export interface ConsensusReviewPort {
  /** Truthful readiness — false when no pal client is wired (the gate skips it). */
  readonly available: boolean;
  /**
   * Run the adversarial multi-model review. MUST NOT throw across the seam — a
   * fault resolves to an `abstain` review so the kernel verdict stands. Bounded
   * by the adapter (a slow model call never hangs the gate).
   */
  review(request: ConsensusReviewRequest): Promise<ConsensusReview>;
}
