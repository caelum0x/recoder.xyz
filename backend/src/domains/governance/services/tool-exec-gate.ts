/**
 * `createToolExecGate` — binds the {@link ToolExecEnforcementPort} to the
 * governance gate's `enforceTool`. This is the narrow seam the engines MCP host
 * consumes: it projects the raw tool args to a SECRET-FREE input string, runs the
 * gate's deny-biased + Merkle-sealing per-tool enforcement, and maps the result
 * to the least-authority {@link ToolEnforcementOutcome}.
 *
 * FAIL-CLOSED: `gate.enforceTool` never throws a policy outcome (it returns a
 * synthetic deny on kernel fault) — but should the seam itself throw, this binder
 * still fails CLOSED to a synthetic DENY (never a fabricated allow). The audit
 * seal is performed by `enforceTool` itself; this binder adds no side channel.
 *
 * The `describeToolInput` secret-drop projection is lifted from the retired
 * `governed-sidecar.adapter.ts` (which decorated the low-level `EngineClientPort`
 * the live MCP stream does not traverse — superseded by the executor chokepoint).
 */
import type { GovernanceGate } from '../ports/gate.port.js';
import type {
  ToolExecEnforcementPort,
  ToolExecEnforceInput,
  ToolEnforcementOutcome,
} from '../ports/tool-exec-gate.port.js';
import type { ToolEnforcement } from '../types.js';

/** Keys whose NAME implies a credential — never forwarded into the kernel input. */
const SECRET_KEY_PATTERN = /key|secret|token|password|passwd|credential|auth/i;

/**
 * Bounds on the secret-free projection so a hostile/huge payload can neither
 * blow up the description string nor recurse without limit. A nested
 * `command`/`path`/`url` value is the whole point of the recursion — but a
 * multi-megabyte blob or a pathologically deep object must stay cheap.
 */
const MAX_DESCRIPTION_LEN = 8192;
const MAX_DEPTH = 6;
const MAX_STRING_LEN = 512;

/**
 * Recursively project a value into its secret-free shadow: drop secret-named
 * keys at EVERY level, keep scalars (bounded), and descend into arrays/objects
 * up to {@link MAX_DEPTH} so a nested command/path reaches the classifier.
 * Returns `undefined` for values that must not appear (too deep, non-JSON).
 */
function projectValue(value: unknown, depth: number): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string') return (value as string).slice(0, MAX_STRING_LEN);
  if (t === 'number' || t === 'boolean') return value;
  if (t !== 'object') return undefined; // functions/symbols/bigint/undefined dropped
  if (depth >= MAX_DEPTH) return undefined; // recursion cap — stops circular refs too
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const projected = projectValue(item, depth + 1);
      if (projected !== undefined) out.push(projected);
    }
    return out;
  }
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(k)) continue; // secret VALUES never leak into the description
    const projected = projectValue(v, depth + 1);
    if (projected !== undefined) safe[k] = projected;
  }
  return safe;
}

/**
 * Project raw tool args to a secret-free string for enforcement. Drops keys whose
 * NAME looks like a credential (at every nesting level) and keeps the value SHAPE
 * — the kernel's forbidden-path / risk classifier needs to see a nested
 * `command`/`path`/`url` wherever it appears, never the secret VALUES, and the
 * audit row records only the projected length. Bounded in depth and total size.
 */
export function describeToolInput(rawArgs: unknown): string {
  if (rawArgs == null) return '';
  if (typeof rawArgs === 'string') return rawArgs;
  if (typeof rawArgs !== 'object') return String(rawArgs);
  try {
    const safe = projectValue(rawArgs, 0);
    const serialized = JSON.stringify(safe);
    if (typeof serialized !== 'string') return '';
    return serialized.length > MAX_DESCRIPTION_LEN
      ? serialized.slice(0, MAX_DESCRIPTION_LEN)
      : serialized;
  } catch {
    return '';
  }
}

/** Bind the per-tool teeth from `gate.enforceTool`. */
export function createToolExecGate(gate: GovernanceGate): ToolExecEnforcementPort {
  return {
    async enforce(input: ToolExecEnforceInput): Promise<ToolEnforcementOutcome> {
      const safeInput = describeToolInput(input.rawArgs);
      let result: ToolEnforcement;
      try {
        result = await gate.enforceTool(input.toolName, safeInput, input.principal, input.ctx);
      } catch {
        // The gate is deny-biased on fault; a thrown seam still fails CLOSED.
        return {
          outcome: 'denied',
          reason: 'Governance enforcement fault — failing closed (deny).',
          degraded: true,
          engine: 'synthetic',
        };
      }
      return {
        outcome: result.outcome,
        reason: result.reason,
        degraded: result.degraded,
        engine: result.engine,
      };
    },
  };
}
