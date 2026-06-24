/**
 * @recoder/brain — Recoder's shared memory subsystem.
 *
 * Fuses git-nexus (repo intelligence / assembly core), mem0 (semantic recall),
 * context7 (docs), and beads (task graph) into one BrainContext that the whole
 * agent team reads once and reuses.
 */
export { Brain, createBrain, type BrainDeps } from "./brain";
export type {
  BrainContext,
  BrainQuery,
  BrainEvent,
  BrainMemory,
  BrainDoc,
  BrainTask,
  MemoryRecall,
  DocsSource,
  TaskGraph,
} from "./types";
