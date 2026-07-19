/**
 * `coordination-engine` — the agent-os MCP surface over the Multica coordination
 * fabric (squad leader-routing + per-member work-locks). It is the control-plane
 * COMPANION to the engines-domain `multica.*` tools (raw squad CRUD): these tools
 * expose the DERIVED coordination view the control plane reasons about —
 *
 *   READ (read-mostly, subject-bound):
 *     - `coordination_squad_routing` — squad routing introspection (leaders + members)
 *     - `coordination_status`        — work-lock / coordination status (who is busy)
 *     - `coordination_conflicts`     — conflict-detection status (contended issues)
 *   WRITE (governance-gated):
 *     - `coordination_request_reroute` — ask a squad leader to re-evaluate routing
 *       for a contended issue. Runs the injected governance gate FIRST; a
 *       deny/needs_approval returns a truthful `{ ok:false, effect, reason }`.
 *
 * SECURITY — CALLER BINDING (cross-tenant class CLOSED): the Multica coordination
 * state is the platform's OWN squad fabric (a single backend workspace configured
 * via `MULTICA_WORKSPACE_ID`), NOT per-customer rows — so there is no tenant
 * partition to leak here. We still REFUSE an anonymous caller (`AUTH_REQUIRED`):
 * every tool binds to the host-authorized {@link McpToolCaller} so the gate that
 * already ran `authorize→risk→policy→audit` is never bypassed, and the write
 * attributes the governed action to the caller's identity.
 *
 * DEGRADE-SAFE: when Multica is absent (no `MULTICA_URL`; the Go server needs
 * PG15) each read returns the seam's truthful `{ available:false, reason }` and
 * the write `{ routed:false, reason }` — never a faked squad, lock, or route.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { CoordinationEnginePort } from '../ports/coordination-engine.port.js';
import type { AgentOsGovernanceGate } from '../adapters/governance-gate.adapter.js';

/** The governed action string the reroute write declares to the gate. */
const REROUTE_ACTION = 'agent-os.coordination.reroute';

export interface CoordinationMcpDeps {
  readonly engine: CoordinationEnginePort;
  /** The domain governance gate — the reroute write gate-checks before routing. */
  readonly gate: AgentOsGovernanceGate;
  readonly logger: Logger;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Require an authenticated host caller. The coordination fabric is infra-level
 * (not tenant-partitioned), so binding is an anonymous-refusal, not a per-space
 * filter — but it MUST NOT be skippable. Absent a caller ⇒ `AUTH_REQUIRED`.
 */
function requireCaller(caller: McpToolCaller | undefined): McpToolCaller {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'coordination: no authorized caller identity');
  }
  return caller;
}

export function buildCoordinationMcpTools(deps: CoordinationMcpDeps): readonly McpToolRegistration[] {
  const { engine, gate, logger } = deps;
  return [
    {
      name: 'coordination_squad_routing',
      description:
        'Squad routing introspection: list Multica squads with their leader and member counts ' +
        '(where work would route). Read-only; truthful degrade when the engine is absent.',
      handler: async (_raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        return engine.routingStatus();
      },
    },
    {
      name: 'coordination_status',
      description:
        'Work-lock / coordination status: per squad member, whether they hold an active-task lock ' +
        "(working), are available (idle), or unroutable (unstable/offline). Read-only.",
      handler: async (_raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        return engine.coordinationStatus();
      },
    },
    {
      name: 'coordination_conflicts',
      description:
        'Conflict-detection status: issues actively held by two or more agents at once ' +
        '(contended assignments the coordinator should re-balance). Read-only.',
      handler: async (_raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        return engine.conflictStatus();
      },
    },
    {
      name: 'coordination_request_reroute',
      description:
        'Ask the squad leader to re-evaluate routing for a contended issue (mutating, governed). ' +
        'Requires issueId. Runs the governance gate first; truthful when denied or when the engine is down.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const bound = requireCaller(caller);
        const args = (raw ?? {}) as Record<string, unknown>;
        const issueId = str(args.issueId);
        if (!issueId) return { ok: false, error: 'issueId is required' };
        const reason = str(args.reason);

        const decision = await gate.guard(REROUTE_ACTION, {
          ownerId: bound.userId,
          target: { toolName: REROUTE_ACTION },
          metadata: { via: 'mcp', issueId, ...(reason ? { reason } : {}) },
        });
        if (!decision.allowed) {
          return {
            ok: false,
            effect: decision.effect,
            reason: decision.reason,
            ...(decision.approvalId ? { approvalId: decision.approvalId } : {}),
          };
        }

        const result = await engine.requestReroute({ issueId, ...(reason ? { reason } : {}) });
        if (!result.routed) {
          logger.info({ issueId, reason: result.reason }, 'coordination: reroute not routed (degrade-safe)');
          return { ok: false, routed: false, reason: result.reason, issueId };
        }
        return { ok: true, routed: true, issueId: result.issueId ?? issueId };
      },
    },
  ];
}
