import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack } from "@recoder/git-nexus";
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
