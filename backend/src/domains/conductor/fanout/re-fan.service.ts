/**
 * `ReFanService` — the SECOND-ROUND re-fan (`recoder_converge_refan`,
 * LOOM-ROADMAP.md build-now #6). A first-round {@link ConvergeFanoutService} run
 * fans ONE task to N agents and auto-composes their sibling diffs into ONE governed
 * `recoder/converge-<id>` branch. A re-fan takes that converged branch as the NEW
 * base and fans a NARROWED task to N fresh agents again — a second iteration whose
 * base is round 1's TRUSTED convergence, not `main`. It converges again into a new
 * reviewable branch, and links the whole thing back to round 1.
 *
 * A re-fan is NOT a new orchestration primitive: it is a {@link ConvergeFanoutService}
 * fan-out whose `base` is the prior converge branch and whose `taskGroup` is a NEW
 * second-round group. This service is the THIN glue that:
 *
 *   1. RESOLVES the prior convergence for `taskGroup` via the injected
 *      {@link PriorConvergenceResolver} — its composed branch (`recoder/converge-<id>`)
 *      and its {@link ConvergenceProvenance} (`plan.assisted` included). If NO prior
 *      converged branch exists for the group, it REFUSES truthfully (never a
 *      fabricated base) — a re-fan with nothing to iterate on is a `refused` result,
 *      not a launch off `main`.
 *   2. CARRIES the round-1 provenance (+ any relevant memory) into each new pane's
 *      task text, then delegates to the SHIPPED fan-out launch+wait+converge path via
 *      the injected {@link ReFanFanoutPort} with `base = recoder/converge-<id>`. The
 *      fan-out mints the NEW second-round group and, on its OWN ≥2 done, composes a
 *      new reviewable branch (or `converged:null` + a truthful reason on <2 done).
 *   3. RETURNS a truthful, round-1-linked result: the new group, the new converge
 *      branch (or `null` + reason), the per-agent outcomes, and the prior convergence
 *      it iterated from.
 *
 * HONESTY INVARIANTS (non-negotiable — the re-fan NEVER fabricates):
 *  - No prior converged branch for the group ⇒ `refused` with a truthful reason; the
 *    fan-out seam is NEVER invoked (no launch off a fabricated base).
 *  - The base handed to the fan-out is EXACTLY the resolved `recoder/converge-<id>`;
 *    it is never invented and never defaulted to `main`.
 *  - The second round's convergence is whatever the shipped fan-out truthfully
 *    reports — <2 done ⇒ `converged:null` + the fan-out's own reason; excluded /
 *    timed-out / errored panes are excluded by the same shipped path (never counted
 *    as done here).
 */
import type { LoggerPort } from '@recoder/substrate';
import type { Principal } from '../../identity/types.js';
import type { ConvergenceProvenance } from '../converge/converge.ops.js';
import type {
  FanoutAgentResult,
  FanoutConverged,
  FanoutInput,
  FanoutResult,
} from './converge-fanout.service.js';

// --- injected seams ----------------------------------------------------------

/**
 * The prior convergence a re-fan iterates from: the composed `recoder/converge-<id>`
 * branch of a first-round fan-out + its recorded provenance. The real wiring resolves
 * this from the composed Workspace record whose `metadata.convergedFromTaskGroup`
 * equals the group (`branch` = the converge branch, `metadata.convergence` = the
 * provenance).
 */
export interface PriorConvergence {
  /** The composed convergence workspace id (round 1's reviewable output). */
  readonly workspaceId: string;
  /** The composed branch — ALWAYS a `recoder/converge-<id>` ref (the re-fan base). */
  readonly branch: string;
  /** The recorded round-1 provenance (`plan.assisted` included), or `null` if unrecorded. */
  readonly provenance: ConvergenceProvenance | null;
}

/**
 * Resolve the prior convergence for a first-round `taskGroup`. Returns `null` when no
 * composed converge branch exists for the group (⇒ the re-fan refuses truthfully —
 * NEVER a fabricated base). The real wiring binds this to the composer's
 * `resolvePriorConvergence` scan over the workspace repository.
 */
export interface PriorConvergenceResolver {
  resolve(taskGroup: string): Promise<PriorConvergence | null>;
}

/**
 * The shipped fan-out entry a re-fan delegates to (the SAME `recoder_converge_fanout`
 * launch+wait+converge path — never reimplemented here). The real wiring binds this to
 * the composer's `fanout`.
 */
export interface ReFanFanoutPort {
  fanout(input: FanoutInput): Promise<FanoutResult>;
}

/** Injected wiring for {@link ReFanService}. */
export interface ReFanDeps {
  readonly resolver: PriorConvergenceResolver;
  readonly fanout: ReFanFanoutPort;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

// --- input / result ----------------------------------------------------------

/** A second-round re-fan request: iterate the prior convergence of `taskGroup`. */
export interface ReFanInput {
  /** The FIRST-round shared task-group id whose convergence is the new base. */
  readonly taskGroup: string;
  /** The narrowed second-round instruction delivered to each fresh pane. */
  readonly narrowedTask: string;
  readonly agentKinds: readonly string[];
  readonly repoPath: string;
  readonly spaceId: string;
  /** The project anchor every second-round sibling is scoped to. */
  readonly projectId: string;
  /** The task anchor for the second-round siblings; defaults to the minted new group. */
  readonly taskId?: string;
  readonly actor: Principal;
  /** Per-pane settle budget (ms); forwarded to the fan-out. */
  readonly settleTimeoutMs?: number;
  /** OPTIONAL relevant memory carried into each new pane's task text (never fabricated). */
  readonly memory?: string;
}

/** A compact, truthful link back to the round-1 provenance the re-fan iterated from. */
export interface ReFanProvenanceLink {
  /** The FIRST-round group the prior convergence folded (its `fromTaskGroup`). */
  readonly fromTaskGroup: string | null;
  readonly sourceCount: number;
  readonly fileCount: number;
  /** Paths whose round-1 conflicts an LLM resolved — ABSENT when none. */
  readonly assistedPaths?: readonly string[];
}

/**
 * The truthful outcome of a re-fan. A `refused` result means NO prior converged branch
 * existed for the group — the re-fan never launched (no fabricated base). A resolved
 * result carries the round-1 link + the SECOND round's own fan-out outcome.
 */
export type ReFanResult =
  | {
      readonly refused: true;
      /** The first-round group that had no convergence to iterate from. */
      readonly priorTaskGroup: string;
      readonly reason: string;
    }
  | {
      readonly refused: false;
      /** The first-round group whose convergence became this round's base. */
      readonly priorTaskGroup: string;
      /** The prior convergence the re-fan branched from (its branch is the base). */
      readonly priorConverge: FanoutConverged;
      /** The round-1 provenance link, or `null` when round 1 recorded none. */
      readonly provenanceLink: ReFanProvenanceLink | null;
      /** The NEW second-round shared task-group id (minted by the fan-out). */
      readonly taskGroup: string;
      /** Every governed second-round workspace successfully created. */
      readonly workspaceIds: readonly string[];
      /** The new composed branch, or `null` when <2 panes settled done. */
      readonly converged: FanoutConverged | null;
      /** Why `converged` is `null` (the fan-out's own truthful reason). */
      readonly convergeReason?: string;
      /** Per-agent truthful outcome, in the caller's `agentKinds` order. */
      readonly perAgent: readonly FanoutAgentResult[];
    };

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/**
 * Build the second-round pane task: the narrowed instruction PREFIXED with a truthful
 * context header naming the prior round, its converge branch (this round's base), what
 * it folded, and any carried memory. Pure — no fabrication; a header line is only
 * emitted from real provenance/memory fields.
 */
export function buildReFanTask(
  input: ReFanInput,
  prior: PriorConvergence
): string {
  const parts: string[] = [
    'This is a SECOND-ROUND re-fan iterating a prior convergence.',
    `Prior round task group: ${input.taskGroup}`,
    `Prior converged branch (YOUR BASE — build on it, do not redo it): ${prior.branch}`,
  ];
  if (prior.provenance) {
    parts.push(
      `Prior convergence folded ${prior.provenance.fileCount} file(s) from ${prior.provenance.sourceCount} agent(s).`
    );
    const assisted = prior.provenance.assisted;
    if (assisted && assisted.length > 0) {
      parts.push(
        `LLM-assisted merged file(s) from round 1 (review with extra care): ${assisted
          .map(a => a.path)
          .join(', ')}.`
      );
    }
  }
  const memory = input.memory?.trim();
  if (memory) {
    parts.push(`Relevant memory carried from round 1: ${memory}`);
  }
  parts.push('', 'Narrowed task for this round:', input.narrowedTask);
  return parts.join('\n');
}

/** Project the round-1 provenance into the compact truthful link surfaced on the result. */
function provenanceLinkOf(
  provenance: ConvergenceProvenance | null
): ReFanProvenanceLink | null {
  if (!provenance) return null;
  const assistedPaths = provenance.assisted?.map(a => a.path) ?? [];
  return {
    fromTaskGroup: provenance.fromTaskGroup,
    sourceCount: provenance.sourceCount,
    fileCount: provenance.fileCount,
    ...(assistedPaths.length > 0 ? { assistedPaths } : {}),
  };
}

/**
 * Re-fan a prior convergence: resolve round 1's converge branch, carry its provenance
 * into a narrowed task, and re-run the SHIPPED fan-out with that branch as the base.
 * Truthful degrade throughout — see the class-level HONESTY INVARIANTS.
 */
export class ReFanService {
  private readonly deps: ReFanDeps;
  private readonly logger: LoggerPort;

  constructor(deps: ReFanDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? NOOP_LOGGER;
  }

  async reFan(input: ReFanInput): Promise<ReFanResult> {
    // (1) Resolve the prior convergence. NO prior branch ⇒ refuse truthfully — the
    // fan-out seam is never invoked (no launch off a fabricated base).
    const prior = await this.deps.resolver.resolve(input.taskGroup);
    if (!prior) {
      const reason = `no prior converged branch exists for task group '${input.taskGroup}' — nothing to re-fan from (run recoder_converge_fanout first)`;
      this.logger.info('re-fan refused: no prior convergence', {
        taskGroup: input.taskGroup,
      });
      return { refused: true, priorTaskGroup: input.taskGroup, reason };
    }

    // (2) Carry the round-1 provenance (+ memory) into each pane's task text, then
    // delegate to the SHIPPED fan-out with base = the prior converge branch.
    const task = buildReFanTask(input, prior);
    const fanoutInput: FanoutInput = {
      task,
      agentKinds: input.agentKinds,
      base: prior.branch,
      repoPath: input.repoPath,
      spaceId: input.spaceId,
      projectId: input.projectId,
      actor: input.actor,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.settleTimeoutMs !== undefined
        ? { settleTimeoutMs: input.settleTimeoutMs }
        : {}),
    };
    const result = await this.deps.fanout.fanout(fanoutInput);

    this.logger.info('re-fan complete', {
      priorTaskGroup: input.taskGroup,
      priorBranch: prior.branch,
      newTaskGroup: result.taskGroup,
      converged: result.converged != null,
    });

    // (3) Return the truthful, round-1-linked result.
    return {
      refused: false,
      priorTaskGroup: input.taskGroup,
      priorConverge: { workspaceId: prior.workspaceId, branch: prior.branch },
      provenanceLink: provenanceLinkOf(prior.provenance),
      taskGroup: result.taskGroup,
      workspaceIds: result.workspaceIds,
      converged: result.converged,
      ...(result.convergeReason ? { convergeReason: result.convergeReason } : {}),
      perAgent: result.perAgent,
    };
  }
}
