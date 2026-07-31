/**
 * `createRunEventSink` — the fan-out {@link RunEventSinkPort} the run-tailer emits
 * through. ONE emission, two consumers (domain doc §6):
 *  - DURABLE: the injected repository's `appendEvent` (the audit trail / source of
 *    record), gated by `persistDurably`. It is skipped when an EXTERNAL durable
 *    sink (the agent-os RunEvent bus) already writes the same event to the SAME
 *    state-of-record store — otherwise every tailed event would be duplicated
 *    (P1 #8). Direct control-plane writers still persist via `repository.appendEvent`.
 *  - LIVE: the `/sync` publisher, which streams state changes + log deltas to the
 *    clients attached to that workspace's terminal.
 *
 * DEGRADE-SAFE: a durable-append failure is logged and swallowed so the live
 * stream still flows (and vice-versa) — a single sink fault never drops the whole
 * event or crashes the tailer. The workspace id is resolved from the RunEvent's
 * `data.workspaceId` (the tailer stamps it); absent, the live fan-out is skipped
 * truthfully rather than published to the wrong workspace.
 */
import type { RunEvent } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { WorkspaceRepositoryPort } from '../ports/workspace-repository.port.js';
import type { RunEventSinkPort, WorkspaceSyncEvent } from '../ports/index.js';

export interface RunEventSinkDeps {
  readonly repository: WorkspaceRepositoryPort;
  /**
   * Whether THIS sink durably appends the event to the repository. `false` when an
   * external durable sink (the agent-os bus) already persists it to the same
   * state-of-record store, so the local sink stays live-only and never duplicates.
   * Defaults to `true` (the sink is the sole durable writer).
   */
  readonly persistDurably?: boolean;
  /** The live `/sync` publisher (from the terminal surface). */
  readonly publish: (event: WorkspaceSyncEvent) => void;
  /**
   * OPTIONAL full-RunEvent publisher for `/workspaces/:id/stream` (the
   * conductor-ui client consumes bare RunEvents there). Absent ⇒ only the
   * narrowed `/sync` fan-out runs.
   */
  readonly publishRun?: (workspaceId: string, event: RunEvent) => void;
  readonly logger: Logger;
}

/** Build the durable+live RunEvent sink. */
export function createRunEventSink(deps: RunEventSinkDeps): RunEventSinkPort {
  const { repository, publish, publishRun, logger } = deps;
  const persistDurably = deps.persistDurably ?? true;
  return {
    async append(event: RunEvent): Promise<void> {
      if (persistDurably) {
        try {
          await repository.appendEvent(event);
        } catch (err) {
          logger.error({ err, eventId: event.eventId }, 'conductor run-event durable append failed');
        }
      }
      const workspaceId = resolveWorkspaceId(event);
      if (!workspaceId) return;
      try {
        publish(toSyncEvent(workspaceId, event));
      } catch (err) {
        logger.error({ err, eventId: event.eventId }, 'conductor run-event live publish failed');
      }
      if (!publishRun) return;
      try {
        publishRun(workspaceId, event);
      } catch (err) {
        logger.error({ err, eventId: event.eventId }, 'conductor run-event stream publish failed');
      }
    },
  };
}

/** The workspace this event belongs to, as stamped by the tailer, or undefined. */
function resolveWorkspaceId(event: RunEvent): string | undefined {
  const raw = event.data?.workspaceId;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/** Project a RunEvent onto the narrow `/sync` shape (state vs log delta). */
function toSyncEvent(workspaceId: string, event: RunEvent): WorkspaceSyncEvent {
  const at = event.createdAt ?? new Date().toISOString();
  if (event.message !== undefined) {
    return { workspaceId, kind: 'log', text: event.message, at };
  }
  return { workspaceId, kind: 'log', text: `[${event.type}]`, at };
}
