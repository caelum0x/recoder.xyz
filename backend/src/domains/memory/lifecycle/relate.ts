/**
 * lifecycle/relate — the memory-owned relation graph (`memory_relations`):
 * `relate(from, to, kind)` over the four legal edge kinds
 * (supersedes / derived-from / contradicts / relates-to).
 *
 * Relations are memory-domain-owned (this domain's ONE table), so writes go
 * straight through the `MemoryRepository` relation methods with an app-layer
 * `WHERE user_id = :user_id` guard. The repository is truthful on a down pool:
 * relation READS return `[]`, relation WRITES throw (a gated write must not fake
 * success) — this service surfaces those semantics unchanged, adding only
 * fail-fast kind validation and self-edge rejection.
 */
import { ErrorCode, createError } from '../../../shared/errors.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import { isRelationKind, type MemoryRelation, type RelationKind } from '../types.js';

/** Input to relate two durable memories. */
export interface RelateInput {
  readonly userId: string;
  readonly fromMemoryId: string;
  readonly toMemoryId: string;
  readonly kind: RelationKind | string;
}

export interface RelateService {
  /** Record a relation edge (idempotent on the UNIQUE(from,to,kind) constraint). */
  relate(input: RelateInput): Promise<MemoryRelation>;
  /** List a memory's outgoing relations (tenant-scoped; `[]` on a down pool). */
  list(userId: string, fromMemoryId: string): Promise<readonly MemoryRelation[]>;
  /** Remove a relation edge; `false` when no such edge is held by the user. */
  unrelate(userId: string, relationId: string): Promise<boolean>;
}

export interface RelateServiceDeps {
  readonly repository: MemoryRepository;
}

/** Validate + narrow the edge kind (fail fast on an unknown kind). */
function validateKind(kind: RelationKind | string): RelationKind {
  if (!isRelationKind(kind)) {
    throw createError(
      ErrorCode.INVALID_INPUT,
      `"kind" must be one of: supersedes, derived-from, contradicts, relates-to`,
    );
  }
  return kind;
}

/** Build the relation service over the memory repository. */
export function createRelateService(deps: RelateServiceDeps): RelateService {
  const { repository } = deps;

  return {
    async relate(input: RelateInput): Promise<MemoryRelation> {
      const from = input.fromMemoryId?.trim();
      const to = input.toMemoryId?.trim();
      if (!from || !to) {
        throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'both "fromMemoryId" and "toMemoryId" are required');
      }
      if (from === to) {
        throw createError(ErrorCode.INVALID_INPUT, 'a memory cannot relate to itself');
      }
      const kind = validateKind(input.kind);
      return repository.addRelation({ userId: input.userId, fromMemoryId: from, toMemoryId: to, kind });
    },

    async list(userId: string, fromMemoryId: string): Promise<readonly MemoryRelation[]> {
      return repository.listRelations(userId, fromMemoryId);
    },

    async unrelate(userId: string, relationId: string): Promise<boolean> {
      return repository.deleteRelation(userId, relationId);
    },
  };
}
