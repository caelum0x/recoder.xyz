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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RunEvent, RunEventType } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger';

const exec = promisify(execFile);
const logger = createLogger('conductor:tail');

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_MAX_MS = 30 * 60 * 1000; // safety stop for runaway tails
const MAX_DELTA_CHARS = 8000;

export interface RunTailInput {
  workspaceId: string;
  taskId: string;
  runId: string;
  agentId?: string;
  /** tmux session name hosting the agent (e.g. recoder-ws_...). */
  sessionName: string;
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

async function capture(sessionName: string): Promise<string | null> {
  try {
    const { stdout } = await exec('tmux', ['capture-pane', '-p', '-t', sessionName, '-S', '-2000'], {
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null; // session gone or tmux unavailable
  }
}

async function sessionAlive(sessionName: string): Promise<boolean> {
  try {
    await exec('tmux', ['has-session', '-t', sessionName]);
    return true;
  } catch {
    return false;
  }
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

  const tick = async (): Promise<void> => {
    if (stopped) return;

    const pane = await capture(input.sessionName);
    if (pane !== null && pane !== lastCapture) {
      const delta = pane.startsWith(lastCapture) ? pane.slice(lastCapture.length) : pane;
      lastCapture = pane;
      const trimmed = delta.trim();
      if (trimmed) {
        await appendEvent(input, 'log', trimmed.slice(-MAX_DELTA_CHARS), { source: 'tmux' });
      }
    }

    const alive = await sessionAlive(input.sessionName);
    if (!alive) {
      await appendEvent(input, 'completed', 'Agent session ended', { sessionName: input.sessionName });
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
