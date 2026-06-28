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

/** RunEventSink backed by the agent-os repository (the audit-trail of record). */
const repositorySink: RunEventSink = {
  async append(event: RunEvent): Promise<void> {
    await agentOsContainer.repository.appendEvent(event);
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
