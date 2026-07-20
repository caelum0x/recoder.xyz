/**
 * `GithubModule` — the ONE GitHub composition in the engines domain (docs/modules/
 * github.md: `analyzeRepo · domainMap · reviewPR · openPR · comment · search ·
 * health`). It drives the two REAL seams in place:
 *  - the `gh` CLI (search / pr create / pr comment / pr review-context) through
 *    the shared bounded `runCli` primitive, and
 *  - the vendored `recodergit` engine through the existing `RecoderGitService`
 *    (analyzeRepo / domainMap — flag-gated, fail-safe indexing lifecycle).
 *
 * It is ALSO the single truthful `GithubHealth` source: one probe that reports
 * both facets (`gh`, `recodergitLib`) and folds them into one status —
 * `up` (both), `degraded` (one), `down` (neither). No gh on PATH, an
 * unauthenticated gh, a disabled code-graph flag, or an unbuilt engine each
 * surface a truthful `available:false` + reason — NEVER a faked success.
 *
 * DEGRADE-SAFE LAW (mirrors every engine adapter): no method throws across the
 * seam — every operation returns a typed `InvokeResult` with a truthful reason
 * on failure. All IO (CLI runner, engine service, bin resolution, clock) is
 * injectable so tests never spawn a real process.
 */
import type { Logger } from '../../../shared/logger.js';
import { ok, fail, type InvokeResult } from '../types.js';
import { runCli, type CliResult, type RunCliOptions } from '../adapters/cli/cli-exec.js';
import {
  createRecoderGitService,
  defaultResolveBin,
  type RecoderGitService,
  type IndexState,
  type DomainMap,
} from '../recodergit-service.js';

/** One facet of the unified GitHub health (gh CLI or the recodergit lib). */
export interface GithubFacetHealth {
  readonly available: boolean;
  /** Why the facet is unavailable; required whenever `available` is false. */
  readonly reason?: string;
  /** Human detail when available (gh version line / resolved engine path). */
  readonly detail?: string;
}

/** The ONE truthful GitHub health reading: both facets + the folded status. */
export interface GithubHealth {
  /** `up` = both facets available, `degraded` = exactly one, `down` = neither. */
  readonly status: 'up' | 'degraded' | 'down';
  readonly gh: GithubFacetHealth;
  readonly recodergitLib: GithubFacetHealth;
  readonly checkedAt: string;
}

/** The bounded CLI runner seam (defaults to the shared `runCli`). */
export type GithubCliRunner = (
  bin: string,
  args: readonly string[],
  options?: RunCliOptions,
) => Promise<CliResult>;

export interface GithubModuleDeps {
  readonly log: Logger;
  /** Default repo root for repo-scoped gh calls (pr create/comment/review). */
  readonly repoRoot?: string | null;
  /** Injectable bounded CLI runner. Defaults to the shared `runCli`. */
  readonly runCli?: GithubCliRunner;
  /** The `gh` binary (name resolved via PATH, or an absolute path). */
  readonly ghBin?: string;
  /** Minimal env overlay for gh (e.g. GH_TOKEN forwarded by bootstrap). */
  readonly env?: Readonly<Record<string, string>>;
  /** The shared recodergit service (analyzeRepo/domainMap facet). */
  readonly recodergit?: RecoderGitService;
  /** Resolves the vendored recodergit engine bin (health truth). */
  readonly resolveEngine?: () => string | null;
  readonly now?: () => string;
}

export interface GithubSearchInput {
  readonly query: string;
  readonly limit?: number;
}

export interface GithubOpenPrInput {
  readonly title: string;
  readonly body?: string;
  readonly base?: string;
  readonly head?: string;
  readonly repoRoot?: string;
}

export interface GithubCommentInput {
  readonly pr: string | number;
  readonly body: string;
  readonly repoRoot?: string;
}

export interface GithubReviewPrInput {
  readonly pr: string | number;
  readonly repoRoot?: string;
  /**
   * Optional label for the code-graph impact query (only used to tag the
   * result). The blast-radius always runs against the on-disk `repoRoot`
   * checkout, so this is NOT required for the fusion to fire.
   */
  readonly repoId?: string;
}

/**
 * One changed symbol's blast radius, read from the recodergit code-graph:
 *   - `references` = upstream callers/dependents (`find_references`),
 *   - `callGraph`  = downstream callees/dependencies (`call_graph`).
 * Either facet is `null` when its query degraded (never a fabricated graph);
 * `reason` carries the truthful cause when BOTH facets are null.
 */
export interface PrSymbolImpact {
  readonly symbol: string;
  readonly references: unknown | null;
  readonly callGraph: unknown | null;
  readonly reason?: string;
}

/**
 * The blast-radius annotation folded into a PR review. `available` is true only
 * when the engine produced at least one real reading; otherwise `reason` states
 * the truthful cause (code-graph disabled / repo not indexed / lib absent / no
 * changed symbols) and the review still returns — impact NEVER blocks a review.
 */
export interface PrImpactAnnotation {
  readonly available: boolean;
  readonly reason?: string;
  /** Symbols extracted from the diff (bounded). */
  readonly changedSymbols: readonly string[];
  /** Per-symbol blast radius (callers + callees). Empty when unavailable. */
  readonly symbols: readonly PrSymbolImpact[];
}

export interface GithubAnalyzeRepoInput {
  readonly repoRoot: string;
  readonly repoId: string;
  readonly ref?: string;
}

const PROBE_TIMEOUT_MS = 5_000;
const SEARCH_TIMEOUT_MS = 10_000;
const PR_TIMEOUT_MS = 15_000;
const MAX_DIFF_CHARS = 200_000;
const MAX_SEARCH_LIMIT = 50;
/** Cap the blast-radius fan-out so a huge PR can't spawn hundreds of engine calls. */
const MAX_IMPACT_SYMBOLS = 12;

export class GithubModule {
  private readonly log: Logger;
  private readonly repoRoot: string | null;
  private readonly run: GithubCliRunner;
  private readonly ghBin: string;
  private readonly env: Readonly<Record<string, string>> | undefined;
  private readonly recodergit: RecoderGitService;
  private readonly resolveEngine: () => string | null;
  private readonly now: () => string;

  constructor(deps: GithubModuleDeps) {
    this.log = deps.log;
    this.repoRoot = deps.repoRoot ?? null;
    this.run = deps.runCli ?? runCli;
    this.ghBin = deps.ghBin ?? 'gh';
    this.env = deps.env;
    this.recodergit = deps.recodergit ?? createRecoderGitService();
    this.resolveEngine = deps.resolveEngine ?? defaultResolveBin;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /** `gh search repos <query>` — typed JSON results, truthful fail without gh. */
  async search(input: GithubSearchInput): Promise<InvokeResult<{ query: string; results: unknown }>> {
    const query = str(input.query);
    if (!query) return fail('github.search requires a non-empty query', 'bad_input');
    const limit = clampLimit(input.limit);
    const result = await this.gh(
      ['search', 'repos', query, '--limit', String(limit), '--json', 'fullName,description,url,stargazersCount'],
      { timeoutMs: SEARCH_TIMEOUT_MS },
    );
    if (!result.ok) return this.ghFail('github.search', result);
    return ok({ query, results: parseJsonArray(result.stdout) });
  }

  /** `gh pr create` in the repo root — returns the PR URL gh prints. */
  async openPR(input: GithubOpenPrInput): Promise<InvokeResult<{ url: string }>> {
    const title = str(input.title);
    if (!title) return fail('github.pr.create requires a title', 'bad_input');
    const cwd = str(input.repoRoot) ?? this.repoRoot;
    if (!cwd) return fail('github.pr.create requires a repoRoot (none configured)', 'bad_input');
    const args = ['pr', 'create', '--title', title, '--body', str(input.body) ?? ''];
    const base = str(input.base);
    if (base) args.push('--base', base);
    const head = str(input.head);
    if (head) args.push('--head', head);
    const result = await this.gh(args, { cwd, timeoutMs: PR_TIMEOUT_MS });
    if (!result.ok) return this.ghFail('github.pr.create', result);
    return ok({ url: result.stdout.trim() });
  }

  /** `gh pr comment <pr> --body` in the repo root. */
  async comment(input: GithubCommentInput): Promise<InvokeResult<{ pr: string; url: string }>> {
    const pr = prRef(input.pr);
    const body = str(input.body);
    if (!pr || !body) return fail('github.pr.comment requires pr + body', 'bad_input');
    const cwd = str(input.repoRoot) ?? this.repoRoot;
    if (!cwd) return fail('github.pr.comment requires a repoRoot (none configured)', 'bad_input');
    const result = await this.gh(['pr', 'comment', pr, '--body', body], { cwd, timeoutMs: PR_TIMEOUT_MS });
    if (!result.ok) return this.ghFail('github.pr.comment', result);
    return ok({ pr, url: result.stdout.trim() });
  }

  /**
   * Review context for a PR: `gh pr view --json …` + `gh pr diff` (bounded),
   * ANNOTATED with a recodergit code-graph BLAST RADIUS. After the diff, the
   * changed symbols are extracted and each is scored for impact via the
   * recodergit engine — `find_references` (upstream callers/dependents) +
   * `call_graph` (downstream callees/dependencies) — so a reviewer sees what a
   * change ripples into, not just the raw hunks.
   *
   * Both seams degrade TRUTHFULLY and independently: a failed diff -> `diff:null`
   * with `diffUnavailable`; a disabled / unindexed / unbuilt code-graph ->
   * `impact.available:false` with a truthful reason. Impact NEVER blocks a
   * review and NEVER fabricates a graph.
   */
  async reviewPR(input: GithubReviewPrInput): Promise<
    InvokeResult<{
      pr: unknown;
      diff: string | null;
      diffTruncated: boolean;
      diffUnavailable?: string;
      impact: PrImpactAnnotation;
    }>
  > {
    const pr = prRef(input.pr);
    if (!pr) return fail('github.pr_review requires a pr number/url', 'bad_input');
    const cwd = str(input.repoRoot) ?? this.repoRoot;
    if (!cwd) return fail('github.pr_review requires a repoRoot (none configured)', 'bad_input');
    const view = await this.gh(
      ['pr', 'view', pr, '--json', 'number,title,body,state,url,author,baseRefName,headRefName'],
      { cwd, timeoutMs: PR_TIMEOUT_MS },
    );
    if (!view.ok) return this.ghFail('github.pr_review', view);
    const parsed = safeJson(view.stdout);
    const diffResult = await this.gh(['pr', 'diff', pr], { cwd, timeoutMs: PR_TIMEOUT_MS });
    const diff = diffResult.ok ? diffResult.stdout.slice(0, MAX_DIFF_CHARS) : null;
    const impact = await this.annotateImpact(cwd, diff, input.repoId);
    return ok({
      pr: parsed,
      diff,
      diffTruncated: diffResult.ok && diffResult.stdout.length > MAX_DIFF_CHARS,
      ...(diffResult.ok ? {} : { diffUnavailable: diffResult.reason ?? 'gh pr diff failed' }),
      impact,
    });
  }

  /**
   * Fire the recodergit blast-radius over a PR diff. Truthful, non-blocking:
   * no diff / disabled code-graph / no changed symbols each short-circuit to an
   * `available:false` annotation with a real reason. Per-symbol it runs BOTH
   * impact directions and keeps whatever the engine could produce.
   */
  private async annotateImpact(
    cwd: string,
    diff: string | null,
    repoIdInput?: string,
  ): Promise<PrImpactAnnotation> {
    if (diff === null) {
      return skippedImpact('no diff to analyze (gh pr diff unavailable)');
    }
    // Truthful skip when the code-graph is opted out — NEVER blocks the review.
    if (!this.recodergit.isEnabled()) {
      return skippedImpact('recodergit code-graph disabled (RECODER_CODE_GRAPH_ENABLED off)');
    }
    const changedSymbols = extractChangedSymbols(diff).slice(0, MAX_IMPACT_SYMBOLS);
    if (changedSymbols.length === 0) {
      return skippedImpact('no changed symbols detected in the diff');
    }

    const repoId = str(repoIdInput) ?? repoIdFromRepoRoot(cwd);
    const symbols: PrSymbolImpact[] = [];
    let anyAvailable = false;
    let firstReason: string | undefined;

    for (const symbol of changedSymbols) {
      // Both directions in parallel; the on-disk checkout (cwd) is the target.
      const [refs, calls] = await Promise.all([
        this.safeCodeIntel('find_references', repoId, { symbol, repo: cwd }),
        this.safeCodeIntel('call_graph', repoId, { symbol, repo: cwd }),
      ]);
      const references = refs.available ? (refs.result ?? null) : null;
      const callGraph = calls.available ? (calls.result ?? null) : null;
      if (references !== null || callGraph !== null) anyAvailable = true;
      const reason = references === null && callGraph === null ? refs.reason ?? calls.reason : undefined;
      if (reason && !firstReason) firstReason = reason;
      symbols.push({ symbol, references, callGraph, ...(reason ? { reason } : {}) });
    }

    return {
      available: anyAvailable,
      ...(anyAvailable
        ? {}
        : { reason: firstReason ?? 'code-graph produced no impact (repo not indexed?)' }),
      changedSymbols,
      symbols,
    };
  }

  /**
   * One code-intel query normalized to a flat, non-throwing result. A flag-off
   * `{ enabled:false }`, an `available:false` degrade, or any thrown error all
   * collapse to `{ available:false, reason }` so the review is never blocked.
   */
  private async safeCodeIntel(
    op: 'find_references' | 'call_graph',
    repoId: string,
    params: { symbol: string; repo: string },
  ): Promise<{ available: boolean; result?: unknown; reason?: string }> {
    try {
      const res = await this.recodergit.codeIntel(op, repoId, params);
      if (!res.enabled) {
        return { available: false, reason: 'recodergit code-graph disabled' };
      }
      if (!res.available) {
        return { available: false, reason: res.reason ?? 'code-graph unavailable' };
      }
      return { available: true, result: res.result };
    } catch (err) {
      // codeIntel is contracted never to throw, but stay defensive: impact must
      // never take down a PR review.
      this.log.warn({ op, reason: message(err) }, 'github pr_review impact query degraded');
      return { available: false, reason: message(err) };
    }
  }

  /** Build/refresh the repo code graph via the existing `RecoderGitService`. */
  async analyzeRepo(input: GithubAnalyzeRepoInput): Promise<InvokeResult<IndexState>> {
    const repoRoot = str(input.repoRoot);
    const repoId = str(input.repoId);
    if (!repoRoot || !repoId) return fail('analyzeRepo requires repoRoot + repoId', 'bad_input');
    try {
      const result = await this.recodergit.indexRepo({
        repoRoot,
        repoId,
        ...(str(input.ref) ? { ref: str(input.ref) as string } : {}),
      });
      if (!result.enabled) {
        return fail('recodergit code-graph disabled (set RECODER_CODE_GRAPH_ENABLED)', 'disabled');
      }
      return ok(result.state);
    } catch (err) {
      return fail(`analyzeRepo failed: ${message(err)}`);
    }
  }

  /** Project the engine's groups/route map into a Recoder DomainMap. */
  async domainMap(repoId: string): Promise<InvokeResult<DomainMap>> {
    const id = str(repoId);
    if (!id) return fail('domainMap requires a repoId', 'bad_input');
    try {
      const result = await this.recodergit.domainMap(id);
      if (!result.enabled) {
        return fail('recodergit code-graph disabled (set RECODER_CODE_GRAPH_ENABLED)', 'disabled');
      }
      return ok(result.map);
    } catch (err) {
      return fail(`domainMap failed: ${message(err)}`);
    }
  }

  /** The ONE truthful GitHub health: both facets, never a faked `up`. */
  async health(): Promise<GithubHealth> {
    const [gh, recodergitLib] = await Promise.all([this.probeGh(), this.probeRecodergit()]);
    const available = [gh, recodergitLib].filter((facet) => facet.available).length;
    const status = available === 2 ? 'up' : available === 1 ? 'degraded' : 'down';
    return { status, gh, recodergitLib, checkedAt: this.now() };
  }

  private async probeGh(): Promise<GithubFacetHealth> {
    const version = await this.gh(['--version'], { timeoutMs: PROBE_TIMEOUT_MS });
    if (!version.ok) {
      return { available: false, reason: `gh CLI not available: ${version.reason ?? 'not found on PATH'}` };
    }
    const auth = await this.gh(['auth', 'status'], { timeoutMs: PROBE_TIMEOUT_MS });
    if (!auth.ok) {
      return {
        available: false,
        reason: 'gh CLI present but not authenticated (run `gh auth login` or set GH_TOKEN)',
      };
    }
    return { available: true, detail: version.stdout.trim().split('\n')[0] ?? 'gh' };
  }

  private async probeRecodergit(): Promise<GithubFacetHealth> {
    try {
      if (!this.recodergit.isEnabled()) {
        return { available: false, reason: 'recodergit code-graph disabled (RECODER_CODE_GRAPH_ENABLED off)' };
      }
      const bin = this.resolveEngine();
      if (!bin) {
        return {
          available: false,
          reason: 'recodergit engine not built (set RECODERGIT_BIN or build the vendored dist)',
        };
      }
      return { available: true, detail: bin };
    } catch (err) {
      return { available: false, reason: `recodergit probe failed: ${message(err)}` };
    }
  }

  /** One bounded gh invocation with the minimal env overlay. */
  private gh(args: readonly string[], options: RunCliOptions): Promise<CliResult> {
    return this.run(this.ghBin, args, { ...options, ...(this.env ? { env: this.env } : {}) });
  }

  private ghFail<T>(op: string, result: CliResult): InvokeResult<T> {
    const missing = /ENOENT|not found/i.test(result.reason ?? '');
    const reason = missing
      ? `${op}: gh CLI not found on PATH (install GitHub CLI)`
      : `${op} failed: ${result.reason ?? 'gh error'}`;
    this.log.warn({ op, reason }, 'github module gh call degraded (truthful fail)');
    return fail(reason, missing ? 'unavailable' : 'gh_error');
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function prRef(value: string | number | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value);
  return str(value);
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return 10;
  return Math.min(Math.floor(limit), MAX_SEARCH_LIMIT);
}

function parseJsonArray(stdout: string): unknown {
  const parsed = safeJson(stdout);
  return Array.isArray(parsed) ? parsed : [];
}

function safeJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A truthful "no blast radius" annotation (never a fabricated graph). */
function skippedImpact(reason: string): PrImpactAnnotation {
  return { available: false, reason, changedSymbols: [], symbols: [] };
}

/** Derive a stable, path-safe code-graph label from a repo root's last segment. */
function repoIdFromRepoRoot(cwd: string): string {
  const segment = cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? 'repo';
  const safe = segment.toLowerCase().replace(/[^a-z0-9_-]+/g, '__');
  return safe.length > 0 ? safe : 'repo';
}

/** Identifiers that a declaration regex can capture but which are never symbols. */
const SYMBOL_STOPWORDS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'function', 'class', 'const', 'let',
  'var', 'async', 'await', 'new', 'typeof', 'interface', 'type', 'enum', 'def',
  'func', 'fn', 'public', 'private', 'protected', 'static', 'export', 'default',
  'import', 'from', 'catch', 'else', 'try', 'do', 'in', 'of', 'as',
]);

/**
 * Per-declaration-kind regexes run against added/removed diff lines and hunk
 * headers. Each captures the DECLARED symbol name (group 1) across the common
 * languages in this repo (TS/JS, Python, Go, Rust, Java/C-like).
 */
const DECL_PATTERNS: readonly RegExp[] = [
  /\bfunction\s+([A-Za-z_$][\w$]*)/, // function foo
  /\bclass\s+([A-Za-z_$][\w$]*)/, // class Foo
  /\b(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, // interface/type/enum Foo
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, // const foo = () =>
  /\bdef\s+([A-Za-z_][\w]*)/, // python def foo
  /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/, // go func foo / func (r) foo
  /\bfn\s+([A-Za-z_][\w]*)/, // rust fn foo
  /^\s*(?:public|private|protected|static|async|readonly|override|\s)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={]+)?[{]/, // method foo(...) {
];

/**
 * Extract the changed symbols from a unified git diff. Scans hunk-header context
 * (`@@ … @@ <context>` — usually the enclosing declaration) and every added or
 * removed content line with the language-aware {@link DECL_PATTERNS}. Returns a
 * de-duplicated, order-preserving list of plausible symbol names (stopwords and
 * <2-char names dropped). Exported so the fusion's symbol step is unit-testable.
 */
export function extractChangedSymbols(diff: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const consider = (text: string): void => {
    for (const pattern of DECL_PATTERNS) {
      const match = pattern.exec(text);
      const name = match?.[1];
      if (!name || name.length < 2 || SYMBOL_STOPWORDS.has(name) || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  };

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('@@')) {
      // Hunk header: the context trails the second `@@`.
      const context = raw.slice(raw.indexOf('@@', 2) + 2);
      if (context.trim()) consider(context);
      continue;
    }
    // Only added/removed content lines (skip the +++/--- file headers).
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    if (raw.startsWith('+') || raw.startsWith('-')) consider(raw.slice(1));
  }
  return out;
}
