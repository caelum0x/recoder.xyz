/**
 * The conductor `recoder_converge_fanout` MCP tool — the HEADLINE fusion verb
 * (LOOM-ROADMAP.md §0): fan ONE task to N agents in Loom panes, wait for all to
 * settle, then auto-converge the sibling diffs into ONE governed branch. The heavy
 * lifting lives in the pure {@link ConvergeFanoutService}; this tool is the thin,
 * governed binding, mirroring the write-tool posture:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd
 *    handler param), NEVER a free-form `args.userId`. A non-privileged caller may
 *    only act as its OWN subject; only an `admin`/`internal` caller may name another
 *    subject; absent a caller the tool refuses. The gate principal carries the
 *    caller's real org/scopes (never a forged `internal`), and the DOWNSTREAM
 *    `createWorkspace` / `composeConvergence` seams self-gate under it — so a
 *    blocked verdict refuses per agent without a fabricated launch/merge.
 *  - VALIDATION: `agentKinds` is validated against the KNOWN set (native + fallback),
 *    deduped, and the count clamped to [{@link MIN_FANOUT_AGENTS},
 *    {@link MAX_FANOUT_AGENTS}] — a bad set fails fast without any launch.
 *  - TRUTHFULNESS: the {@link FanoutResult} flows straight back — per-agent
 *    `nativeStatus`/`settled`/`reason`, and `converged:null` (+ `convergeReason`)
 *    whenever fewer than 2 panes settled done or compose could not build the branch.
 */
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import {
  KNOWN_AGENT_KINDS,
  MIN_FANOUT_AGENTS,
  MAX_FANOUT_AGENTS,
  type FanoutInput,
  type FanoutRetryInput,
  type FanoutRetryResult,
  type FanoutResult,
} from '../fanout/converge-fanout.service.js';

/**
 * The narrow module seam this tool binds to: the already-governed fan-out entry.
 * Kept minimal so the tool composes against a contract, not the whole conductor.
 */
export interface ConvergeFanoutSurface {
  fanout(input: FanoutInput): Promise<FanoutResult>;
  retryFanout(input: FanoutRetryInput): Promise<FanoutRetryResult>;
}

/** A fail-fast validation error (bad tool input; no fan-out started). */
export interface ToolInputError {
  readonly ok: false;
  readonly error: string;
}

export function inputError(error: string): ToolInputError {
  return { ok: false, error };
}

/** Coerce raw MCP args to a record without trusting the shape. */
export function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Read a required non-empty string, or `null`. */
export function reqString(
  body: Record<string, unknown>,
  field: string
): string | null {
  const value = body[field];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Does the caller carry an elevated scope that may act as an arbitrary subject? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** The resolved acting tenant of the fan-out: its gate principal. */
export interface ResolvedCaller {
  readonly principal: Principal;
}

/**
 * Resolve the tenant the fan-out acts under, bound to the HOST-AUTHORIZED
 * {@link McpToolCaller} — NOT a free-form `args.userId`. A non-privileged caller may
 * only act as its OWN subject; only `admin`/`internal` may name another; absent a
 * caller the tool refuses. Mirrors the conductor write tools exactly.
 */
export function resolveCaller(
  body: Record<string, unknown>,
  caller: McpToolCaller | undefined
): ResolvedCaller | ToolInputError {
  const authUserId = caller?.userId?.trim();
  if (!caller || !authUserId) {
    return inputError('an authenticated caller identity is required');
  }
  const requested = reqString(body, 'userId');
  let userId = authUserId;
  if (requested && requested !== authUserId) {
    if (!isPrivileged(caller)) {
      return inputError('caller may only act as its own userId');
    }
    userId = requested;
  }
  const principal: Principal = {
    userId,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
    scopes: caller.scopes ?? ['read', 'write'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
  return { principal };
}

/** Type guard: did a parse/resolve step fail (a refusal, not a resolved value)? */
export function isInputError<T>(r: T | ToolInputError): r is ToolInputError {
  return (
    typeof r === 'object' && r !== null && (r as ToolInputError).ok === false
  );
}

/**
 * Validate + normalize the requested `agentKinds`: each must be a KNOWN kind, the set
 * is deduped (preserving order), and the count is clamped to
 * [{@link MIN_FANOUT_AGENTS}, {@link MAX_FANOUT_AGENTS}]. Returns the normalized
 * list, or a fail-fast {@link ToolInputError}.
 */
export function parseAgentKinds(raw: unknown): readonly string[] | ToolInputError {
  return parseAgentKindsWithMinimum(raw, MIN_FANOUT_AGENTS);
}

/** Recovery may replace one pane while retaining healthy siblings in the group. */
export function parseRetryAgentKinds(
  raw: unknown
): readonly string[] | ToolInputError {
  return parseAgentKindsWithMinimum(raw, 1);
}

function parseAgentKindsWithMinimum(
  raw: unknown,
  minimum: number
): readonly string[] | ToolInputError {
  if (!Array.isArray(raw)) {
    return inputError('agentKinds must be an array of agent kinds');
  }
  const seen = new Set<string>();
  const kinds: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.trim().length === 0) continue;
    const kind = entry.trim();
    if (!KNOWN_AGENT_KINDS.includes(kind)) {
      return inputError(
        `unknown agent kind '${kind}' (known: ${KNOWN_AGENT_KINDS.join(', ')})`
      );
    }
    if (seen.has(kind)) continue;
    seen.add(kind);
    kinds.push(kind);
  }
  if (kinds.length < minimum) {
    return inputError(
      `agentKinds needs ≥${minimum} distinct known kinds (got ${kinds.length})`
    );
  }
  // Clamp N to the sane max — take the first MAX_FANOUT_AGENTS distinct kinds.
  return kinds.slice(0, MAX_FANOUT_AGENTS);
}

/** Read the optional per-pane settle budget (positive integer ms), or `undefined`. */
export function parseSettleTimeoutMs(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.floor(raw);
}

/**
 * Build the governed `recoder_converge_fanout` MCP tool bound to the fan-out surface.
 * Kept SEPARATE from the other tool builders so its single registration is explicit
 * at the composer.
 */
export function buildConductorFanoutTools(
  surface: ConvergeFanoutSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_converge_fanout',
      description:
        'THE fusion verb: fan ONE task to N agents in parallel Loom panes, wait for all to settle, then auto-converge the sibling diffs into ONE reviewable, governed branch. Args: task (required), agentKinds (required, 2..6 distinct kinds from: ' +
        KNOWN_AGENT_KINDS.join(', ') +
        '), repoPath (required), spaceId (required), projectId (required), base (optional), taskId (optional), settleTimeoutMs (optional). Loom drives claude/codex/cursor/opencode/pi/gemini natively; recoder_code/qwen_code/crush fall back to raw-pane input (reported nativeStatus:false, never faked). Governed: each launch + the compose self-gate under the caller. Truthful: a pane that never settles is excluded from the converge; fewer than 2 settled ⇒ converged:null with a reason; never a fabricated branch.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const body = asObject(raw);
        const resolved = resolveCaller(body, caller);
        if (isInputError(resolved)) return resolved;

        const task = reqString(body, 'task');
        if (!task) return inputError('task is required');
        const repoPath = reqString(body, 'repoPath');
        if (!repoPath) return inputError('repoPath is required');
        const spaceId = reqString(body, 'spaceId');
        if (!spaceId) return inputError('spaceId is required');
        const projectId = reqString(body, 'projectId');
        if (!projectId) return inputError('projectId is required');

        const agentKinds = parseAgentKinds(body.agentKinds);
        if (isInputError(agentKinds)) return agentKinds;

        const base = reqString(body, 'base');
        const taskId = reqString(body, 'taskId');
        const settleTimeoutMs = parseSettleTimeoutMs(body.settleTimeoutMs);
        const input: FanoutInput = {
          task,
          agentKinds,
          repoPath,
          spaceId,
          projectId,
          actor: resolved.principal,
          ...(base ? { base } : {}),
          ...(taskId ? { taskId } : {}),
          ...(settleTimeoutMs !== undefined ? { settleTimeoutMs } : {}),
        };
        return surface.fanout(input);
      },
    },
    {
      name: 'recoder_fanout_retry',
      description:
        'Recover an incomplete fan-out by launching 1..6 replacement agent panes into the SAME owned taskGroup. Existing healthy siblings remain available; this action does not compose replacement panes alone. Refresh the convergence cockpit and use its Converge action when the full group is ready. Args: taskGroup, agentKinds, repoPath, spaceId, projectId (required); task (optional, defaults to the original server-recorded task), base, taskId, settleTimeoutMs (optional).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const body = asObject(raw);
        const resolved = resolveCaller(body, caller);
        if (isInputError(resolved)) return resolved;

        const taskGroup = reqString(body, 'taskGroup');
        if (!taskGroup) return inputError('taskGroup is required');
        const task = reqString(body, 'task');
        const repoPath = reqString(body, 'repoPath');
        if (!repoPath) return inputError('repoPath is required');
        const spaceId = reqString(body, 'spaceId');
        if (!spaceId) return inputError('spaceId is required');
        const projectId = reqString(body, 'projectId');
        if (!projectId) return inputError('projectId is required');

        const agentKinds = parseRetryAgentKinds(body.agentKinds);
        if (isInputError(agentKinds)) return agentKinds;
        const base = reqString(body, 'base');
        const taskId = reqString(body, 'taskId');
        const settleTimeoutMs = parseSettleTimeoutMs(body.settleTimeoutMs);
        return surface.retryFanout({
          taskGroup,
          ...(task ? { task } : {}),
          agentKinds,
          repoPath,
          spaceId,
          projectId,
          actor: resolved.principal,
          ...(base ? { base } : {}),
          ...(taskId ? { taskId } : {}),
          ...(settleTimeoutMs !== undefined ? { settleTimeoutMs } : {}),
        });
      },
    },
  ];
}
