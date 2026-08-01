/**
 * `RunEventRing` — the pure, per-workspace bounded replay buffer behind the
 * `/sync` + `/workspaces/:id/stream` resume path (DT-7.3).
 *
 * The live fan-out ({@link SyncHub}) keeps no history, so a client that drops its
 * socket loses every frame sent while it was gone. This ring closes that gap
 * WITHOUT changing the wire: each fanned frame is stamped with a monotonic
 * per-workspace `eventId` (1, 2, 3, …) and retained in a bounded window (the
 * oldest is evicted once the window is full), so a reconnecting client can ask
 * for everything newer than the last id it saw and then resume the live stream.
 *
 * It is intentionally free of `ws`, sockets, and I/O so the ring logic is a
 * self-contained, deterministically testable unit. Ids are monotonic for the
 * lifetime of a workspace entry and never rewind, even after eviction, so a stale
 * `sinceId` from a long-disconnected client can never collide with a newer frame.
 */

/** A single buffered frame plus the monotonic id stamped onto it. */
export interface RingEntry {
  /** Monotonic, per-workspace, 1-based sequence id of this frame. */
  readonly eventId: number;
  /** The exact payload that was fanned out (stored by reference, never mutated). */
  readonly payload: unknown;
}

export class RunEventRing {
  /** Bounded window of retained frames, per workspace (oldest-first). */
  private readonly buffers = new Map<string, RingEntry[]>();
  /** Last id assigned per workspace; survives eviction so ids never rewind. */
  private readonly cursors = new Map<string, number>();
  private readonly capacity: number;

  /**
   * @param capacity Max frames retained per workspace. Must be a positive
   * integer; the ring never grows past it (oldest frames are evicted).
   */
  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`RunEventRing capacity must be a positive integer, got ${String(capacity)}`);
    }
    this.capacity = capacity;
  }

  /**
   * Stamp `payload` with the next monotonic id for `workspaceId`, retain it in the
   * bounded window (evicting the oldest if full), and return the assigned id.
   */
  append(workspaceId: string, payload: unknown): number {
    const eventId = (this.cursors.get(workspaceId) ?? 0) + 1;
    this.cursors.set(workspaceId, eventId);

    let buffer = this.buffers.get(workspaceId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(workspaceId, buffer);
    }
    buffer.push({ eventId, payload });
    if (buffer.length > this.capacity) {
      buffer.splice(0, buffer.length - this.capacity);
    }
    return eventId;
  }

  /**
   * The retained frames strictly newer than `sinceId`, oldest-first. A `sinceId`
   * of 0 (or below the oldest retained id) yields the whole retained window; a
   * `sinceId` at/after the latest yields an empty list. Returns a fresh array of
   * the stored entries — callers never see the internal buffer.
   */
  since(workspaceId: string, sinceId: number): readonly RingEntry[] {
    const buffer = this.buffers.get(workspaceId);
    if (!buffer || buffer.length === 0) return [];
    const out: RingEntry[] = [];
    for (const entry of buffer) {
      if (entry.eventId > sinceId) out.push(entry);
    }
    return out;
  }

  /** The highest id assigned for this workspace (0 if none seen yet). */
  lastEventId(workspaceId: string): number {
    return this.cursors.get(workspaceId) ?? 0;
  }

  /**
   * The oldest id still retained (0 if empty). A resuming client whose `sinceId`
   * is below this saw its buffer partially evicted — a truthful history gap the
   * caller can surface rather than silently claiming completeness.
   */
  oldestRetainedId(workspaceId: string): number {
    const buffer = this.buffers.get(workspaceId);
    return buffer && buffer.length > 0 ? buffer[0]!.eventId : 0;
  }

  /** Count of frames currently retained for this workspace. */
  size(workspaceId: string): number {
    return this.buffers.get(workspaceId)?.length ?? 0;
  }
}
