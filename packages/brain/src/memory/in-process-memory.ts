import type { MemoryPort } from "../ports/memory.port";
import type { BrainMemory } from "../domain/memory.types";
import { randomUUID } from "node:crypto";

/**
 * In-process TS memory — the DEFAULT `MemoryPort` for `@recoder/brain`.
 *
 * Stores memories in a `Map<id, BrainMemory>` within the running Node.js
 * process. No external service, no network, no secrets required. Recall is a
 * simple substring-match over the stored text — good enough for single-process
 * agent runs and for tests.
 *
 * Degrade-safe by construction: recall never throws (empty Map → []), and
 * remember never throws (Map.set never fails in practice). The implementation
 * is also the fallback when the optional `MEM0_SERVICE_URL` loopback is absent,
 * so brain always has a working memory authority.
 *
 * Fusion law: this is a first-party TS in-process import — no subprocess, no
 * loopback, no external dependency. It is the DEFAULT; the Python REST server
 * (py/mem0) is the OPTIONAL loopback authority.
 */
export class InProcessMemory implements MemoryPort {
  private readonly store = new Map<string, BrainMemory>();

  async recall(query: string, limit: number): Promise<BrainMemory[]> {
    if (!query || this.store.size === 0) {
      return [];
    }
    const needle = query.toLowerCase();
    const hits: BrainMemory[] = [];
    for (const memory of this.store.values()) {
      if (memory.text.toLowerCase().includes(needle)) {
        hits.push(memory);
        if (hits.length >= limit) {
          break;
        }
      }
    }
    return hits;
  }

  async remember(
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!text) {
      return;
    }
    const id = randomUUID();
    const memory: BrainMemory = metadata
      ? { id, text, metadata }
      : { id, text };
    this.store.set(id, memory);
  }

  /** Number of stored memories (useful for assertions in tests). */
  size(): number {
    return this.store.size;
  }
}

/** Construct the default in-process memory authority (no config required). */
export function createInProcessMemory(): InProcessMemory {
  return new InProcessMemory();
}
