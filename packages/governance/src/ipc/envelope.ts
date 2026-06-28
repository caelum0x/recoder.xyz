/**
 * IpcEnvelope — the typed wire contract between the TS daemon-client and the
 * owned Rust governance daemon.
 *
 * This is the SINGLE pinned shape both sides serialize. The Rust daemon is the
 * SOURCE OF TRUTH for this wire (see
 * `crates/recoder-governance/recoder-governance-ipc/src/{envelope,method,dispatch}.rs`).
 * This file mirrors the daemon's `serde` structs EXACTLY so the TS client speaks
 * the daemon's real wire natively — no protocol-translation shim:
 *
 *   request  (client -> daemon):
 *     { "id": "<string>", "method": "<snake_case>", "payload": { ... }, "ts": <i64> }
 *     - `id`      — caller-chosen correlation id (a string; echoed back).
 *     - `method`  — the snake_case method name (closed set; unknown -> rejected).
 *     - `payload` — method-specific args; the shared key lives at `payload.key`
 *                   for the authenticated methods (Health needs none).
 *     - `ts`      — caller-supplied unix-millis timestamp (audit/replay only).
 *
 *   response (daemon -> client):
 *     { "id": "<string>", "ok": <bool>, "result"?: <value>, "error"?: "<string>" }
 *     - `ok:true`  carries `result`; `ok:false` carries a `error` STRING.
 *     - There is no `kind`, no `method` echo, and no `protocol` field on the wire.
 *
 * The codec (`codec.ts`) frames a serialized envelope as `4-byte big-endian
 * length + JSON` — the identical framing the Rust `transport.rs` uses.
 *
 * HOSTILE-BY-DEFAULT: every field that crosses the wire is treated as untrusted.
 * `parseResponseEnvelope` validates the shape; a missing field or a wrong type is
 * rejected — never coerced. The caller MUST treat a null parse as a daemon
 * failure (fail closed), never as a tacit allow.
 */

/**
 * The fixed set of methods the daemon answers, as the daemon's snake_case wire
 * strings (mirrors `IpcMethod` in `recoder-governance-ipc/src/method.rs`).
 * Anything else is rejected.
 */
export const IPC_METHODS = [
  'decide',
  'enforce_tool',
  'route',
  'request_approval',
  'resolve_approval',
  'record_audit',
  'verify_audit',
  'reload_config',
  'health',
] as const;

export type IpcMethod = (typeof IPC_METHODS)[number];

const IPC_METHOD_SET: ReadonlySet<string> = new Set(IPC_METHODS);

/** Narrowing guard for a method string. */
export function isIpcMethod(value: unknown): value is IpcMethod {
  return typeof value === 'string' && IPC_METHOD_SET.has(value);
}

/**
 * IpcRequestEnvelope — a client -> daemon call. `id` correlates the response;
 * `payload` is method-specific and is validated by the daemon, never trusted.
 * The shared `INTERNAL_SERVICE_KEY` (when configured) rides inside `payload.key`.
 */
export type IpcRequestEnvelope = {
  /** Caller-chosen correlation id (a string; echoed in the response). */
  readonly id: string;
  /** The snake_case method name. */
  readonly method: IpcMethod;
  /** Method-specific arguments (carries `key` for authenticated methods). */
  readonly payload: Record<string, unknown>;
  /** Caller-supplied unix-millis timestamp (audit/replay windowing only). */
  readonly ts: number;
};

/**
 * IpcResponseEnvelope — a daemon -> client reply. Exactly one of `result` or
 * `error` is meaningful; `ok` disambiguates. A malformed reply (both/neither,
 * bad id) is treated as a daemon failure -> fail closed.
 */
export type IpcResponseEnvelope =
  | {
      readonly id: string;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly id: string;
      readonly ok: false;
      /** The daemon's sanitized, secret-free error message (a string). */
      readonly error: string;
    };

/**
 * Build a request envelope (the only place the client mints the shape). The
 * caller supplies the already-merged `payload` (params + any `key`).
 */
export function makeRequestEnvelope(
  id: string,
  method: IpcMethod,
  payload: Record<string, unknown>,
  ts: number,
): IpcRequestEnvelope {
  return { id, method, payload, ts };
}

/**
 * parseResponseEnvelope — validate an untrusted decoded JSON value as a
 * well-formed daemon response envelope. Returns `null` on ANY violation; the
 * caller MUST treat null as a daemon failure (fail closed), never as a tacit
 * allow.
 *
 * Validation is total: it checks the string `id`, the boolean `ok`, and that
 * exactly the matching payload field (`result` for ok, `error` STRING for !ok)
 * is present and well-shaped. The daemon emits no `kind`/`method`/`protocol`,
 * so none are required here.
 */
export function parseResponseEnvelope(value: unknown): IpcResponseEnvelope | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;

  if (typeof v.id !== 'string' || v.id.length === 0) return null;
  if (typeof v.ok !== 'boolean') return null;

  if (v.ok === true) {
    // The daemon always sends a `result` on success (it may be `null`).
    if (!('result' in v)) return null;
    return { id: v.id, ok: true, result: v.result };
  }

  // ok === false -> must carry a non-empty error STRING.
  if (typeof v.error !== 'string' || v.error.length === 0) return null;
  return { id: v.id, ok: false, error: v.error };
}
