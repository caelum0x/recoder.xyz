import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runCodeGraphDoctor,
  parseCount,
  buildCountArgs,
  COUNT_EDGES_CYPHER,
  COUNT_NODES_CYPHER,
  type CodeGraphExec,
} from "./code-graph-doctor";
import type { ResolvedExecEngine } from "./engine-resolver";

/** A resolved engine the doctor will spawn (faked). */
const ENGINE: ResolvedExecEngine = {
  kind: "node",
  cmd: "node",
  args: ["/repo/recodergit.js"],
};
const resolveBin = () => ENGINE;

/** Build the engine's real cypher-count payload shape for a single value. */
function countPayload(column: "nodes" | "edges", value: number): string {
  return JSON.stringify({
    markdown: `| ${column} |\n| --- |\n| ${value} |`,
    row_count: 1,
  });
}

test("buildCountArgs targets the repo via --repo", () => {
  assert.deepEqual(buildCountArgs("/r", COUNT_NODES_CYPHER), [
    "cypher",
    COUNT_NODES_CYPHER,
    "--repo",
    "/r",
  ]);
});

test("parseCount reads the value out of the engine's markdown table", () => {
  assert.equal(parseCount(countPayload("edges", 11)), 11);
  assert.equal(parseCount(countPayload("nodes", 7)), 7);
});

test("parseCount tolerates a leading pino log line", () => {
  const noisy = `{"level":40,"time":1,"name":"recodergit","msg":"FTS unavailable"}\n${countPayload("edges", 3)}`;
  assert.equal(parseCount(noisy), 3);
});

test("parseCount returns null on unusable output", () => {
  assert.equal(parseCount("not json"), null);
  assert.equal(parseCount('{"row_count":1}'), null);
  assert.equal(parseCount('{"markdown":"| edges |\\n| --- |"}'), null);
});

test("reports the graph LIVE with real counts when edges > 0", async () => {
  const calls: string[][] = [];
  const exec: CodeGraphExec = async (_cmd, args) => {
    calls.push(args);
    const cypher = args[args.indexOf("cypher") + 1];
    if (cypher === COUNT_EDGES_CYPHER) {
      return countPayload("edges", 11);
    }
    return countPayload("nodes", 7);
  };

  const report = await runCodeGraphDoctor("/repo", { exec, resolveBin });

  assert.equal(report.available, true);
  assert.equal(report.nodes, 7);
  assert.equal(report.edges, 11);
  assert.match(report.detail, /live: 7 nodes, 11 edges/);
  // Both count queries ran against the resolved engine + repo.
  assert.equal(calls.length, 2);
  assert.ok(calls.every((a) => a[0] === "/repo/recodergit.js"));
  assert.ok(calls.every((a) => a.includes("--repo") && a.includes("/repo")));
});

test("reports NOT live (empty graph) when the repo has 0 edges", async () => {
  const exec: CodeGraphExec = async (_cmd, args) => {
    const cypher = args[args.indexOf("cypher") + 1];
    return countPayload(
      cypher === COUNT_EDGES_CYPHER ? "edges" : "nodes",
      cypher === COUNT_EDGES_CYPHER ? 0 : 4,
    );
  };
  const report = await runCodeGraphDoctor("/repo", { exec, resolveBin });
  assert.equal(report.available, false);
  assert.equal(report.edges, 0);
  assert.equal(report.nodes, 4);
  assert.match(report.detail, /empty for this repo \(4 nodes, 0 edges\)/);
});

test("reports not-indexed when the engine output is unparseable", async () => {
  const exec: CodeGraphExec = async () => "Target not found";
  const report = await runCodeGraphDoctor("/repo", { exec, resolveBin });
  assert.equal(report.available, false);
  assert.match(report.detail, /not indexed for this repo/);
});

test("a thrown exec degrades to unavailable, never throws", async () => {
  const exec: CodeGraphExec = async () => {
    throw new Error("spawn ENOENT");
  };
  const report = await runCodeGraphDoctor("/repo", { exec, resolveBin });
  assert.equal(report.available, false);
  assert.equal(report.edges, 0);
  assert.match(report.detail, /engine not callable/);
});
