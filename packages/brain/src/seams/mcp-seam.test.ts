import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack } from "@recoder/recodergit";
import { createBrain } from "../brain";
import type { ActivityPort, RepoIntelPort } from "../ports";
import type { BrainActivity } from "../domain";
import { createBrainTools, BRAIN_TOOL_NAMES, type BrainTool } from "./mcp-seam";

/** A repo-intel fake so the seam tests never touch the filesystem / indexer. */
const fakeRepo: RepoIntelPort = {
  async contextPack() {
    return {} as ContextPack;
  },
};

/** A sample activity row with the correct `who` literal type. */
const sampleRow: BrainActivity = {
  when: "now",
  app: "Terminal",
  who: "you",
  type: "command",
  text: "deployed",
  id: "a1",
};

/** A fully-populated activity fake (recent/snapshot/answer + recall/profile). */
function fakeActivity(): ActivityPort {
  return {
    async recall() {
      return [];
    },
    async profile() {
      return null;
    },
    async recent(limit = 8) {
      return [sampleRow].slice(0, limit);
    },
    async snapshot() {
      return "active today mostly in Terminal";
    },
    async answer(query) {
      return { answer: `grounded answer about ${query}`, sources: [sampleRow] };
    },
  };
}

/** A repo-intel fake that returns a "real" pack (a non-empty sourceRefs). */
const richRepo: RepoIntelPort = {
  async contextPack() {
    return {
      sourceRefs: [{ kind: "git_nexus", ref: "src/a.ts", detail: "real impact" }],
    } as unknown as ContextPack;
  },
};

function toolByName(tools: BrainTool[], name: string): BrainTool {
  const tool = tools.find((t) => t.name === name);
  assert.ok(tool, `tool ${name} should exist`);
  return tool;
}

/** Parse the JSON payload out of a (non-error) tool result. */
function parseResult(result: { content: Array<{ text: string }>; isError?: boolean }): unknown {
  assert.equal(result.isError, undefined, "expected a non-error result");
  return JSON.parse(result.content[0].text);
}

test("exposes exactly the four brain tools with correct read-only flags", () => {
  const tools = createBrainTools(createBrain({ repo: fakeRepo }));
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      BRAIN_TOOL_NAMES.assemble,
      BRAIN_TOOL_NAMES.recall,
      BRAIN_TOOL_NAMES.record,
      BRAIN_TOOL_NAMES.activity,
    ].sort(),
  );
  assert.equal(toolByName(tools, BRAIN_TOOL_NAMES.assemble).readOnly, true);
  assert.equal(toolByName(tools, BRAIN_TOOL_NAMES.recall).readOnly, true);
  assert.equal(toolByName(tools, BRAIN_TOOL_NAMES.activity).readOnly, true);
  // record is a write tool (candidate / task update).
  assert.equal(toolByName(tools, BRAIN_TOOL_NAMES.record).readOnly, false);
});

test("brain_activity without a query returns recent activity + snapshot", async () => {
  const tools = createBrainTools(createBrain({ repo: fakeRepo, activity: fakeActivity() }));
  const result = parseResult(await toolByName(tools, BRAIN_TOOL_NAMES.activity).handler({}));
  const payload = result as { recent: unknown[]; snapshot: string | null; degraded: string[] };
  assert.equal(payload.recent.length, 1);
  assert.equal(payload.snapshot, "active today mostly in Terminal");
  assert.deepEqual(payload.degraded, []);
});

test("brain_activity with a query returns a grounded answer + sources", async () => {
  const tools = createBrainTools(createBrain({ repo: fakeRepo, activity: fakeActivity() }));
  const result = parseResult(
    await toolByName(tools, BRAIN_TOOL_NAMES.activity).handler({ query: "deploys" }),
  );
  const payload = result as { answer: string | null; sources: unknown[]; degraded: string[] };
  assert.equal(payload.answer, "grounded answer about deploys");
  assert.equal(payload.sources.length, 1);
  assert.deepEqual(payload.degraded, []);
});

test("brain_activity degrades when no activity adapter is wired", async () => {
  const tools = createBrainTools(createBrain({ repo: fakeRepo }));
  const noQuery = parseResult(await toolByName(tools, BRAIN_TOOL_NAMES.activity).handler({})) as {
    degraded: string[];
  };
  assert.deepEqual(noQuery.degraded, ["activity"]);
});

test("brain_assemble maps the fused context and reports degraded sections", async () => {
  const brain = createBrain({
    repo: richRepo,
    memory: {
      async recall() {
        return [{ id: "m1", text: "seen this" }];
      },
      async remember() {},
    },
    // no docs / tasks / activity adapters -> those sections degrade to empty.
  });
  const tools = createBrainTools(brain);
  const result = await toolByName(tools, BRAIN_TOOL_NAMES.assemble).handler({
    task: "fix bug",
    repoRoot: "/tmp/repo",
  });
  const ctx = parseResult(result) as {
    memories: unknown[];
    docs: unknown[];
    tasks: unknown[];
    assembledAt: string;
    degraded: string[];
  };
  assert.equal(ctx.memories.length, 1);
  assert.ok(ctx.assembledAt, "assembledAt is stamped");
  // repo + memories present; docs/tasks/activity degraded.
  assert.ok(!ctx.degraded.includes("repo"), "repo had sourceRefs -> not degraded");
  assert.ok(!ctx.degraded.includes("memories"), "memories present -> not degraded");
  assert.deepEqual(
    ctx.degraded.filter((d) => d !== "repo" && d !== "memories").sort(),
    ["activity", "docs", "tasks"],
  );
});

test("brain_assemble degrades fully (all sections empty) and still responds", async () => {
  // Only the (empty) repo fake — every other adapter is absent.
  const tools = createBrainTools(createBrain({ repo: fakeRepo }));
  const result = await toolByName(tools, BRAIN_TOOL_NAMES.assemble).handler({
    task: "anything",
    repoRoot: "/tmp/repo",
  });
  const ctx = parseResult(result) as { degraded: string[] };
  assert.deepEqual(
    ctx.degraded.sort(),
    ["activity", "docs", "memories", "repo", "tasks"],
    "every section degrades but the server still responds successfully",
  );
});

test("brain_assemble validates required args (fail fast, not a throw)", async () => {
  const tools = createBrainTools(createBrain({ repo: fakeRepo }));
  const missingTask = await toolByName(tools, BRAIN_TOOL_NAMES.assemble).handler({
    repoRoot: "/tmp/repo",
  });
  assert.equal(missingTask.isError, true);
  assert.match(missingTask.content[0].text, /task/);

  const missingRoot = await toolByName(tools, BRAIN_TOOL_NAMES.assemble).handler({
    task: "x",
  });
  assert.equal(missingRoot.isError, true);
  assert.match(missingRoot.content[0].text, /repoRoot/);
});

test("brain_recall returns focused memories without a full assemble", async () => {
  let assembleCalled = false;
  const brain = createBrain({
    repo: {
      async contextPack() {
        assembleCalled = true;
        return {} as ContextPack;
      },
    },
    memory: {
      async recall(query) {
        return [{ id: "m1", text: `about: ${query}` }];
      },
      async remember() {},
    },
  });
  const tools = createBrainTools(brain);
  const result = await toolByName(tools, BRAIN_TOOL_NAMES.recall).handler({
    query: "auth flow",
  });
  const payload = parseResult(result) as { memories: Array<{ text: string }> };
  assert.equal(payload.memories[0].text, "about: auth flow");
  assert.equal(assembleCalled, false, "recall must NOT trigger repo assembly");
});

test("brain_recall degrades to [] when no memory adapter is wired", async () => {
  const tools = createBrainTools(createBrain({ repo: fakeRepo }));
  const result = await toolByName(tools, BRAIN_TOOL_NAMES.recall).handler({
    query: "anything",
  });
  const payload = parseResult(result) as { memories: unknown[]; degraded: string[] };
  assert.deepEqual(payload.memories, []);
  assert.deepEqual(payload.degraded, ["memories"]);
});

test("brain_record(memory) emits a CANDIDATE and never writes durable memory", async () => {
  let remembered: string | null = null;
  const brain = createBrain({
    repo: fakeRepo,
    memory: {
      async recall() {
        return [];
      },
      async remember(text) {
        remembered = text; // MUST NOT be called for a record(memory).
      },
    },
  });
  const tools = createBrainTools(brain);
  const result = await toolByName(tools, BRAIN_TOOL_NAMES.record).handler({
    kind: "memory",
    text: "learned X",
    evidence: "saw it in CI logs",
  });
  const payload = parseResult(result) as {
    durable: boolean;
    candidate: { kind: string; text: string; evidence?: string };
  };
  assert.equal(payload.durable, false, "memory record is NOT durable");
  assert.equal(payload.candidate.kind, "memory");
  assert.equal(payload.candidate.text, "learned X");
  assert.equal(payload.candidate.evidence, "saw it in CI logs");
  assert.equal(remembered, null, "memory.remember must never be called by record");
});

test("brain_record(task) applies a task-graph update", async () => {
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
  const tools = createBrainTools(brain);
  const result = await toolByName(tools, BRAIN_TOOL_NAMES.record).handler({
    kind: "task",
    id: "t9",
    status: "closed",
  });
  const payload = parseResult(result) as { durable: boolean; applied: { id: string } };
  assert.equal(payload.durable, true);
  assert.equal(payload.applied.id, "t9");
  assert.equal(updated, "t9:closed");
});

test("brain_record validates kind and required fields", async () => {
  const tools = createBrainTools(createBrain({ repo: fakeRepo }));
  const record = toolByName(tools, BRAIN_TOOL_NAMES.record);

  const badKind = await record.handler({ kind: "bogus" });
  assert.equal(badKind.isError, true);

  const noText = await record.handler({ kind: "memory" });
  assert.equal(noText.isError, true);
  assert.match(noText.content[0].text, /text/);

  const noId = await record.handler({ kind: "task", status: "open" });
  assert.equal(noId.isError, true);
  assert.match(noId.content[0].text, /id/);
});

test("a handler never throws — an adapter failure becomes an isError result", async () => {
  const brain = createBrain({
    repo: {
      async contextPack() {
        throw new Error("indexer exploded");
      },
    },
  });
  const tools = createBrainTools(brain);
  const result = await toolByName(tools, BRAIN_TOOL_NAMES.assemble).handler({
    task: "x",
    repoRoot: "/tmp/repo",
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /indexer exploded/);
});
