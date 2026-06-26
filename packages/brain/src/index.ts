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

// Real GitNexus-backed repo intelligence (opt-in, degrade-safe to the mock)
export {
  GitNexusRepoIntel,
  createGitNexusRepoIntel,
  createRepoIntelAuto,
  buildImpactArgs,
  type GitNexusExec,
  type GitNexusRepoIntelOptions,
} from "./repo/gitnexus-repo-intel";

// Desktop-activity adapter (the ts/continuum fusion seam)
export {
  ContinuumActivity,
  createContinuumActivity,
  type ContinuumActivityOptions,
  type ActivityExec,
} from "./activity/continuum-activity-adapter";

// Real mem0-backed semantic memory (degrade-safe to empty when key/tool absent)
export {
  Mem0Memory,
  createMem0Memory,
  buildMem0Request,
  type Mem0Request,
  type Mem0Response,
  type Mem0Transport,
  type Mem0MemoryOptions,
} from "./memory/mem0-memory";

// Real context7-backed docs (degrade-safe to empty when unavailable)
export {
  Context7Docs,
  createContext7Docs,
  type Context7DocsOptions,
  type FetchImpl,
  type FetchResponse,
} from "./docs/context7-docs";

// Real beads-backed task graph (degrade-safe to empty when `bd` absent)
export {
  BeadsTasks,
  createBeadsTasks,
  buildReadyArgs,
  buildUpdateArgs,
  type BeadsExec,
  type BeadsTasksOptions,
} from "./tasks/beads-tasks";

// Engine resolver + truthful doctor (vendored-engine discovery + honest health)
export {
  resolveEngines,
  resolveExecEngine,
  type ResolvedEngines,
  type ResolvedExecEngine,
  type ResolvedMem0,
  type ResolvedContext7,
  type EngineKind,
  type ResolveEnginesOptions,
  type ExistsFn,
  type EnvLike,
} from "./runtime/engine-resolver";
export {
  runDoctor,
  type EngineReport,
  type EngineName,
  type ProbeFn,
  type ProbeResult,
  type DoctorFetch,
  type DoctorFetchResult,
  type RunDoctorOptions,
} from "./runtime/doctor";

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
