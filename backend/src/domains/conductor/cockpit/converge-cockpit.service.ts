/**
 * `ConvergeCockpitService` — the LIVE convergence cockpit snapshot (LOOM-ROADMAP.md
 * §1 build-now #1). It makes `recoder_converge_fanout` OBSERVABLE: it folds the
 * per-pane native attention status + the shipped read-only convergence probes into
 * ONE truthful cockpit view model the desktop renders as a terminal-plain strip
 * ("K/N settled · C contested · A auto-mergeable · P need a pick") plus the N-up
 * column view.
 *
 * THIN COMPOSITION — it reuses the already-shipped ops and reimplements NONE of the
 * convergence math. Every heavy read is an INJECTED SEAM ({@link ConvergeCockpitDeps}):
 *  - (a) the sibling set + each pane's live {@link AttentionState} + agent kind
 *        (the compare read's `attention`), from `loadPanes`;
 *  - (b) `planConvergence(taskGroup,{probe:true})` — the pure fold ENRICHED with the
 *        read-only synthesizability probe (`contested[]`), from `plan`;
 *  - (c) `gatherFileVersions` for the contested paths — the N-up column view, from
 *        `fileVersions`.
 * The service produces ONE authoritative snapshot per call (the injected seams are
 * the source of truth, never a cached stream) — subscribe/live-refresh is a CALLER
 * concern (the desktop re-invokes on `pane.agent_status_changed`).
 *
 * TRUTHFULNESS (non-negotiable, all shipped):
 *  - A pane whose state is `unknown`/`working` is NOT counted settled — `settledCount`
 *    reflects only the real settle-set states (`review_ready` / `agent_idle_prompt` /
 *    `awaiting_approval` / `error`), matching the fanout {@link DEFAULT_SETTLE_SET}.
 *  - `autoMergeableCount` + `needsPickCount` PARTITION the contested set exactly
 *    (auto-mergeable = synthesizable, needs-pick = the rest) — never a double count.
 *  - `convergeReady` is true ONLY when EVERY pane is settled AND the probed plan is
 *    usable (there is ≥1 changed file to converge) — never fabricated.
 *  - If the probe cannot run (repo gone / too-few panes / fault) the snapshot
 *    DEGRADES with truthful zeros + a `reason`, never invented contested/auto-mergeable
 *    numbers.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { AttentionState } from '../types.js';
import type {
  ConvergencePlan,
  ContestedProbe,
} from '../converge/converge-plan.service.js';
import type { FileVersionsView } from '../converge/converge.ops.js';
import {
  isNativeKind,
  MIN_FANOUT_AGENTS,
  DONE_ISH_STATES,
} from '../fanout/converge-fanout.service.js';
import { DEFAULT_SETTLE_SET } from '../wait/wait.service.js';

/**
 * The attention states that count a pane as SETTLED (it finished producing a diff or
 * failed truthfully) — the SAME set the fanout wait resolves on
 * ({@link DEFAULT_SETTLE_SET}: `agent_idle_prompt` / `review_ready` /
 * `awaiting_approval` / `error`). `working`/`unknown` are NOT settled.
 */
export const COCKPIT_SETTLED_STATES: readonly AttentionState[] =
  DEFAULT_SETTLE_SET;

/** True when a pane's live attention state counts as settled. */
export function isSettledState(state: AttentionState): boolean {
  return COCKPIT_SETTLED_STATES.includes(state);
}

// --- injected seams ----------------------------------------------------------

/** One pane's live status the cockpit folds (projected from the compare/attention read). */
export interface CockpitPaneInput {
  readonly workspaceId: string;
  /** The agent kind / runtimeId that ran this pane (the native-status key). */
  readonly agent: string;
  /** Live attention classification; `'unknown'` when there is no truthful signal. */
  readonly state: AttentionState;
}

/** The sibling set the cockpit folds — the shared group label + the panes. */
export interface CockpitPanesResult {
  /** The shared group key, or `null` when the subject set is ungrouped/ad-hoc. */
  readonly taskGroup: string | null;
  readonly panes: readonly CockpitPaneInput[];
}

/**
 * The injected reads the cockpit composes. In production the module binds these to
 * the shipped compare read (`attention` per sibling), `planConvergence(probe)`, and
 * `gatherFileVersions`; tests bind them to fakes. NONE reimplement convergence.
 */
export interface ConvergeCockpitDeps {
  /** (a) The sibling set + each pane's live {@link AttentionState} + agent kind. */
  loadPanes(): Promise<CockpitPanesResult>;
  /** (b) The PROBED convergence plan (`planConvergence(taskGroup,{probe:true})`). */
  plan(): Promise<ConvergencePlan>;
  /** (c) The N-up per-file version view for the given (contested) paths. */
  fileVersions(paths: readonly string[]): Promise<readonly FileVersionsView[]>;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

// --- view model --------------------------------------------------------------

/** One agent pane in the cockpit — its live state + settle/native truthful flags. */
export interface CockpitAgent {
  readonly workspaceId: string;
  /** The agent kind / runtimeId that ran this pane. */
  readonly kind: string;
  readonly state: AttentionState;
  /** True when {@link isSettledState}(state) — never for `working`/`unknown`. */
  readonly settled: boolean;
  /** True when Loom drives this kind with NATIVE agent-status (else raw-pane fallback). */
  readonly nativeStatus: boolean;
}

/** One contested file in the cockpit — who touched it + whether it auto-merges. */
export interface CockpitContested {
  readonly path: string;
  /** The sibling workspaceIds that authored this path (the pick options). */
  readonly agents: readonly string[];
  /** True when a clean line-level 3-way merge of the versions is possible. */
  readonly synthesizable: boolean;
  /** When `synthesizable:false`: `'overlap'` | `'delete-modify'` | `'unreadable'`. */
  readonly reason?: string;
}

/** The one authoritative cockpit view model — a PURE fold, never a cached stream. */
export interface CockpitSnapshot {
  /** The shared group key, or `null` when ungrouped/ad-hoc. */
  readonly taskGroup: string | null;
  /** Every pane, in the compare read's order. */
  readonly agents: readonly CockpitAgent[];
  /** Panes counted settled (state in the settle set) — never `working`/`unknown`. */
  readonly settledCount: number;
  /** Total panes in the group. */
  readonly totalCount: number;
  /** Contested files (2+ authors) with their synthesizability probe. */
  readonly contested: readonly CockpitContested[];
  /** Contested files that auto-merge cleanly (`synthesizable`). */
  readonly autoMergeableCount: number;
  /** Contested files that still need an explicit pick (the rest — exact partition). */
  readonly needsPickCount: number;
  /** Changed files NO sibling contested (single-author, auto-resolve). */
  readonly cleanCount: number;
  /** The N-up per-file version view for the contested paths (the column view). */
  readonly fileVersions: readonly FileVersionsView[];
  /** True ONLY when every pane is settled AND the probed plan is usable. */
  readonly convergeReady: boolean;
  /** The terminal-plain strip line (`"3/4 settled · 2 files contested · …"`). */
  readonly summaryLine: string;
  /** True when the probe could not run — the counts are truthful zeros + a `reason`. */
  readonly degraded: boolean;
  /** Why the snapshot degraded (repo gone / too-few panes / probe fault). Absent otherwise. */
  readonly reason?: string;
}

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fold the injected reads into ONE truthful {@link CockpitSnapshot}. Construct per
 * target (the seams close over the taskGroup/workspace set + principal); `snapshot`
 * takes no args so the source of truth is always the seams, never service state.
 */
export class ConvergeCockpitService {
  private readonly deps: ConvergeCockpitDeps;
  private readonly logger: LoggerPort;

  constructor(deps: ConvergeCockpitDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? NOOP_LOGGER;
  }

  /** Produce the one authoritative cockpit snapshot for this target. */
  async snapshot(): Promise<CockpitSnapshot> {
    let panes: CockpitPanesResult;
    try {
      panes = await this.deps.loadPanes();
    } catch (err) {
      // Cannot even read the sibling set — a fully truthful degraded snapshot.
      return degraded(null, [], `panes unavailable: ${message(err)}`);
    }

    const agents = panes.panes.map(toAgent);

    // TOO FEW to converge: never probe (the ops need ≥2 siblings) — degrade truthfully.
    if (agents.length < MIN_FANOUT_AGENTS) {
      return degraded(
        panes.taskGroup,
        agents,
        `convergence needs ≥${MIN_FANOUT_AGENTS} panes (found ${agents.length})`
      );
    }

    let plan: ConvergencePlan;
    try {
      plan = await this.deps.plan();
    } catch (err) {
      // The probe faulted (repo gone / git fault) — zeros + reason, never invented.
      return degraded(
        panes.taskGroup,
        agents,
        `convergence probe failed: ${message(err)}`
      );
    }

    const contested = (plan.contested ?? []).map(toContested);
    const autoMergeableCount = contested.filter(c => c.synthesizable).length;
    // Exact partition: needs-pick is every contested file that is NOT synthesizable.
    const needsPickCount = contested.length - autoMergeableCount;
    const contestedPaths = new Set(contested.map(c => c.path));
    const cleanCount = plan.changedFiles.filter(
      p => !contestedPaths.has(p)
    ).length;

    // (c) N-up column view for the contested paths — best-effort: a fault here leaves
    // the columns empty but NEVER invents the numbers above (they come from the probe).
    const fileVersions = await this.gatherFileVersions(
      [...contestedPaths].sort()
    );

    const settledCount = agents.filter(a => a.settled).length;
    const totalCount = agents.length;
    // convergeReady requires every pane settled DONE-ISH — an `error` pane counts as
    // settled (it stopped) but has no trustworthy diff (matching the fanout
    // DONE_ISH_STATES, which excludes `error`), so it must NOT light the merge CTA.
    const allDoneIsh =
      totalCount > 0 && agents.every(a => DONE_ISH_STATES.includes(a.state));
    // A usable plan = there is genuinely something to converge (≥1 changed file).
    const planUsable = plan.changedFiles.length > 0;
    const convergeReady = allDoneIsh && planUsable;

    return {
      taskGroup: panes.taskGroup,
      agents,
      settledCount,
      totalCount,
      contested,
      autoMergeableCount,
      needsPickCount,
      cleanCount,
      fileVersions,
      convergeReady,
      summaryLine: summarize(
        settledCount,
        totalCount,
        contested.length,
        autoMergeableCount,
        needsPickCount
      ),
      degraded: false,
    };
  }

  /** Read the N-up versions for the contested paths; a fault degrades to empty (never a throw). */
  private async gatherFileVersions(
    paths: readonly string[]
  ): Promise<readonly FileVersionsView[]> {
    if (paths.length === 0) return [];
    try {
      return await this.deps.fileVersions(paths);
    } catch (err) {
      this.logger.warn('cockpit file-versions read failed', {
        err: message(err),
      });
      return [];
    }
  }
}

/** Project a pane read into a cockpit agent — settle + native flags are truthful, never guessed. */
function toAgent(pane: CockpitPaneInput): CockpitAgent {
  return {
    workspaceId: pane.workspaceId,
    kind: pane.agent,
    state: pane.state,
    settled: isSettledState(pane.state),
    nativeStatus: isNativeKind(pane.agent),
  };
}

/** Project a synthesizability probe into a cockpit contested entry. */
function toContested(probe: ContestedProbe): CockpitContested {
  return {
    path: probe.path,
    agents: [...probe.workspaceIds],
    synthesizable: probe.synthesizable,
    ...(probe.reason ? { reason: probe.reason } : {}),
  };
}

/** The terminal-plain strip line. */
function summarize(
  settled: number,
  total: number,
  contested: number,
  autoMergeable: number,
  needsPick: number
): string {
  const files = contested === 1 ? 'file' : 'files';
  return `${settled}/${total} settled · ${contested} ${files} contested · ${autoMergeable} auto-mergeable · ${needsPick} needs a pick`;
}

/**
 * A truthful DEGRADED snapshot — the panes are still reported (settle counts stay
 * real), but every convergence number is a hard zero + a `reason`. NEVER fabricates
 * contested/auto-mergeable counts, and `convergeReady` is always false.
 */
function degraded(
  taskGroup: string | null,
  agents: readonly CockpitAgent[],
  reason: string
): CockpitSnapshot {
  const totalCount = agents.length;
  const settledCount = agents.filter(a => a.settled).length;
  return {
    taskGroup,
    agents,
    settledCount,
    totalCount,
    contested: [],
    autoMergeableCount: 0,
    needsPickCount: 0,
    cleanCount: 0,
    fileVersions: [],
    convergeReady: false,
    summaryLine: `${settledCount}/${totalCount} settled · convergence unavailable (${reason})`,
    degraded: true,
    reason,
  };
}
