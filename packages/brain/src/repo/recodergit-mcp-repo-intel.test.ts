import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack, CreateContextPackInput } from "@recoder/recodergit";
import {
  buildImpactToolArgs,
  createRecoderGitMcpRepoIntel,
  RecoderGitMcpRepoIntel,
  parseMcpImpact,
  type McpCallToolResult,
  type McpTransport,
} from "./recodergit-mcp-repo-intel";
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

/** The raw `impact` JSON payload an indexed graph emits. */
const IMPACT_PAYLOAD = {
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
    "2": [{ id: "c", name: "boot", filePath: "apps/web/src/boot.ts", type: "Function" }],
  },
};

/**
 * Wrap a tool payload exactly like the RecoderGit MCP server does: pretty-printed
 * JSON in a text content block, with a trailing "Next:" hint appended.
 */
function mcpResult(payload: unknown): McpCallToolResult {
  const text =
    JSON.stringify(payload, null, 2) +
    "\n\n---\n**Next:** Review d=1 items first (WILL BREAK).";
  return { content: [{ type: "text", text }] };
}

test("contextPack maps a real MCP impact result into a ContextPack", async () => {
  const transport: McpTransport = async () => mcpResult(IMPACT_PAYLOAD);
  const intel = createRecoderGitMcpRepoIntel({ transport });

  const pack = await intel.contextPack(
    makeInput(["packages/brain/src/brain.ts"]),
  );

  assert.equal(pack.taskId, "task-1");
  assert.equal(pack.impactReport.changedFileRisks.length, 1);
  assert.equal(
    pack.impactReport.changedFileRisks[0].path,
    "packages/brain/src/brain.ts",
  );
  assert.equal(pack.impactReport.changedFileRisks[0].risk, "high");
  assert.deepEqual(pack.impactReport.impactedPackages, [
    "packages/brain",
    "apps/web",
  ]);

  const depends = pack.dependencyGraph.edges.filter(
    (e) => e.kind === "depends_on",
  );
  const tests = pack.dependencyGraph.edges.filter((e) => e.kind === "tests");
  assert.deepEqual(
    depends.map((e) => e.from).sort(),
    ["apps/web/src/boot.ts", "apps/web/src/use-brain.ts"],
  );
  assert.ok(depends.every((e) => e.to === "packages/brain/src/brain.ts"));
  assert.deepEqual(tests.map((e) => e.from), [
    "packages/brain/src/brain.test.ts",
  ]);
  assert.ok(
    pack.dependencyGraph.nodes.includes("packages/brain/src/brain.ts"),
  );

  assert.ok(
    pack.testTargetMap.targets.some(
      (t) => t.pathGlob === "packages/brain/src/brain.test.ts",
    ),
  );

  assert.equal(pack.sourceRefs.length, 1);
  assert.equal(pack.sourceRefs[0].kind, "git_nexus");
  assert.match(pack.sourceRefs[0].detail ?? "", /Real RecoderGit MCP impact/);
});

test("parseMcpImpact strips prepended pino log lines and the Next hint", () => {
  const text =
    '{"level":40,"time":1700000000000,"name":"gitnexus","msg":"FTS extension unavailable"}\n' +
    JSON.stringify(IMPACT_PAYLOAD, null, 2) +
    "\n\n---\n**Next:** Review d=1 items first.";
  const parsed = parseMcpImpact("packages/brain/src/brain.ts", {
    content: [{ type: "text", text }],
  });
  assert.ok(parsed, "log-prefixed + hint-suffixed payload must still parse");
  assert.equal(parsed?.risk, "high");
  assert.equal(parsed?.impactedCount, 3);
});

test("buildImpactToolArgs targets the right file, repo, and direction", () => {
  assert.deepEqual(
    buildImpactToolArgs("/work/repo", "packages/brain/src/brain.ts"),
    {
      target: "brain",
      direction: "upstream",
      file_path: "packages/brain/src/brain.ts",
      repo: "/work/repo",
      includeTests: true,
    },
  );
});

test("contextPack issues one impact tool call per target path", async () => {
  const seen: string[] = [];
  const transport: McpTransport = async (toolName, args) => {
    assert.equal(toolName, "impact");
    seen.push(String((args as { file_path?: unknown }).file_path));
    return mcpResult(IMPACT_PAYLOAD);
  };
  const intel = createRecoderGitMcpRepoIntel({ transport });

  await intel.contextPack(makeInput(["a.ts", "b.ts"]));
  assert.deepEqual(seen.sort(), ["a.ts", "b.ts"]);
});

test("contextPack degrades to the fallback when the transport throws", async () => {
  const sentinel = makeSentinelPack("fallback-task");
  let fallbackCalled = false;
  const fallback: RepoIntelPort = {
    async contextPack() {
      fallbackCalled = true;
      return sentinel;
    },
  };
  const transport: McpTransport = async () => {
    throw new Error("ECONNREFUSED: MCP server unreachable");
  };

  const intel = new RecoderGitMcpRepoIntel({ transport, fallback });
  const pack = await intel.contextPack(
    makeInput(["packages/brain/src/brain.ts"]),
  );

  assert.ok(fallbackCalled, "fallback must be used when the transport throws");
  assert.equal(pack, sentinel);
});

test("contextPack degrades on an MCP error result or unparseable payload", async () => {
  let fallbackCalls = 0;
  const fallback = makeCountingFallback(() => {
    fallbackCalls += 1;
  });

  // isError result -> not usable intelligence.
  const errored = new RecoderGitMcpRepoIntel({
    fallback,
    transport: async () => ({
      content: [{ type: "text", text: "Error: no index for repo" }],
      isError: true,
    }),
  });
  const erroredPack = await errored.contextPack(makeInput(["a.ts"]));
  assert.equal(erroredPack.sourceRefs.length, 0);

  // Non-JSON text content -> unparseable.
  const garbage = new RecoderGitMcpRepoIntel({
    fallback,
    transport: async () => ({ content: [{ type: "text", text: "not json" }] }),
  });
  const garbagePack = await garbage.contextPack(makeInput(["a.ts"]));
  assert.equal(garbagePack.sourceRefs.length, 0);

  // Structured-error JSON payload -> not usable intelligence.
  const structured = new RecoderGitMcpRepoIntel({
    fallback,
    transport: async () => mcpResult({ error: "no index for repo" }),
  });
  const structuredPack = await structured.contextPack(makeInput(["a.ts"]));
  assert.equal(structuredPack.sourceRefs.length, 0);

  assert.equal(fallbackCalls, 3);
});

test("contextPack degrades without any call when no url/transport is configured", async () => {
  const previous = process.env["RECODERGIT_MCP_URL"];
  delete process.env["RECODERGIT_MCP_URL"];
  try {
    let fallbackCalled = false;
    const fallback = makeCountingFallback(() => {
      fallbackCalled = true;
    });
    const intel = new RecoderGitMcpRepoIntel({ fallback });
    const pack = await intel.contextPack(
      makeInput(["packages/brain/src/brain.ts"]),
    );
    assert.ok(fallbackCalled, "no transport -> degrade to fallback");
    assert.equal(pack.sourceRefs.length, 0);
  } finally {
    if (previous === undefined) {
      delete process.env["RECODERGIT_MCP_URL"];
    } else {
      process.env["RECODERGIT_MCP_URL"] = previous;
    }
  }
});

test("contextPack degrades to the fallback when there are no target paths", async () => {
  let transportCalled = false;
  const transport: McpTransport = async () => {
    transportCalled = true;
    return mcpResult(IMPACT_PAYLOAD);
  };
  let fallbackCalled = false;
  const fallback = makeCountingFallback(() => {
    fallbackCalled = true;
  });

  const intel = new RecoderGitMcpRepoIntel({ transport, fallback });
  await intel.contextPack(makeInput([]));

  assert.ok(fallbackCalled, "no targets -> degrade to fallback");
  assert.equal(transportCalled, false, "no tool call when nothing to analyze");
});

// --- helpers ---------------------------------------------------------------

function makeSentinelPack(taskId: string): ContextPack {
  return {
    taskId,
    repoMap: { repoRoot: "/repo", packageGlobs: [], indexedAt: "x" },
    dependencyGraph: { repoRoot: "/repo", nodes: [], edges: [], indexedAt: "x" },
    ownershipMap: { entries: [] },
    testTargetMap: { targets: [] },
    impactReport: {
      taskId,
      targetPaths: [],
      impactedPackages: [],
      relatedTests: [],
      changedFileRisks: [],
      generatedAt: "x",
    },
    sourceRefs: [],
  };
}

function makeCountingFallback(onCall: () => void): RepoIntelPort {
  return {
    async contextPack(input) {
      onCall();
      return makeSentinelPack(input.task.taskId);
    },
  };
}
