import { execFile } from "node:child_process";
import { resolveExecEngine, type ResolvedExecEngine } from "./engine-resolver";

/**
 * Code-graph doctor — the truthful "is the knowledge graph LIVE for this repo?"
 * surface. Where {@link runDoctor}'s `recodergit` check only proves the CLI is
 * *callable* (a `--help` probe), this proves the graph is actually *indexed* for a
 * given repo by reading its REAL node + edge counts straight out of the engine.
 *
 * It runs two structured `cypher` count queries against the built engine
 *   - `MATCH (n) RETURN count(n) AS nodes`
 *   - `MATCH ()-[r]->() RETURN count(r) AS edges`
 * and parses the engine's Markdown-table count output. A graph with >0 edges is
 * LIVE; a zero/absent graph (repo never indexed, engine unbuilt, unparseable
 * output) degrades to `available: false` with an actionable detail. Like every
 * Brain doctor check, this NEVER throws.
 *
 * All IO is injectable (`exec`, `resolveBin`) so the report is deterministic in
 * tests; the real default spawns the resolved `recodergit` engine via a
 * short-timeout `execFile`.
 */

/** Live availability of the code graph for one repo, with real counts. */
export interface CodeGraphReport {
  /** True iff the repo has an indexed graph with at least one edge. */
  readonly available: boolean;
  /** Node count read from the graph (0 when unavailable/unparseable). */
  readonly nodes: number;
  /** Edge count read from the graph (0 when unavailable/unparseable). */
  readonly edges: number;
  /** Human-readable reason (counts when live, actionable hint when not). */
  readonly detail: string;
}

/** Runs the resolved recodergit engine and resolves its stdout (the test fakes this). */
export type CodeGraphExec = (
  cmd: string,
  args: string[],
  cwd: string,
) => Promise<string>;

export interface CodeGraphDoctorOptions {
  /** Override the exec (defaults to execFile against the resolved engine). */
  readonly exec?: CodeGraphExec;
  /** Override engine resolution (defaults to the vendored/PATH recodergit). */
  readonly resolveBin?: () => ResolvedExecEngine;
  /** Pin the binary (forwarded to the resolver; matches RECODERGIT_BIN override). */
  readonly recodergitBin?: string;
}

const PROBE_TIMEOUT_MS = 8000;

/** Cypher that counts every node in the graph. */
export const COUNT_NODES_CYPHER = "MATCH (n) RETURN count(n) AS nodes";
/** Cypher that counts every directed edge in the graph. */
export const COUNT_EDGES_CYPHER = "MATCH ()-[r]->() RETURN count(r) AS edges";

/** Build the argv for a `recodergit cypher <q> --repo <root>` count call. */
export function buildCountArgs(repoRoot: string, cypher: string): string[] {
  return ["cypher", cypher, "--repo", repoRoot];
}

/** Default exec: spawn the resolved engine, collect stdout, short timeout. */
function defaultExec(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: PROBE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/**
 * Parse the single numeric count out of the engine's cypher output. The engine
 * emits `{ markdown, row_count }` where markdown is a one-column table
 * (`| nodes |\n| --- |\n| 7 |`). Returns null on any unusable shape so the caller
 * degrades — never throws. Tolerant of a leading pino log line.
 */
export function parseCount(stdout: string): number | null {
  const cleaned = stdout
    .split("\n")
    .filter((line) => !/^\s*\{"level":\d+/.test(line))
    .join("\n");
  const start = cleaned.indexOf("{");
  if (start < 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const markdown = (parsed as { markdown?: unknown }).markdown;
  if (typeof markdown !== "string") {
    return null;
  }
  // Last non-empty, non-separator table row holds the value cell.
  const rows = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const cells = rows[i]
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
      continue; // separator row
    }
    const value = cells[0];
    if (value === "nodes" || value === "edges") {
      continue; // header row
    }
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

/**
 * Probe the code graph for a repo: read its REAL node + edge counts from the
 * engine and report LIVE iff edges > 0. Degrade-safe: a missing engine, an
 * un-indexed repo, or unparseable output yields `available: false` with an
 * actionable detail. Never throws.
 */
export async function runCodeGraphDoctor(
  repoRoot: string,
  options: CodeGraphDoctorOptions = {},
): Promise<CodeGraphReport> {
  const exec = options.exec ?? defaultExec;
  const resolveBin =
    options.resolveBin ??
    (() => resolveExecEngine("recodergit", options.recodergitBin));
  const engine = resolveBin();

  let nodes: number | null;
  let edges: number | null;
  try {
    // SEQUENTIAL, not parallel: the engine's embedded graph DB is lock-sensitive,
    // so two concurrent `cypher` processes against the same repo can collide on the
    // DB lock and make one call fail. Counting nodes then edges keeps the probe
    // single-reader and deterministic.
    const nodesOut = await exec(
      engine.cmd,
      [...engine.args, ...buildCountArgs(repoRoot, COUNT_NODES_CYPHER)],
      repoRoot,
    );
    const edgesOut = await exec(
      engine.cmd,
      [...engine.args, ...buildCountArgs(repoRoot, COUNT_EDGES_CYPHER)],
      repoRoot,
    );
    nodes = parseCount(nodesOut);
    edges = parseCount(edgesOut);
  } catch {
    return {
      available: false,
      nodes: 0,
      edges: 0,
      detail:
        "code graph unavailable — recodergit engine not callable (build ts/recodergit or set RECODERGIT_BIN)",
    };
  }

  if (nodes === null || edges === null) {
    return {
      available: false,
      nodes: nodes ?? 0,
      edges: edges ?? 0,
      detail:
        "code graph not indexed for this repo — run `recodergit analyze` (engine reachable but no parseable graph)",
    };
  }
  if (edges <= 0) {
    return {
      available: false,
      nodes,
      edges,
      detail: `code graph empty for this repo (${nodes} nodes, 0 edges) — run \`recodergit analyze\``,
    };
  }
  return {
    available: true,
    nodes,
    edges,
    detail: `code graph live: ${nodes} nodes, ${edges} edges indexed`,
  };
}
