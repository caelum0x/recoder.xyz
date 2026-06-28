/**
 * IpcEnvelope — the typed wire contract between the TS daemon-client and the
 * owned Rust governance daemon.
 *
 * This is the SINGLE pinned shape both sides serialize. The Rust transport uses
 * `serde_json` + `tokio` with the identical struct (tagged by `kind`/`method`),
 * so this file is the canonical reference for the wire format. The codec
 * (`codec.ts`) frames a serialized envelope as `4-byte big-endian length + JSON`
 * — a real length-prefixed JSON-line transport, no CBOR / heavy dep on either
 * side.
 *
 * HOSTILE-BY-DEFAULT: every field that crosses the wire is treated as untrusted.
 * `parseResponseEnvelope` validates the shape and the method allow-list; an
 * unknown method, a missing field, or a wrong type is rejected — never coerced.
 */

/** The fixed set of methods the daemon answers. Anything else is rejected. */
export const IPC_METHODS = [
  'decide',
  'enforceTool',
  'route',
  'recordAudit',
  'verifyAudit',
  'health',
] as const;

export type IpcMethod = (typeof IPC_METHODS)[number];

const IPC_METHOD_SET: ReadonlySet<string> = new Set(IPC_METHODS);

/** Narrowing guard for a method string arriving off the wire. */
export function isIpcMethod(value: unknown): value is IpcMethod {
  return typeof value === 'string' && IPC_METHOD_SET.has(value);
}

/**
 * IpcRequestEnvelope — a client -> daemon call. `id` correlates the response;
 * `params` is method-specific and is validated by the daemon, never trusted.
 */
export type IpcRequestEnvelope = {
  readonly kind: 'request';
  /** Monotonic per-connection correlation id. */
  readonly id: number;
  readonly method: IpcMethod;
  /** Protocol version; the daemon rejects an unknown major. */
  readonly protocol: 1;
  readonly params: unknown;
};

/**
 * IpcResponseEnvelope — a daemon -> client reply. Exactly one of `result` or
 * `error` is meaningful; `ok` disambiguates. A malformed reply (both/neither,
 * unknown method echoed, bad id) is treated as a daemon failure -> fail closed.
 */
export type IpcResponseEnvelope =
  | {
      readonly kind: 'response';
      readonly id: number;
      readonly method: IpcMethod;
      readonly protocol: 1;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly kind: 'response';
      readonly id: number;
      readonly method: IpcMethod;
      readonly protocol: 1;
      readonly ok: false;
      readonly error: IpcError;
    };

/** A structured error surfaced by the daemon. */
export type IpcError = {
  readonly code: string;
  readonly message: string;
};

export const IPC_PROTOCOL_VERSION = 1 as const;

/** Build a request envelope (the only place the client mints the shape). */
export function makeRequestEnvelope(id: number, method: IpcMethod, params: unknown): IpcRequestEnvelope {
  return { kind: 'request', id, method, protocol: IPC_PROTOCOL_VERSION, params };
}

/**
 * parseResponseEnvelope — validate an untrusted decoded JSON value as a
 * well-formed response envelope. Returns `null` on ANY violation; the caller
 * MUST treat null as a daemon failure (fail closed), never as a tacit allow.
 *
 * Validation is total: it checks the literal `kind`, the protocol version, the
 * method allow-list, the numeric id, the boolean `ok`, and that exactly the
 * matching payload field (`result` xor `error`) is present and well-shaped.
 */
export function parseResponseEnvelope(value: unknown): IpcResponseEnvelope | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;

  if (v.kind !== 'response') return null;
  if (v.protocol !== IPC_PROTOCOL_VERSION) return null;
  if (typeof v.id !== 'number' || !Number.isInteger(v.id) || v.id < 0) return null;
  if (!isIpcMethod(v.method)) return null;
  if (typeof v.ok !== 'boolean') return null;

  if (v.ok === true) {
    if (!('result' in v)) return null;
    if ('error' in v && v.error !== undefined) return null;
    return {
      kind: 'response',
      id: v.id,
      method: v.method,
      protocol: IPC_PROTOCOL_VERSION,
      ok: true,
      result: v.result,
    };
  }

  // ok === false -> must carry a well-shaped error.
  const err = v.error;
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Record<string, unknown>;
  if (typeof e.code !== 'string' || typeof e.message !== 'string') return null;
  return {
    kind: 'response',
    id: v.id,
    method: v.method,
    protocol: IPC_PROTOCOL_VERSION,
    ok: false,
    error: { code: e.code, message: e.message },
  };
}
