/** Something an agent did, written back so the next read is richer. */
export type BrainEvent =
  | { kind: "memory"; text: string; metadata?: Record<string, unknown> }
  | { kind: "task"; id: string; status: string; note?: string };
