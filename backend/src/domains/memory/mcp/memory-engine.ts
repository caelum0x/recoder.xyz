/**
 * Memory MCP tools — the gated agent-facing surface for the shared memory layer
 * (mirrors the `recoder_memory_search` / `recoder_remember` route names). Every
 * call passes the interop `authorize→risk→policy→audit` chain + governance gate
 * at the MCP host boundary, so these handlers stay thin, tenant-scoped, and
 * truthful over the module surface.
 *
 *  - `memory_recall`   — READ: fuse mem0 ∪ beads ∪ candidates ∪ items for a query.
 *  - `memory_remember` — WRITE (ephemeral): propose an EVIDENCE-BACKED candidate
 *    wisp. It never writes durable memory (that is the governed accept path); an
 *    unevidenced remember is rejected, never silently stored.
 *  - `memory_promote`  — WRITE (governed): promote a candidate wisp → durable
 *    item. It passes THE governance write seam (`memory.promote`); a non-allow
 *    verdict returns a truthful `{ promoted:false, verdict }`, NEVER a fabricated
 *    success. Agents cannot self-promote past a gate that denies them.
 *  - `memory_relate`   — WRITE: record a relation edge between two durable items
 *    over the four legal kinds (supersedes / derived-from / contradicts /
 *    relates-to); a down pool throws truthfully rather than faking the edge.
 *
 * The caller identity is supplied by the host from the authorized principal (the
 * `userId` field), NOT trusted from free-form model output beyond that binding.
 * `memory_promote` reconstructs a `Principal` from that bound `userId` so the
 * governance gate makes an independent, truthful decision.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { RecallService } from '../recall/recall-fusion.js';
import type { CandidateService, MemoryScope } from '../lifecycle/candidate-service.js';
import type { MemoryLifecycle } from '../lifecycle/memory-lifecycle.js';
import type { ForgetService } from '../lifecycle/forget.js';
import type { RelateService } from '../lifecycle/relate.js';

/** The module surface the memory MCP tools bind to. */
export interface MemoryMcpModule {
  recall(): RecallService;
  candidates(): CandidateService;
  lifecycle(): MemoryLifecycle;
  forget(): ForgetService;
  relations(): RelateService;
}

interface RecallInput {
  readonly userId?: string;
  readonly query?: string;
  readonly scope?: string;
  readonly scopeRef?: string;
  readonly limit?: number;
}

interface RememberInput {
  readonly userId?: string;
  readonly title?: string;
  readonly body?: string;
  readonly scope?: string;
  readonly proposedBy?: string;
  readonly evidence?: { readonly taskId?: string; readonly artifactId?: string };
  readonly discoveredFrom?: string;
}

interface PromoteInput {
  readonly userId?: string;
  readonly candidateId?: string;
  readonly supersedesMemoryId?: string;
  readonly taskId?: string;
  readonly runId?: string;
}

interface RelateInput {
  readonly userId?: string;
  readonly fromMemoryId?: string;
  readonly toMemoryId?: string;
  readonly kind?: string;
}

interface ForgetInput {
  readonly userId?: string;
  readonly memoryId?: string;
  readonly reason?: string;
  readonly taskId?: string;
  readonly runId?: string;
}

const VALID_SCOPES: readonly string[] = ['user', 'org', 'space', 'repo', 'path', 'agent', 'task-type'];

function requireUserId(input: { userId?: string }): string {
  const userId = input.userId?.trim();
  if (!userId) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'userId is required (authorized principal)');
  return userId;
}

function requireField(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, `${name} is required`);
  return trimmed;
}

function coerceScope(scope: string | undefined): MemoryScope {
  return (scope && VALID_SCOPES.includes(scope) ? scope : 'repo') as MemoryScope;
}

/**
 * Reconstruct a `Principal` from the host-bound `userId` for the governance gate.
 * The MCP call already cleared the host's `authorize→risk` step, so the caller is
 * an authenticated write-capable principal — but it carries NO elevated scopes,
 * so `gate.decide('memory.promote', …)` renders its own truthful verdict (an
 * agent that the policy denies simply gets `{ promoted:false }`, never a bypass).
 */
function principalFromUserId(userId: string): Principal {
  return {
    userId,
    scopes: ['read', 'write'],
    kind: 'apikey',
    isAnonymous: false,
    raw: { via: 'mcp' },
  };
}

export function buildMemoryMcpTools(module: MemoryMcpModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'memory_recall',
      description:
        'Recall relevant memories for a query by fusing mem0, beads, candidate wisps, and durable items — deduped and provenance-tagged. Read-only; returns [] truthfully when no source is configured.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as RecallInput;
        const query = input.query?.trim();
        if (!query) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'query is required');
        const result = await module.recall().recall({
          query,
          userId: requireUserId(input),
          ...(input.scope ? { scope: input.scope } : {}),
          ...(input.scopeRef ? { scopeRef: input.scopeRef } : {}),
          ...(typeof input.limit === 'number' && input.limit > 0 ? { limit: Math.trunc(input.limit) } : {}),
        });
        return {
          memories: result.memories,
          sources: result.sources,
          reranker: result.reranker,
        };
      },
    },
    {
      name: 'memory_remember',
      description:
        'Propose an EVIDENCE-BACKED memory candidate (ephemeral wisp). Requires evidence { taskId, artifactId }; never writes durable memory (a human/policy review promotes it via accept).',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as RememberInput;
        const userId = requireUserId(input);
        const title = input.title?.trim();
        const body = input.body?.trim();
        if (!title || !body) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'title and body are required');
        const taskId = input.evidence?.taskId?.trim();
        const artifactId = input.evidence?.artifactId?.trim();
        if (!taskId || !artifactId) {
          throw createError(
            ErrorCode.MISSING_REQUIRED_FIELD,
            'evidence { taskId, artifactId } is required — an unevidenced memory is noise',
          );
        }
        const candidate = await module.candidates().propose({
          userId,
          scope: coerceScope(input.scope),
          title,
          body,
          proposedBy: input.proposedBy?.trim() || userId,
          evidence: { taskId, artifactId },
          ...(input.discoveredFrom ? { discoveredFrom: input.discoveredFrom } : {}),
        });
        return { candidate };
      },
    },
    {
      name: 'memory_promote',
      description:
        'Promote a candidate wisp → durable memory item, GATED by governance (memory.promote). Requires candidateId. A non-allow verdict returns { promoted:false, verdict } truthfully — it never writes durable memory on the runtime\'s own authority.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as PromoteInput;
        const userId = requireUserId(input);
        const candidateId = requireField(input.candidateId, 'candidateId');
        const result = await module.lifecycle().accept({
          userId,
          candidateId,
          principal: principalFromUserId(userId),
          ...(input.supersedesMemoryId?.trim() ? { supersedesMemoryId: input.supersedesMemoryId.trim() } : {}),
          ...(input.taskId?.trim() ? { taskId: input.taskId.trim() } : {}),
          ...(input.runId?.trim() ? { runId: input.runId.trim() } : {}),
        });
        return {
          promoted: result.promoted,
          verdict: result.verdict,
          candidate: result.candidate,
          ...(result.memory ? { memory: result.memory } : {}),
        };
      },
    },
    {
      name: 'memory_relate',
      description:
        'Record a relation edge between two durable memory items. Requires fromMemoryId, toMemoryId, and kind (one of: supersedes, derived-from, contradicts, relates-to). A down persistence pool throws truthfully rather than fabricating the edge.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as RelateInput;
        const userId = requireUserId(input);
        const relation = await module.relations().relate({
          userId,
          fromMemoryId: requireField(input.fromMemoryId, 'fromMemoryId'),
          toMemoryId: requireField(input.toMemoryId, 'toMemoryId'),
          kind: requireField(input.kind, 'kind'),
        });
        return { relation };
      },
    },
    {
      name: 'memory_forget',
      description:
        'Forget (tombstone) a durable memory item, GATED by governance (memory.forget). Requires memoryId and reason. A non-allow verdict returns { forgotten:false, verdict } truthfully; on allow the item is retired from active recall — it never deletes durable memory on the runtime\'s own authority.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as ForgetInput;
        const userId = requireUserId(input);
        const memoryId = requireField(input.memoryId, 'memoryId');
        const reason = requireField(input.reason, 'reason');
        const result = await module.forget().forget({
          userId,
          memoryId,
          principal: principalFromUserId(userId),
          reason,
          ...(input.taskId?.trim() ? { taskId: input.taskId.trim() } : {}),
          ...(input.runId?.trim() ? { runId: input.runId.trim() } : {}),
        });
        return {
          forgotten: result.forgotten,
          verdict: result.verdict,
          item: result.item,
        };
      },
    },
  ];
}
