/**
 * `WorkspaceGridPort` — the conductor-owned seam the F3 compare/parallel path
 * consumes to (a) surface a READ-ONLY operator-attach hint on the compare read
 * model and (b) arrange a GOVERNED, worktree-bound operator grid over a
 * parallel-run group. The concrete adapter (`adapters/dmux-grid.adapter.ts`) is
 * built over the engines-domain dmux LAYOUT brain (`engines.dmuxLayout()`) + the
 * dmux `EngineClientPort`; the conductor never imports engines internals and
 * never shells tmux itself — every pane/session tmux call lives in the engines
 * pure functions behind this port (mirror of `tmux-scan-source.adapter.ts`).
 *
 * DEGRADE-TRUTHFUL BY CONTRACT (the non-negotiable invariant): dmux/tmux absent,
 * not-built, or any tmux fault ⇒ `null` (no grid, no hint) — NEVER a fabricated
 * arrangement, NEVER a hollow/empty grid, NEVER a cross-tenant console, and NEVER
 * a block on a compare read. The compare/parallel read model still returns
 * without a grid when this port is absent.
 */

/**
 * A READ-ONLY operator-attach hint for a parallel-run group. No mutation — safe
 * to emit on every compare read.
 */
export interface GroupAttachHint {
  /**
   * The exact operator attach line (`dmuxAttachCommand` — pinned to the shared
   * tmux server). DESKTOP-ONLY: present only in the single-tenant desktop
   * composition, because this console renders ALL box-wide `recoder-*` sessions
   * with no tenant partition. Absent on shared/prod (see the adapter's tenant
   * gate + `docs/modules/terminal.md`).
   */
  readonly attachCommand?: string;
  /**
   * The group's live `recoder-*` sessions the console can see, already
   * intersected to THIS group (`dmuxVisibleSessions ∩ groupSessionNames`) —
   * tenant-safe, so always emitted regardless of composition.
   */
  readonly visibleSessions: readonly string[];
}

/**
 * The result of arranging the group's operator grid (a GOVERNED write). The grid
 * is BOUND to the real sibling worktrees: one pane per sibling, each cwd'd to
 * that sibling's own `worktreePath`. Never empty panes, never one shared
 * repoPath — `worktreePaths` is the audit surface proving the binding.
 */
export interface GroupGridArrangement extends GroupAttachHint {
  /** The dedicated detached operator session the grid was built in (`recoder-group-<taskGroup>`). */
  readonly sessionName: string;
  /** The per-pane cwds, in pane order == the ordered sibling worktrees fed in (the binding proof). */
  readonly worktreePaths: readonly string[];
  readonly paneCount: number;
  readonly layout: 'agent-grid';
}

/** One sibling's real worktree, as fed to the grid write (both fields live on the Workspace record). */
export interface GroupWorktree {
  readonly workspaceId: string;
  readonly worktreePath: string;
}

/**
 * The dmux layout brain, as the conductor's compare/parallel path consumes it.
 * DEGRADE-TRUTHFUL BY CONTRACT: dmux/tmux absent or any tmux fault ⇒ `null`
 * (no grid, no hint) — NEVER a fabricated arrangement, NEVER a hollow/empty grid,
 * NEVER blocks a compare read.
 */
export interface WorkspaceGridPort {
  /** Truthful: is the dmux operator console usable right now? */
  available(): Promise<boolean>;
  /**
   * READ-ONLY hint for a group. `visibleSessions` is always intersected to the
   * group (tenant-safe); `attachCommand` is emitted only in the single-tenant
   * desktop composition. `null` when dmux/tmux absent or the repo is unknown.
   */
  attachHint(input: {
    readonly repoPath: string;
    readonly groupSessionNames: readonly string[];
  }): Promise<GroupAttachHint | null>;
  /**
   * GOVERNED WRITE: ensure `recoder-group-<taskGroup>` then build one pane per
   * sibling, each cwd'd to its OWN worktree, laid out `agent-grid`. `null` on
   * degrade. Requires ≥1 sibling with a real `worktreePath`, else `null` (no
   * worktrees ⇒ no honest grid to build).
   */
  arrangeGrid(input: {
    readonly taskGroup: string;
    readonly worktrees: readonly GroupWorktree[];
  }): Promise<GroupGridArrangement | null>;
}
