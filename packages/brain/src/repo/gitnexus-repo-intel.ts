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
} from "@recoder/git-nexus";
import type { RepoIntelPort } from "../ports/repo-intel.port";
import { ContextPackRepoIntel } from "./repo-intel-adapter";
import { resolveExecEngine } from "../runtime/engine-resolver";

/**
 * REAL {@link RepoIntelPort}, backed by the actual GitNexus engine (ts/gitnexus:
 * tree-sitter parse -> scope resolution -> knowledge graph -> hybrid search).
 *
 * It shells the `gitnexus impact` CLI — one call per target path — behind an
 * INJECTABLE exec, parses the structured JSON the engine emits, and MAPS it into
 * a valid {@link ContextPack} so every existing BrainContext.repo consumer keeps
 * working unchanged. The engine is consumed as an external CLI, never imported,
 * so this package has no build/runtime dependency on a built gitnexus.
 *
 * Fail-safe doctrine (brain's law): if gitnexus is missing, unbuilt, or emits
 * unparseable output, this adapter NEVER throws — it degrades to the injected
 * {@link RepoIntelPort} fallback (the mock-backed {@link ContextPackRepoIntel}
 * by default) and returns that pack instead. Real intelligence is opt-in and
 * additive; its absence can only cost richness, never correctness.
 */

/** Runs a command and resolves its stdout (the seam the test fakes). */
export type GitNexusExec = (
  command: string,
  args: string[],
) => Promise<string>;

export interface GitNexusRepoIntelOptions {
  /** Override the exec (defaults to execFile against the gitnexus binary). */
  exec?: GitNexusExec;
  /**
   * Port used when the real engine is unavailable or unusable. Defaults to the
   * mock-backed {@link ContextPackRepoIntel} so the Brain keeps prior behavior.
   */
  fallback?: RepoIntelPort;
  /** Override the binary name/path (defaults to "gitnexus"). */
  gitnexusBin?: string;
}

/** Default exec: run the gitnexus binary and collect stdout via execFile. */
function defaultExec(command: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Build the argv for `gitnexus impact` over one target path. Tiny and pure so
 * the command surface is trivially auditable and the test can assert it targets
 * the right file + repoRoot. A symbol guess (the filename stem) is passed as the
 * positional target because `impact` resolves a symbol, with `--file` as the
 * disambiguator; an unresolved guess simply makes the CLI error and that path is
 * skipped (degrade), it never corrupts the pack.
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

/** A `gitnexus impact` result as emitted by the CLI (untrusted external shape). */
interface GitNexusImpactResult {
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
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Map gitnexus risk (LOW/MEDIUM/HIGH/CRITICAL) to a ContextPack risk. */
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

/** Parse one impact stdout into a trusted, target-keyed view (or null). */
function parseImpact(targetPath: string, stdout: string): ParsedImpact | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
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
  const result = parsed as GitNexusImpactResult;
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

export class GitNexusRepoIntel implements RepoIntelPort {
  private readonly exec: GitNexusExec;
  private readonly fallback: RepoIntelPort;
  /** Command to spawn — `node` for the vendored build, else a binary name. */
  private readonly cmd: string;
  /** Fixed arg prefix (the vendored entry path) prepended before impact argv. */
  private readonly argsPrefix: string[];

  constructor(options: GitNexusRepoIntelOptions = {}) {
    this.exec = options.exec ?? defaultExec;
    this.fallback = options.fallback ?? new ContextPackRepoIntel();
    // An explicit binary keeps prior behavior; otherwise discover the vendored
    // build (run via node) or fall back to the bare `gitnexus` on PATH.
    const resolved = resolveExecEngine("gitnexus", options.gitnexusBin);
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
      // gitnexus missing / unusable — degrade to the fallback, never throw.
      return this.fallback.contextPack(input);
    }
  }

  /** Run impact for one path; resolve null on any per-path failure (skip it). */
  private async runImpact(
    repoRoot: string,
    targetPath: string,
  ): Promise<ParsedImpact | null> {
    try {
      const stdout = await this.exec(this.cmd, [
        ...this.argsPrefix,
        ...buildImpactArgs(repoRoot, targetPath),
      ]);
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
            ? `Real GitNexus impact: ${r.rawRisk} risk, ${r.impactedCount} impacted symbols.`
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
            reason: `GitNexus graph links this test to ${r.targetPath}.`,
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
          reason: "No GitNexus impact data for this path.",
        };
      }
      return {
        path,
        risk: r.risk,
        reason: `GitNexus impact: ${r.impactedCount} impacted symbols, ${r.rawRisk} risk.`,
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

/** Construct the real GitNexus-backed repo-intelligence adapter (opt-in). */
export function createGitNexusRepoIntel(
  options?: GitNexusRepoIntelOptions,
): RepoIntelPort {
  return new GitNexusRepoIntel(options);
}

/**
 * Smart constructor: the real GitNexus engine with the mock-backed
 * {@link ContextPackRepoIntel} as its degrade target. Use this to opt into real
 * repo intelligence while keeping the Brain's fail-safe behavior. The default
 * `createRepoIntel` stays the safe (mock) default; this is the additive upgrade.
 */
export function createRepoIntelAuto(
  options?: GitNexusRepoIntelOptions,
): RepoIntelPort {
  return new GitNexusRepoIntel(options);
}
