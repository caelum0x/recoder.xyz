/**
 * Shared helpers for the daemon adapters' MCP tool surfaces. Each daemon engine
 * registers its OWN in-proc MCP server (like the `engines` server) — a standalone
 * `McpServerRegistration` + `McpToolRegistration[]` the composer seeds into the
 * gated host with `registerServer` + `registerInProcTool`. Every tool call still
 * traverses interop's `authorize → risk → execute → audit` gate at the host
 * boundary, so these handlers stay thin: validate input, invoke the typed
 * `EngineClientPort`, and surface the truthful `InvokeResult`.
 */
import type { EngineCall, EngineClientPort } from '../../../ports/engine-client.port.js';
import type { InvokeResult } from '../../../types.js';

/** The minimal engine surface an MCP tool builder needs (just `invoke`). */
export type Invoker<TReq> = Pick<EngineClientPort<TReq, unknown>, 'invoke'>;

/**
 * Run one engine op and flatten the discriminated `InvokeResult` into the plain
 * object MCP tools return: the value on success, or a truthful
 * `{ error, code? }` on failure (never a thrown exception across the seam).
 */
export async function runOp<TReq>(
  engine: Invoker<TReq>,
  op: string,
  input: TReq,
  timeoutMs?: number,
): Promise<unknown> {
  const call: EngineCall<TReq> = timeoutMs !== undefined ? { op, input, timeoutMs } : { op, input };
  const result: InvokeResult<unknown> = await engine.invoke(call);
  if (result.ok) {
    return result.value === undefined ? { ok: true } : result.value;
  }
  return result.code ? { error: result.reason, code: result.code } : { error: result.reason };
}

/** Read a trimmed non-empty string from unknown MCP args, else undefined. */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Read a finite integer from unknown MCP args, else undefined. */
export function readInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/** Read a boolean from unknown MCP args, else undefined. */
export function readBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Coerce unknown MCP args to a record (empty object when not an object). */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
