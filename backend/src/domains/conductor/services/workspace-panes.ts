/**
 * Workspace panes — the TERMINAL `panes(sessionId)` read model (RECODER-MODULES
 * §TERMINAL): a pure projection of the engines domain's read-only tmux
 * introspection (`TmuxIntrospectPort.listPanes`) into the workspace detail view,
 * so the API surfaces which panes exist in a workspace's tmux session, which is
 * active, and what command runs in each.
 *
 * DEGRADE-TRUTHFUL LAW (mirrors the attention probe in `buildWorkspaceView`):
 *
 *  - no introspect port wired / no session name ⇒ `undefined` — the facet is
 *    OMITTED (not probed), never fabricated;
 *  - introspect reports `{ ok:false }` or throws ⇒ a truthful warn + `undefined`
 *    — a MISSING signal, never an empty lie;
 *  - `ok([])` ⇒ `[]` — the session was OBSERVED and genuinely has no panes,
 *    deliberately distinct from `undefined`.
 *
 * This function never rejects; it is the only pane seam the conductor owns, and
 * it is read-only by construction (the introspect port carries no mutations).
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  TmuxIntrospectPort,
  TmuxPane,
} from '../../engines/adapters/cli/tmux-introspect.adapter.js';

/** One live pane of a workspace's tmux session (mirrors `TmuxPane` field-for-field). */
export interface WorkspacePaneView {
  /** tmux pane id (`%0`, `%1`, …) — stable while the pane lives. */
  readonly id: string;
  /** Pane index within its window. */
  readonly index: number;
  /** PID of the pane's root process. */
  readonly pid: number;
  /** Whether this is the session's active (focused) pane. */
  readonly active: boolean;
  /** The command currently running in the pane (`claude`, `zsh`, …). */
  readonly command: string;
  /** The pane's current working directory. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly title?: string;
}

/**
 * Read the live panes of one workspace session through the injected introspect
 * port. `undefined` ⇒ the facet could not be truthfully probed (omit it);
 * `[]` ⇒ the session was observed with no panes.
 */
export async function readWorkspacePanes(
  introspect: TmuxIntrospectPort | undefined,
  sessionName: string | undefined,
  log: Logger
): Promise<readonly WorkspacePaneView[] | undefined> {
  if (!introspect || !sessionName) return undefined;
  try {
    const res = await introspect.listPanes(sessionName);
    if (!res.ok) {
      // Missing signal, not a fabricated one — the facet stays absent.
      log.warn(
        { sessionName, reason: res.reason, ...(res.code ? { code: res.code } : {}) },
        'pane probe unavailable — omitting panes facet'
      );
      return undefined;
    }
    return res.value.map(toPaneView);
  } catch (err) {
    log.warn({ err, sessionName }, 'pane probe faulted — omitting panes facet');
    return undefined;
  }
}

/** Project one tmux pane record into the view shape (immutably, field-for-field). */
function toPaneView(pane: TmuxPane): WorkspacePaneView {
  return {
    id: pane.id,
    index: pane.index,
    pid: pane.pid,
    active: pane.active,
    command: pane.command,
    path: pane.path,
    width: pane.width,
    height: pane.height,
    ...(pane.title !== undefined ? { title: pane.title } : {}),
  };
}
