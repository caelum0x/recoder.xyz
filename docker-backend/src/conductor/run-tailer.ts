/**
 * Conductor run-tailer — BACKEND ADAPTER over @recoder/substrate's observe/
 * run-tailer (substrate.md §4.7 / §12 step 4).
 *
 * The polling loop, prefix-diff delta + cap, exit-code → completed/failed
 * discrimination, max-duration safety stop, and per-workspace idempotency now
 * live (substrate-pure) in the package. This file is the thin wiring: it
 * resolves the registered backend substrate, injects a RunEventSink backed by
 * the agent-os repository, holds the process-wide active-tails registry, and
 * keeps the SAME exported `startRunTail`/`stopRunTail`/`activeTailCount` names +
 * `RunTailInput` shape so workspace-service.ts and review.ts callers are
 * unchanged. The proven live tail path behaves identically.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (RunEvent tailing).
 */
import type { RunEvent, WorkspaceSubstrate } from '@recoder/agent-os';
import {
  startRunTail as startPackageRunTail,
  stopRunTail as stopPackageRunTail,
  activeTailCount as packageActiveTailCount,
  systemClock,
  uuidId,
  TailRegistry,
  type RunEventSink,
  type TailSubstrate,
  type LoggerPort,
} from '@recoder/substrate';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger';
import { getSubstrate } from './substrate.js';

const logger = createLogger('conductor:tail');

export interface RunTailInput {
  workspaceId: string;
  taskId: string;
  runId: string;
  agentId?: string;
  /** Execution substrate hosting the agent (selects capture/alive impl). */
  substrate: WorkspaceSubstrate;
  /** Session/handle ref hosting the agent (e.g. tmux session name). */
  sessionName: string;
  worktreePath?: string;
  intervalMs?: number;
  maxMs?: number;
}

interface TailHandle {
  stop(): void;
}

/** Process-wide active-tails registry (was the module-level Map here). */
const registry = new TailRegistry();

/** Bridge the package LoggerPort (message, context) to the pino-style logger. */
const loggerPort: LoggerPort = {
  info: (message, context) => logger.info(context ?? {}, message),
  warn: (message, context) => logger.warn(context ?? {}, message),
  error: (message, context) => logger.error(context ?? {}, message),
};

/**
 * Map a terminal RunEvent's message to friendly, user-facing copy.
 *
 * The substrate run-tailer (and reconcile) emit truthful-but-technical terminal
 * messages ("Agent session ended", "Agent session exited with code N", "Pane is
 * dead (status 0)"). For a LOCAL chat product those leak tmux/process internals.
 * This maps the terminal event to plain language the user understands:
 *   - completed (exit 0)      -> "Agent finished"
 *   - failed / non-zero exit  -> "Agent stopped (error)"
 * Non-terminal events (started/log/handoff/…) and any already-friendly message
 * are passed through untouched. The technical detail is preserved on `data`
 * (exitCode etc.) for the audit trail — only the human-facing `message` changes.
 */
function friendlyTerminalMessage(event: RunEvent): string | undefined {
  if (event.type === 'completed') {
    return 'Agent finished';
  }
  if (event.type === 'failed') {
    const code =
      typeof event.data?.exitCode === 'number' ? (event.data.exitCode as number) : undefined;
    // Max-duration / safety stops carry a `reason` instead of an exit code; keep
    // those as a distinct friendly line rather than a generic error.
    if (event.data?.reason === 'max_duration') {
      return 'Agent stopped (took too long)';
    }
    return code !== undefined && code !== 0
      ? `Agent stopped (error, exit ${code})`
      : 'Agent stopped (error)';
  }
  return undefined;
}

/**
 * Return a copy of the event with a friendlier user-facing message, when
 * applicable. Exported for unit testing the mapping in isolation.
 */
export function withFriendlyMessage(event: RunEvent): RunEvent {
  const friendly = friendlyTerminalMessage(event);
  if (!friendly || friendly === event.message) return event;
  // Immutable: never mutate the input event. Preserve the technical message on
  // `data.technicalMessage` so nothing is lost for debugging/audit.
  return {
    ...event,
    message: friendly,
    data: { ...(event.data ?? {}), technicalMessage: event.message },
  };
}

/** RunEventSink backed by the agent-os repository (the audit-trail of record). */
const repositorySink: RunEventSink = {
  async append(event: RunEvent): Promise<void> {
    await agentOsContainer.repository.appendEvent(withFriendlyMessage(event));
  },
};

/**
 * Start tailing a run. Emits `started`, then `log` events for new output, and a
 * terminal `completed` when the session ends (or `failed` on non-zero exit /
 * max-time stop). Idempotent per workspace; returns a stop handle.
 */
export function startRunTail(input: RunTailInput): TailHandle {
  // Resolve the registered substrate once; the package tailer polls its
  // capture/alive/exitCode (exitCode is optional on the package contract).
  const substrate = getSubstrate(input.substrate) as unknown as TailSubstrate;
  return startPackageRunTail(
    {
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      runId: input.runId,
      agentId: input.agentId,
      sessionName: input.sessionName,
      worktreePath: input.worktreePath,
      intervalMs: input.intervalMs,
      maxMs: input.maxMs,
    },
    {
      substrate,
      sink: repositorySink,
      registry,
      clock: systemClock,
      id: uuidId,
      logger: loggerPort,
    },
  );
}

export function stopRunTail(workspaceId: string): void {
  stopPackageRunTail(registry, workspaceId);
}

export function activeTailCount(): number {
  return packageActiveTailCount(registry);
}
