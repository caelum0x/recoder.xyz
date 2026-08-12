/**
 * The conductor playbook MCP tools — `recoder_playbook_list` + `recoder_playbook_run`
 * (LOOM-ROADMAP.md Bigger Bet B: multi-agent orchestration recipes). A playbook is a
 * SAVED, named choreography that SEQUENCES the already-shipped fusion verbs
 * (`recoder_converge_fanout`, `recoder_swarm_unblock`, `recoder_converge_refan`) into
 * ONE governed run. The heavy lifting lives in the pure {@link PlaybookService}; these
 * tools are the thin, GOVERNED binding, mirroring `recoder_converge_fanout` EXACTLY:
 *
 *  - `recoder_playbook_list`: read-only — returns the built-in playbook ids +
 *    descriptions + step kinds (static metadata, no tenant state, no auth needed).
 *  - `recoder_playbook_run`: owner-scoped write. IDENTITY (SECURITY): the acting
 *    identity is the HOST-AUTHORIZED caller (2nd handler param), NEVER a free-form
 *    `args.userId`. A non-privileged caller may only act as its OWN subject; only an
 *    `admin`/`internal` caller may name another subject; absent a caller the tool
 *    refuses. The gate principal carries the caller's real org/scopes, and every
 *    downstream fan-out / unblock / re-fan self-gates under it. When the run seam is
 *    unwired the composer refuses truthfully (`SERVICE_UNAVAILABLE`), never a fabricated
 *    run.
 *  - VALIDATION: `playbookId` must be a known built-in; `agentKinds` is validated against
 *    the KNOWN set (native + fallback), deduped, and clamped to
 *    [{@link MIN_FANOUT_AGENTS}, {@link MAX_FANOUT_AGENTS}].
 *  - TRUTHFULNESS: the {@link PlaybookRunResult} flows straight back — per-step outcomes
 *    carry the REAL underlying service result, and `converged:null` (+ reason) whenever no
 *    shipped compose built a branch.
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
} from '../fanout/converge-fanout.service.js';
import {
  BUILT_IN_PLAYBOOKS,
  listBuiltInPlaybooks,
  type PlaybookListItem,
} from '../playbook/playbooks.js';
import type {
  PlaybookRunInput,
  PlaybookRunResult,
} from '../playbook/playbook.types.js';

/**
 * The narrow module seam the run tool binds to: the already-governed playbook-run entry.
 * Kept minimal so the tool composes against a contract, not the whole conductor.
 */
export interface ConductorPlaybookSurface {
  runPlaybook(input: PlaybookRunInput): Promise<PlaybookRunResult>;
}

/** A fail-fast validation error (bad tool input; no run started). */
interface ToolInputError {
  readonly ok: false;
  readonly error: string;
}

function inputError(error: string): ToolInputError {
  return { ok: false, error };
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Read a required non-empty string, or `null`. */
function reqString(
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

/** The resolved acting tenant of the run: its gate principal. */
interface ResolvedCaller {
  readonly principal: Principal;
}

/**
 * Resolve the tenant the run acts under, bound to the HOST-AUTHORIZED
 * {@link McpToolCaller} — NOT a free-form `args.userId`. A non-privileged caller may
 * only act as its OWN subject; only `admin`/`internal` may name another; absent a caller
 * the tool refuses. Mirrors `recoder_converge_fanout` exactly.
 */
function resolveCaller(
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
function isInputError<T>(r: T | ToolInputError): r is ToolInputError {
  return (
    typeof r === 'object' && r !== null && (r as ToolInputError).ok === false
  );
}

/**
 * Validate + normalize the requested `agentKinds`: each must be a KNOWN kind, the set is
 * deduped (preserving order), and the count is clamped to
 * [{@link MIN_FANOUT_AGENTS}, {@link MAX_FANOUT_AGENTS}]. Mirrors the fan-out tool.
 */
function parseAgentKinds(raw: unknown): readonly string[] | ToolInputError {
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
  if (kinds.length < MIN_FANOUT_AGENTS) {
    return inputError(
      `agentKinds needs ≥${MIN_FANOUT_AGENTS} distinct known kinds (got ${kinds.length})`
    );
  }
  return kinds.slice(0, MAX_FANOUT_AGENTS);
}

/** Read the optional per-pane settle budget (positive integer ms), or `undefined`. */
function parseSettleTimeoutMs(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.floor(raw);
}

/** Read the optional confidence floor for an auto-answer (0..1], or `undefined`. */
function parseMinConfidence(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.min(raw, 1);
}

/** The built-in ids, for the tool description + validation message. */
const BUILT_IN_IDS: readonly string[] = [...BUILT_IN_PLAYBOOKS.keys()];

/**
 * Build the governed playbook MCP tools bound to the playbook surface. Kept SEPARATE
 * from the other tool builders so their registrations are explicit at the composer.
 */
export function buildConductorPlaybookTools(
  surface: ConductorPlaybookSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_playbook_list',
      description:
        'List the built-in multi-agent orchestration playbooks (saved recipes that sequence the shipped fusion verbs into one governed run). Read-only: returns each playbook id, a human description, and its ordered step kinds. Built-ins: ' +
        BUILT_IN_IDS.join(', ') +
        '.',
      handler: async (): Promise<readonly PlaybookListItem[]> => {
        return listBuiltInPlaybooks();
      },
    },
    {
      name: 'recoder_playbook_run',
      description:
        'Run a built-in multi-agent playbook: sequence recoder_converge_fanout / recoder_swarm_unblock / recoder_converge_refan into ONE governed run over one shared taskGroup. Args: playbookId (required, one of: ' +
        BUILT_IN_IDS.join(', ') +
        '), task (required), agentKinds (required, 2..6 distinct kinds from: ' +
        KNOWN_AGENT_KINDS.join(', ') +
        '), repoPath (required), spaceId (required), projectId (required), base (optional), taskId (optional), settleTimeoutMs (optional), followupTask (optional — the narrowed second-round task for a re_fan step; absent ⇒ that step skips), autoAnswer (optional, default false — escalate-by-default for an unblock step), minConfidence (optional). Governed: each step self-gates under the caller. Truthful: every step outcome carries the real underlying service result; a refused/degraded primitive is reported (never a fabricated step success); fewer than 2 settled ⇒ converged:null with a reason. Refuses SERVICE_UNAVAILABLE when the run seam is unwired.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const body = asObject(raw);
        const resolved = resolveCaller(body, caller);
        if (isInputError(resolved)) return resolved;

        const playbookId = reqString(body, 'playbookId');
        if (!playbookId) return inputError('playbookId is required');
        if (!BUILT_IN_PLAYBOOKS.has(playbookId)) {
          return inputError(
            `unknown playbookId '${playbookId}' (known: ${BUILT_IN_IDS.join(', ')})`
          );
        }
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
        const followupTask = reqString(body, 'followupTask');
        const settleTimeoutMs = parseSettleTimeoutMs(body.settleTimeoutMs);
        const minConfidence = parseMinConfidence(body.minConfidence);
        const input: PlaybookRunInput = {
          playbookId,
          task,
          agentKinds,
          repoPath,
          spaceId,
          projectId,
          actor: resolved.principal,
          // ESCALATE BY DEFAULT: auto-answer is opt-in and still gated downstream.
          unblockPolicy: {
            autoAnswer: body.autoAnswer === true,
            ...(minConfidence !== undefined ? { minConfidence } : {}),
          },
          ...(base ? { base } : {}),
          ...(taskId ? { taskId } : {}),
          ...(followupTask ? { followupTask } : {}),
          ...(settleTimeoutMs !== undefined ? { settleTimeoutMs } : {}),
        };
        return surface.runPlaybook(input);
      },
    },
  ];
}
