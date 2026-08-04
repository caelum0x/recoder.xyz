/**
 * lifecycle/harvest-shaping — turn a finished convergence run into a REUSABLE
 * lesson (thesis §7: what an agent learned on run A must inform run B).
 *
 * Today a harvest stores whatever raw title/body the caller passes. This pure
 * step composes a STRUCTURED lesson from the run's outcome + convergence
 * provenance (how many agents converged, which approach won, which paths were
 * contested) + verification, so the candidate reads like a distilled convention
 * a later run can act on — not a raw log line:
 *
 *   "On <repo>, task '<title>': converged <N> agents; kept <winning>; contested
 *    <paths>; verified <pass/fail>; outcome=<completed|failed>. Evidence: task
 *    <taskId>, artifact <artifactId>."
 *
 * TRUTH: every clause is only emitted when its input is genuinely present — an
 * absent field is OMITTED, never fabricated (no "converged 0 agents"). The body
 * ALWAYS embeds the repo name (so the cross-RUN scope-boost can repo-match it)
 * and ALWAYS cites the evidence anchor (task + artifact), keeping the candidate
 * evidence-backed. This shapes a CANDIDATE only — promotion stays human/policy
 * gated (AGENTS.md), and this function never touches durable memory.
 *
 * Pure + deterministic: identical input → identical string. No I/O, no clock.
 */

/** The convergence provenance a completed run hands the shaper (all optional). */
export interface HarvestShapeInput {
  /** Repo the run operated on (path/display); basename is embedded + matched on. */
  readonly repo?: string;
  /** Human task title; falls back to the taskId when absent. */
  readonly taskTitle?: string;
  /** The task the run served — half of the evidence anchor (required). */
  readonly taskId: string;
  /** The run artifact — the other half of the evidence anchor (required). */
  readonly artifactId: string;
  /** Terminal outcome of the run. */
  readonly outcome: 'completed' | 'failed';
  /** How many parallel agents converged into the winning result. */
  readonly convergedAgents?: number;
  /** A short signal of the approach that won the merge (the reusable lesson). */
  readonly winningApproach?: string;
  /** Paths multiple agents disagreed on (the risky surface for the next run). */
  readonly contestedPaths?: readonly string[];
  /** Whether the run's verification passed (distinct from merely completing). */
  readonly verified?: boolean;
}

/** Last path segment of a repo ref (`/srv/recoder.xyz` → `recoder.xyz`). */
function repoName(repo: string | undefined): string {
  const trimmed = (repo ?? '').trim().replace(/[/\\]+$/, '');
  if (trimmed.length === 0) return '';
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
}

/**
 * Is there any convergence provenance worth shaping into a structured lesson?
 * When false, callers should keep the plain default body (no fabricated clauses).
 */
export function hasConvergenceProvenance(input: HarvestShapeInput): boolean {
  return (
    repoName(input.repo).length > 0 ||
    typeof input.convergedAgents === 'number' ||
    (input.winningApproach?.trim().length ?? 0) > 0 ||
    (input.contestedPaths?.some((p) => p.trim().length > 0) ?? false) ||
    typeof input.verified === 'boolean'
  );
}

/** A structured, reusable lesson title distilled from the run. */
export function shapeHarvestTitle(input: HarvestShapeInput): string {
  const repo = repoName(input.repo);
  const task = input.taskTitle?.trim();
  if (task) return repo ? `Lesson: ${task} (${repo})` : `Lesson: ${task}`;
  return repo ? `Lesson from a run on ${repo}` : `Lesson from run ${input.taskId}`;
}

/** A structured, reusable lesson body distilled from the run + convergence. */
export function shapeHarvestBody(input: HarvestShapeInput): string {
  const repo = repoName(input.repo) || 'the workspace repo';
  const task = input.taskTitle?.trim() || input.taskId;

  const clauses: string[] = [];
  if (typeof input.convergedAgents === 'number' && Number.isFinite(input.convergedAgents) && input.convergedAgents > 0) {
    clauses.push(`converged ${input.convergedAgents} agent${input.convergedAgents === 1 ? '' : 's'}`);
  }
  const winning = input.winningApproach?.trim();
  if (winning) clauses.push(`kept ${winning}`);
  const contested = (input.contestedPaths ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
  if (contested.length > 0) clauses.push(`contested ${contested.join(', ')}`);
  if (typeof input.verified === 'boolean') clauses.push(`verified ${input.verified ? 'pass' : 'fail'}`);
  clauses.push(`outcome=${input.outcome}`);

  const lead = `On ${repo}, task '${task}': ${clauses.join('; ')}.`;
  return `${lead} Evidence: task ${input.taskId}, artifact ${input.artifactId}.`;
}
