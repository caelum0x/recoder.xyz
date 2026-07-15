/**
 * `createRunEventSink` — the fan-out {@link RunEventSinkPort} the run-tailer emits
 * through. ONE emission, two consumers (domain doc §6):
 *  - DURABLE: the injected repository's `appendEvent` (the audit trail / live
 *    terminal source of record).
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
  /** The live `/sync` publisher (from the terminal surface). */
  readonly publish: (event: WorkspaceSyncEvent) => void;
  readonly logger: Logger;
}

/** Build the durable+live RunEvent sink. */
export function createRunEventSink(deps: RunEventSinkDeps): RunEventSinkPort {
  const { repository, publish, logger } = deps;
  return {
    async append(event: RunEvent): Promise<void> {
      try {
        await repository.appendEvent(event);
      } catch (err) {
        logger.error({ err, eventId: event.eventId }, 'conductor run-event durable append failed');
      }
      const workspaceId = resolveWorkspaceId(event);
      if (!workspaceId) return;
      try {
        publish(toSyncEvent(workspaceId, event));
      } catch (err) {
        logger.error({ err, eventId: event.eventId }, 'conductor run-event live publish failed');
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
