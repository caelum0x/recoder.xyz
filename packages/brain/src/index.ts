/**
 * @recoder/brain — Recoder's shared memory subsystem.
 *
 * Fuses git-nexus (repo intelligence / assembly core), mem0 (semantic recall),
 * context7 (docs), beads (task graph), and continuum (desktop activity) into one
 * BrainContext that the whole agent team reads once and reuses. See
 * docs/subsystems/brain.md.
 */

// Construction
export { Brain, createBrain, type BrainDeps } from "./brain";

// Repo-intelligence adapter (the ts/gitnexus fusion seam)
export { ContextPackRepoIntel, createRepoIntel } from "./repo/repo-intel-adapter";

// Desktop-activity adapter (the ts/continuum fusion seam)
export {
  ContinuumActivity,
  createContinuumActivity,
  type ContinuumActivityOptions,
  type ActivityExec,
} from "./activity/continuum-activity-adapter";

// Domain types (data shapes)
export type {
  BrainContext,
  BrainQuery,
  BrainEvent,
  BrainMemory,
  BrainDoc,
  BrainTask,
  BrainActivity,
  BrainActivityProfile,
} from "./domain";

// Ports (source contracts; advanced wiring / alternative backends)
export type {
  RepoIntelPort,
  MemoryPort,
  DocsPort,
  TaskGraphPort,
  ActivityPort,
  // Deprecated aliases, kept for backward compatibility:
  MemoryRecall,
  DocsSource,
  TaskGraph,
} from "./ports";
