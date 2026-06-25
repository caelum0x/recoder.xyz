/** A piece of recalled semantic memory (bound to mem0). */
export interface BrainMemory {
  id: string;
  text: string;
  score?: number;
  metadata?: Record<string, unknown>;
}
