import type { BrainMemory } from "../domain/memory.types";

/** Semantic recall, bound to the owned mem0 (py/mem0/mem0-ts). */
export interface MemoryPort {
  recall(query: string, limit: number): Promise<BrainMemory[]>;
  remember(text: string, metadata?: Record<string, unknown>): Promise<void>;
}

/** @deprecated Use {@link MemoryPort}. Kept for backward compatibility. */
export type MemoryRecall = MemoryPort;
