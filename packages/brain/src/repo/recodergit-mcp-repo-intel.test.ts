import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack, CreateContextPackInput } from "@recoder/recodergit";
import {
  buildImpactToolArgs,
  buildImpactByUidToolArgs,
  buildSymbolResolveToolArgs,
  createRecoderGitMcpRepoIntel,
  RecoderGitMcpRepoIntel,
  parseMcpImpact,
  type McpCallToolResult,
  type McpTransport,
} from "./recodergit-mcp-repo-intel";
import type { RepoIntelPort } from "../ports/repo-intel.port";

/** Wrap a `cypher` resolution payload exactly like the MCP server's text content. */
function mcpCypher(filePath: string, symbolName: string, kind = "Class"): McpCallToolResult {
  const uid = `${kind}:${filePath}:${symbolName}`;
  const markdown = [
    "| uid | name | kind | exported |",
    "| --- | --- | --- | --- |",
    `| ${uid} | ${symbolName} | ${kind} | true |`,
    `| Method:${filePath}:${symbolName}.run#1 | run | Method | true |`,
    `| File:${filePath} | ${filePath.split("/").pop()} | File |  |`,
  ].join("\n");
  const text =
    JSON.stringify({ markdown, row_count: 3 }, null, 2) +
    "\n\n---\n**Next:** To explore a result symbol, use context().";
  return { content: [{ type: "text", text }] };
}

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
    '{"level":40,"time":1700000000000,"name":"recodergit","msg":"FTS extension unavailable"}\n' +
    JSON.stringify(IMPACT_PAYLOAD, null, 2) +
    "\n\n---\n**Next:** Review d=1 items first.";
  const parsed = parseMcpImpact("packages/brain/src/brain.ts", {
    content: [{ type: "text", text }],
  });
  assert.ok(parsed, "log-prefixed + hint-suffixed payload must still parse");
  assert.equal(parsed?.risk, "high");
  assert.equal(parsed?.impactedCount, 3);
});

test("tool arg builders: stem (legacy), cypher resolve, and impact-by-UID", () => {
  // Legacy stem guess (fallback only).
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
  // Cypher resolve keys its statement on `statement` and scopes by filePath.
  const resolve = buildSymbolResolveToolArgs("/work/repo", "source/index.ts");
  assert.equal(resolve["repo"], "/work/repo");
  assert.match(String(resolve["statement"]), /s\.filePath = 'source\/index\.ts'/);
  // Impact-by-UID uses the zero-ambiguity `target_uid` key.
  assert.deepEqual(
    buildImpactByUidToolArgs("/work/repo", "Class:source/index.ts:PQueue"),
    {
      target_uid: "Class:source/index.ts:PQueue",
      direction: "upstream",
      repo: "/work/repo",
      includeTests: true,
    },
  );
});

test("contextPack resolves via cypher then impacts each path by its own UID", async () => {
  const impactUids: string[] = [];
  const transport: McpTransport = async (toolName, args) => {
    if (toolName === "cypher") {
      const stmt = String((args as { statement?: unknown }).statement);
      const file = stmt.match(/s\.filePath = '([^']+)'/)?.[1] ?? "unknown";
      return mcpCypher(file, "Sym", "Class");
    }
    assert.equal(toolName, "impact");
    impactUids.push(String((args as { target_uid?: unknown }).target_uid));
    return mcpResult(IMPACT_PAYLOAD);
  };
  const intel = createRecoderGitMcpRepoIntel({ transport });

  await intel.contextPack(makeInput(["a.ts", "b.ts"]));
  assert.deepEqual(impactUids.sort(), ["Class:a.ts:Sym", "Class:b.ts:Sym"]);
});

test("PQueue case (MCP): main export != stem resolves real impact, not fallback", async () => {
  const file = "source/index.ts";
  const impactUids: string[] = [];
  let stemGuessed = false;
  const transport: McpTransport = async (toolName, args) => {
    if (toolName === "cypher") {
      return mcpCypher(file, "PQueue", "Class");
    }
    if ((args as { target_uid?: unknown }).target_uid) {
      impactUids.push(String((args as { target_uid?: unknown }).target_uid));
      return mcpResult(IMPACT_PAYLOAD);
    }
    stemGuessed = true; // a stem-guess `target: "index"` would land here and miss.
    return mcpResult({ error: "Target 'index' not found" });
  };
  const intel = createRecoderGitMcpRepoIntel({ transport });

  const pack = await intel.contextPack(makeInput([file]));

  assert.deepEqual(impactUids, ["Class:source/index.ts:PQueue"]);
  assert.equal(stemGuessed, false, "must not fall back to the stem guess");
  assert.equal(pack.sourceRefs.length, 1);
  assert.match(pack.sourceRefs[0].detail ?? "", /Real RecoderGit MCP impact/);
  assert.match(pack.sourceRefs[0].detail ?? "", /resolved symbol/);
  assert.equal(pack.impactReport.changedFileRisks[0].risk, "high");
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
