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

// MCP seam — expose the Brain as read-mostly stdio MCP tools (assemble/recall
// read-only; record emits a candidate, never a durable write).
export {
  createBrainTools,
  BRAIN_TOOL_NAMES,
  type BrainTool,
  type BrainToolResult,
} from "./seams/mcp-seam";
export {
  createBrainMcpServer,
  createDefaultBrain,
  runBrainMcpStdio,
} from "./seams/mcp-server";

// Repo-intelligence adapter (the ts/recodergit fusion seam)
export { ContextPackRepoIntel, createRepoIntel } from "./repo/repo-intel-adapter";

// Real RecoderGit-backed repo intelligence (opt-in, degrade-safe to the mock)
export {
  RecoderGitRepoIntel,
  createRecoderGitRepoIntel,
  createRepoIntelAuto,
  buildImpactArgs,
  type RecoderGitExec,
  type RecoderGitRepoIntelOptions,
} from "./repo/recodergit-repo-intel";

// Real RecoderGit MCP-server-backed repo intelligence (persistent-graph path;
// degrade-safe to the CLI/context-pack chain via createRepoIntelAuto)
export {
  RecoderGitMcpRepoIntel,
  createRecoderGitMcpRepoIntel,
  buildImpactToolArgs,
  parseMcpImpact,
  createMcpFetchTransport,
  type McpTransport,
  type McpCallToolResult,
  type RecoderGitMcpRepoIntelOptions,
} from "./repo/recodergit-mcp-repo-intel";

// Desktop-activity adapter (the in-process @recoder/continuum fusion seam)
export {
  ContinuumActivity,
  createContinuumActivity,
  type ContinuumActivityOptions,
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

// Real document-preprocessor-backed RAG/context ingest (the owned
// @recoder/document-preprocessor fusion seam; degrade-safe to empty text)
export {
  RecoderDocumentPreprocessor,
  createDocumentPreprocessor,
  type RecoderDocumentPreprocessorOptions,
  type PdfiumWasmLoader,
} from "./docs/document-preprocessor";

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
  type LoadContinuumFn,
  type ContinuumEngineShape,
  type RunDoctorOptions,
} from "./runtime/doctor";
// Code-graph doctor — proves the knowledge graph is LIVE for a repo with REAL
// node/edge counts (not just that the CLI is callable).
export {
  runCodeGraphDoctor,
  parseCount,
  buildCountArgs,
  COUNT_NODES_CYPHER,
  COUNT_EDGES_CYPHER,
  type CodeGraphReport,
  type CodeGraphExec,
  type CodeGraphDoctorOptions,
} from "./runtime/code-graph-doctor";
// Cache doctor — surfaces the headline value metric: tokens saved by the shared
// brain assembling once and reusing (hit rate + cumulative tokensSaved).
export { runCacheDoctor, type CacheReport } from "./runtime/cache-doctor";

// Assemble-once cache engine: content-addressed key, read-through cache with
// hit/miss + tokensSaved accounting, revision resolution, token estimation, and
// degrade-safe source running with truthful provenance.
export {
  estimateTokens,
  estimateTokensOfParts,
  estimateContextTokens,
  buildCacheKey,
  repoKeyPrefix,
  ContextCache,
  resolveRevision,
  NO_HEAD_SENTINEL,
  runSource,
  buildProvenance,
  type CacheKeyInput,
  type CacheStats,
  type CacheLookup,
  type GitRunner,
  type ResolveRevisionOptions,
  type SourceOutcome,
  type RunSourceInput,
} from "./engine";

// Context-cache store: the in-memory default + the injectable store port (a
// Postgres/Redis store can be dropped in for cross-process / cross-agent reuse).
export {
  InMemoryContextCache,
  createInMemoryContextCache,
} from "./persistence/memory-context-cache";

// Domain types (data shapes)
export type {
  BrainContext,
  BrainQuery,
  BrainEvent,
  BrainMemory,
  BrainDoc,
  BrainPassage,
  BrainDocumentFormat,
  BrainRawDocument,
  BrainPreprocessedDocument,
  BrainTask,
  BrainActivity,
  BrainActivityProfile,
  Revision,
  Provenance,
  SourceProvenance,
  BrainSourceKind,
  DegradeReason,
} from "./domain";

// Ports (source contracts; advanced wiring / alternative backends)
export type {
  RepoIntelPort,
  MemoryPort,
  DocsPort,
  TaskGraphPort,
  ActivityPort,
  DocumentPreprocessorPort,
  ChunkerPort,
  VectorStorePort,
  BrainContextCacheStore,
  ClockPort,
  // Deprecated aliases, kept for backward compatibility:
  MemoryRecall,
  DocsSource,
  TaskGraph,
} from "./ports";
export { systemClock } from "./ports";
