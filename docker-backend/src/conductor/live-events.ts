/**
 * Conductor live-events — WebSocket real-time event streaming for workspaces.
 *
 * Polls listWorkspaceEvents at a fixed interval, tracks the last-seen eventId to
 * only emit new events, and forwards them as JSON over a WebSocket.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (RunEvent tailing / live surface).
 */
import type { WebSocket } from 'ws';
import type { RunEvent } from '@recoder/agent-os';
import { createLogger } from '../logger.js';
import { listWorkspaceEvents } from './workspace-service.js';

const logger = createLogger('conductor:live');

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_MAX_MS = 30 * 60 * 1000;

export interface WorkspaceEventStreamHandlers {
  onEvent?(event: RunEvent): void;
  onError?(err: Error): void;
  onComplete?(): void;
}

export interface WorkspaceEventStreamOptions extends WorkspaceEventStreamHandlers {
  intervalMs?: number;
  maxMs?: number;
  /**
   * When true, the first poll REPLAYS the run-so-far: every event already
   * persisted for the workspace is emitted before live tailing begins. This is
   * what a cockpit/xterm/board needs — a client attaching to a run that is
   * already in flight (or just finished) must render the existing RunEvents, not
   * wait for the next new one. `attachWorkspaceStream` (the cockpit socket path)
   * opts in. Defaults to false (baseline-only: live tail of just newly-appended
   * events) so a bare `WorkspaceEventStream` stays a low-noise lifecycle watcher.
   */
  replayBacklog?: boolean;
}

export class WorkspaceEventStream {
  private readonly workspaceId: string;
  private readonly intervalMs: number;
  private readonly maxMs: number;
  private readonly replayBacklog: boolean;
  private readonly handlers: WorkspaceEventStreamHandlers;
  /**
   * Stable delta cursor. The repository is append-only (in-memory push order /
   * PG `order by created_at asc`, filtered by runId preserving order), so the
   * count of already-emitted events is a robust head position — unlike keying on
   * a single last-seen id, this never silently drops a batch of events appended
   * between two polls, and it advances monotonically. Seen ids are also tracked
   * as a belt-and-suspenders guard against any out-of-order/duplicate read.
   */
  private emittedCount = 0;
  private readonly seenEventIds = new Set<string>();
  private firstTick = true;
  private startedAt = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(workspaceId: string, options: WorkspaceEventStreamOptions = {}) {
    this.workspaceId = workspaceId;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.maxMs = options.maxMs ?? DEFAULT_MAX_MS;
    this.replayBacklog = options.replayBacklog ?? false;
    this.handlers = { onEvent: options.onEvent, onError: options.onError, onComplete: options.onComplete };
  }

  start(): void {
    if (this.stopped) return;
    this.startedAt = Date.now();
    logger.info({ workspaceId: this.workspaceId }, 'workspace event stream started');
    this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    try { this.handlers.onComplete?.(); } catch { /* */ }
  }

  get isRunning(): boolean { return !this.stopped; }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    if (Date.now() - this.startedAt > this.maxMs) { this.stop(); return; }

    let events: RunEvent[];
    try {
      events = await listWorkspaceEvents(this.workspaceId);
    } catch (err) {
      this.handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), this.intervalMs);
      return;
    }

    // First tick with replay disabled: baseline silently to the current head so
    // only events appended AFTER attach are delivered (live-only watcher mode).
    if (this.firstTick && !this.replayBacklog) {
      this.firstTick = false;
      this.emittedCount = events.length;
      for (const e of events) this.seenEventIds.add(e.eventId);
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), this.intervalMs);
      return;
    }
    this.firstTick = false;

    // Emit every event past the head cursor (the run-so-far on the first replay
    // poll, then each newly-appended event on subsequent polls). The seen-id set
    // guards against re-emitting an event if a read ever returns out of order.
    for (let i = this.emittedCount; i < events.length; i += 1) {
      const event = events[i];
      if (this.seenEventIds.has(event.eventId)) continue;
      this.seenEventIds.add(event.eventId);
      try { this.handlers.onEvent?.(event); } catch { /* */ }
    }
    if (events.length > this.emittedCount) this.emittedCount = events.length;

    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }
}

export function attachWorkspaceStream(ws: WebSocket, workspaceId: string): () => void {
  const send = (payload: unknown): void => {
    if (ws.readyState !== ws.OPEN) return;
    try { ws.send(JSON.stringify(payload)); } catch { /* */ }
  };

  // The cockpit board/xterm attaches to render the run. Replay the run-so-far on
  // connect (default) so a client joining a live or just-finished run sees the
  // existing RunEvents immediately, then receives each new one as it is appended.
  const stream = new WorkspaceEventStream(workspaceId, {
    replayBacklog: true,
    onEvent: (event) => send({ type: 'event', event }),
    onError: (err) => send({ type: 'error', message: err.message }),
    onComplete: () => send({ type: 'complete' }),
  });

  const onWsClose = (): void => cleanup();
  const onWsError = (): void => cleanup();
  ws.on('close', onWsClose);
  ws.on('error', onWsError);
  stream.start();

  function cleanup(): void {
    ws.off('close', onWsClose);
    ws.off('error', onWsError);
    stream.stop();
  }
  return cleanup;
}
