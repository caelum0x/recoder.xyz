/**
 * The Brain — one shared memory, assembled once per repo and reused by every
 * agent. git-nexus's context-pack is the assembly core; mem0 recall, context7
 * docs, and the beads task graph are fused into the same read.
 *
 * Repo intelligence now flows through {@link RepoIntelPort}, the seam where the
 * real ts/recodergit knowledge-graph engine is merged in (see brain.md). Recall,
 * docs, the task graph, and desktop activity flow through their ports. The core
 * depends only on the ports, never the concrete engines.
 */

import { type CreateContextPackInput } from "@recoder/recodergit";
import type {
  BrainActivity,
  BrainActivityProfile,
  BrainContext,
  BrainEvent,
  BrainQuery,
} from "./domain";
import type {
  ActivityPort,
  DocsPort,
  MemoryPort,
  RepoIntelPort,
  TaskGraphPort,
} from "./ports";
import { createRepoIntel } from "./repo/repo-intel-adapter";

export interface BrainDeps {
  /** Repo intelligence engine (defaults to the git-nexus context-pack adapter). */
  repo?: RepoIntelPort;
  /** Semantic recall, bound to the owned mem0. */
  memory?: MemoryPort;
  /** External docs, bound to the owned context7. */
  docs?: DocsPort;
  /** Durable task graph, bound to the owned beads. */
  tasks?: TaskGraphPort;
  /** Desktop-activity memory, bound to the owned continuum. */
  activity?: ActivityPort;
  /** How git-nexus builds the repo map (defaults to indexing repoRoot). */
  repoMap?: (q: BrainQuery) => CreateContextPackInput;
}

const DEFAULT_LIMIT = 8;

const EMPTY_ACTIVITY: BrainContext["activity"] = { recent: [], profile: null };

export class Brain {
  private readonly repo: RepoIntelPort;

  constructor(private readonly deps: BrainDeps = {}) {
    this.repo = deps.repo ?? createRepoIntel();
  }

  /**
   * One read. Repo intelligence + recall + docs + task graph + desktop
   * activity, fused into a single BrainContext that the whole agent team shares.
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

    // Repo intel + recall + docs + tasks + activity run together; the same read
    // is reused. Each source defaults to empty/null when its port is absent.
    const [repo, memories, docs, tasks, activityRecent, activityProfile] =
      await Promise.all([
        this.repo.contextPack(input),
        this.deps.memory?.recall(query.task, limit) ?? Promise.resolve([]),
        this.deps.docs?.lookup(query.task, limit) ?? Promise.resolve([]),
        this.deps.tasks?.related(query.task, limit) ?? Promise.resolve([]),
        this.deps.activity?.recall(query.task, limit) ??
          Promise.resolve([] as BrainActivity[]),
        this.deps.activity?.profile() ??
          Promise.resolve(null as BrainActivityProfile | null),
      ]);

    const activity: BrainContext["activity"] = this.deps.activity
      ? { recent: activityRecent, profile: activityProfile }
      : EMPTY_ACTIVITY;

    return {
      repo,
      memories,
      docs,
      tasks,
      activity,
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
