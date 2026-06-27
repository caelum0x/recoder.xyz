/**
 * Conductor run-tailer — stream a running agent's terminal output into the
 * control-plane RunEvent log (the audit trail + UI/A2A source).
 *
 * Polls the tmux pane DIRECTLY (so it is correct independent of the orchestrator's
 * in-memory map), appends `log` events for new output, and emits a terminal
 * `completed` event when the tmux session ends. Truthful: it reports what the
 * terminal actually shows; it never fabricates progress.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (RunEvent tailing).
 */
import type { RunEvent, RunEventType, WorkspaceSubstrate } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger';
import { getSubstrate, type SubstrateHandle } from './substrate.js';

const logger = createLogger('conductor:tail');

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_MAX_MS = 30 * 60 * 1000; // safety stop for runaway tails
const MAX_DELTA_CHARS = 8000;

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

const active = new Map<string, TailHandle>();

function eventId(runId: string, suffix: string): string {
  return `event_${runId}_${suffix}_${Date.now()}`;
}

async function appendEvent(
  input: RunTailInput,
  type: RunEventType,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const event: RunEvent = {
    eventId: eventId(input.runId, type),
    type,
    taskId: input.taskId,
    runId: input.runId,
    agentId: input.agentId,
    message,
    createdAt: new Date().toISOString(),
    data,
  };
  try {
    await agentOsContainer.repository.appendEvent(event);
  } catch (err) {
    logger.warn({ workspaceId: input.workspaceId, err }, 'appendEvent failed');
  }
}

function handleFor(input: RunTailInput): SubstrateHandle {
  // ref = workspaceId (orchestrator session id); sessionName = tmux session name.
  return { ref: input.workspaceId, sessionName: input.sessionName, worktreePath: input.worktreePath };
}

/**
 * Start tailing a run. Emits `started`, then `log` events for new output, and a
 * terminal `completed` when the session ends (or `failed` on max-time stop).
 * Idempotent per workspace; returns a stop handle.
 */
export function startRunTail(input: RunTailInput): TailHandle {
  if (active.has(input.workspaceId)) return active.get(input.workspaceId)!;

  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxMs = input.maxMs ?? DEFAULT_MAX_MS;
  const startedAt = Date.now();
  let lastCapture = '';
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const handle: TailHandle = {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      active.delete(input.workspaceId);
    },
  };
  active.set(input.workspaceId, handle);

  void appendEvent(input, 'started', `Run started on session ${input.sessionName}`, {
    sessionName: input.sessionName,
  });

  const substrate = getSubstrate(input.substrate);
  const subHandle = handleFor(input);

  const tick = async (): Promise<void> => {
    if (stopped) return;

    const pane = await substrate.capture(subHandle, 2000);
    if (pane !== null && pane !== lastCapture) {
      const delta = pane.startsWith(lastCapture) ? pane.slice(lastCapture.length) : pane;
      lastCapture = pane;
      const trimmed = delta.trim();
      if (trimmed) {
        await appendEvent(input, 'log', trimmed.slice(-MAX_DELTA_CHARS), { source: 'tmux' });
      }
    }

    const alive = await substrate.alive(subHandle);
    if (!alive) {
      // Check the true exit code (upgrade over "session gone = done") —
      // distinguishes success (exit 0 → completed) from crash (non-zero → failed).
      const code = substrate.exitCode ? await substrate.exitCode(subHandle) : undefined;
      if (code !== undefined && code !== null && code !== 0) {
        await appendEvent(input, 'failed', `Agent session exited with code ${code}`, {
          sessionName: input.sessionName,
          exitCode: code,
        });
      } else {
        await appendEvent(input, 'completed', 'Agent session ended', {
          sessionName: input.sessionName,
          exitCode: code ?? 0,
        });
      }
      handle.stop();
      return;
    }
    if (Date.now() - startedAt > maxMs) {
      await appendEvent(input, 'failed', `Run tail stopped after max duration (${maxMs}ms)`, { reason: 'max_duration' });
      handle.stop();
      return;
    }
    timer = setTimeout(() => void tick(), intervalMs);
  };

  timer = setTimeout(() => void tick(), intervalMs);
  logger.info({ workspaceId: input.workspaceId, runId: input.runId, session: input.sessionName }, 'run tail started');
  return handle;
}

export function stopRunTail(workspaceId: string): void {
  active.get(workspaceId)?.stop();
}

export function activeTailCount(): number {
  return active.size;
}
