import type { LogFrame, TextFrame, ThinkingFrame } from '../../contracts/driver-frame';

type DebounceableFrame = TextFrame | ThinkingFrame;

/**
 * Coalesce streaming token deltas into rate-limited `log` frames so we do not emit one
 * RunEvent per token. Flushes when the buffer reaches `maxChars` or `flushIntervalMs`
 * elapses. Pure-state: callers drive it with `push`/`flush`; no timers are owned here,
 * keeping it deterministic and testable.
 */
export class FrameDebouncer {
  private buffer = '';
  private kind: DebounceableFrame['kind'] = 'text';
  private lastFlushAt = 0;

  constructor(
    private readonly options: { maxChars?: number; flushIntervalMs?: number } = {},
  ) {}

  /** Add a delta. Returns a coalesced log frame if a flush boundary was crossed. */
  push(frame: DebounceableFrame, nowMs: number): LogFrame | null {
    if (frame.kind !== this.kind && this.buffer.length > 0) {
      const flushed = this.flush();
      this.kind = frame.kind;
      this.buffer = frame.text;
      this.lastFlushAt = nowMs;
      return flushed;
    }

    this.kind = frame.kind;
    this.buffer += frame.text;
    if (this.lastFlushAt === 0) this.lastFlushAt = nowMs;

    const maxChars = this.options.maxChars ?? 512;
    const interval = this.options.flushIntervalMs ?? 250;
    if (this.buffer.length >= maxChars || nowMs - this.lastFlushAt >= interval) {
      const flushed = this.flush();
      this.lastFlushAt = nowMs;
      return flushed;
    }
    return null;
  }

  /** Force-flush any buffered text (call at terminal state). */
  flush(): LogFrame | null {
    if (this.buffer.length === 0) return null;
    const message = this.buffer;
    const kind = this.kind;
    this.buffer = '';
    return { kind: 'log', message, level: 'debug', data: { delta: kind } };
  }
}
