/**
 * MemoryModule — the composed owner of the MEMORY domain.
 *
 * One interface over the three absorbed engines + the agent-os store-of-record:
 *   recall  → fuse mem0 (semantic) ∪ beads (issue-graph) ∪ agent-os candidates,
 *             colbert-rerank, dedupe, provenance-tag.
 *   remember→ propose an evidence-backed candidate (beads wisp; mem0 when a user
 *             scope is given). Durable only after `promote`.
 *   promote → the review gate (bd promote).
 *   forget  → remove a semantic memory (mem0).
 *   relate  → typed beads dependency edge between two memories.
 *   health  → truthful liveness of every engine.
 *   asMemoryStore → the agent-os MemoryStore port, so existing MCP registration
 *             keeps working through the module.
 *
 * The DEPTH lives in the engine bindings (conductor/beads-*, mem0-client,
 * conductor/colbert-rerank); this module only fuses + exposes one interface +
 * truthful health. Degrade-safe throughout: any engine down contributes nothing
 * and never fabricates a row; recall never throws into a launch path.
 */
import type { MemoryScope } from '@recoder/agent-os';
import type { MemoryStore } from '@recoder/agent-memory';
import type { Mem0Mode } from '../../mem0-client.js';

/** Which store a recalled/remembered item came from (provenance). */
export type MemoryStoreId = 'beads' | 'mem0' | 'agent-os';

/** Typed relation edges between memories (beads dependency types). */
export type RelationKind = 'discovered-from' | 'supersedes' | 'related-to' | 'blocks';

/** A scope reference: a MemoryScope kind plus an optional concrete value. */
export interface MemoryScopeRef {
  kind: MemoryScope;
  value?: string;
}

export interface RecallOptions {
  limit?: number;
  agentId?: string;
  userId?: string;
  repoPath?: string;
  runId?: string;
}

/** A single fused, provenance-tagged recall result. */
export interface RecalledMemory {
  id: string;
  text: string;
  title?: string;
  /** Provenance tag — which store this came from. */
  store: MemoryStoreId;
  /** Rerank/similarity score when available. */
  score?: number;
  scope?: string;
  status?: string;
  evidenceRef?: string;
}

/** A proposed memory (candidate) — evidence-required, durable only after review. */
export interface MemoryDraft {
  title: string;
  body: string;
  scope?: string;
  /** bd dep edge to the issue this was discovered from. */
  discoveredFrom?: string;
  /** Routes to the agent-os store-of-record when present. */
  evidence?: { taskId?: string; artifactId?: string };
  /** Force a target store; otherwise inferred (userId → mem0, else beads). */
  route?: MemoryStoreId;
  /** A user scope enables the mem0 semantic layer. */
  userId?: string;
  agentId?: string;
  runId?: string;
}

export interface ReviewRef {
  reviewedBy: string;
  accepted: boolean;
  reason?: string;
  memoryId?: string;
  reviewedAt?: string;
}

export type EngineStatus = 'up' | 'down';

export interface MemoryHealth {
  mem0: { status: EngineStatus; mode: Mem0Mode; vectorStore?: string; reason?: string };
  beadsSql: { status: EngineStatus; port?: number; reason?: string };
  beadsCli: { status: EngineStatus; bin: string; reason?: string };
  colbert: { status: EngineStatus; url?: string };
  agentOs: { status: EngineStatus };
  overall: 'healthy' | 'degraded' | 'down';
}

/**
 * Cheap, synchronous configured-availability snapshot (no probes) — what the
 * conductor-health surface reads without paying for async engine init.
 */
export interface MemoryHealthSnapshot {
  mem0: { configured: boolean; mode: Mem0Mode };
  beadsSql: { configured: boolean; port?: number };
  colbert: { configured: boolean; url?: string };
  agentOs: { configured: boolean };
}

export interface MemoryModule {
  /** Fuse mem0 ∪ beads ∪ agent-os candidates → colbert rank → dedupe → provenance. */
  recall(query: string, scope?: MemoryScopeRef, opts?: RecallOptions): Promise<RecalledMemory[]>;
  /** Propose an evidence-backed candidate. Durable only after `promote`. */
  remember(fact: MemoryDraft): Promise<{ id: string; store: MemoryStoreId }>;
  /** The review gate — copy a candidate into durable memory. Throws on genuine failure. */
  promote(id: string, review: ReviewRef): Promise<void>;
  /** Remove a semantic memory (mem0). */
  forget(id: string): Promise<void>;
  /** Link two memories with a typed beads dependency edge. */
  relate(fromId: string, toId: string, kind: RelationKind): Promise<void>;
  /** Truthful liveness of every engine (probes mem0 init + beads port). */
  health(): Promise<MemoryHealth>;
  /** Sync configured-availability snapshot (no probes). */
  healthSnapshot(): MemoryHealthSnapshot;
  /** The agent-os MemoryStore port, so MCP registration keeps working. */
  asMemoryStore(): MemoryStore;
  /** Register the agent-os store-of-record (candidate recall + asMemoryStore). */
  attachAgentOsStore(store: MemoryStore): void;
}
