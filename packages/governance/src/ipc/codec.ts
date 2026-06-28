/**
 * codec — the length-prefixed JSON-line frame format on the governance UDS.
 *
 * WIRE FORMAT (pinned; the Rust transport MUST match byte-for-byte):
 *
 *   ┌────────────────────────┬──────────────────────────────┐
 *   │ 4 bytes  big-endian u32 │ N bytes  UTF-8 JSON payload   │
 *   │ = N (payload length)    │ (no trailing newline)         │
 *   └────────────────────────┴──────────────────────────────┘
 *
 * The length prefix counts ONLY the JSON payload bytes, not the prefix itself.
 * On Rust: `write_u32::<BigEndian>(json.len())` then `write_all(json)`; read is
 * the symmetric `read_u32::<BigEndian>()` then `read_exact(n)`.
 *
 * HOSTILE-BY-DEFAULT:
 *  - A frame larger than `MAX_FRAME_BYTES` is rejected before allocation, so a
 *    malicious length prefix cannot drive an unbounded buffer.
 *  - JSON.parse failure is a decode error, never a silent empty value.
 *  - The decoder is a pure streaming function over an accumulated Buffer; it
 *    never trusts that a length prefix is followed by that many bytes (it waits).
 *
 * No external dependency: Node `Buffer` + `JSON` only.
 */

/** Bytes used by the length prefix. */
export const LENGTH_PREFIX_BYTES = 4;

/**
 * Maximum payload size accepted on a single frame (8 MiB). A governance call is
 * tiny; anything larger is treated as hostile and rejected without allocating.
 */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

/** Raised when a frame violates the wire contract. The caller fails closed. */
export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameError';
    Object.setPrototypeOf(this, FrameError.prototype);
  }
}

/**
 * encodeFrame — serialize a value to its length-prefixed frame.
 * Throws FrameError if the payload would exceed MAX_FRAME_BYTES.
 */
export function encodeFrame(value: unknown): Buffer {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch (err) {
    throw new FrameError(`encodeFrame: value is not JSON-serializable: ${(err as Error).message}`);
  }
  if (json === undefined) {
    // JSON.stringify(undefined) === undefined; refuse to frame an empty payload.
    throw new FrameError('encodeFrame: value serialized to undefined');
  }
  const payload = Buffer.from(json, 'utf8');
  if (payload.length > MAX_FRAME_BYTES) {
    throw new FrameError(`encodeFrame: payload ${payload.length}B exceeds max ${MAX_FRAME_BYTES}B`);
  }
  const frame = Buffer.allocUnsafe(LENGTH_PREFIX_BYTES + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, LENGTH_PREFIX_BYTES);
  return frame;
}

/** One decode step: a parsed value plus the remaining (unconsumed) buffer. */
export type DecodeStep = {
  /** A fully-decoded JSON value, or null when more bytes are still needed. */
  readonly value: unknown | null;
  /** The buffer with the consumed frame removed (unchanged when value is null). */
  readonly rest: Buffer;
};

/**
 * decodeFrame — attempt to read ONE frame from the head of `buffer`.
 *
 * Returns `{ value: null, rest: buffer }` when the buffer does not yet hold a
 * complete frame (partial length prefix OR partial payload) — the caller should
 * accumulate more bytes and retry. Returns the decoded value and the remaining
 * bytes when a full frame is present.
 *
 * Throws FrameError on a length prefix that exceeds MAX_FRAME_BYTES (hostile)
 * or on a payload that is not valid UTF-8 JSON.
 */
export function decodeFrame(buffer: Buffer): DecodeStep {
  if (buffer.length < LENGTH_PREFIX_BYTES) {
    return { value: null, rest: buffer };
  }
  const length = buffer.readUInt32BE(0);
  if (length > MAX_FRAME_BYTES) {
    throw new FrameError(`decodeFrame: declared length ${length}B exceeds max ${MAX_FRAME_BYTES}B`);
  }
  const frameEnd = LENGTH_PREFIX_BYTES + length;
  if (buffer.length < frameEnd) {
    // Full payload has not arrived yet.
    return { value: null, rest: buffer };
  }
  const payload = buffer.subarray(LENGTH_PREFIX_BYTES, frameEnd);
  let value: unknown;
  try {
    value = JSON.parse(payload.toString('utf8'));
  } catch (err) {
    throw new FrameError(`decodeFrame: payload is not valid JSON: ${(err as Error).message}`);
  }
  return { value, rest: buffer.subarray(frameEnd) };
}

/**
 * FrameDecoder — a small stateful accumulator for stream data. Push raw chunks;
 * it yields each complete frame's decoded value in order. It bounds its own
 * backlog: if accumulated bytes exceed the prefix + MAX_FRAME_BYTES while still
 * incomplete, it throws (a peer that sends a huge length then dribbles bytes
 * cannot pin memory).
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  /** Append a chunk and drain every complete frame it now contains. */
  push(chunk: Buffer): unknown[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const out: unknown[] = [];
    for (;;) {
      const step = decodeFrame(this.buffer);
      if (step.value === null) {
        // Guard against an unbounded incomplete backlog.
        if (this.buffer.length > LENGTH_PREFIX_BYTES + MAX_FRAME_BYTES) {
          throw new FrameError('FrameDecoder: incomplete backlog exceeds bound');
        }
        break;
      }
      out.push(step.value);
      this.buffer = step.rest;
    }
    return out;
  }

  /** Bytes currently buffered (for diagnostics / tests). */
  pending(): number {
    return this.buffer.length;
  }

  /** Reset the accumulator (e.g. after a reconnect). */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
