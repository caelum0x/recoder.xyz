import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack } from "@recoder/recodergit";
import { createBrain } from "./index";
import type { GitRunner } from "./index";
import type { RepoIntelPort } from "./ports";

/** A repo-intel fake so the test never touches the filesystem / real indexer. */
const fakeRepo: RepoIntelPort = {
  async contextPack() {
    return {} as ContextPack;
  },
};

/** A deterministic git runner so assemble never spawns real git. */
function fixedGit(head: string, dirty = false): GitRunner {
  return async (_repo, args) => {
    if (args[0] === "rev-parse") return `${head}\n`;
    if (args[0] === "status") return dirty ? " M src/a.ts\n" : "";
    return "";
  };
}

test("assemble fuses all four sources behind ports", async () => {
  const brain = createBrain({
    repo: fakeRepo,
    memory: {
      async recall() {
        return [{ id: "m1", text: "seen this error before" }];
      },
      async remember() {},
    },
    docs: {
      async lookup() {
        return [{ library: "react", snippet: "useEffect cleanup" }];
      },
    },
    tasks: {
      async related() {
        return [{ id: "t1", title: "wire brain", status: "open" }];
      },
      async update() {},
    },
  });

  const ctx = await brain.assemble({ task: "fix bug", repoRoot: "/tmp/repo" });

  assert.equal(ctx.memories.length, 1);
  assert.equal(ctx.memories[0].id, "m1");
  assert.equal(ctx.docs[0].library, "react");
  assert.equal(ctx.tasks[0].id, "t1");
  assert.ok(ctx.assembledAt, "assembledAt is stamped so peers know it is reusable");
});

test("assemble degrades to empty arrays when a source is absent", async () => {
  const brain = createBrain({ repo: fakeRepo });
  const ctx = await brain.assemble({ task: "anything", repoRoot: "/tmp/repo" });
  assert.deepEqual(ctx.memories, []);
  assert.deepEqual(ctx.docs, []);
  assert.deepEqual(ctx.tasks, []);
});

test("assemble fuses desktop activity from the activity port", async () => {
  const brain = createBrain({
    repo: fakeRepo,
    activity: {
      async recall() {
        return [
          {
            when: "2026-06-26T10:00:00Z",
            app: "Slack",
            who: "you",
            type: "message",
            text: "shipping the brain fusion",
            id: "a1",
          },
        ];
      },
      async profile() {
        return {
          kind: "developer",
          brief: "ships fast, async-first",
          apps: ["Slack", "VS Code"],
          tools: ["message", "edit"],
          recurring: ["deep work mornings"],
        };
      },
    },
  });

  const ctx = await brain.assemble({ task: "fix bug", repoRoot: "/tmp/repo" });

  assert.equal(ctx.activity.recent.length, 1);
  assert.equal(ctx.activity.recent[0].id, "a1");
  assert.equal(ctx.activity.recent[0].who, "you");
  assert.equal(ctx.activity.profile?.kind, "developer");
  assert.deepEqual(ctx.activity.profile?.apps, ["Slack", "VS Code"]);
});

test("assemble yields empty activity when no activity port (non-breaking)", async () => {
  const brain = createBrain({ repo: fakeRepo });
  const ctx = await brain.assemble({ task: "anything", repoRoot: "/tmp/repo" });
  assert.deepEqual(ctx.activity, { recent: [], profile: null });
});

test("assembleForTask feeds the FULL TaskSpec to the repo engine (taskId + paths)", async () => {
  let seenInput: import("@recoder/recodergit").CreateContextPackInput | null = null;
  const capturingRepo: RepoIntelPort = {
    async contextPack(input) {
      seenInput = input;
      return {
        taskId: input.task.taskId,
        repoMap: { repoRoot: input.repoRoot, packageGlobs: [], indexedAt: "x" },
        dependencyGraph: {
          repoRoot: input.repoRoot,
          nodes: ["src/sum.ts"],
          edges: [{ from: "src/main.ts", to: "src/sum.ts", kind: "depends_on" }],
          indexedAt: "x",
        },
        ownershipMap: { entries: [] },
        testTargetMap: { targets: [] },
        impactReport: {
          taskId: input.task.taskId,
          targetPaths: input.task.targetPaths,
          impactedPackages: [],
          relatedTests: [],
          changedFileRisks: [],
          generatedAt: "x",
        },
        sourceRefs: [{ kind: "git_nexus", ref: "src/sum.ts", detail: "Real RecoderGit impact" }],
      } satisfies ContextPack;
    },
  };

  const brain = createBrain({ repo: capturingRepo });
  const task = {
    taskId: "task-42",
    title: "t",
    intent: "refactor",
    goal: "refactor sum",
    spaceId: "s",
    targetPaths: ["src/sum.ts"],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  } as import("@recoder/agent-os").TaskSpec;

  const ctx = await brain.assembleForTask(task, "/tmp/repo");

  // The engine received the REAL spec, not a synthesized minimal task.
  assert.equal(seenInput!.task.taskId, "task-42");
  assert.deepEqual(seenInput!.task.targetPaths, ["src/sum.ts"]);
  assert.equal(seenInput!.repoRoot, "/tmp/repo");
  // Repo context is non-empty + provenance flows through.
  assert.equal(ctx.repo.taskId, "task-42");
  assert.equal(ctx.repo.dependencyGraph.edges.length, 1);
  assert.match(ctx.repo.sourceRefs[0].detail ?? "", /Real RecoderGit impact/);
});

test("record routes memory events to memory.remember", async () => {
  let remembered = "";
  const brain = createBrain({
    repo: fakeRepo,
    memory: {
      async recall() {
        return [];
      },
      async remember(text) {
        remembered = text;
      },
    },
  });
  await brain.record({ kind: "memory", text: "learned X" });
  assert.equal(remembered, "learned X");
});

test("record routes task events to tasks.update", async () => {
  let updated = "";
  const brain = createBrain({
    repo: fakeRepo,
    tasks: {
      async related() {
        return [];
      },
      async update(id, status) {
        updated = `${id}:${status}`;
      },
    },
  });
  await brain.record({ kind: "task", id: "t9", status: "closed" });
  assert.equal(updated, "t9:closed");
});

// ---------------------------------------------------------------------------
// Assemble-once cache: read the repo once, every later read reuses it.
// ---------------------------------------------------------------------------

test("assemble-once: a second read for the same repo/revision/task HITS the cache — ZERO source calls", async () => {
  let repoCalls = 0;
  let memoryCalls = 0;
  const brain = createBrain({
    runGit: fixedGit("head-1"),
    repo: {
      async contextPack(input) {
        repoCalls += 1;
        return {
          taskId: "t",
          repoMap: { repoRoot: input.repoRoot, packageGlobs: [], indexedAt: "x" },
          dependencyGraph: {
            repoRoot: input.repoRoot,
            nodes: [],
            edges: [],
            indexedAt: "x",
          },
          ownershipMap: { entries: [] },
          testTargetMap: { targets: [] },
          impactReport: {
            taskId: "t",
            targetPaths: [],
            impactedPackages: [],
            relatedTests: [],
            changedFileRisks: [],
            generatedAt: "x",
          },
          sourceRefs: [{ kind: "git_nexus", ref: "src/a.ts" }],
        } satisfies ContextPack;
      },
    },
    memory: {
      async recall() {
        memoryCalls += 1;
        return [{ id: "m1", text: "prior knowledge" }];
      },
      async remember() {},
    },
  });

  const first = await brain.assemble({ task: "fix bug", repoRoot: "/repo" });
  const second = await brain.assemble({ task: "fix bug", repoRoot: "/repo" });

  // The expensive assembly ran exactly once; the second read reused it.
  assert.equal(repoCalls, 1, "repo intel assembled exactly once");
  assert.equal(memoryCalls, 1, "memory recalled exactly once");
  // The same fused object is reused (reference identity from the cache).
  assert.equal(first, second);

  const stats = brain.cacheStats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.equal(stats.hitRate, 0.5);
});

test("assemble-once: tokensSaved accrues the reused context's real token cost on the HIT", async () => {
  const brain = createBrain({
    runGit: fixedGit("head-1"),
    repo: fakeRepo,
    memory: {
      async recall() {
        return [
          { id: "m1", text: "we hit this exact error before in the auth flow" },
        ];
      },
      async remember() {},
    },
  });

  const ctx = await brain.assemble({ task: "fix bug", repoRoot: "/repo" });
  assert.ok(
    (ctx.estimatedTokens ?? 0) > 0,
    "the assembled context carries a real token estimate",
  );
  assert.equal(brain.cacheStats().tokensSaved, 0, "no savings until a reuse");

  await brain.assemble({ task: "fix bug", repoRoot: "/repo" }); // HIT
  assert.equal(
    brain.cacheStats().tokensSaved,
    ctx.estimatedTokens,
    "the HIT saved exactly the reused context's token cost",
  );
});

test("a new git HEAD invalidates the cache and forces a fresh assembly", async () => {
  let head = "head-1";
  let repoCalls = 0;
  const runGit: GitRunner = async (_repo, args) =>
    args[0] === "rev-parse" ? `${head}\n` : "";
  const brain = createBrain({
    runGit,
    repo: {
      async contextPack() {
        repoCalls += 1;
        return { sourceRefs: [{ kind: "git_nexus", ref: "x" }] } as ContextPack;
      },
    },
  });

  await brain.assemble({ task: "t", repoRoot: "/repo" });
  await brain.assemble({ task: "t", repoRoot: "/repo" }); // HIT at head-1
  assert.equal(repoCalls, 1);

  head = "head-2"; // a new commit
  await brain.assemble({ task: "t", repoRoot: "/repo" }); // MISS, re-assembles
  assert.equal(repoCalls, 2, "a new HEAD re-runs the repo engine");

  const stats = brain.cacheStats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 2);
});

test("refresh() busts a repo's cache so the next read re-assembles", async () => {
  let repoCalls = 0;
  const brain = createBrain({
    runGit: fixedGit("head-1"),
    repo: {
      async contextPack() {
        repoCalls += 1;
        return { sourceRefs: [{ kind: "git_nexus", ref: "x" }] } as ContextPack;
      },
    },
  });

  await brain.assemble({ task: "t", repoRoot: "/repo" });
  await brain.assemble({ task: "t", repoRoot: "/repo" }); // HIT
  assert.equal(repoCalls, 1);

  const dropped = await brain.refresh("/repo");
  assert.ok(dropped >= 1, "refresh dropped the cached context");

  await brain.assemble({ task: "t", repoRoot: "/repo" }); // MISS after bust
  assert.equal(repoCalls, 2);
});

test("a different task over the same revision is a distinct cached context (no false reuse)", async () => {
  let repoCalls = 0;
  const brain = createBrain({
    runGit: fixedGit("head-1"),
    repo: {
      async contextPack() {
        repoCalls += 1;
        return { sourceRefs: [{ kind: "git_nexus", ref: "x" }] } as ContextPack;
      },
    },
  });
  await brain.assemble({ task: "task A", repoRoot: "/repo" });
  await brain.assemble({ task: "task B", repoRoot: "/repo" });
  assert.equal(repoCalls, 2, "distinct tasks never share a cached context");
});

// ---------------------------------------------------------------------------
// Truthful provenance + degrade-safe source lighting.
// ---------------------------------------------------------------------------

test("provenance truthfully lists which sources contributed vs degraded", async () => {
  const brain = createBrain({
    runGit: fixedGit("head-1"),
    repo: {
      async contextPack() {
        return { sourceRefs: [{ kind: "git_nexus", ref: "x" }] } as ContextPack;
      },
    },
    memory: {
      async recall() {
        return [{ id: "m1", text: "prior" }];
      },
      async remember() {},
    },
    // docs + tasks + activity are NOT wired — they must degrade as not_configured.
  });

  const ctx = await brain.assemble({ task: "t", repoRoot: "/repo" });
  const prov = ctx.provenance!;
  const bySource = new Map(prov.sources.map((s) => [s.source, s]));

  assert.equal(bySource.get("repo")?.contributed, true);
  assert.equal(bySource.get("memory")?.contributed, true);
  assert.equal(bySource.get("docs")?.contributed, false);
  assert.equal(bySource.get("docs")?.degradeReason, "not_configured");
  assert.equal(bySource.get("tasks")?.degradeReason, "not_configured");
  assert.equal(bySource.get("activity")?.degradeReason, "not_configured");

  // The degraded view is exactly the dark sources.
  assert.deepEqual(
    prov.degraded.map((d) => d.source).sort(),
    ["activity", "docs", "tasks"],
  );
});

test("a wired source that throws degrades (unavailable) without failing the read", async () => {
  const brain = createBrain({
    runGit: fixedGit("head-1"),
    repo: {
      async contextPack() {
        return { sourceRefs: [{ kind: "git_nexus", ref: "x" }] } as ContextPack;
      },
    },
    docs: {
      async lookup() {
        throw new Error("context7 unreachable");
      },
    },
  });

  const ctx = await brain.assemble({ task: "t", repoRoot: "/repo" });
  // The read still succeeds with the other sources.
  assert.deepEqual(ctx.docs, []);
  const docsProv = ctx.provenance!.sources.find((s) => s.source === "docs");
  assert.equal(docsProv?.contributed, false);
  assert.equal(docsProv?.degradeReason, "unavailable");
  assert.match(docsProv?.detail ?? "", /context7 unreachable/);
});

test("mem0 + context7 are genuinely INVOKED in assembly behind their ports", async () => {
  const seen: string[] = [];
  const brain = createBrain({
    runGit: fixedGit("head-1"),
    repo: fakeRepo,
    memory: {
      async recall(query, limit) {
        seen.push(`memory:${query}:${limit}`);
        return [{ id: "m1", text: "recalled" }];
      },
      async remember() {},
    },
    docs: {
      async lookup(query, limit) {
        seen.push(`docs:${query}:${limit}`);
        return [{ library: "react", snippet: "useEffect" }];
      },
    },
  });

  await brain.assemble({ task: "use effects", repoRoot: "/repo", limit: 5 });
  assert.ok(
    seen.includes("memory:use effects:5"),
    "mem0 recall was really invoked with the query + limit",
  );
  assert.ok(
    seen.includes("docs:use effects:5"),
    "context7 lookup was really invoked with the query + limit",
  );
});
