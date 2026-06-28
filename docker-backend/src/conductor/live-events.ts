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
}

export class WorkspaceEventStream {
  private readonly workspaceId: string;
  private readonly intervalMs: number;
  private readonly maxMs: number;
  private readonly handlers: WorkspaceEventStreamHandlers;
  private lastSeenEventId: string | undefined;
  private startedAt = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(workspaceId: string, options: WorkspaceEventStreamOptions = {}) {
    this.workspaceId = workspaceId;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.maxMs = options.maxMs ?? DEFAULT_MAX_MS;
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

    let newest = this.lastSeenEventId;
    for (const event of events) {
      if (this.lastSeenEventId === undefined) { newest = event.eventId; continue; }
      if (event.eventId === this.lastSeenEventId) { newest = event.eventId; continue; }
      newest = event.eventId;
      try { this.handlers.onEvent?.(event); } catch { /* */ }
    }
    this.lastSeenEventId = newest;

    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }
}

export function attachWorkspaceStream(ws: WebSocket, workspaceId: string): () => void {
  const send = (payload: unknown): void => {
    if (ws.readyState !== ws.OPEN) return;
    try { ws.send(JSON.stringify(payload)); } catch { /* */ }
  };

  const stream = new WorkspaceEventStream(workspaceId, {
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
