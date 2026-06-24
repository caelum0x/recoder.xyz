/**
 * The Brain — one shared memory, assembled once per repo and reused by every
 * agent. git-nexus's context-pack is the assembly core; mem0 recall, context7
 * docs, and the beads task graph are fused into the same read.
 */

import { createContextPack, type CreateContextPackInput } from "@recoder/git-nexus";
import type {
  BrainContext,
  BrainEvent,
  BrainQuery,
  DocsSource,
  MemoryRecall,
  TaskGraph,
} from "./types";

export interface BrainDeps {
  /** Semantic recall, bound to the owned mem0. */
  memory?: MemoryRecall;
  /** External docs, bound to the owned context7. */
  docs?: DocsSource;
  /** Durable task graph, bound to the owned beads. */
  tasks?: TaskGraph;
  /** How git-nexus builds the repo map (defaults to indexing repoRoot). */
  repoMap?: (q: BrainQuery) => CreateContextPackInput;
}

const DEFAULT_LIMIT = 8;

export class Brain {
  constructor(private readonly deps: BrainDeps = {}) {}

  /**
   * One read. Repo intelligence + recall + docs + task graph, fused into a
   * single BrainContext that the whole agent team shares.
   */
  async assemble(query: BrainQuery): Promise<BrainContext> {
    const limit = query.limit ?? DEFAULT_LIMIT;

    // git-nexus assembles around a TaskSpec; build a minimal one from the query
    // (createContextPack only reads task.targetPaths). Callers can supply a full
    // TaskSpec mapping via deps.repoMap.
    const input: CreateContextPackInput =
      this.deps.repoMap?.(query) ?? {
        task: { targetPaths: query.focusFiles ?? [] } as CreateContextPackInput["task"],
        repoRoot: query.repoRoot,
      };

    // The git-nexus context-pack is synchronous; recall/docs/tasks run together.
    const repo = createContextPack(input);
    const [memories, docs, tasks] = await Promise.all([
      this.deps.memory?.recall(query.task, limit) ?? Promise.resolve([]),
      this.deps.docs?.lookup(query.task, limit) ?? Promise.resolve([]),
      this.deps.tasks?.related(query.task, limit) ?? Promise.resolve([]),
    ]);

    return {
      repo,
      memories,
      docs,
      tasks,
      assembledAt: new Date().toISOString(),
    };
  }

  /** Write an agent's outcome back so the next assemble() is richer. */
  async record(event: BrainEvent): Promise<void> {
    if (event.kind === "memory") {
      await this.deps.memory?.remember(event.text, event.metadata);
      return;
    }
    await this.deps.tasks?.update(event.id, event.status, event.note);
  }
}

export function createBrain(deps?: BrainDeps): Brain {
  return new Brain(deps);
}
