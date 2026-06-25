/**
 * @recoder/brain — Recoder's shared memory subsystem.
 *
 * Fuses git-nexus (repo intelligence / assembly core), mem0 (semantic recall),
 * context7 (docs), and beads (task graph) into one BrainContext that the whole
 * agent team reads once and reuses. See docs/subsystems/brain.md.
 */

// Construction
export { Brain, createBrain, type BrainDeps } from "./brain";

// Repo-intelligence adapter (the ts/gitnexus fusion seam)
export { ContextPackRepoIntel, createRepoIntel } from "./repo/repo-intel-adapter";

// Domain types (data shapes)
export type {
  BrainContext,
  BrainQuery,
  BrainEvent,
  BrainMemory,
  BrainDoc,
  BrainTask,
} from "./domain";

// Ports (source contracts; advanced wiring / alternative backends)
export type {
  RepoIntelPort,
  MemoryPort,
  DocsPort,
  TaskGraphPort,
  // Deprecated aliases, kept for backward compatibility:
  MemoryRecall,
  DocsSource,
  TaskGraph,
} from "./ports";
