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

/**
 * REAL {@link RepoIntelPort}, backed by the RecoderGit MCP server (option c — the
 * persistent-graph path).
 *
 * Unlike the CLI adapter (which spawns `recodergit impact` per call against a
 * freshly-loaded graph), this adapter talks to a long-lived RecoderGit MCP server
 * over MCP JSON-RPC (`POST /mcp`, `tools/call` for the `impact` tool). The graph
 * is indexed once and kept resident, so per-task context assembly is a cheap
 * remote tool call instead of a cold engine boot.
 *
 * The wire seam is a fully INJECTABLE {@link McpTransport}: a function that takes
 * a tool name + arguments and resolves the MCP `CallToolResult`. The default
 * transport (`createMcpFetchTransport`) performs the real Streamable-HTTP MCP
 * handshake (initialize -> session id -> tools/call) against `RECODERGIT_MCP_URL`.
 * Tests inject a fake transport, so the mapping is verified without a live server.
 *
 * Fail-safe doctrine (brain's law): if no URL is configured, the transport
 * throws, the server returns an error result, or the payload is unparseable,
 * this adapter NEVER throws — it degrades to the injected {@link RepoIntelPort}
 * fallback (the mock-backed {@link ContextPackRepoIntel} by default) and returns
 * that pack instead. Real intelligence is opt-in and additive; its absence can
 * only cost richness, never correctness.
 */

/**
 * One MCP `CallToolResult` — the JSON-RPC `result` of a `tools/call`. The text
 * content of a RecoderGit tool carries the tool's pretty-printed JSON payload
 * (with a trailing "Next:" hint the adapter strips). Untrusted external shape.
 */
export interface McpCallToolResult {
  content?: Array<{ type?: unknown; text?: unknown }> | null;
  isError?: boolean;
}

/**
 * The injectable wire seam. Given a tool name + arguments, resolve the MCP
 * `CallToolResult`. Implementations own transport concerns (HTTP, session,
 * auth); the adapter only maps results. A throw is treated as "engine
 * unavailable" and triggers a per-path skip / global degrade.
 */
export type McpTransport = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<McpCallToolResult>;

export interface RecoderGitMcpRepoIntelOptions {
  /** Override the wire transport (defaults to a fetch-based MCP client). */
  transport?: McpTransport;
  /**
   * MCP server base URL (the `POST /mcp` endpoint). Defaults to
   * `RECODERGIT_MCP_URL`. With neither a `transport` nor a resolvable URL, every
   * call degrades to the fallback without attempting a request.
   */
  url?: string;
  /** Optional Bearer token for the default transport (defaults to `RECODERGIT_MCP_TOKEN`). */
  authToken?: string;
  /**
   * Port used when the real engine is unavailable or unusable. Defaults to the
   * mock-backed {@link ContextPackRepoIntel} so the Brain keeps prior behavior.
   */
  fallback?: RepoIntelPort;
  /** Override fetch (the seam the default transport uses; defaults to global). */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Result parsing (untrusted boundary normalization)
// ---------------------------------------------------------------------------

/** A `recodergit impact` payload as emitted by the engine (untrusted shape). */
interface RecoderGitImpactPayload {
  target?: { filePath?: unknown; name?: unknown } | null;
  risk?: unknown;
  impactedCount?: unknown;
  affected_modules?: unknown;
  byDepth?: unknown;
  error?: unknown;
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
 * Pull the text payload out of an MCP `CallToolResult`. An error result (or one
 * with no usable text content) returns null so the caller can degrade.
 */
function textFromResult(result: McpCallToolResult | null | undefined): string | null {
  if (!result || result.isError) {
    return null;
  }
  if (!Array.isArray(result.content)) {
    return null;
  }
  const parts: string[] = [];
  for (const item of result.content) {
    if (item && typeof item === "object" && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Drop pino-style log lines an engine may prepend to its output, e.g.
 * `{"level":40,"time":...,"name":"recodergit","msg":"..."}` on its own line.
 */
function stripLogLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*\{"level":\d+,"time":/.test(line))
    .join("\n");
}

/**
 * Extract the first balanced JSON object from `text`. RecoderGit appends a
 * `\n\n---\n**Next:** ...` hint after the JSON payload, so a plain `JSON.parse`
 * of the whole string fails — walk braces (string/escape aware) to slice out
 * just the leading object.
 */
function extractLeadingJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/** Parse one MCP impact result into a trusted, target-keyed view (or null). */
export function parseMcpImpact(
  targetPath: string,
  result: McpCallToolResult | null | undefined,
): ParsedImpact | null {
  const text = textFromResult(result);
  if (text === null) {
    return null;
  }
  const json = extractLeadingJsonObject(stripLogLines(text));
  if (json === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
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
  const payload = parsed as RecoderGitImpactPayload;
  const files = filesFromByDepth(payload.byDepth);
  return {
    targetPath,
    rawRisk: str(payload.risk) || "LOW",
    risk: toRisk(payload.risk),
    impactedCount: num(payload.impactedCount),
    modules: modulesFrom(payload.affected_modules),
    upstreamFiles: files.filter((f) => f !== targetPath && !isTestPath(f)),
    testFiles: files.filter(isTestPath),
  };
}

/**
 * Build the `impact` tool arguments for one target path. Mirrors the CLI
 * adapter's argv: resolve the filename stem as the symbol with `file_path` as
 * the disambiguator, walk upstream, include tests. An unresolved guess just
 * makes the tool return an error/disambiguation result, which is skipped.
 */
export function buildImpactToolArgs(
  repoRoot: string,
  targetPath: string,
): Record<string, unknown> {
  return {
    target: symbolFromPath(targetPath),
    direction: "upstream",
    file_path: targetPath,
    repo: repoRoot,
    includeTests: true,
  };
}

/** Derive a candidate symbol name from a file path (its stem). */
function symbolFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.indexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

// ---------------------------------------------------------------------------
// Default fetch transport (real Streamable-HTTP MCP client)
// ---------------------------------------------------------------------------

/** Parse a fetch Response body as either plain JSON-RPC or an SSE event stream. */
async function readJsonRpcResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    // Concatenate `data:` lines; the last JSON-RPC message wins.
    let last: unknown;
    for (const line of body.split("\n")) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("data:")) {
        const data = trimmed.slice("data:".length).trim();
        if (data && data !== "[DONE]") {
          try {
            last = JSON.parse(data);
          } catch {
            // Ignore non-JSON keepalives / partial frames.
          }
        }
      }
    }
    return last;
  }
  return JSON.parse(body);
}

/**
 * Default transport: a minimal Streamable-HTTP MCP client. Lazily performs the
 * `initialize` handshake (capturing the `mcp-session-id`), sends the
 * `notifications/initialized` notification, then issues `tools/call`. Any
 * non-2xx, missing session, or JSON-RPC error throws — the adapter degrades.
 */
export function createMcpFetchTransport(options: {
  url: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
}): McpTransport {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let sessionId: string | undefined;
  let initialized: Promise<void> | undefined;
  let nextId = 1;

  function headers(extra?: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (options.authToken) {
      base["authorization"] = `Bearer ${options.authToken}`;
    }
    if (sessionId) {
      base["mcp-session-id"] = sessionId;
    }
    return { ...base, ...extra };
  }

  async function post(payload: unknown): Promise<Response> {
    if (typeof fetchImpl !== "function") {
      throw new Error("No fetch implementation available for the MCP transport.");
    }
    const response = await fetchImpl(options.url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`MCP server responded ${response.status}.`);
    }
    return response;
  }

  async function ensureInitialized(): Promise<void> {
    if (!initialized) {
      initialized = (async () => {
        const response = await post({
          jsonrpc: "2.0",
          id: nextId++,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "@recoder/brain", version: "0.1.0" },
          },
        });
        sessionId = response.headers.get("mcp-session-id") ?? undefined;
        await readJsonRpcResponse(response); // drain + validate
        // Best-effort initialized notification (server returns 202, no body).
        try {
          await post({ jsonrpc: "2.0", method: "notifications/initialized" });
        } catch {
          // Non-fatal: many servers accept tools/call without it.
        }
      })().catch((error) => {
        // Reset so a later call can retry a fresh handshake.
        initialized = undefined;
        throw error;
      });
    }
    return initialized;
  }

  return async (toolName, args) => {
    await ensureInitialized();
    const response = await post({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });
    const message = (await readJsonRpcResponse(response)) as
      | { result?: McpCallToolResult; error?: { message?: string } }
      | undefined;
    if (!message || typeof message !== "object") {
      throw new Error("Empty MCP tools/call response.");
    }
    if (message.error) {
      throw new Error(message.error.message ?? "MCP tools/call error.");
    }
    return message.result ?? {};
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class RecoderGitMcpRepoIntel implements RepoIntelPort {
  private readonly transport: McpTransport | null;
  private readonly fallback: RepoIntelPort;

  constructor(options: RecoderGitMcpRepoIntelOptions = {}) {
    this.fallback = options.fallback ?? new ContextPackRepoIntel();
    if (options.transport) {
      this.transport = options.transport;
    } else {
      const url = options.url ?? process.env["RECODERGIT_MCP_URL"];
      this.transport = url
        ? createMcpFetchTransport({
            url,
            authToken: options.authToken ?? process.env["RECODERGIT_MCP_TOKEN"],
            fetchImpl: options.fetchImpl,
          })
        : null;
    }
  }

  async contextPack(input: CreateContextPackInput): Promise<ContextPack> {
    // No transport (no URL configured) — degrade without a remote call.
    if (!this.transport) {
      return this.fallback.contextPack(input);
    }
    try {
      const targetPaths = input.task.targetPaths;
      if (targetPaths.length === 0) {
        return this.fallback.contextPack(input);
      }

      const results = await Promise.all(
        targetPaths.map((path) => this.runImpact(input.repoRoot, path)),
      );
      const parsed = results.filter((r): r is ParsedImpact => r !== null);

      // No usable graph data — degrade rather than emit a hollow "real" pack.
      if (parsed.length === 0) {
        return this.fallback.contextPack(input);
      }

      return this.assemblePack(input, parsed);
    } catch {
      // Transport / server unusable — degrade to the fallback, never throw.
      return this.fallback.contextPack(input);
    }
  }

  /** Call the impact tool for one path; null on any per-path failure (skip it). */
  private async runImpact(
    repoRoot: string,
    targetPath: string,
  ): Promise<ParsedImpact | null> {
    if (!this.transport) {
      return null;
    }
    try {
      const result = await this.transport(
        "impact",
        buildImpactToolArgs(repoRoot, targetPath),
      );
      return parseMcpImpact(targetPath, result);
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
            ? `Real RecoderGit MCP impact: ${r.rawRisk} risk, ${r.impactedCount} impacted symbols.`
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
      ...new Set(Array.from(byPath.values()).flatMap((r) => r.modules)),
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

/**
 * Construct the MCP-server-backed RecoderGit repo-intelligence adapter (opt-in).
 * Degrades to the mock-backed {@link ContextPackRepoIntel} by default.
 */
export function createRecoderGitMcpRepoIntel(
  options?: RecoderGitMcpRepoIntelOptions,
): RepoIntelPort {
  return new RecoderGitMcpRepoIntel(options);
}
