/**
 * `MemoryStore` — the canonical store-of-record seam, re-exported from
 * `@recoder/agent-memory` so this domain binds to the SAME contract the rest of
 * the control plane uses (no parallel store; ARCHITECTURE boundary rule).
 *
 * The concrete impl (`RepositoryMemoryStore`) adapts the agent-os repository;
 * this domain consumes the port, it does not redefine the shape.
 */
export type { MemoryStore } from '@recoder/agent-memory';
