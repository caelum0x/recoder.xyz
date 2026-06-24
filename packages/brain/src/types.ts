/**
 * Recoder Brain — unified memory model.
 *
 * The Brain fuses four memory sources into one shared context that every agent
 * reads once and reuses, killing the "each agent re-reads the repo and re-pays
 * for it" token waste:
 *
 *   - repo intelligence  (git-nexus context-pack: the assembly core)
 *   - semantic recall    (mem0)
 *   - external docs       (context7)
 *   - task graph + history (beads)
 *
 * These are not external services. They are modules of this subsystem; the
 * source contracts below are the brain's internal seams, bound to the owned
 * mem0 / context7 / beads code (see brain.ts).
 */

import type { ContextPack } from "@recoder/git-nexus";

/** A piece of recalled semantic memory (bound to mem0). */
export interface BrainMemory {
  id: string;
  text: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

/** A documentation reference pulled for the task (bound to context7). */
export interface BrainDoc {
  library: string;
  title?: string;
  url?: string;
  snippet: string;
}

/** A node in the durable task graph (bound to beads). */
export interface BrainTask {
  id: string;
  title: string;
  status: string;
  dependsOn?: string[];
  blocks?: string[];
}

/** What an agent gets from one Brain read. Shared, reused, never re-fetched. */
export interface BrainContext {
  /** Repo intelligence — the git-nexus assembly core. */
  repo: ContextPack;
  /** Relevant prior knowledge (mem0). */
  memories: BrainMemory[];
  /** Relevant external docs (context7). */
  docs: BrainDoc[];
  /** Open/related work in the durable task graph (beads). */
  tasks: BrainTask[];
  /** When this context was assembled (so peers know it's fresh and reusable). */
  assembledAt: string;
}

export interface BrainQuery {
  /** The task/prompt driving this run. */
  task: string;
  /** Absolute repo root to index. */
  repoRoot: string;
  /** Optional files the agent is focused on. */
  focusFiles?: string[];
  /** Max items per source. */
  limit?: number;
}

/** Something an agent did, written back so the next read is richer. */
export type BrainEvent =
  | { kind: "memory"; text: string; metadata?: Record<string, unknown> }
  | { kind: "task"; id: string; status: string; note?: string };

// ---- Internal source contracts (bound to the owned mem0/context7/beads) ----

export interface MemoryRecall {
  recall(query: string, limit: number): Promise<BrainMemory[]>;
  remember(text: string, metadata?: Record<string, unknown>): Promise<void>;
}

export interface DocsSource {
  lookup(query: string, limit: number): Promise<BrainDoc[]>;
}

export interface TaskGraph {
  related(query: string, limit: number): Promise<BrainTask[]>;
  update(id: string, status: string, note?: string): Promise<void>;
}
