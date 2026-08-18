/**
 * `foldCheckRuns` + `CheckRunnerPort` — the seam for running RECODER'S OWN checks
 * (tests / typecheck / lint / build) on a change, instead of only mirroring GitHub's
 * status-check rollup (recoder-fxee). The research's sharpest finding: Recoder's
 * `checks` merge-readiness signal is a passthrough of GitHub's `statusCheckRollup` and
 * goes `'unknown'` the moment a repo has no CI — a hollow center for a merge-gate
 * product, while every substrate competitor (Continue, Sweep, Aider, opencode) runs at
 * least tests/lint/diagnostics itself.
 *
 * This file owns the PURE, testable half: fold a set of already-executed check results
 * into a rollup the readiness `checks` signal consumes (same shape as the GitHub
 * rollup, so the fold combines them). The EXECUTION half is the injected
 * {@link CheckRunnerPort} — a sandbox runner (recoder_sandbox_exec) that produces the
 * {@link LocalCheckRun}s. Until a runner is wired the readiness fold simply sees no
 * local checks and behaves exactly as today (GitHub-only) — degrade-truthful, no
 * fabricated pass.
 */

/** One executed check (a test suite / typecheck / lint / build step). */
export interface LocalCheckRun {
  readonly name: string;
  readonly status: 'pass' | 'fail' | 'error';
  /** Short detail (e.g. "3 failing", first error line); optional. */
  readonly detail?: string;
}

/** The folded rollup — mirrors the GitHub `checks` shape so readiness can combine them. */
export interface LocalChecksRollup {
  readonly rollup: 'passing' | 'failing' | 'pending' | 'none';
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
  /** Names of the failing/errored checks (for the reviewer-facing blocker). */
  readonly failing: readonly string[];
}

/**
 * The injected runner that EXECUTES the repo's checks for a workspace (in a sandbox)
 * and returns their results. Returns `[]` when unavailable/unwired — never throws, so
 * the readiness fold degrades to GitHub-only rather than fabricating a pass.
 */
export interface CheckRunnerPort {
  run(workspaceId: string): Promise<readonly LocalCheckRun[]>;
}

/** Fold executed check results into a rollup. PURE. Empty ⇒ `'none'` (nothing ran). */
export function foldCheckRuns(runs: readonly LocalCheckRun[]): LocalChecksRollup {
  if (runs.length === 0) {
    return { rollup: 'none', passed: 0, failed: 0, total: 0, failing: [] };
  }
  const failing = runs.filter((r) => r.status === 'fail' || r.status === 'error');
  const passed = runs.filter((r) => r.status === 'pass').length;
  const rollup: LocalChecksRollup['rollup'] =
    failing.length > 0 ? 'failing' : passed === runs.length ? 'passing' : 'pending';
  return { rollup, passed, failed: failing.length, total: runs.length, failing: failing.map((r) => r.name) };
}
