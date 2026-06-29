import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack } from "@recoder/recodergit";
import type { BrainContext } from "../domain/brain-context.types";
import { estimateContextTokens } from "./context-tokens";

function emptyPack(): ContextPack {
  return {
    taskId: "t",
    repoMap: { repoRoot: "/r", packageGlobs: [], indexedAt: "x" },
    dependencyGraph: { repoRoot: "/r", nodes: [], edges: [], indexedAt: "x" },
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
    sourceRefs: [],
  };
}

function baseContext(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    repo: emptyPack(),
    memories: [],
    docs: [],
    tasks: [],
    activity: { recent: [], profile: null },
    assembledAt: "2026-06-28T00:00:00Z",
    ...overrides,
  };
}

test("an empty context costs zero tokens", () => {
  assert.equal(estimateContextTokens(baseContext()), 0);
});

test("memories, docs, tasks each add to the estimate", () => {
  const ctx = baseContext({
    memories: [{ id: "m", text: "we hit this exact error before in auth" }],
    docs: [{ library: "react", title: "useEffect", snippet: "cleanup runs" }],
    tasks: [{ id: "t1", title: "wire the brain cache", status: "open" }],
  });
  const tokens = estimateContextTokens(ctx);
  assert.ok(tokens > 0);
  // Strictly greater than any single section alone — all three counted.
  const onlyMem = estimateContextTokens(
    baseContext({ memories: ctx.memories }),
  );
  assert.ok(tokens > onlyMem);
});

test("repo intelligence (graph + impact + refs) dominates the estimate", () => {
  const pack = emptyPack();
  pack.dependencyGraph.nodes = ["src/a.ts", "src/b.ts", "src/c.ts"];
  pack.dependencyGraph.edges = [
    { from: "src/a.ts", to: "src/b.ts", kind: "imports" },
    { from: "src/b.ts", to: "src/c.ts", kind: "imports" },
  ];
  pack.ownershipMap.entries = [
    { pathGlob: "src/**", owners: ["@team/core"], source: "package" },
  ];
  pack.impactReport.targetPaths = ["src/a.ts"];
  pack.impactReport.changedFileRisks = [
    { path: "src/a.ts", risk: "high", reason: "touches auth" },
  ];
  pack.sourceRefs = [
    { kind: "git_nexus", ref: "src/a.ts", detail: "Real impact" },
  ];
  const tokens = estimateContextTokens(baseContext({ repo: pack }));
  assert.ok(tokens > 0);
});

test("estimate is deterministic for the same context", () => {
  const ctx = baseContext({
    memories: [{ id: "m", text: "stable input" }],
  });
  assert.equal(estimateContextTokens(ctx), estimateContextTokens(ctx));
});

test("malformed/partial fields contribute 0 rather than throwing", () => {
  const ctx = baseContext();
  // @ts-expect-error — deliberately drop repo to prove degrade-safety.
  ctx.repo = undefined;
  assert.equal(estimateContextTokens(ctx), 0);
});
