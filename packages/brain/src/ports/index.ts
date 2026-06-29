/** Brain ports — the source contracts the engine depends on (never the concretes). */
export type { MemoryPort, MemoryRecall } from "./memory.port";
export type { DocsPort, DocsSource } from "./docs.port";
export type { TaskGraphPort, TaskGraph } from "./task-graph.port";
export type { RepoIntelPort } from "./repo-intel.port";
export type { ActivityPort } from "./activity.port";
export type { DocumentPreprocessorPort } from "./document-preprocessor.port";
export type { ChunkerPort } from "./chunker.port";
export type { BrainContextCacheStore } from "./cache.port";
export type { ClockPort } from "./clock.port";
export { systemClock } from "./clock.port";
