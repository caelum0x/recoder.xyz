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
 *
 * The caller identity is supplied by the host from the authorized principal (the
 * `userId` field), NOT trusted from free-form model output beyond that binding.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { RecallService } from '../recall/recall-fusion.js';
import type { CandidateService, MemoryScope } from '../lifecycle/candidate-service.js';

/** The module surface the memory MCP tools bind to. */
export interface MemoryMcpModule {
  recall(): RecallService;
  candidates(): CandidateService;
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

const VALID_SCOPES: readonly string[] = ['user', 'org', 'space', 'repo', 'path', 'agent', 'task-type'];

function requireUserId(input: { userId?: string }): string {
  const userId = input.userId?.trim();
  if (!userId) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'userId is required (authorized principal)');
  return userId;
}

function coerceScope(scope: string | undefined): MemoryScope {
  return (scope && VALID_SCOPES.includes(scope) ? scope : 'repo') as MemoryScope;
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
  ];
}
