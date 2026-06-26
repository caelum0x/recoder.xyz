import type { ChangedFileRisk } from "@recoder/recodergit";

/**
 * Shared, engine-agnostic symbol resolution for the RecoderGit repo-intel adapters
 * (CLI + MCP).
 *
 * WHY THIS EXISTS (verified live against the built engine): `recodergit impact`
 * needs a SYMBOL, not a file. The adapters previously GUESSED the symbol as the
 * filename stem, so a file whose main export differs from its stem — e.g.
 * `source/index.ts` exporting `class PQueue`, or any default export — resolved to
 * `{ error: "Target 'index' not found" }` and the whole pack silently degraded to
 * the mock fallback even though the repo WAS indexed. Live proof:
 *
 *   impact index   -f source/index.ts   -> impactedCount 0, "Target not found"
 *   impact --uid Class:source/index.ts:PQueue -> impactedCount 9, MEDIUM risk
 *
 * FIX: resolve a file's ACTUAL symbols from the graph (a `cypher` query keyed on
 * `filePath`), pick its primary/exported top-level declarations, and run impact by
 * their UID (zero ambiguity). The helpers here are pure so both adapters share one
 * verified resolution + merge path and both can unit-test it without a live engine.
 */

/** Risk strings the engine emits, lowest -> highest, for max-merge ranking. */
const RISK_RANK: Record<ChangedFileRisk["risk"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** Top-level declaration kinds that are the "primary" exports of a file. */
const STRUCTURAL_KINDS = new Set([
  "Class",
  "Interface",
  "Enum",
  "Struct",
  "Trait",
  "Type",
]);

/**
 * Default cap on how many symbols per file we run impact for. Bounds the blast of
 * engine calls per target while still covering the common "one class / a few
 * exported functions" file. Primary (structural/exported) symbols rank first, so
 * the cap drops only the least-relevant locals.
 */
export const RESOLVE_SYMBOL_CAP = 5;

/** One symbol of a file as resolved from the knowledge graph (trusted view). */
export interface ResolvedSymbol {
  /** Graph UID, e.g. `Class:source/index.ts:PQueue` (zero-ambiguity impact key). */
  uid: string;
  /** Simple symbol name, e.g. `PQueue`. */
  name: string;
  /** Node label, e.g. `Class`, `Function`, `Method`, `File`. */
  kind: string;
  /** Whether the engine marked the symbol exported. */
  exported: boolean;
}

/** Normalized impact facts for one symbol (the merge inputs, target-agnostic). */
export interface SymbolImpactFacts {
  rawRisk: string;
  risk: ChangedFileRisk["risk"];
  impactedCount: number;
  modules: string[];
  upstreamFiles: string[];
  testFiles: string[];
}

/** A file's merged impact across its resolved symbols, keyed to its path. */
export interface MergedImpact extends SymbolImpactFacts {
  targetPath: string;
  /** How many symbols actually contributed real impact data to this merge. */
  resolvedSymbolCount: number;
}

/**
 * Build the Cypher that lists a file's symbols by `filePath`. Returns id/name/
 * kind/exported as a Markdown table (the engine's only cypher output mode). The
 * path is single-quoted with `'` escaped so an exotic path can only ever make the
 * query error (-> empty resolution -> degrade), never break out of the literal.
 */
export function buildSymbolResolveCypher(filePath: string): string {
  const escaped = filePath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return (
    `MATCH (s) WHERE s.filePath = '${escaped}' ` +
    "RETURN s.id AS uid, s.name AS name, label(s) AS kind, s.isExported AS exported " +
    "LIMIT 500"
  );
}

/**
 * Drop pino-style log lines an engine may prepend (e.g. the FTS-unavailable
 * notice) so the structured payload that follows still parses.
 */
function stripLogLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*\{"level":\d+/.test(line))
    .join("\n");
}

/**
 * Slice the first balanced JSON object out of `text`. The CLI emits a clean object
 * on stdout; the MCP tool wraps the same `{ markdown, row_count }` payload in text
 * content that may carry a trailing `Next:` hint. Brace-walking (string/escape
 * aware) tolerates both.
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

/** Split one Markdown table row `| a | b |` into trimmed cell strings. */
function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) {
    return [];
  }
  // Drop the leading/trailing pipe, then split. Identifier columns never contain
  // a literal `|`, so a naive split is safe for the uid/name/kind/exported shape.
  return trimmed
    .slice(1, trimmed.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => cell.trim());
}

/** True when a Markdown separator row (`| --- | --- |`). */
function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * Parse a `cypher` output payload (`{ markdown, row_count }`, possibly log-prefixed
 * or hint-suffixed) into resolved symbols. Returns `[]` on any unusable shape so
 * the caller degrades — never throws.
 */
export function parseResolvedSymbols(rawOutput: string): ResolvedSymbol[] {
  const json = extractLeadingJsonObject(stripLogLines(rawOutput));
  if (json === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const markdown = (parsed as { markdown?: unknown }).markdown;
  if (typeof markdown !== "string") {
    return [];
  }

  const lines = markdown.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  const header = splitRow(lines[0]).map((c) => c.toLowerCase());
  const uidIdx = header.indexOf("uid");
  const nameIdx = header.indexOf("name");
  const kindIdx = header.indexOf("kind");
  const exportedIdx = header.indexOf("exported");
  if (uidIdx < 0 || nameIdx < 0) {
    return [];
  }

  const out: ResolvedSymbol[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitRow(line);
    if (cells.length === 0 || isSeparatorRow(cells)) {
      continue;
    }
    const uid = cells[uidIdx] ?? "";
    const name = cells[nameIdx] ?? "";
    if (!uid || !name) {
      continue;
    }
    out.push({
      uid,
      name,
      kind: kindIdx >= 0 ? (cells[kindIdx] ?? "") : "",
      exported: exportedIdx >= 0 ? cells[exportedIdx] === "true" : false,
    });
  }
  return out;
}

/**
 * A symbol is a top-level declaration (not a member/local) when the last segment
 * of its UID equals its name and the name is a plain identifier. Members carry a
 * dotted owner in the UID tail (e.g. `…:PQueue.run`), so they fail this test.
 */
function isTopLevel(symbol: ResolvedSymbol): boolean {
  if (!symbol.name || symbol.name.includes(".") || symbol.name.startsWith("#")) {
    return false;
  }
  const lastColon = symbol.uid.lastIndexOf(":");
  const tail = lastColon >= 0 ? symbol.uid.slice(lastColon + 1) : symbol.uid;
  return tail === symbol.name;
}

/** Lower score = higher priority: structural first, then exported. */
function primaryScore(symbol: ResolvedSymbol): number {
  const structural = STRUCTURAL_KINDS.has(symbol.kind) ? 0 : 1;
  const exported = symbol.exported ? 0 : 1;
  return structural * 10 + exported;
}

/**
 * Choose the most relevant symbols of a file to run impact for: its top-level
 * declarations, ranked structural-then-exported, capped. Empty in -> empty out, so
 * a file with no resolvable symbols cleanly degrades.
 */
export function pickPrimarySymbols(
  symbols: ResolvedSymbol[],
  cap: number = RESOLVE_SYMBOL_CAP,
): ResolvedSymbol[] {
  const seen = new Set<string>();
  const topLevel = symbols.filter((s) => {
    if (s.kind === "File" || seen.has(s.uid) || !isTopLevel(s)) {
      return false;
    }
    seen.add(s.uid);
    return true;
  });
  topLevel.sort(
    (a, b) => primaryScore(a) - primaryScore(b) || a.name.localeCompare(b.name),
  );
  return topLevel.slice(0, Math.max(0, cap));
}

/** Union of two string arrays, preserving first-seen order. */
function union(into: Set<string>, values: string[]): void {
  for (const v of values) {
    into.add(v);
  }
}

/**
 * Aggregate per-symbol impact facts into one file-level result: risk is the MAX
 * across symbols (worst case wins), counts sum, and modules/upstream/test files
 * union. Returns null when nothing usable was resolved, so the caller can degrade.
 */
export function mergeSymbolImpacts(
  targetPath: string,
  facts: SymbolImpactFacts[],
): MergedImpact | null {
  if (facts.length === 0) {
    return null;
  }
  const modules = new Set<string>();
  const upstreamFiles = new Set<string>();
  const testFiles = new Set<string>();
  let impactedCount = 0;
  let risk: ChangedFileRisk["risk"] = "low";
  let rawRisk = "LOW";

  for (const f of facts) {
    impactedCount += f.impactedCount;
    union(modules, f.modules);
    union(upstreamFiles, f.upstreamFiles);
    union(testFiles, f.testFiles);
    if (RISK_RANK[f.risk] > RISK_RANK[risk]) {
      risk = f.risk;
      rawRisk = f.rawRisk;
    }
  }

  return {
    targetPath,
    resolvedSymbolCount: facts.length,
    rawRisk,
    risk,
    impactedCount,
    modules: [...modules],
    upstreamFiles: [...upstreamFiles],
    testFiles: [...testFiles],
  };
}
