/**
 * `createDmuxGridAdapter` — the FUSION seam that adapts the engines-domain dmux
 * LAYOUT brain ({@link DmuxLayoutPort}) + the dmux {@link EngineClientPort} onto
 * the conductor-owned {@link WorkspaceGridPort} the F3 compare/parallel path
 * consumes. Mirror of `tmux-scan-source.adapter.ts`: the conductor reaches the
 * layout brain ONLY through the injected engine ports and never shells tmux —
 * all `new-session`/`split-window`/`select-layout` calls live in the engines
 * pure functions behind `buildWorktreeGrid`.
 *
 * TWO surfaces:
 *  - `attachHint` reads the box-wide visible `recoder-*` sessions
 *    (`client.invoke({op:'sessions'})`), intersects them to THIS group, and — ONLY
 *    in the single-tenant desktop composition — includes the raw `attachCommand`
 *    (`client.invoke({op:'attach-command'})`). On shared/prod the console would
 *    render every tenant's `recoder-*` sessions box-wide, so the attach line is
 *    withheld exactly like the box-wide introspect verbs; `visibleSessions`
 *    (intersected, tenant-safe) is always emitted. Documented desktop-only in
 *    `docs/modules/terminal.md`.
 *  - `arrangeGrid` calls `layout.buildWorktreeGrid({ session:'recoder-group-<g>',
 *    worktrees })` — one pane per sibling, EACH cwd'd to its OWN worktree (never a
 *    hollow shared-repoPath grid, never a moved live session).
 *
 * DEGRADE-TRUTHFUL: any op failure / rejected tmux ⇒ `null` — never a partial,
 * fabricated, or empty arrangement/hint, never a throw across the seam, never a
 * block on a compare read.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { DmuxLayoutPort } from '../../engines/dmux-adapter.js';
import type {
  GroupAttachHint,
  GroupGridArrangement,
  GroupWorktree,
  WorkspaceGridPort,
} from '../ports/workspace-grid.port.js';

/** The conductor namespaces every tmux session under this prefix. */
const CONDUCTOR_SESSION_PREFIX = 'recoder-';
/** The dedicated operator-grid session for a group is namespaced under this prefix. */
const GROUP_SESSION_PREFIX = 'recoder-group-';

export interface DmuxGridAdapterDeps {
  /** The engines-domain dmux LAYOUT brain (`engines.dmuxLayout()`). */
  readonly layout: DmuxLayoutPort;
  /** The dmux `EngineClientPort` (`engines.client('dmux')`) — sessions/attach/availability. */
  readonly client: EngineClientPort;
  /** Structured logger for the truthful degrade path (optional). */
  readonly logger?: LoggerPort;
  /** Session-name prefix that marks a conductor-owned session; default `recoder-`. */
  readonly sessionPrefix?: string;
  /**
   * TENANT GATE: the single-tenant desktop composition ⇒ emit the raw
   * `attachCommand`; shared/prod ⇒ withhold it (the box-wide console spans every
   * tenant). Default `false` (safe). `visibleSessions` is always emitted.
   */
  readonly singleTenant?: boolean;
}

/** Build the {@link WorkspaceGridPort} over the dmux layout brain + engine client. */
export function createDmuxGridAdapter(deps: DmuxGridAdapterDeps): WorkspaceGridPort {
  const prefix = deps.sessionPrefix ?? CONDUCTOR_SESSION_PREFIX;
  const singleTenant = deps.singleTenant === true;

  /** The box-wide visible `recoder-*` sessions, or `null` on any invoke failure. */
  async function visibleSessions(): Promise<readonly string[] | null> {
    const res = await deps.client.invoke({ op: 'sessions', input: {} });
    if (!res.ok) {
      deps.logger?.warn('dmux grid: sessions unavailable — degrading to no hint', {
        reason: res.reason,
        ...(res.code ? { code: res.code } : {}),
      });
      return null;
    }
    const sessions = (res.value as { sessions?: unknown })?.sessions;
    if (!Array.isArray(sessions)) return [];
    return sessions.filter((name): name is string => typeof name === 'string');
  }

  return {
    async available(): Promise<boolean> {
      const res = await deps.client.invoke({ op: 'availability', input: {} });
      if (!res.ok) return false;
      return (res.value as { available?: unknown })?.available === true;
    },

    async attachHint(input): Promise<GroupAttachHint | null> {
      const sessions = await visibleSessions();
      if (sessions === null) return null;
      // Intersect the box-wide visible sessions with THIS group — never surfaces
      // another tenant's sessions even before the attach-command gate.
      const group = new Set(input.groupSessionNames.filter((s) => s.startsWith(prefix)));
      const intersected = sessions.filter((name) => group.has(name));

      if (!singleTenant) {
        // Shared/prod: tenant-safe visibleSessions only — the box-wide console
        // attach line is withheld (it would render every tenant's sessions).
        return { visibleSessions: intersected };
      }

      const attach = await deps.client.invoke({
        op: 'attach-command',
        input: { repoPath: input.repoPath },
      });
      if (!attach.ok) {
        deps.logger?.warn('dmux grid: attach-command unavailable — hint without attach line', {
          reason: attach.reason,
        });
        return { visibleSessions: intersected };
      }
      const command = (attach.value as { command?: unknown })?.command;
      return typeof command === 'string' && command.trim()
        ? { visibleSessions: intersected, attachCommand: command }
        : { visibleSessions: intersected };
    },

    async arrangeGrid(input): Promise<GroupGridArrangement | null> {
      const worktrees = input.worktrees.filter(
        (w: GroupWorktree) => typeof w.worktreePath === 'string' && w.worktreePath.trim(),
      );
      if (worktrees.length === 0) return null; // no honest grid to build

      const session = `${GROUP_SESSION_PREFIX}${input.taskGroup}`;
      const built = await deps.layout.buildWorktreeGrid({ session, worktrees });
      if (!built.ok) {
        deps.logger?.warn('dmux grid: buildWorktreeGrid failed — no arrangement', {
          reason: built.reason,
          ...(built.code ? { code: built.code } : {}),
        });
        return null;
      }

      // The grid is a fresh detached operator session; its own sessionName is the
      // only tenant-safe "visible session" we can assert without a box-wide read.
      const arrangement: GroupGridArrangement = {
        sessionName: built.value.session,
        worktreePaths: built.value.worktreePaths,
        paneCount: built.value.worktreePaths.length,
        layout: 'agent-grid',
        visibleSessions: [built.value.session],
      };
      return arrangement;
    },
  };
}
