/**
 * `InProcLogStore` + `logsEngineBinder` — the REAL in-process capability behind
 * the advertised `recoder.logs` MCP server (`logs.append` / `logs.stream` /
 * `logs.search` / `logs.attach`). Before this binder those four tools sat in the
 * gated catalog with NO in-proc executor, so every call failed truthfully with
 * "No in-proc executor wired".
 *
 * The store is a bounded FIFO ring of structured log records an agent appends to
 * and reads back — genuine capability, never a fabricated result. It is
 * self-contained (no external service), degrade-safe (bounded memory, never
 * throws for a full ring), and runtime-owned (the composer constructs ONE and
 * passes its binder into the interop-gated host). Every call still traverses
 * interop's `authorize → risk → execute → audit` gate at the host boundary.
 *
 * `@recoder/agent-mcp` ships the `logsMcpServer` REGISTRATION only (no register
 * fn), so — exactly like `github`/`repo` — this binder registers the four handlers
 * directly on the shared router over the `logsMcpServer` descriptor.
 */
import { logsMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolResult } from '@recoder/agent-mcp';

/** Default ring capacity — bounded so the store never grows unbounded. */
export const DEFAULT_LOG_RING_CAPACITY = 2000;

/** A structured log record kept in the ring. */
export interface LogEntry {
  readonly seq: number;
  readonly time: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly runId?: string;
  readonly domain?: string;
  readonly kind?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** Query filter for `search` / `stream`. */
export interface LogQuery {
  readonly query?: string;
  readonly level?: LogEntry['level'];
  readonly runId?: string;
  readonly limit?: number;
}

/**
 * A bounded FIFO ring of structured log records. `append` is O(1); `recent`/
 * `search` return defensive copies. A monotonically increasing `seq` gives every
 * record a stable id an agent can page from.
 */
export class InProcLogStore {
  private readonly buf: LogEntry[] = [];
  private seq = 0;

  constructor(private readonly capacity: number = DEFAULT_LOG_RING_CAPACITY) {}

  append(entry: Omit<LogEntry, 'seq' | 'time'> & { time?: string }): LogEntry {
    const record: LogEntry = {
      seq: ++this.seq,
      time: entry.time ?? new Date().toISOString(),
      level: entry.level,
      message: entry.message,
      ...(entry.runId ? { runId: entry.runId } : {}),
      ...(entry.domain ? { domain: entry.domain } : {}),
      ...(entry.kind ? { kind: entry.kind } : {}),
      ...(entry.fields ? { fields: entry.fields } : {}),
    };
    this.buf.push(record);
    if (this.buf.length > this.capacity) this.buf.shift();
    return record;
  }

  /** The last `limit` records (newest last), optionally scoped to a run. */
  recent(runId?: string, limit = 100): readonly LogEntry[] {
    const scoped = runId ? this.buf.filter((r) => r.runId === runId) : this.buf;
    const n = Math.max(0, Math.min(limit, scoped.length));
    return scoped.slice(scoped.length - n);
  }

  /** Filter by substring/level/run — a truthful (possibly empty) match set. */
  search(q: LogQuery): readonly LogEntry[] {
    const needle = q.query?.trim().toLowerCase();
    const limit = clampLimit(q.limit, 100, 500);
    const matches: LogEntry[] = [];
    // Newest-first scan so `limit` keeps the most recent matches.
    for (let i = this.buf.length - 1; i >= 0 && matches.length < limit; i--) {
      const record = this.buf[i] as LogEntry;
      if (q.runId && record.runId !== q.runId) continue;
      if (q.level && record.level !== q.level) continue;
      if (needle && !record.message.toLowerCase().includes(needle)) continue;
      matches.push(record);
    }
    return matches.reverse();
  }

  get size(): number {
    return this.buf.length;
  }
}

/**
 * The MCP binder: registers `logs.append` / `logs.stream` / `logs.search` /
 * `logs.attach` over the {@link InProcLogStore}. Missing required fields throw a
 * truthful Error the interop host records; nothing is ever fabricated.
 */
export function logsEngineBinder(store: InProcLogStore): (router: McpToolRouter) => void {
  return (router) => {
    router.register(logsMcpServer, 'logs.append', (input): McpToolResult => {
      const args = input.args ?? {};
      const message = readRequiredString(args.message ?? args.msg, 'logs.append requires args.message');
      const record = store.append({
        level: readLevel(args.level),
        message,
        ...(readString(args.runId) ? { runId: readString(args.runId) as string } : {}),
        ...(readString(args.domain) ? { domain: readString(args.domain) as string } : {}),
        ...(readRecord(args.fields) ? { fields: readRecord(args.fields) } : {}),
      });
      return { content: { ok: true, seq: record.seq, time: record.time, size: store.size }, metadata: { engine: 'logs' } };
    });

    router.register(logsMcpServer, 'logs.stream', (input): McpToolResult => {
      const args = input.args ?? {};
      const runId = readString(args.runId) ?? input.task?.taskId;
      const records = store.recent(runId, clampLimit(args.limit, 100, 500));
      return { content: { records, count: records.length, size: store.size }, metadata: { engine: 'logs' } };
    });

    router.register(logsMcpServer, 'logs.search', (input): McpToolResult => {
      const args = input.args ?? {};
      const matches = store.search({
        ...(readString(args.query) ? { query: readString(args.query) as string } : {}),
        ...(readLevelOrUndefined(args.level) ? { level: readLevelOrUndefined(args.level) } : {}),
        ...(readString(args.runId) ? { runId: readString(args.runId) as string } : {}),
        ...(readNumber(args.limit) != null ? { limit: readNumber(args.limit) as number } : {}),
      });
      return { content: { matches, count: matches.length }, metadata: { engine: 'logs' } };
    });

    router.register(logsMcpServer, 'logs.attach', (input): McpToolResult => {
      const args = input.args ?? {};
      const runId = readRequiredString(args.runId, 'logs.attach requires args.runId');
      const ref = readRequiredString(args.ref ?? args.url ?? args.name, 'logs.attach requires args.ref (url/name)');
      // An attachment is recorded as a structured `attach` log record scoped to the
      // run, so it is discoverable via `logs.stream`/`logs.search` for that run.
      const record = store.append({
        level: 'info',
        kind: 'attach',
        message: `attachment: ${ref}`,
        runId,
        fields: {
          ref,
          ...(readString(args.note) ? { note: readString(args.note) } : {}),
          ...(readString(args.kind) ? { attachmentKind: readString(args.kind) } : {}),
        },
      });
      return { content: { ok: true, seq: record.seq, runId, ref }, metadata: { engine: 'logs' } };
    });
  };
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = readNumber(value);
  if (n == null || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function readLevel(value: unknown): LogEntry['level'] {
  return readLevelOrUndefined(value) ?? 'info';
}

function readLevelOrUndefined(value: unknown): LogEntry['level'] | undefined {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : undefined;
}

function readRequiredString(value: unknown, errorMessage: string): string {
  const result = readString(value);
  if (!result) throw new Error(errorMessage);
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
