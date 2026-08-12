/**
 * The conductor `recoder_converge_refan` MCP tool — the SECOND-ROUND re-fan verb
 * (LOOM-ROADMAP.md build-now #6). It takes a FIRST-round fan-out's converged
 * `recoder/converge-<id>` branch as the NEW base and fans a NARROWED task to N fresh
 * agents again, auto-converging into a new reviewable branch linked to round 1. The
 * heavy lifting lives in the pure {@link ReFanService}; this tool is the thin, GOVERNED
 * binding, mirroring the swarm-unblock tool's owner-scoped posture:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd
 *    handler param), NEVER a free-form `args.userId`. Absent a caller the tool refuses
 *    (`AUTH_REQUIRED`). The gate principal carries the caller's real org/scopes, and
 *    every downstream launch/compose self-gates under it.
 *  - OWNERSHIP: a re-fan reads a prior convergence keyed on a shared `taskGroup`. The
 *    tool resolves that convergence's composed workspace and, for a non-privileged
 *    caller, REFUSES (403) a group it does not own — so this never becomes a
 *    cross-tenant re-fan oracle. An `admin`/`internal` caller re-fans across tenants.
 *    A group with NO prior convergence is a truthful REFUSAL (no fabricated base),
 *    byte-shaped like the service's own refusal — never a launch off `main`.
 *  - VALIDATION: `agentKinds` is validated against the KNOWN set (native + fallback),
 *    deduped, and clamped to [{@link MIN_FANOUT_AGENTS}, {@link MAX_FANOUT_AGENTS}].
 *  - TRUTHFULNESS: the {@link ReFanResult} flows straight back — the round-1 link, the
 *    new group, and `converged:null` (+ reason) whenever the second round's fan-out
 *    truthfully reports <2 done or a compose that could not build the branch.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Workspace } from '@recoder/agent-os';
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import {
  KNOWN_AGENT_KINDS,
  MIN_FANOUT_AGENTS,
  MAX_FANOUT_AGENTS,
} from '../fanout/converge-fanout.service.js';
import type { ReFanInput, ReFanResult } from '../fanout/re-fan.service.js';

/**
 * The narrow module seam this tool binds to: ownership resolution over the prior
 * convergence (`resolvePriorConvergence`) plus the composed re-fan entrypoint. Kept
 * minimal so the tool composes against a contract, not the whole conductor.
 */
export interface ConductorReFanSurface {
  /**
   * Resolve the composed convergence workspace for a first-round `taskGroup`, or
   * `null` when the group has no prior convergence. Used for the OWNERSHIP gate; the
   * service re-resolves the branch/provenance itself.
   */
  resolvePriorConvergence(taskGroup: string): Promise<Workspace | null>;
  reFan(input: ReFanInput): Promise<ReFanResult>;
}

/** A fail-fast validation error (bad tool input; no re-fan started). */
interface ToolInputError {
  readonly error: string;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Does the caller carry an elevated scope that may act across tenants? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** Require an authorized caller identity — absent ⇒ `AUTH_REQUIRED` (never guess a tenant). */
function requireCaller(caller: McpToolCaller | undefined): McpToolCaller {
  if (!caller || !str(caller.userId)) {
    throw createError(
      ErrorCode.AUTH_REQUIRED,
      'conductor: no authorized caller identity'
    );
  }
  return caller;
}

/** Does the authorized caller own the workspace (by `createdBy` or matching org tenant)? */
function callerOwnsWorkspace(
  caller: McpToolCaller,
  workspace: Workspace
): boolean {
  const authUserId = str(caller.userId);
  if (authUserId && workspace.createdBy === authUserId) return true;
  const orgId = str(caller.orgId);
  return Boolean(orgId && workspace.tenant?.orgId === orgId);
}

/** Build the gate principal from the host-authorized caller (never a forged scope). */
function principalOf(caller: McpToolCaller): Principal {
  return {
    userId: str(caller.userId)!,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
    scopes: caller.scopes ?? ['read', 'write'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
}

/**
 * Validate + normalize the requested `agentKinds`: each must be a KNOWN kind, the set
 * is deduped (preserving order), and the count is clamped to
 * [{@link MIN_FANOUT_AGENTS}, {@link MAX_FANOUT_AGENTS}]. Returns the normalized list,
 * or a fail-fast {@link ToolInputError}. Mirrors the fan-out tool's validation.
 */
function parseAgentKinds(raw: unknown): readonly string[] | ToolInputError {
  if (!Array.isArray(raw)) {
    return { error: 'agentKinds must be an array of agent kinds' };
  }
  const seen = new Set<string>();
  const kinds: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.trim().length === 0) continue;
    const kind = entry.trim();
    if (!KNOWN_AGENT_KINDS.includes(kind)) {
      return {
        error: `unknown agent kind '${kind}' (known: ${KNOWN_AGENT_KINDS.join(', ')})`,
      };
    }
    if (seen.has(kind)) continue;
    seen.add(kind);
    kinds.push(kind);
  }
  if (kinds.length < MIN_FANOUT_AGENTS) {
    return {
      error: `agentKinds needs ≥${MIN_FANOUT_AGENTS} distinct known kinds (got ${kinds.length})`,
    };
  }
  return kinds.slice(0, MAX_FANOUT_AGENTS);
}

function isToolInputError(r: unknown): r is ToolInputError {
  return typeof r === 'object' && r !== null && 'error' in r;
}

/** Read the optional per-pane settle budget (positive integer ms), or `undefined`. */
function parseSettleTimeoutMs(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.floor(raw);
}

/**
 * Build the governed `recoder_converge_refan` MCP tool bound to the re-fan surface.
 * Kept SEPARATE from the other tool builders so its single registration is explicit
 * at the composer.
 */
export function buildConductorReFanTools(
  surface: ConductorReFanSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_converge_refan',
      description:
        "SECOND-ROUND re-fan: take a prior fan-out's converged branch (recoder/converge-<id>) as the NEW base and fan a NARROWED task to N fresh agents again, then auto-converge into a new reviewable branch linked to round 1. Args: taskGroup (required — the FIRST-round group whose convergence is the base), narrowedTask (required), agentKinds (required, 2..6 distinct kinds from: " +
        KNOWN_AGENT_KINDS.join(', ') +
        '), repoPath (required), spaceId (required), projectId (required), taskId (optional), settleTimeoutMs (optional), memory (optional — relevant context carried into each pane). Scoped to groups the caller owns (admin/internal re-fan across tenants). Truthful: a group with NO prior convergence is refused (never a fabricated base); the second round follows the shipped fan-out — <2 panes settled ⇒ converged:null with a reason, never a fabricated branch.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);

        const taskGroup = str(body.taskGroup);
        if (!taskGroup) return { error: 'taskGroup is required' };
        const narrowedTask = str(body.narrowedTask);
        if (!narrowedTask) return { error: 'narrowedTask is required' };
        const repoPath = str(body.repoPath);
        if (!repoPath) return { error: 'repoPath is required' };
        const spaceId = str(body.spaceId);
        if (!spaceId) return { error: 'spaceId is required' };
        const projectId = str(body.projectId);
        if (!projectId) return { error: 'projectId is required' };

        const agentKinds = parseAgentKinds(body.agentKinds);
        if (isToolInputError(agentKinds)) return agentKinds;

        // OWNERSHIP FIRST — never disclose (or re-fan) another tenant's convergence.
        // Unknown/never-converged group ⇒ truthful refusal (no fabricated base);
        // known-but-unowned ⇒ 403 (no cross-tenant oracle).
        const prior = await surface.resolvePriorConvergence(taskGroup);
        if (!prior) {
          return {
            refused: true,
            priorTaskGroup: taskGroup,
            reason: `no prior converged branch exists for task group '${taskGroup}' — nothing to re-fan from (run recoder_converge_fanout first)`,
          } satisfies ReFanResult;
        }
        if (!isPrivileged(authorized) && !callerOwnsWorkspace(authorized, prior)) {
          throw createError(
            ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
            'conductor: caller may only re-fan task groups it owns'
          );
        }

        const taskId = str(body.taskId);
        const memory = str(body.memory);
        const settleTimeoutMs = parseSettleTimeoutMs(body.settleTimeoutMs);
        const input: ReFanInput = {
          taskGroup,
          narrowedTask,
          agentKinds,
          repoPath,
          spaceId,
          projectId,
          actor: principalOf(authorized),
          ...(taskId ? { taskId } : {}),
          ...(memory ? { memory } : {}),
          ...(settleTimeoutMs !== undefined ? { settleTimeoutMs } : {}),
        };
        return surface.reFan(input);
      },
    },
  ];
}
