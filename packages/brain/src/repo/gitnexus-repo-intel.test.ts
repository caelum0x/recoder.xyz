import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack, CreateContextPackInput } from "@recoder/git-nexus";
import {
  buildImpactArgs,
  createGitNexusRepoIntel,
  GitNexusRepoIntel,
  type GitNexusExec,
} from "./gitnexus-repo-intel";
import type { RepoIntelPort } from "../ports/repo-intel.port";

/** Minimal CreateContextPackInput — the adapter only reads task + repoRoot. */
function makeInput(
  targetPaths: string[],
  repoRoot = "/repo",
): CreateContextPackInput {
  return {
    task: {
      taskId: "task-1",
      targetPaths,
    } as CreateContextPackInput["task"],
    repoRoot,
  };
}

/** A canned `gitnexus impact` JSON payload for a target file. */
const IMPACT_JSON = JSON.stringify({
  target: { filePath: "packages/brain/src/brain.ts", name: "brain" },
  direction: "upstream",
  impactedCount: 3,
  risk: "HIGH",
  summary: { direct: 2, processes_affected: 1, modules_affected: 1 },
  affected_modules: [
    { name: "packages/brain", hits: 4, impact: "direct" },
    { name: "apps/web", hits: 1, impact: "indirect" },
  ],
  byDepth: {
    "1": [
      { id: "a", name: "assemble", filePath: "apps/web/src/use-brain.ts", type: "Function" },
      { id: "b", name: "spec", filePath: "packages/brain/src/brain.test.ts", type: "Function" },
    ],
    "2": [
      { id: "c", name: "boot", filePath: "apps/web/src/boot.ts", type: "Function" },
    ],
  },
});

test("contextPack maps real impact JSON into a ContextPack", async () => {
  const exec: GitNexusExec = async () => IMPACT_JSON;
  const intel = createGitNexusRepoIntel({ exec });

  const pack = await intel.contextPack(
    makeInput(["packages/brain/src/brain.ts"]),
  );

  // Impact report: real risk + impacted packages from affected_modules.
  assert.equal(pack.taskId, "task-1");
  assert.equal(pack.impactReport.changedFileRisks.length, 1);
  assert.equal(pack.impactReport.changedFileRisks[0].path, "packages/brain/src/brain.ts");
  assert.equal(pack.impactReport.changedFileRisks[0].risk, "high");
  assert.deepEqual(pack.impactReport.impactedPackages, [
    "packages/brain",
    "apps/web",
  ]);

  // Dependency graph: upstream callers depend_on the target, tests link via 'tests'.
  const depends = pack.dependencyGraph.edges.filter((e) => e.kind === "depends_on");
  const tests = pack.dependencyGraph.edges.filter((e) => e.kind === "tests");
  assert.deepEqual(
    depends.map((e) => e.from).sort(),
    ["apps/web/src/boot.ts", "apps/web/src/use-brain.ts"],
  );
  assert.ok(depends.every((e) => e.to === "packages/brain/src/brain.ts"));
  assert.deepEqual(tests.map((e) => e.from), [
    "packages/brain/src/brain.test.ts",
  ]);
  assert.ok(pack.dependencyGraph.nodes.includes("packages/brain/src/brain.ts"));

  // Test target map: the test file discovered from the graph is included.
  assert.ok(
    pack.testTargetMap.targets.some(
      (t) => t.pathGlob === "packages/brain/src/brain.test.ts",
    ),
  );

  // Source refs cite the real engine.
  assert.equal(pack.sourceRefs.length, 1);
  assert.equal(pack.sourceRefs[0].kind, "git_nexus");
  assert.match(pack.sourceRefs[0].detail ?? "", /Real GitNexus impact/);
});

test("buildImpactArgs targets the right file and repoRoot", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const exec: GitNexusExec = async (command, args) => {
    calls.push({ command, args });
    return IMPACT_JSON;
  };
  const intel = createGitNexusRepoIntel({ exec, gitnexusBin: "gitnexus" });

  await intel.contextPack(
    makeInput(["packages/brain/src/brain.ts"], "/work/repo"),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "gitnexus");
  assert.deepEqual(calls[0].args, [
    "impact",
    "brain",
    "--file",
    "packages/brain/src/brain.ts",
    "--repo",
    "/work/repo",
    "--direction",
    "upstream",
    "--include-tests",
  ]);

  // The pure builder agrees with what the adapter shells.
  assert.deepEqual(
    buildImpactArgs("/work/repo", "packages/brain/src/brain.ts"),
    calls[0].args,
  );
});

test("contextPack runs one impact call per target path", async () => {
  const seen: string[] = [];
  const exec: GitNexusExec = async (_command, args) => {
    const fileIdx = args.indexOf("--file");
    seen.push(args[fileIdx + 1]);
    return IMPACT_JSON;
  };
  const intel = createGitNexusRepoIntel({ exec });

  await intel.contextPack(makeInput(["a.ts", "b.ts"]));
  assert.deepEqual(seen.sort(), ["a.ts", "b.ts"]);
});

test("contextPack degrades to the fallback when exec throws", async () => {
  const sentinel: ContextPack = {
    taskId: "fallback-task",
    repoMap: { repoRoot: "/repo", packageGlobs: [], indexedAt: "2026-01-01T00:00:00Z" },
    dependencyGraph: { repoRoot: "/repo", nodes: [], edges: [], indexedAt: "2026-01-01T00:00:00Z" },
    ownershipMap: { entries: [] },
    testTargetMap: { targets: [] },
    impactReport: {
      taskId: "fallback-task",
      targetPaths: [],
      impactedPackages: [],
      relatedTests: [],
      changedFileRisks: [],
      generatedAt: "2026-01-01T00:00:00Z",
    },
    sourceRefs: [],
  };
  let fallbackCalled = false;
  const fallback: RepoIntelPort = {
    async contextPack() {
      fallbackCalled = true;
      return sentinel;
    },
  };
  const exec: GitNexusExec = async () => {
    throw new Error("gitnexus: command not found");
  };

  const intel = new GitNexusRepoIntel({ exec, fallback });
  const pack = await intel.contextPack(makeInput(["packages/brain/src/brain.ts"]));

  assert.ok(fallbackCalled, "fallback must be used when the engine is unusable");
  assert.equal(pack, sentinel);
});

test("contextPack degrades to the fallback on unparseable / error output", async () => {
  let fallbackCalls = 0;
  const fallback: RepoIntelPort = {
    async contextPack(input) {
      fallbackCalls += 1;
      return {
        taskId: input.task.taskId,
        repoMap: { repoRoot: input.repoRoot, packageGlobs: [], indexedAt: "x" },
        dependencyGraph: { repoRoot: input.repoRoot, nodes: [], edges: [], indexedAt: "x" },
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
        sourceRefs: [],
      };
    },
  };

  const garbage = new GitNexusRepoIntel({
    fallback,
    exec: async () => "not json at all",
  });
  const garbagePack = await garbage.contextPack(makeInput(["a.ts"]));
  assert.equal(garbagePack.sourceRefs.length, 0);

  // A structured-error payload is also not usable intelligence -> fallback.
  const errored = new GitNexusRepoIntel({
    fallback,
    exec: async () => JSON.stringify({ error: "no index for repo" }),
  });
  const erroredPack = await errored.contextPack(makeInput(["a.ts"]));
  assert.equal(erroredPack.sourceRefs.length, 0);

  assert.equal(fallbackCalls, 2);
});

test("contextPack degrades to the fallback when there are no target paths", async () => {
  let fallbackCalled = false;
  const fallback: RepoIntelPort = {
    async contextPack(input) {
      fallbackCalled = true;
      return {
        taskId: input.task.taskId,
        repoMap: { repoRoot: input.repoRoot, packageGlobs: [], indexedAt: "x" },
        dependencyGraph: { repoRoot: input.repoRoot, nodes: [], edges: [], indexedAt: "x" },
        ownershipMap: { entries: [] },
        testTargetMap: { targets: [] },
        impactReport: {
          taskId: input.task.taskId,
          targetPaths: [],
          impactedPackages: [],
          relatedTests: [],
          changedFileRisks: [],
          generatedAt: "x",
        },
        sourceRefs: [],
      };
    },
  };
  let execCalled = false;
  const exec: GitNexusExec = async () => {
    execCalled = true;
    return IMPACT_JSON;
  };

  const intel = new GitNexusRepoIntel({ exec, fallback });
  await intel.contextPack(makeInput([]));

  assert.ok(fallbackCalled, "no targets -> degrade to fallback");
  assert.equal(execCalled, false, "no engine call when there is nothing to analyze");
});
