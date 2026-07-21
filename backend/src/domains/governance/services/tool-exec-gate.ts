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
 * Project raw tool args to a secret-free string for enforcement. Drops keys whose
 * NAME looks like a credential and keeps only scalar values — the kernel's
 * forbidden-path / risk classifier needs the shape (command/path), never the
 * secret VALUES, and the audit row records only the projected length.
 */
export function describeToolInput(rawArgs: unknown): string {
  if (rawArgs == null) return '';
  if (typeof rawArgs === 'string') return rawArgs;
  if (typeof rawArgs !== 'object') return String(rawArgs);
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawArgs as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
  }
  try {
    return JSON.stringify(safe);
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
