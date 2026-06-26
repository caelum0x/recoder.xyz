import { execFile } from "node:child_process";
import {
  relatedTestsForPaths,
  type ChangedFileRisk,
  type ContextPack,
  type CreateContextPackInput,
  type DependencyEdge,
  type DependencyGraph,
  type ImpactReport,
  type TestTarget,
  type TestTargetMap,
} from "@recoder/recodergit";
import type { RepoIntelPort } from "../ports/repo-intel.port";
import { ContextPackRepoIntel } from "./repo-intel-adapter";
import { RecoderGitMcpRepoIntel } from "./recodergit-mcp-repo-intel";
import { resolveExecEngine } from "../runtime/engine-resolver";
import {
  buildSymbolResolveCypher,
  mergeSymbolImpacts,
  parseResolvedSymbols,
  pickPrimarySymbols,
} from "./recodergit-symbol-resolve";

/**
 * REAL {@link RepoIntelPort}, backed by the actual RecoderGit engine (ts/recodergit:
 * tree-sitter parse -> scope resolution -> knowledge graph -> hybrid search).
 *
 * It shells the `recodergit impact` CLI — one call per target path — behind an
 * INJECTABLE exec, parses the structured JSON the engine emits, and MAPS it into
 * a valid {@link ContextPack} so every existing BrainContext.repo consumer keeps
 * working unchanged. The engine is consumed as an external CLI, never imported,
 * so this package has no build/runtime dependency on a built recodergit.
 *
 * Fail-safe doctrine (brain's law): if recodergit is missing, unbuilt, or emits
 * unparseable output, this adapter NEVER throws — it degrades to the injected
 * {@link RepoIntelPort} fallback (the mock-backed {@link ContextPackRepoIntel}
 * by default) and returns that pack instead. Real intelligence is opt-in and
 * additive; its absence can only cost richness, never correctness.
 */

/** Where/how a single recodergit invocation runs (the cwd it resolves from). */
export interface RecoderGitExecOptions {
  /**
   * Working directory for the spawned process. `impact` is run from the analyzed
   * repo root so its repo + relative `--file` resolution match how the engine
   * indexed the tree (verified live: running outside the repo still works with an
   * explicit `--repo`, but the repo root is the natural, drift-free context).
   */
  cwd?: string;
}

/** Runs a command and resolves its stdout (the seam the test fakes). */
export type RecoderGitExec = (
  command: string,
  args: string[],
  options?: RecoderGitExecOptions,
) => Promise<string>;

export interface RecoderGitRepoIntelOptions {
  /** Override the exec (defaults to execFile against the recodergit binary). */
  exec?: RecoderGitExec;
  /**
   * Port used when the real engine is unavailable or unusable. Defaults to the
   * mock-backed {@link ContextPackRepoIntel} so the Brain keeps prior behavior.
   */
  fallback?: RepoIntelPort;
  /** Override the binary name/path (defaults to "recodergit"). */
  recodergitBin?: string;
}

/**
 * Largest stdout an impact call may emit before execFile aborts. A real impact
 * report over a large graph (depth-3, hundreds of symbols) is well under this;
 * the generous cap keeps a big-but-valid result from being truncated into an
 * unparseable string (which would needlessly degrade an otherwise-good answer).
 */
const EXEC_MAX_BUFFER = 64 * 1024 * 1024;

/** Default exec: run the recodergit binary and collect stdout via execFile. */
function defaultExec(
  command: string,
  args: string[],
  options?: RecoderGitExecOptions,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: options?.cwd, maxBuffer: EXEC_MAX_BUFFER },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        // execFile captures stdout only; recodergit writes its pino logs to stderr,
        // so stdout is already clean JSON. The parser still strips any stray log
        // line defensively in case a different exec merges the streams.
        resolve(stdout);
      },
    );
  });
}

/**
 * Build the argv for the `cypher` call that RESOLVES a file's symbols. This is the
 * robust replacement for the filename-stem guess: instead of assuming the symbol
 * name equals the file stem (which fails for `source/index.ts` exporting `class
 * PQueue`, or any default export — verified live: `impact index -f source/index.ts`
 * -> `{ error: "Target 'index' not found" }`), we ask the graph for the file's
 * actual declarations, then impact them by UID.
 */
export function buildSymbolResolveArgs(
  repoRoot: string,
  targetPath: string,
): string[] {
  return ["cypher", buildSymbolResolveCypher(targetPath), "--repo", repoRoot];
}

/**
 * Build the argv for `recodergit impact` by UID — the zero-ambiguity form. A graph
 * UID (e.g. `Class:source/index.ts:PQueue`) skips name resolution entirely, so the
 * blast radius is exact (verified live: `impact --uid Class:source/index.ts:PQueue`
 * -> impactedCount 9, MEDIUM risk, real `byDepth`).
 */
export function buildImpactByUidArgs(repoRoot: string, uid: string): string[] {
  return [
    "impact",
    "--uid",
    uid,
    "--repo",
    repoRoot,
    "--direction",
    "upstream",
    "--include-tests",
  ];
}

/**
 * Build the argv for `recodergit impact` by the filename STEM — the legacy guess,
 * retained ONLY as a last-resort fallback for files whose main export happens to
 * match the stem (so prior behavior is never lost when symbol resolution can't run,
 * e.g. against an older engine without `cypher`).
 *
 * Verified live against the built engine (`dist/cli/index.js`):
 *  - `impact <symbol>` requires a POSITIONAL symbol — there is no file-only mode
 *    (`impact --file x` exits with a usage error). The filename stem is passed as
 *    the symbol guess, with `--file` as the disambiguator; an unresolved guess
 *    just makes the CLI emit `{ "error": "Target '…' not found" }`, which the
 *    parser treats as no data and skips (degrade) — it never corrupts the pack.
 *  - `--repo` resolves a repo PATH to its canonical index, so the absolute
 *    repoRoot is passed here. (The CLI also accepts the registered alias, but the
 *    alias is remote-derived for git repos and not always the basename, whereas
 *    the path is unambiguous. `--json` is NOT a flag — it errors — output is JSON
 *    by default.) The adapter additionally runs this with `cwd = repoRoot`.
 */
export function buildImpactArgs(repoRoot: string, targetPath: string): string[] {
  return [
    "impact",
    symbolFromPath(targetPath),
    "--file",
    targetPath,
    "--repo",
    repoRoot,
    "--direction",
    "upstream",
    "--include-tests",
  ];
}

/** Derive a candidate symbol name from a file path (its stem). */
function symbolFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.indexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/** A `recodergit impact` result as emitted by the CLI (untrusted external shape). */
interface RecoderGitImpactResult {
  target?: { filePath?: unknown; name?: unknown } | null;
  risk?: unknown;
  impactedCount?: unknown;
  affected_modules?: unknown;
  byDepth?: unknown;
}

/** A normalized, trusted view of one impact result keyed to its target path. */
interface ParsedImpact {
  targetPath: string;
  rawRisk: string;
  risk: ChangedFileRisk["risk"];
  impactedCount: number;
  modules: string[];
  upstreamFiles: string[];
  testFiles: string[];
  /** How many real symbols backed this result (>=1 for resolved, undefined for legacy). */
  resolvedSymbolCount?: number;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Map recodergit risk (LOW/MEDIUM/HIGH/CRITICAL) to a ContextPack risk. */
function toRisk(value: unknown): ChangedFileRisk["risk"] {
  const v = str(value).toUpperCase();
  if (v === "HIGH" || v === "CRITICAL") {
    return "high";
  }
  if (v === "MEDIUM") {
    return "medium";
  }
  return "low";
}

function isTestPath(filePath: string): boolean {
  return /(\.|_)(test|spec)\.|(^|\/)__tests__\//.test(filePath);
}

/** Collect distinct symbol file paths across every depth bucket of `byDepth`. */
function filesFromByDepth(byDepth: unknown): string[] {
  if (!byDepth || typeof byDepth !== "object") {
    return [];
  }
  const out = new Set<string>();
  for (const bucket of Object.values(byDepth as Record<string, unknown>)) {
    if (!Array.isArray(bucket)) {
      continue;
    }
    for (const item of bucket) {
      if (item && typeof item === "object") {
        const fp = str((item as { filePath?: unknown }).filePath);
        if (fp) {
          out.add(fp);
        }
      }
    }
  }
  return [...out];
}

/** Collect distinct module names from the impact result's affected_modules. */
function modulesFrom(affectedModules: unknown): string[] {
  if (!Array.isArray(affectedModules)) {
    return [];
  }
  const out = new Set<string>();
  for (const item of affectedModules) {
    if (item && typeof item === "object") {
      const name = str((item as { name?: unknown }).name);
      if (name) {
        out.add(name);
      }
    }
  }
  return [...out];
}

/**
 * recodergit emits its structured result as JSON on stdout, but its pino logger can
 * prepend single-line records like `{"level":40,"time":…,"name":"recodergit",…}`
 * (e.g. the "FTS extension unavailable" notice). Verified live: with execFile
 * those go to stderr, so stdout is already clean — but this strips any such line
 * defensively so a merged-stream exec (or a future log on stdout) still parses.
 * Only whole log lines (a line that STARTS the pino envelope) are dropped; a
 * pretty-printed result's own lines never begin with `{"level":<n>`.
 */
function stripLogLines(stdout: string): string {
  return stdout
    .split("\n")
    .filter((line) => !/^\s*\{"level":\d+/.test(line))
    .join("\n");
}

/** Parse one impact stdout into a trusted, target-keyed view (or null). */
function parseImpact(targetPath: string, stdout: string): ParsedImpact | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripLogLines(stdout));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  // A structured-error payload ({ error, ... }) is not usable intelligence.
  if (typeof (parsed as { error?: unknown }).error === "string") {
    return null;
  }
  const result = parsed as RecoderGitImpactResult;
  const files = filesFromByDepth(result.byDepth);
  return {
    targetPath,
    rawRisk: str(result.risk) || "LOW",
    risk: toRisk(result.risk),
    impactedCount: num(result.impactedCount),
    modules: modulesFrom(result.affected_modules),
    upstreamFiles: files.filter((f) => f !== targetPath && !isTestPath(f)),
    testFiles: files.filter(isTestPath),
  };
}

export class RecoderGitRepoIntel implements RepoIntelPort {
  private readonly exec: RecoderGitExec;
  private readonly fallback: RepoIntelPort;
  /** Command to spawn — `node` for the vendored build, else a binary name. */
  private readonly cmd: string;
  /** Fixed arg prefix (the vendored entry path) prepended before impact argv. */
  private readonly argsPrefix: string[];

  constructor(options: RecoderGitRepoIntelOptions = {}) {
    this.exec = options.exec ?? defaultExec;
    this.fallback = options.fallback ?? new ContextPackRepoIntel();
    // An explicit binary keeps prior behavior; otherwise discover the vendored
    // build (run via node) or fall back to the bare `recodergit` on PATH.
    const resolved = resolveExecEngine("recodergit", options.recodergitBin);
    this.cmd = resolved.cmd;
    this.argsPrefix = resolved.args;
  }

  async contextPack(input: CreateContextPackInput): Promise<ContextPack> {
    try {
      const targetPaths = input.task.targetPaths;
      if (targetPaths.length === 0) {
        return this.fallback.contextPack(input);
      }

      const results = await Promise.all(
        targetPaths.map((path) => this.runImpact(input.repoRoot, path)),
      );
      const parsed = results.filter(
        (r): r is ParsedImpact => r !== null,
      );

      // No usable graph data — degrade rather than emit a hollow "real" pack.
      if (parsed.length === 0) {
        return this.fallback.contextPack(input);
      }

      return this.assemblePack(input, parsed);
    } catch {
      // recodergit missing / unusable — degrade to the fallback, never throw.
      return this.fallback.contextPack(input);
    }
  }

  /**
   * Resolve a path's REAL symbols, then impact them by UID; merge into one result.
   * Resolves null on any per-path failure (skip it). Falls back to the legacy
   * stem-guess impact only when symbol resolution yields nothing usable, so files
   * whose export matches the stem (and older engines without `cypher`) still work.
   */
  private async runImpact(
    repoRoot: string,
    targetPath: string,
  ): Promise<ParsedImpact | null> {
    const symbols = pickPrimarySymbols(
      await this.resolveSymbols(repoRoot, targetPath),
    );
    if (symbols.length > 0) {
      const facts = await Promise.all(
        symbols.map((s) => this.impactByUid(repoRoot, targetPath, s.uid)),
      );
      const merged = mergeSymbolImpacts(
        targetPath,
        facts.filter((f): f is ParsedImpact => f !== null),
      );
      if (merged) {
        return merged;
      }
    }
    // No resolvable symbols (or none produced impact) — legacy stem guess.
    return this.impactByStem(repoRoot, targetPath);
  }

  /** Ask the graph for a file's symbols; resolve [] on any failure (degrade). */
  private async resolveSymbols(
    repoRoot: string,
    targetPath: string,
  ): Promise<ReturnType<typeof parseResolvedSymbols>> {
    try {
      const stdout = await this.exec(
        this.cmd,
        [...this.argsPrefix, ...buildSymbolResolveArgs(repoRoot, targetPath)],
        { cwd: repoRoot },
      );
      return parseResolvedSymbols(stdout);
    } catch {
      return [];
    }
  }

  /** Run impact for one resolved symbol UID; null on any failure (skip it). */
  private async impactByUid(
    repoRoot: string,
    targetPath: string,
    uid: string,
  ): Promise<ParsedImpact | null> {
    try {
      const stdout = await this.exec(
        this.cmd,
        [...this.argsPrefix, ...buildImpactByUidArgs(repoRoot, uid)],
        { cwd: repoRoot },
      );
      return parseImpact(targetPath, stdout);
    } catch {
      return null;
    }
  }

  /** Legacy fallback: impact by the filename stem; null on any failure (skip it). */
  private async impactByStem(
    repoRoot: string,
    targetPath: string,
  ): Promise<ParsedImpact | null> {
    try {
      const stdout = await this.exec(
        this.cmd,
        [...this.argsPrefix, ...buildImpactArgs(repoRoot, targetPath)],
        { cwd: repoRoot },
      );
      return parseImpact(targetPath, stdout);
    } catch {
      return null;
    }
  }

  /** Map real impact results into a valid ContextPack (boundary normalization). */
  private assemblePack(
    input: CreateContextPackInput,
    results: ParsedImpact[],
  ): ContextPack {
    const indexedAt = new Date().toISOString();
    const targetPaths = input.task.targetPaths;
    const byPath = new Map(results.map((r) => [r.targetPath, r]));

    const dependencyGraph = this.buildDependencyGraph(
      input.repoRoot,
      results,
      indexedAt,
    );
    const testTargetMap = this.buildTestTargetMap(input, results);
    const impactReport = this.buildImpactReport(
      input,
      targetPaths,
      byPath,
      testTargetMap,
      indexedAt,
    );

    return {
      taskId: input.task.taskId,
      repoMap: input.repoMap ?? {
        repoRoot: input.repoRoot,
        packageGlobs: ["packages/*", "apps/*", "docker-backend"],
        indexedAt,
      },
      dependencyGraph,
      ownershipMap: input.ownershipMap ?? { entries: [] },
      testTargetMap,
      impactReport,
      sourceRefs: targetPaths.map((path) => {
        const r = byPath.get(path);
        return {
          kind: "git_nexus" as const,
          ref: path,
          detail: r
            ? `Real RecoderGit impact: ${r.rawRisk} risk, ${r.impactedCount} impacted symbols` +
              (r.resolvedSymbolCount
                ? ` across ${r.resolvedSymbolCount} resolved symbol(s).`
                : ".")
            : "Target path included in Git Nexus context pack (no graph data).",
        };
      }),
    };
  }

  private buildDependencyGraph(
    repoRoot: string,
    results: ParsedImpact[],
    indexedAt: string,
  ): DependencyGraph {
    const nodes = new Set<string>();
    const edges: DependencyEdge[] = [];
    for (const r of results) {
      nodes.add(r.targetPath);
      for (const dep of r.upstreamFiles) {
        nodes.add(dep);
        // Upstream callers depend on the changed target.
        edges.push({ from: dep, to: r.targetPath, kind: "depends_on" });
      }
      for (const test of r.testFiles) {
        nodes.add(test);
        edges.push({ from: test, to: r.targetPath, kind: "tests" });
      }
    }
    return { repoRoot, nodes: [...nodes], edges, indexedAt };
  }

  private buildTestTargetMap(
    input: CreateContextPackInput,
    results: ParsedImpact[],
  ): TestTargetMap {
    const seeded = input.testTargetMap?.targets ?? [];
    const known = new Set(seeded.map((t) => t.pathGlob));
    const discovered: TestTarget[] = [];
    for (const r of results) {
      for (const test of r.testFiles) {
        if (!known.has(test)) {
          known.add(test);
          discovered.push({
            pathGlob: test,
            commands: [],
            reason: `RecoderGit graph links this test to ${r.targetPath}.`,
          });
        }
      }
    }
    return { targets: [...seeded, ...discovered] };
  }

  private buildImpactReport(
    input: CreateContextPackInput,
    targetPaths: string[],
    byPath: Map<string, ParsedImpact>,
    testTargetMap: TestTargetMap,
    generatedAt: string,
  ): ImpactReport {
    const impactedPackages = [
      ...new Set(
        Array.from(byPath.values()).flatMap((r) => r.modules),
      ),
    ];
    const changedFileRisks: ChangedFileRisk[] = targetPaths.map((path) => {
      const r = byPath.get(path);
      if (!r) {
        return {
          path,
          risk: "low",
          reason: "No RecoderGit impact data for this path.",
        };
      }
      return {
        path,
        risk: r.risk,
        reason: `RecoderGit impact: ${r.impactedCount} impacted symbols, ${r.rawRisk} risk.`,
      };
    });
    return {
      taskId: input.task.taskId,
      targetPaths,
      impactedPackages,
      relatedTests: relatedTestsForPaths(testTargetMap, targetPaths),
      changedFileRisks,
      generatedAt,
    };
  }
}

/** Construct the real RecoderGit-backed repo-intelligence adapter (opt-in). */
export function createRecoderGitRepoIntel(
  options?: RecoderGitRepoIntelOptions,
): RepoIntelPort {
  return new RecoderGitRepoIntel(options);
}

/**
 * Smart constructor: a degrade-safe PREFERENCE CHAIN over the RecoderGit backends,
 * each one falling through to the next so absence only ever costs richness:
 *
 *   MCP server (persistent graph)  ->  CLI (cold per-call engine)  ->  context-pack (mock)
 *
 * When `RECODERGIT_MCP_URL` is set the long-lived MCP server is preferred; it
 * degrades to the `recodergit` CLI adapter, which itself degrades to the
 * mock-backed {@link ContextPackRepoIntel}. With no URL configured the chain
 * starts at the CLI (-> context-pack). Use this to opt into real repo
 * intelligence while keeping the Brain's fail-safe behavior; the default
 * `createRepoIntel` stays the safe (mock) default — this is the additive upgrade.
 */
export function createRepoIntelAuto(
  options?: RecoderGitRepoIntelOptions,
): RepoIntelPort {
  // CLI -> context-pack: RecoderGitRepoIntel's fallback defaults to ContextPackRepoIntel.
  const cli = new RecoderGitRepoIntel(options);
  // Prefer the persistent MCP graph when a server URL is configured; it degrades
  // to the CLI, which in turn degrades to the mock-backed context pack.
  if (process.env["RECODERGIT_MCP_URL"]) {
    return new RecoderGitMcpRepoIntel({ fallback: cli });
  }
  return cli;
}
