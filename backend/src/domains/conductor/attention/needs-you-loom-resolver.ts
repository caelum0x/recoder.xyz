/**
 * `createNeedsYouLoomResolver` — the pane→workspace attribution seam for the Needs-You
 * bridge (LOOM-ROADMAP.md build-now #4). A raw Loom `pane.agent_status_changed` edge
 * carries only `{ pane_id, agent_status }`; this resolver maps that `pane_id` to the
 * OWNING Recoder workspace (id, agent kind, owner, task group) so the queue is attributed
 * truthfully — a pane it cannot map is `null` (dropped), never guessed.
 *
 * Attribution is authoritative-record-first: the Loom `session.snapshot` gives
 * `pane_id → workspace_id` (Loom stores the RECODER workspace id at `worktree.create`),
 * and the Recoder workspace RECORD supplies the durable kind/owner/task-group — never the
 * prompt-injectable pane text. The pane index is refreshed from `session.snapshot` on a
 * cache MISS (rate-limited by {@link NeedsYouResolverDeps.refreshIntervalMs}) so a burst of
 * unknown panes cannot hammer the daemon.
 */
import type { AgentStatus } from '@recoder/agent-runtimes/loom';
import type { Workspace } from '@recoder/agent-os';
import type { LoggerPort } from '@recoder/substrate';
import type { NeedsYouEvent } from './needs-you-queue.service.js';
import type { LoomStatusResolver } from './needs-you-loom-stream.js';

/** One row of the Loom pane index: a pane and the Recoder workspace it belongs to. */
export interface LoomPaneRow {
  readonly paneId: string;
  readonly workspaceId: string;
}

export interface NeedsYouResolverDeps {
  /** Load the current `pane_id → workspaceId` rows (bind to Loom `session.snapshot`). */
  loadPanes(): Promise<readonly LoomPaneRow[]>;
  /** Fetch the durable Recoder workspace record (for kind/owner/taskGroup), or `null`. */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** Minimum ms between `session.snapshot` refreshes on a cache miss (default 1000). */
  readonly refreshIntervalMs?: number;
  /** Injected clock for the refresh rate-limit (default `Date.now`). */
  readonly now?: () => number;
  readonly logger?: LoggerPort;
}

const DEFAULT_REFRESH_INTERVAL_MS = 1_000;
const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readTaskGroup(workspace: Workspace): string | null {
  const meta = workspace.metadata as Record<string, unknown> | undefined;
  const group = meta?.taskGroup;
  return typeof group === 'string' && group.length > 0 ? group : null;
}

/**
 * Build the {@link LoomStatusResolver}. Attributes a pane edge to its Recoder workspace
 * (kind/owner/taskGroup from the durable record); returns `null` when the pane is not a
 * live, mappable Recoder workspace — never a fabricated attribution.
 */
export function createNeedsYouLoomResolver(
  deps: NeedsYouResolverDeps
): LoomStatusResolver {
  const logger = deps.logger ?? NOOP_LOGGER;
  const now = deps.now ?? (() => Date.now());
  const refreshIntervalMs = deps.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;

  let index = new Map<string, string>();
  let lastRefresh = Number.NEGATIVE_INFINITY;

  async function refresh(): Promise<void> {
    lastRefresh = now();
    try {
      const rows = await deps.loadPanes();
      const next = new Map<string, string>();
      for (const row of rows) {
        if (row.paneId && row.workspaceId) next.set(row.paneId, row.workspaceId);
      }
      index = next;
    } catch (err) {
      // A snapshot fault leaves the LAST index in place (stale, not fabricated); the
      // bridge drops this edge and a later edge retries once the interval elapses.
      logger.warn('needs-you resolver: session.snapshot refresh failed', {
        err: message(err),
      });
    }
  }

  return {
    async resolve(
      paneId: string,
      status: AgentStatus
    ): Promise<NeedsYouEvent | null> {
      let workspaceId = index.get(paneId);
      if (workspaceId == null && now() - lastRefresh >= refreshIntervalMs) {
        await refresh();
        workspaceId = index.get(paneId);
      }
      if (workspaceId == null) return null; // unmappable pane — dropped, never guessed

      const workspace = await deps.getWorkspace(workspaceId);
      if (workspace == null) return null; // not a known Recoder workspace — dropped

      return {
        workspaceId,
        agentKind: workspace.runtimeId,
        owner: workspace.createdBy,
        taskGroup: readTaskGroup(workspace),
        nativeStatus: status,
      };
    },
  };
}
