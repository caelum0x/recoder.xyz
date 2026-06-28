import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack } from "@recoder/recodergit";
import { createBrain } from "./index";
import type { RepoIntelPort } from "./ports";

/** A repo-intel fake so the test never touches the filesystem / real indexer. */
const fakeRepo: RepoIntelPort = {
  async contextPack() {
    return {} as ContextPack;
  },
};

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
