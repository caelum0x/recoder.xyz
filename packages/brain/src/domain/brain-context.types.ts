import type { ContextPack } from "@recoder/recodergit";
import type { BrainMemory } from "./memory.types";
import type { BrainDoc } from "./docs.types";
import type { BrainPassage } from "./passage.types";
import type { BrainTask } from "./task-graph.types";
import type { BrainActivity, BrainActivityProfile } from "./activity.types";
import type { Revision } from "./revision";
import type { Provenance } from "./provenance";

/** What an agent gets from one Brain read. Shared, reused, never re-fetched. */
export interface BrainContext {
  /** Repo intelligence — the git-nexus assembly core. */
  repo: ContextPack;
  /** Relevant prior knowledge (mem0). */
  memories: BrainMemory[];
  /** Relevant external docs (context7). */
  docs: BrainDoc[];
  /**
   * Passage-level hits from the owned RAG vector store (@recoder/rag): the most
   * similar embedded chunks of documents the brain has ingested. Empty when no
   * vector-store port is wired (additive, degrade-safe). Optional so older
   * serialized contexts (pre-vector-store) still typecheck.
   */
  passages?: BrainPassage[];
  /** Open/related work in the durable task graph (beads). */
  tasks: BrainTask[];
  /** Desktop activity context (continuum): recent recall + how-the-user-works profile. */
  activity: {
    recent: BrainActivity[];
    profile: BrainActivityProfile | null;
  };
  /**
   * The repo state this context was assembled against (git HEAD + dirty). Part
   * of the cache key — a new HEAD invalidates this context. Optional so older
   * serialized contexts (pre-cache) still typecheck.
   */
  revision?: Revision;
  /**
   * Truthful per-source provenance: which sources contributed vs degraded, with
   * item counts and actionable reasons. The Brain never fabricates a source.
   */
  provenance?: Provenance;
  /**
   * Estimated token cost of this assembled context (real tokenizer estimate over
   * the assembled material). On every cache HIT this is the value re-spent had
   * the context been re-assembled — i.e. the tokens the shared brain saved.
   */
  estimatedTokens?: number;
  /** When this context was assembled (so peers know it's fresh and reusable). */
  assembledAt: string;
}
