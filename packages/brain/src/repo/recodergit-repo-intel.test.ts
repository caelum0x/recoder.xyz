import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack, CreateContextPackInput } from "@recoder/recodergit";
import {
  buildImpactArgs,
  createRecoderGitRepoIntel,
  RecoderGitRepoIntel,
  type RecoderGitExec,
} from "./recodergit-repo-intel";
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

/**
 * A canned `recodergit impact` JSON payload — modeled on the REAL shape the built
 * CLI emits (verified live): `target` carries `id`/`type`/`filePath`, `risk` is
 * LOW|MEDIUM|HIGH|CRITICAL, `affected_modules` are graph CLUSTERS, and each
 * `byDepth` entry has `depth`/`id`/`name`/`filePath`/`type`/`relationType`/
 * `confidence`/`processes`. The adapter only reads filePath/name/risk, so the
 * extra real fields are carried verbatim to prove it parses the genuine output.
 */
const IMPACT_OBJECT = {
  target: {
    id: "Function:packages/brain/src/brain.ts:brain",
    name: "brain",
    type: "Function",
    filePath: "packages/brain/src/brain.ts",
  },
  direction: "upstream",
  impactedCount: 3,
  risk: "HIGH",
  epistemic: "exact",
  summary: { direct: 2, processes_affected: 1, modules_affected: 2 },
  byDepthCounts: { "1": 2, "2": 1 },
  affected_processes: [],
  affected_modules: [
    { name: "Cluster_0", hits: 4, impact: "direct" },
    { name: "Cluster_3", hits: 1, impact: "indirect" },
  ],
  byDepth: {
    "1": [
      {
        depth: 1,
        id: "Function:apps/web/src/use-brain.ts:assemble",
        name: "assemble",
        filePath: "apps/web/src/use-brain.ts",
        type: "Function",
        relationType: "CALLS",
        confidence: 0.9,
        processes: [],
      },
      {
        depth: 1,
        id: "Function:packages/brain/src/brain.test.ts:spec",
        name: "spec",
        filePath: "packages/brain/src/brain.test.ts",
        type: "Function",
        relationType: "CALLS",
        confidence: 0.85,
        processes: [],
      },
    ],
    "2": [
      {
        depth: 2,
        id: "Function:apps/web/src/boot.ts:boot",
        name: "boot",
        filePath: "apps/web/src/boot.ts",
        type: "Function",
        relationType: "CALLS",
        confidence: 0.7,
        processes: [],
      },
    ],
  },
};
const IMPACT_JSON = JSON.stringify(IMPACT_OBJECT, null, 2);

test("contextPack maps real impact JSON into a ContextPack", async () => {
  const exec: RecoderGitExec = async () => IMPACT_JSON;
  const intel = createRecoderGitRepoIntel({ exec });

  const pack = await intel.contextPack(
    makeInput(["packages/brain/src/brain.ts"]),
  );

  // Impact report: real risk + impacted packages from affected_modules.
  assert.equal(pack.taskId, "task-1");
  assert.equal(pack.impactReport.changedFileRisks.length, 1);
  assert.equal(pack.impactReport.changedFileRisks[0].path, "packages/brain/src/brain.ts");
  assert.equal(pack.impactReport.changedFileRisks[0].risk, "high");
  // affected_modules are graph clusters in the real engine output.
  assert.deepEqual(pack.impactReport.impactedPackages, [
    "Cluster_0",
    "Cluster_3",
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
  assert.match(pack.sourceRefs[0].detail ?? "", /Real RecoderGit impact/);
});

test("buildImpactArgs targets the right file and repoRoot, run from repoRoot", async () => {
  const calls: Array<{
    command: string;
    args: string[];
    cwd?: string;
  }> = [];
  const exec: RecoderGitExec = async (command, args, options) => {
    calls.push({ command, args, cwd: options?.cwd });
    return IMPACT_JSON;
  };
  const intel = createRecoderGitRepoIntel({ exec, recodergitBin: "recodergit" });

  await intel.contextPack(
    makeInput(["packages/brain/src/brain.ts"], "/work/repo"),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "recodergit");
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
  // impact is run FROM the repo root (verified-live working context).
  assert.equal(calls[0].cwd, "/work/repo");

  // The pure builder agrees with what the adapter shells.
  assert.deepEqual(
    buildImpactArgs("/work/repo", "packages/brain/src/brain.ts"),
    calls[0].args,
  );
});

test("contextPack strips a prepended pino log line before parsing", async () => {
  // recodergit can prepend pino records (e.g. the FTS-unavailable notice). Even if
  // a merged-stream exec puts them on stdout, the adapter must still parse the
  // real result that follows — proving the degrade isn't triggered by log noise.
  const logLine =
    '{"level":40,"time":1782463500552,"name":"recodergit","msg":"RecoderGit: FTS extension unavailable; continuing without FTS features."}';
  const exec: RecoderGitExec = async () => `${logLine}\n${IMPACT_JSON}`;
  const intel = createRecoderGitRepoIntel({ exec });

  const pack = await intel.contextPack(
    makeInput(["packages/brain/src/brain.ts"]),
  );

  // A real, non-fallback pack: the impact data parsed despite the log prefix.
  assert.equal(pack.impactReport.changedFileRisks[0].risk, "high");
  assert.equal(pack.sourceRefs.length, 1);
  assert.match(pack.sourceRefs[0].detail ?? "", /Real RecoderGit impact/);
});

test("contextPack runs one impact call per target path", async () => {
  const seen: string[] = [];
  const exec: RecoderGitExec = async (_command, args) => {
    const fileIdx = args.indexOf("--file");
    seen.push(args[fileIdx + 1]);
    return IMPACT_JSON;
  };
  const intel = createRecoderGitRepoIntel({ exec });

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
  const exec: RecoderGitExec = async () => {
    throw new Error("recodergit: command not found");
  };

  const intel = new RecoderGitRepoIntel({ exec, fallback });
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

  const garbage = new RecoderGitRepoIntel({
    fallback,
    exec: async () => "not json at all",
  });
  const garbagePack = await garbage.contextPack(makeInput(["a.ts"]));
  assert.equal(garbagePack.sourceRefs.length, 0);

  // A structured-error payload is also not usable intelligence -> fallback.
  const errored = new RecoderGitRepoIntel({
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
  const exec: RecoderGitExec = async () => {
    execCalled = true;
    return IMPACT_JSON;
  };

  const intel = new RecoderGitRepoIntel({ exec, fallback });
  await intel.contextPack(makeInput([]));

  assert.ok(fallbackCalled, "no targets -> degrade to fallback");
  assert.equal(execCalled, false, "no engine call when there is nothing to analyze");
});
