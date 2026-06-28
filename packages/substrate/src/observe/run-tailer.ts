/**
 * run-tailer — stream a running agent's terminal output into the control-plane
 * RunEvent log (the audit trail + UI/A2A source). Design §4.7.
 *
 * Promoted substrate-pure from docker-backend/src/conductor/run-tailer.ts: it
 * polls the INJECTED substrate's capture()/alive()/exitCode() (not tmux
 * directly), emits `started` → `log` (incremental, capped delta) → terminal
 * `completed`/`failed` through an injected RunEventSink port, and uses injected
 * clock/id ports so the emission sequence is deterministically testable.
 *
 * Behavior is identical to the proven backend tailer: same 3s interval, same
 * 30-minute safety stop, same prefix-diff delta + 8000-char cap, same exit-code
 * → completed(0)/failed(non-zero) discrimination, same idempotency per
 * workspace, same "session gone = no exit code → completed" default.
 */
import type { RunEvent, RunEventType } from '@recoder/agent-os';
import type { SubstrateHandle } from '../contract/index.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { IdPort } from '../ports/id.port.js';
import type { LoggerPort } from '../ports/logger.port.js';
import type { RunEventSink } from './event-sink.port.js';
import { TailRegistry, type TailHandle } from './tail-registry.js';
import { computeDelta, MAX_DELTA_CHARS } from './delta.js';

/** Default poll interval — promoted from the backend tailer (3s). */
export const DEFAULT_INTERVAL_MS = 3000;
/** Default safety stop for a runaway tail — promoted from the backend tailer (30m). */
export const DEFAULT_MAX_MS = 30 * 60 * 1000;
/** Lines captured per tick — promoted from the backend tailer (2000). */
export const CAPTURE_LINES = 2000;

/**
 * The substrate surface the tailer polls. A subset of ConductorSubstrate plus
 * the optional `exitCode` completion-detail method (which the package contract
 * keeps optional — the run-tailer degrades to "session gone = completed(0)"
 * when a substrate cannot report a true exit code).
 */
export interface TailSubstrate {
  capture(handle: SubstrateHandle, lines?: number): Promise<string | null>;
  alive(handle: SubstrateHandle): Promise<boolean>;
  exitCode?(handle: SubstrateHandle): Promise<number | null | undefined>;
}

export interface RunTailInput {
  workspaceId: string;
  taskId: string;
  runId: string;
  agentId?: string;
  /** Session/handle ref hosting the agent (e.g. tmux session name). */
  sessionName: string;
  worktreePath?: string;
  intervalMs?: number;
  maxMs?: number;
  /** Per-tick delta cap (defaults to MAX_DELTA_CHARS). */
  maxDeltaChars?: number;
}

export interface RunTailerDeps {
  /** The substrate hosting the agent (already resolved by the caller/engine). */
  substrate: TailSubstrate;
  /** Where lifecycle RunEvents are emitted (backend injects the repository sink). */
  sink: RunEventSink;
  /** Active-tails registry (idempotency + stop handles). */
  registry: TailRegistry;
  clock: ClockPort;
  id: IdPort;
  logger: LoggerPort;
}

/** eventId convention preserved from the backend tailer: event_<runId>_<type>_<ms>. */
function eventId(runId: string, suffix: string, nowMs: number): string {
  return `event_${runId}_${suffix}_${nowMs}`;
}

function handleFor(input: RunTailInput): SubstrateHandle {
  // ref = workspaceId (orchestrator session id); sessionName = tmux session name.
  return { ref: input.workspaceId, sessionName: input.sessionName, worktreePath: input.worktreePath };
}

/**
 * Start tailing a run. Emits `started`, then `log` events for new output, and a
 * terminal `completed` when the session ends (or `failed` on non-zero exit or
 * max-time stop). Idempotent per workspace; returns a stop handle.
 */
export function startRunTail(input: RunTailInput, deps: RunTailerDeps): TailHandle {
  const existing = deps.registry.get(input.workspaceId);
  if (existing) return existing;

  const { substrate, sink, registry, clock, id, logger } = deps;
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxMs = input.maxMs ?? DEFAULT_MAX_MS;
  const maxDeltaChars = input.maxDeltaChars ?? MAX_DELTA_CHARS;
  const startedAtMs = clock.nowMs();
  let lastCapture = '';
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const handle: TailHandle = {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      registry.delete(input.workspaceId);
    },
  };
  registry.set(input.workspaceId, handle);

  const appendEvent = async (
    type: RunEventType,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> => {
    const event: RunEvent = {
      eventId: eventId(input.runId, type, clock.nowMs()),
      type,
      taskId: input.taskId,
      runId: input.runId,
      agentId: input.agentId,
      message,
      createdAt: clock.now(),
      data,
    };
    try {
      await sink.append(event);
    } catch (err) {
      logger.warn('appendEvent failed', { workspaceId: input.workspaceId, err });
    }
  };

  // id is part of the deps contract for parity with the engine's RunEvent
  // factory; the run-tailer's eventId convention is runId+type+ms (stable,
  // ordered), so the random id is reserved for future correlation needs.
  void id;

  void appendEvent('started', `Run started on session ${input.sessionName}`, {
    sessionName: input.sessionName,
  });

  const subHandle = handleFor(input);

  const tick = async (): Promise<void> => {
    if (stopped) return;

    const pane = await substrate.capture(subHandle, CAPTURE_LINES);
    if (pane !== null && pane !== lastCapture) {
      const { delta } = computeDelta(lastCapture, pane, maxDeltaChars);
      lastCapture = pane;
      if (delta) {
        await appendEvent('log', delta, { source: 'tmux' });
      }
    }

    const alive = await substrate.alive(subHandle);
    if (!alive) {
      // Check the true exit code (upgrade over "session gone = done") —
      // distinguishes success (exit 0 → completed) from crash (non-zero → failed).
      const code = substrate.exitCode ? await substrate.exitCode(subHandle) : undefined;
      if (code !== undefined && code !== null && code !== 0) {
        await appendEvent('failed', `Agent session exited with code ${code}`, {
          sessionName: input.sessionName,
          exitCode: code,
        });
      } else {
        await appendEvent('completed', 'Agent session ended', {
          sessionName: input.sessionName,
          exitCode: code ?? 0,
        });
      }
      handle.stop();
      return;
    }
    if (clock.nowMs() - startedAtMs > maxMs) {
      await appendEvent('failed', `Run tail stopped after max duration (${maxMs}ms)`, {
        reason: 'max_duration',
      });
      handle.stop();
      return;
    }
    timer = setTimeout(() => void tick(), intervalMs);
  };

  timer = setTimeout(() => void tick(), intervalMs);
  logger.info('run tail started', {
    workspaceId: input.workspaceId,
    runId: input.runId,
    session: input.sessionName,
  });
  return handle;
}

/** Stop a workspace's active tail (no-op if none). */
export function stopRunTail(registry: TailRegistry, workspaceId: string): void {
  registry.stop(workspaceId);
}

/** Number of active tails in the registry. */
export function activeTailCount(registry: TailRegistry): number {
  return registry.count();
}
