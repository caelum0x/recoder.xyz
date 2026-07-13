/**
 * remember/promote/forget/relate — the WRITE verbs of the memory domain.
 *
 * All writes honor the control-plane rule (agents never write durable memory
 * directly): `remember` only proposes an ephemeral candidate; `promote` is the
 * review gate that makes it durable.
 *
 * Routing:
 *   - default / evidence-backed → beads wisp (the shared issue-graph candidate).
 *   - userId present            → also mirrored into the mem0 semantic layer.
 *   - route: 'mem0'             → mem0 only (semantic-first facts).
 *
 * Degrade-safe on read-shaped ops; `promote` throws on genuine failure so a
 * durable-gate failure is never silently reported as success.
 */
import type { MemoryDraft, MemoryStoreId, ReviewRef, RelationKind } from './types.js';

export interface Mem0AddResult {
  available: boolean;
  reason?: string;
  memories?: Array<{ id?: unknown; [k: string]: unknown }>;
}

/** The engine functions the write verbs call. Injectable for tests. */
export interface RememberEngines {
  rememberCandidate: (input: { title: string; body: string; scope?: string; discoveredFrom?: string }) => string | undefined;
  promoteMemory: (id: string) => boolean;
  linkMemories: (fromId: string, toId: string, kind: string) => boolean;
  mem0Add?: (
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    scope: { userId: string; agentId?: string; runId?: string },
  ) => Promise<Mem0AddResult>;
  mem0Delete?: (memoryId: string) => Promise<{ available: boolean; deleted: boolean; reason?: string }>;
}

function firstMemoryId(result: Mem0AddResult): string | undefined {
  const first = result.memories?.find((m) => typeof m.id === 'string' && m.id);
  return first && typeof first.id === 'string' ? first.id : undefined;
}

/**
 * Propose a memory candidate. Returns the durable-store id + provenance.
 * `route: 'mem0'` (or a mem0-only fact) writes semantic memory; otherwise a
 * beads wisp is created and, when a userId is present, mirrored into mem0.
 */
export async function rememberDraft(
  fact: MemoryDraft,
  engines: RememberEngines,
): Promise<{ id: string; store: MemoryStoreId }> {
  const title = fact.title.trim();
  const body = fact.body.trim();
  if (!title || !body) {
    throw new Error('remember requires a non-empty title and body');
  }

  // mem0-only route: semantic-first fact keyed to a user.
  if (fact.route === 'mem0') {
    if (!engines.mem0Add || !fact.userId) {
      throw new Error('route mem0 requires a userId and an available mem0 engine');
    }
    const result = await engines.mem0Add(
      [{ role: 'user', content: `${title}\n${body}` }],
      { userId: fact.userId, agentId: fact.agentId, runId: fact.runId },
    );
    const id = firstMemoryId(result);
    if (!id) throw new Error(result.reason ?? 'mem0 add produced no memory id');
    return { id, store: 'mem0' };
  }

  // Default: propose a beads candidate (the shared issue-graph wisp).
  const beadsId = engines.rememberCandidate({ title, body, scope: fact.scope, discoveredFrom: fact.discoveredFrom });

  // Best-effort mirror into the mem0 semantic layer when scoped to a user.
  if (fact.userId && engines.mem0Add) {
    try {
      const result = await engines.mem0Add(
        [{ role: 'user', content: `${title}\n${body}` }],
        { userId: fact.userId, agentId: fact.agentId, runId: fact.runId },
      );
      if (!beadsId) {
        const id = firstMemoryId(result);
        if (id) return { id, store: 'mem0' };
      }
    } catch {
      // mem0 mirror is best-effort; the beads candidate remains authoritative.
    }
  }

  if (!beadsId) {
    throw new Error('remember failed: no store accepted the candidate (all engines down)');
  }
  return { id: beadsId, store: 'beads' };
}

/**
 * Promote a candidate to durable memory — the review gate. Throws when the
 * underlying promote fails, so a failed durable write is never faked as success.
 */
export async function promoteDraft(id: string, review: ReviewRef, engines: RememberEngines): Promise<void> {
  if (!review.accepted) {
    // A rejected review is not a promotion; nothing durable is written.
    return;
  }
  const ok = engines.promoteMemory(id);
  if (!ok) throw new Error(`promote failed for ${id} (beads unavailable or no such candidate)`);
}

/** Remove a semantic memory (mem0). No-op when mem0 delete is unavailable. */
export async function forgetMemory(id: string, engines: RememberEngines): Promise<void> {
  if (!engines.mem0Delete) return;
  try {
    await engines.mem0Delete(id);
  } catch {
    // Degrade-safe: a failed delete is logged by the engine, not surfaced here.
  }
}

/** Link two memories with a typed beads dependency edge. */
export async function relateMemories(
  fromId: string,
  toId: string,
  kind: RelationKind,
  engines: RememberEngines,
): Promise<void> {
  engines.linkMemories(fromId, toId, kind);
}
