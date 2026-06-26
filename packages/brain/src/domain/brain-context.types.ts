import type { ContextPack } from "@recoder/recodergit";
import type { BrainMemory } from "./memory.types";
import type { BrainDoc } from "./docs.types";
import type { BrainTask } from "./task-graph.types";
import type { BrainActivity, BrainActivityProfile } from "./activity.types";

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
  /** Desktop activity context (continuum): recent recall + how-the-user-works profile. */
  activity: {
    recent: BrainActivity[];
    profile: BrainActivityProfile | null;
  };
  /** When this context was assembled (so peers know it's fresh and reusable). */
  assembledAt: string;
}
