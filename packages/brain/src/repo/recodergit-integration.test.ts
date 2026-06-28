import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBrain } from "../brain";
import { createRecoderGitRepoIntel } from "./recodergit-repo-intel";
import { runCodeGraphDoctor } from "../runtime/code-graph-doctor";
import { resolveExecEngine } from "../runtime/engine-resolver";
import type { TaskSpec } from "@recoder/agent-os";

/**
 * REAL end-to-end proof that the Brain's context injection works on the live
 * recodergit code-graph indexer — no fakes, no canned JSON. This test:
 *
 *   1. Writes a tiny TS fixture repo with genuine import edges
 *      (main.ts -> sum.ts -> math.ts),
 *   2. Runs the REAL `recodergit analyze` over it (tree-sitter parse -> scope
 *      resolution -> knowledge graph),
 *   3. Asserts the code-graph doctor reports the graph LIVE with real edge counts,
 *   4. Asserts `brain.assembleForTask` returns a NON-EMPTY repo context — real
 *      dependency edges + real impact provenance keyed to the task's own paths.
 *
 * The engine is consumed exactly as production does: as the vendored CLI resolved
 * by the engine-resolver, shelled through the adapter's default execFile. The flag
 * (engine presence) is kept honest: when the engine is not built, the test SKIPS
 * (degrade-safe is proven by the unit tests); when it IS built, every assertion
 * is hard.
 */

/** Resolve the vendored recodergit engine; null when it is not built. */
function resolveEngineCmd(): { cmd: string; args: string[] } | null {
  const engine = resolveExecEngine("recodergit");
  // A vendored build resolves to `node <dist/cli/index.js>`; a bare PATH name
  // ("recodergit") means nothing was discovered. We only run against the real
  // vendored build so the test is hermetic.
  if (engine.kind !== "node" || engine.args.length === 0) {
    return null;
  }
  return { cmd: engine.cmd, args: engine.args };
}

/** Build the fixture repo on disk, git-init it, and run the real indexer. */
function buildAndIndexFixture(
  engine: { cmd: string; args: string[] },
): string {
  const dir = mkdtempSync(join(tmpdir(), "brain-recodergit-it-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
  );
  writeFileSync(
    join(dir, "src", "sum.ts"),
    'import { add } from "./math";\n' +
      "export function total(xs: number[]): number {\n" +
      "  return xs.reduce((acc, x) => add(acc, x), 0);\n}\n",
  );
  writeFileSync(
    join(dir, "src", "main.ts"),
    'import { total } from "./sum";\nconsole.log(total([1, 2, 3]));\n',
  );

  // recodergit indexes by git tree; a committed repo is the natural input.
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git(["init", "-q"]);
  git(["config", "user.email", "test@recoder.xyz"]);
  git(["config", "user.name", "brain-it"]);
  git(["add", "-A"]);
  git(["commit", "-qm", "fixture"]);

  // The REAL indexer: tree-sitter parse -> scope resolution -> knowledge graph.
  execFileSync(engine.cmd, [...engine.args, "analyze", "."], {
    cwd: dir,
    stdio: "ignore",
    timeout: 120_000,
  });
  return dir;
}

const engineCmd = resolveEngineCmd();

test(
  "REAL indexer -> code-graph doctor reports live edges + assembleForTask yields non-empty repo context",
  { skip: engineCmd ? false : "recodergit engine not built (ts/recodergit)" },
  async () => {
    const engine = engineCmd!;
    const repoRoot = buildAndIndexFixture(engine);
    try {
      // (1) Code-graph doctor reports the graph LIVE with REAL edge counts.
      const graph = await runCodeGraphDoctor(repoRoot);
      assert.equal(graph.available, true, graph.detail);
      assert.ok(
        graph.nodes > 0,
        `expected >0 nodes from the real graph, got ${graph.nodes}`,
      );
      assert.ok(
        graph.edges > 0,
        `expected >0 edges from the real graph, got ${graph.edges}`,
      );
      assert.match(graph.detail, /code graph live/);

      // (2) The REAL repo-intel adapter (default execFile against the vendored
      //     engine) is wired into the Brain — no fallback, no fakes.
      const brain = createBrain({ repo: createRecoderGitRepoIntel() });

      const task: TaskSpec = {
        taskId: "it-task-1",
        title: "change sum.total",
        intent: "refactor",
        goal: "Refactor the total() reducer in sum.ts",
        spaceId: "it-space",
        targetPaths: ["src/sum.ts"],
        forbiddenPaths: [],
        acceptanceCriteria: ["tests pass"],
        verification: { commands: ["pnpm test"] },
        approvalRequired: [],
        artifactRequired: [],
      };

      const ctx = await brain.assembleForTask(task, repoRoot);

      // (3) Repo context is NON-EMPTY: the task's id flows through, and the real
      //     graph produced dependency edges (main.ts -> sum.ts is a real CALLS edge).
      assert.equal(ctx.repo.taskId, "it-task-1");
      assert.ok(
        ctx.repo.dependencyGraph.edges.length > 0,
        `expected real dependency edges, got ${ctx.repo.dependencyGraph.edges.length}`,
      );
      const upstreamHit = ctx.repo.dependencyGraph.edges.some(
        (e) => e.to === "src/sum.ts" && e.from === "src/main.ts",
      );
      assert.ok(
        upstreamHit,
        `expected the real upstream edge main.ts -> sum.ts in: ${JSON.stringify(
          ctx.repo.dependencyGraph.edges,
        )}`,
      );

      // (4) Provenance: sourceRefs cite the REAL recodergit impact for the path,
      //     not the hollow "no graph data" envelope the fallback emits.
      const ref = ctx.repo.sourceRefs.find((r) => r.ref === "src/sum.ts");
      assert.ok(ref, "expected a sourceRef for the target path");
      assert.equal(ref?.kind, "git_nexus");
      assert.match(
        ref?.detail ?? "",
        /Real RecoderGit impact/,
        `expected real impact provenance, got: ${ref?.detail}`,
      );

      // (5) The impact report carries a real risk reason for the changed path.
      const risk = ctx.repo.impactReport.changedFileRisks.find(
        (r) => r.path === "src/sum.ts",
      );
      assert.ok(risk, "expected a changed-file risk for the target path");
      assert.match(
        risk?.reason ?? "",
        /RecoderGit impact/,
        `expected real impact risk reason, got: ${risk?.reason}`,
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  },
);
