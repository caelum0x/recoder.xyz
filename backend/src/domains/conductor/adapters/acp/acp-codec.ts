/**
 * ACP wire codec — the framing + JSON-RPC 2.0 shapes for the Agent Client
 * Protocol (agentclientprotocol.com, the protocol claude-code-acp / codex-acp
 * speak). ACP is newline-delimited JSON (ndjson) over the agent process's stdio:
 * one JSON-RPC message per line, `\n`-terminated.
 *
 * This module is PURE — no process, no stream, no I/O. The driver owns the child
 * process and pumps bytes through {@link decodeAcpStream} / {@link encodeAcpMessage};
 * keeping the wire logic here makes it unit-testable without spawning anything.
 * Degrade-truthful: a blank or malformed line is SKIPPED (never a throw), and a
 * partial trailing line is returned as `rest` for the next chunk to complete.
 */

export const ACP_JSONRPC_VERSION = '2.0';

/** A method call expecting a response (has an `id`). */
export interface AcpRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: unknown;
}

/** A one-way message (no `id`, no response). */
export interface AcpNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

/** JSON-RPC error object. */
export interface AcpError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** A response to a request — exactly one of `result` / `error`. */
export interface AcpResponse {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly result?: unknown;
  readonly error?: AcpError;
}

export type AcpMessage = AcpRequest | AcpNotification | AcpResponse;

/** Standard JSON-RPC error codes the driver reuses. */
export const AcpErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

// --- constructors ------------------------------------------------------------

export function makeRequest(id: number | string, method: string, params?: unknown): AcpRequest {
  return { jsonrpc: ACP_JSONRPC_VERSION, id, method, ...(params !== undefined ? { params } : {}) };
}

export function makeNotification(method: string, params?: unknown): AcpNotification {
  return { jsonrpc: ACP_JSONRPC_VERSION, method, ...(params !== undefined ? { params } : {}) };
}

export function makeResponse(id: number | string, result: unknown): AcpResponse {
  return { jsonrpc: ACP_JSONRPC_VERSION, id, result };
}

export function makeError(id: number | string, code: number, message: string, data?: unknown): AcpResponse {
  return { jsonrpc: ACP_JSONRPC_VERSION, id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

// --- type guards -------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** A JSON-RPC id is a string or an integer number (never null for our traffic). */
function isId(v: unknown): v is number | string {
  return typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
}

export function isAcpRequest(msg: AcpMessage): msg is AcpRequest {
  return 'id' in msg && 'method' in msg;
}

export function isAcpNotification(msg: AcpMessage): msg is AcpNotification {
  return !('id' in msg) && 'method' in msg;
}

export function isAcpResponse(msg: AcpMessage): msg is AcpResponse {
  return 'id' in msg && !('method' in msg);
}

/** Validate + narrow one parsed JSON value into an AcpMessage, or null. */
export function asAcpMessage(value: unknown): AcpMessage | null {
  if (!isObj(value) || value.jsonrpc !== ACP_JSONRPC_VERSION) {
    return null;
  }
  const hasId = isId(value.id);
  const hasMethod = typeof value.method === 'string';
  if (hasMethod && hasId) {
    return { jsonrpc: '2.0', id: value.id as number | string, method: value.method as string, params: value.params };
  }
  if (hasMethod) {
    return { jsonrpc: '2.0', method: value.method as string, params: value.params };
  }
  if (hasId && ('result' in value || 'error' in value)) {
    const err = value.error;
    return {
      jsonrpc: '2.0',
      id: value.id as number | string,
      ...('error' in value && isObj(err)
        ? { error: { code: Number(err.code) || AcpErrorCode.InternalError, message: String(err.message ?? ''), data: err.data } }
        : { result: value.result }),
    };
  }
  return null;
}

// --- framing -----------------------------------------------------------------

/** Encode one message as an ndjson line (JSON + trailing newline). */
export function encodeAcpMessage(msg: AcpMessage): string {
  return `${JSON.stringify(msg)}\n`;
}

/**
 * Split a raw stdout chunk (possibly appended to leftover bytes) into complete
 * ACP messages, returning any incomplete trailing line as `rest`. Blank lines
 * and lines that don't parse to a valid JSON-RPC message are skipped (a noisy
 * agent that prints a stray log line never breaks the stream).
 */
export function decodeAcpStream(chunk: string): { messages: AcpMessage[]; rest: string } {
  const lines = chunk.split('\n');
  // The last element is the trailing partial (empty when chunk ended on '\n').
  const rest = lines.pop() ?? '';
  const messages: AcpMessage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const msg = asAcpMessage(parsed);
    if (msg != null) {
      messages.push(msg);
    }
  }
  return { messages, rest };
}
