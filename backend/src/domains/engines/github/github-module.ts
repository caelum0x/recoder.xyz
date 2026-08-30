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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractChangedSymbolLocations, extractChangedSymbols } from '../../../shared/changed-symbols.js';
export { extractChangedSymbolLocations, extractChangedSymbols } from '../../../shared/changed-symbols.js';
import { canonicalRepositoryIdentity } from '../../../shared/repo-identity.js';
import { parseRepositoryReviewRulesJson } from '../../../shared/repository-review-rules.js';
import type {
  CodeImpactConsumer,
  CodeImpactDirection,
  CodeImpactFile,
  CodeImpactLedger,
  CodeImpactProcess,
  CodeImpactRisk,
  CodeImpactScope,
} from '../../../shared/code-impact-ledger.js';
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
  readonly readTextFile?: (filePath: string) => Promise<string | null>;
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

export interface GithubSubmitReviewInput {
  readonly pr: string | number;
  readonly body: string;
  readonly event: 'comment' | 'approve' | 'request_changes';
  readonly repoRoot?: string;
  /** Exact PR head reviewed; required when comments are submitted inline. */
  readonly commitId?: string;
  readonly comments?: readonly {
    readonly path: string;
    readonly line: number;
    readonly body: string;
  }[];
}

export interface GithubReviewThread {
  readonly id: string;
  readonly path: string;
  readonly line: number;
  readonly isResolved: boolean;
  readonly isOutdated: boolean;
  readonly url?: string;
  readonly rootBody: string;
  readonly resolvedBy?: string;
}

export interface GithubReviewPrInput {
  readonly pr: string | number;
  readonly repoRoot?: string;
  /**
   * Optional prior repository label. The PR URL supplies canonical remote
   * identity when available; this value remains a compatibility alias.
   */
  readonly repoId?: string;
}

export interface GithubLinkedIssueRequirement {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'OPEN' | 'CLOSED';
  readonly url: string;
  readonly labels: readonly string[];
}

export interface GithubLinkedRequirementContext {
  readonly issues: readonly GithubLinkedIssueRequirement[];
  readonly unavailable: readonly { readonly number: number; readonly reason: string }[];
}

export interface GithubReviewRule {
  readonly id: string;
  readonly level: 'required' | 'advisory';
  readonly text: string;
  readonly source: string;
  /** Exact named check from `.recoder/checks.json`, when the rule is executable. */
  readonly check?: string;
}

export interface GithubReviewRulesContext {
  readonly rules: readonly GithubReviewRule[];
  readonly source?: string;
  readonly unavailable?: string;
}

export interface GithubListOpenPullRequestsInput {
  readonly repoRoot?: string;
  readonly limit?: number;
}

export interface GithubOpenPullRequest {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly headSha: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly isDraft: boolean;
  readonly updatedAt: string;
  readonly author?: string;
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
  readonly filePath?: string;
  readonly references: unknown | null;
  readonly callGraph: unknown | null;
  readonly reason?: string;
}

export type PrImpactDirection = CodeImpactDirection;
export type PrImpactRisk = CodeImpactRisk;
export type PrImpactScope = CodeImpactScope;
export type PrImpactProcess = CodeImpactProcess;
/** One bounded, code-graph-proven file reached from a changed symbol. */
export type PrImpactFile = CodeImpactFile;

/**
 * The blast-radius annotation folded into a PR review. `available` is true only
 * when the engine produced at least one real reading; otherwise `reason` states
 * the truthful cause (code-graph disabled / repo not indexed / lib absent / no
 * changed symbols) and the review still returns — impact NEVER blocks a review.
 */
export interface PrImpactAnnotation extends CodeImpactLedger {
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
const MAX_IMPACT_FILES = 100;
const MAX_IMPACT_PROCESSES = 30;
const MAX_IMPACT_CONSUMERS = 100;
const IMPACT_QUERY_LIMIT = 20;
const IMPACT_MAX_DEPTH = 3;
const MAX_LINKED_ISSUES = 5;
const MAX_REVIEW_RULES = 30;
const MAX_REVIEW_RULE_FILE_CHARS = 64_000;

const REVIEW_THREADS_QUERY = `
query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes {
          id
          path
          line
          originalLine
          isResolved
          isOutdated
          resolvedBy { login }
          comments(first: 1) { nodes { body url } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

export class GithubModule {
  private readonly log: Logger;
  private readonly repoRoot: string | null;
  private readonly run: GithubCliRunner;
  private readonly ghBin: string;
  private readonly env: Readonly<Record<string, string>> | undefined;
  private readonly recodergit: RecoderGitService;
  private readonly resolveEngine: () => string | null;
  private readonly now: () => string;
  private readonly readTextFile: (filePath: string) => Promise<string | null>;

  constructor(deps: GithubModuleDeps) {
    this.log = deps.log;
    this.repoRoot = deps.repoRoot ?? null;
    this.run = deps.runCli ?? runCli;
    this.ghBin = deps.ghBin ?? 'gh';
    this.env = deps.env;
    this.recodergit = deps.recodergit ?? createRecoderGitService();
    this.resolveEngine = deps.resolveEngine ?? defaultResolveBin;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.readTextFile = deps.readTextFile ?? (async (filePath) => {
      try {
        return await readFile(filePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    });
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

  /** Human-triggered native GitHub review (never called by the watcher itself). */
  async submitReview(
    input: GithubSubmitReviewInput,
  ): Promise<InvokeResult<{ pr: string; event: GithubSubmitReviewInput['event']; inlineCount: number }>> {
    const pr = prRef(input.pr);
    const body = str(input.body);
    if (!pr || !body) return fail('github.pr.review.submit requires pr + body', 'bad_input');
    const cwd = str(input.repoRoot) ?? this.repoRoot;
    if (!cwd) return fail('github.pr.review.submit requires a repoRoot (none configured)', 'bad_input');
    const comments = (input.comments ?? []).flatMap((comment) => {
      const path = str(comment.path);
      const commentBody = str(comment.body);
      const line = Number.isInteger(comment.line) && comment.line > 0 ? comment.line : 0;
      if (!path || path.startsWith('/') || path.split('/').includes('..') || !line || !commentBody) return [];
      return [{ path, line, side: 'RIGHT' as const, body: commentBody }];
    });
    if (comments.length !== (input.comments?.length ?? 0)) {
      return fail('github.pr.review.submit received an invalid inline comment', 'bad_input');
    }
    const flag = input.event === 'approve'
      ? '--approve'
      : input.event === 'request_changes'
        ? '--request-changes'
        : input.event === 'comment'
          ? '--comment'
          : null;
    if (!flag) return fail('github.pr.review.submit requires a valid event', 'bad_input');
    if (comments.length > 0) {
      const commitId = str(input.commitId);
      if (!commitId) return fail('github.pr.review.submit requires commitId for inline comments', 'bad_input');
      const event = input.event === 'approve'
        ? 'APPROVE'
        : input.event === 'request_changes'
          ? 'REQUEST_CHANGES'
          : 'COMMENT';
      const payload = JSON.stringify({ commit_id: commitId, body, event, comments });
      const result = await this.gh(
        ['api', `repos/{owner}/{repo}/pulls/${pr}/reviews`, '--method', 'POST', '--input', '-'],
        { cwd, timeoutMs: PR_TIMEOUT_MS, stdin: payload },
      );
      if (!result.ok) return this.ghFail('github.pr.review.submit', result);
      return ok({ pr, event: input.event, inlineCount: comments.length });
    }
    const result = await this.gh(
      ['pr', 'review', pr, flag, '--body', body],
      { cwd, timeoutMs: PR_TIMEOUT_MS },
    );
    if (!result.ok) return this.ghFail('github.pr.review.submit', result);
    return ok({ pr, event: input.event, inlineCount: 0 });
  }

  /** Read the canonical resolved/outdated state of every native PR review thread. */
  async listReviewThreads(input: {
    readonly pr: string | number;
    readonly repoRoot?: string;
  }): Promise<InvokeResult<{ threads: readonly GithubReviewThread[] }>> {
    const pr = prRef(input.pr);
    if (!pr) return fail('github.pr.review.threads requires a pr number', 'bad_input');
    const cwd = str(input.repoRoot) ?? this.repoRoot;
    if (!cwd) return fail('github.pr.review.threads requires a repoRoot (none configured)', 'bad_input');
    const result = await this.gh(
      [
        'api',
        'graphql',
        '--paginate',
        '--slurp',
        '-F',
        'owner={owner}',
        '-F',
        'repo={repo}',
        '-F',
        `number=${pr}`,
        '-f',
        `query=${REVIEW_THREADS_QUERY}`,
      ],
      { cwd, timeoutMs: PR_TIMEOUT_MS },
    );
    if (!result.ok) return this.ghFail('github.pr.review.threads', result);
    const pages = safeJson(result.stdout);
    const pageRows = Array.isArray(pages) ? pages : pages ? [pages] : [];
    const threads = pageRows.flatMap((page) => parseReviewThreadPage(page));
    return ok({ threads: [...new Map(threads.map((thread) => [thread.id, thread])).values()] });
  }

  /**
   * List the live open-PR revisions for an installed local repository. The head
   * SHA is the watcher cursor: a new push becomes a new review, while the same
   * revision dedupes against canonical workspace metadata.
   */
  async listOpenPullRequests(
    input: GithubListOpenPullRequestsInput,
  ): Promise<InvokeResult<{ pullRequests: readonly GithubOpenPullRequest[] }>> {
    const cwd = str(input.repoRoot) ?? this.repoRoot;
    if (!cwd) return fail('github.pr.list requires a repoRoot (none configured)', 'bad_input');
    const limit = clampLimit(input.limit);
    const result = await this.gh(
      [
        'pr',
        'list',
        '--state',
        'open',
        '--limit',
        String(limit),
        '--json',
        'number,title,url,headRefOid,baseRefName,headRefName,isDraft,updatedAt,author',
      ],
      { cwd, timeoutMs: PR_TIMEOUT_MS },
    );
    if (!result.ok) return this.ghFail('github.pr.list', result);
    const rows = parseJsonArray(result.stdout);
    return ok({ pullRequests: rows.flatMap(parseOpenPullRequest) });
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
      requirements: GithubLinkedRequirementContext;
      reviewRules: GithubReviewRulesContext;
    }>
  > {
    const pr = prRef(input.pr);
    if (!pr) return fail('github.pr_review requires a pr number/url', 'bad_input');
    const cwd = str(input.repoRoot) ?? this.repoRoot;
    if (!cwd) return fail('github.pr_review requires a repoRoot (none configured)', 'bad_input');
    const view = await this.gh(
      [
        'pr',
        'view',
        pr,
        '--json',
        'number,title,body,state,url,author,baseRefName,headRefName,headRefOid,isDraft,updatedAt',
      ],
      { cwd, timeoutMs: PR_TIMEOUT_MS },
    );
    if (!view.ok) return this.ghFail('github.pr_review', view);
    const parsed = safeJson(view.stdout);
    const [diffResult, requirements, reviewRules] = await Promise.all([
      this.gh(['pr', 'diff', pr], { cwd, timeoutMs: PR_TIMEOUT_MS }),
      this.resolveLinkedRequirements(cwd, parsed),
      this.resolveReviewRules(cwd),
    ]);
    const diff = diffResult.ok ? diffResult.stdout.slice(0, MAX_DIFF_CHARS) : null;
    const identity = canonicalRepositoryIdentity({
      repoPath: cwd,
      projectId: input.repoId,
      remoteUrl: stringValue(asRecord(parsed)?.['url']) ?? undefined,
    });
    const impact = await this.annotateImpact(cwd, diff, identity.repoId, identity.aliases);
    return ok({
      pr: parsed,
      diff,
      diffTruncated: diffResult.ok && diffResult.stdout.length > MAX_DIFF_CHARS,
      ...(diffResult.ok ? {} : { diffUnavailable: diffResult.reason ?? 'gh pr diff failed' }),
      impact,
      requirements,
      reviewRules,
    });
  }

  private async resolveReviewRules(cwd: string): Promise<GithubReviewRulesContext> {
    const candidates = ['.recoder/review-rules.json', '.recoder/review-rules.md', 'REVIEW.md'] as const;
    for (const source of candidates) {
      try {
        const content = await this.readTextFile(path.join(cwd, source));
        if (content === null) continue;
        const rules = source.endsWith('.json')
          ? parseRepositoryReviewRulesJson(content.slice(0, MAX_REVIEW_RULE_FILE_CHARS), source)
          : parseMarkdownReviewRules(content.slice(0, MAX_REVIEW_RULE_FILE_CHARS), source);
        return rules.length > 0
          ? { source, rules }
          : { source, rules: [], unavailable: `${source} contains no valid required/advisory review rules` };
      } catch (error) {
        return { source, rules: [], unavailable: `${source} could not be read: ${message(error)}` };
      }
    }
    return { rules: [] };
  }

  private async resolveLinkedRequirements(cwd: string, pullRequest: unknown): Promise<GithubLinkedRequirementContext> {
    const row = pullRequest && typeof pullRequest === 'object' ? pullRequest as Record<string, unknown> : null;
    const numbers = extractLinkedIssueNumbers(
      typeof row?.body === 'string' ? row.body : '',
      typeof row?.url === 'string' ? row.url : '',
    ).slice(0, MAX_LINKED_ISSUES);
    const results = await Promise.all(numbers.map(async (number) => {
      const result = await this.gh(
        ['issue', 'view', String(number), '--json', 'number,title,body,state,url,labels'],
        { cwd, timeoutMs: PR_TIMEOUT_MS },
      );
      if (!result.ok) {
        return { number, issue: null, reason: result.reason ?? 'gh issue view failed' };
      }
      const issue = parseLinkedIssueRequirement(safeJson(result.stdout));
      return issue
        ? { number, issue, reason: null }
        : { number, issue: null, reason: 'GitHub returned invalid issue data' };
    }));
    return {
      issues: results.flatMap((result) => result.issue ? [result.issue] : []),
      unavailable: results.flatMap((result) => !result.issue && result.reason
        ? [{ number: result.number, reason: result.reason }]
        : []),
    };
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
    repoId: string,
    repoAliases: readonly string[] = [],
  ): Promise<PrImpactAnnotation> {
    if (diff === null) {
      return skippedImpact('no diff to analyze (gh pr diff unavailable)');
    }
    const changedSymbolLocations = extractChangedSymbolLocations(diff, MAX_IMPACT_SYMBOLS);
    const changedSymbols = [...new Set(changedSymbolLocations.map((item) => item.symbol))];
    if (changedSymbolLocations.length === 0) {
      return skippedImpact('no changed symbols detected in the diff');
    }
    // Truthful skip when the code-graph is opted out — NEVER blocks the review.
    if (!this.recodergit.isEnabled()) {
      return skippedImpact(
        'recodergit code-graph disabled (RECODER_CODE_GRAPH_ENABLED off)',
        changedSymbols,
      );
    }

    const symbols: PrSymbolImpact[] = [];
    let anyAvailable = false;
    let firstReason: string | undefined;

    for (const { symbol, filePath } of changedSymbolLocations) {
      // Both directions in parallel; the on-disk checkout (cwd) is the target.
      const [refs, calls] = await Promise.all([
        this.safeCodeIntel('find_references', repoId, {
          symbol,
          repo: cwd,
          ...(repoAliases.length > 0 ? { repoAliases } : {}),
          ...(filePath ? { filePath } : {}),
          includeTests: true,
          limit: IMPACT_QUERY_LIMIT,
          maxDepth: IMPACT_MAX_DEPTH,
        }),
        this.safeCodeIntel('call_graph', repoId, {
          symbol,
          repo: cwd,
          ...(repoAliases.length > 0 ? { repoAliases } : {}),
          ...(filePath ? { filePath } : {}),
          includeTests: true,
          limit: IMPACT_QUERY_LIMIT,
          maxDepth: IMPACT_MAX_DEPTH,
        }),
      ]);
      const references = refs.available ? (refs.result ?? null) : null;
      const callGraph = calls.available ? (calls.result ?? null) : null;
      if (references !== null || callGraph !== null) anyAvailable = true;
      const reason = references === null && callGraph === null ? refs.reason ?? calls.reason : undefined;
      if (reason && !firstReason) firstReason = reason;
      symbols.push({ symbol, ...(filePath ? { filePath } : {}), references, callGraph, ...(reason ? { reason } : {}) });
    }

    const normalized = normalizePrImpact(symbols);
    return {
      available: anyAvailable && normalized.available,
      ...(anyAvailable
        ? normalized.reason ? { reason: normalized.reason } : {}
        : { reason: firstReason ?? 'code-graph produced no impact (repo not indexed?)' }),
      source: 'recodergit',
      scope: normalized.scope,
      risk: normalized.risk,
      partial: normalized.partial || (anyAvailable && symbols.some(symbol => symbol.reason !== undefined)),
      changedSymbols,
      symbols,
      files: normalized.files,
      tests: normalized.tests,
      processes: normalized.processes,
      consumers: normalized.consumers,
      summary: normalized.summary,
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
    params: {
      symbol: string;
      repo: string;
      filePath?: string;
      includeTests: boolean;
      limit: number;
      maxDepth: number;
    },
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

function parseJsonArray(stdout: string): unknown[] {
  const parsed = safeJson(stdout);
  return Array.isArray(parsed) ? parsed : [];
}

function parseOpenPullRequest(value: unknown): GithubOpenPullRequest[] {
  if (value === null || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  if (
    typeof row.number !== 'number' ||
    !Number.isInteger(row.number) ||
    row.number <= 0 ||
    typeof row.title !== 'string' ||
    typeof row.url !== 'string' ||
    typeof row.headRefOid !== 'string' ||
    typeof row.baseRefName !== 'string' ||
    typeof row.headRefName !== 'string' ||
    typeof row.updatedAt !== 'string'
  ) {
    return [];
  }
  const author = row.author !== null && typeof row.author === 'object'
    ? str((row.author as Record<string, unknown>).login)
    : undefined;
  return [{
    number: row.number,
    title: row.title,
    url: row.url,
    headSha: row.headRefOid,
    baseRefName: row.baseRefName,
    headRefName: row.headRefName,
    isDraft: row.isDraft === true,
    updatedAt: row.updatedAt,
    ...(author ? { author } : {}),
  }];
}

function safeJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

function parseReviewThreadPage(value: unknown): GithubReviewThread[] {
  if (!value || typeof value !== 'object') return [];
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return [];
  const repository = (data as Record<string, unknown>).repository;
  if (!repository || typeof repository !== 'object') return [];
  const pullRequest = (repository as Record<string, unknown>).pullRequest;
  if (!pullRequest || typeof pullRequest !== 'object') return [];
  const reviewThreads = (pullRequest as Record<string, unknown>).reviewThreads;
  if (!reviewThreads || typeof reviewThreads !== 'object') return [];
  const nodes = (reviewThreads as Record<string, unknown>).nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node): GithubReviewThread[] => {
    if (!node || typeof node !== 'object') return [];
    const row = node as Record<string, unknown>;
    const comments = row.comments && typeof row.comments === 'object'
      ? (row.comments as Record<string, unknown>).nodes
      : null;
    const root = Array.isArray(comments) && comments[0] && typeof comments[0] === 'object'
      ? comments[0] as Record<string, unknown>
      : null;
    const line = typeof row.line === 'number'
      ? row.line
      : typeof row.originalLine === 'number' ? row.originalLine : 0;
    if (typeof row.id !== 'string' || typeof row.path !== 'string' || line < 1 || !root || typeof root.body !== 'string') return [];
    const resolvedBy = row.resolvedBy && typeof row.resolvedBy === 'object'
      ? str((row.resolvedBy as Record<string, unknown>).login)
      : undefined;
    return [{
      id: row.id,
      path: row.path,
      line,
      isResolved: row.isResolved === true,
      isOutdated: row.isOutdated === true,
      rootBody: root.body,
      ...(typeof root.url === 'string' ? { url: root.url } : {}),
      ...(resolvedBy ? { resolvedBy } : {}),
    }];
  });
}

/**
 * Resolve only explicit same-repository requirement references: closing-keyword
 * or Issue/Ticket lines plus same-repository /issues/:number URLs. Casual #123
 * prose is deliberately ignored so unrelated mentions do not become intent.
 */
export function extractLinkedIssueNumbers(body: string, pullRequestUrl: string): readonly number[] {
  const numbers: number[] = [];
  const seen = new Set<number>();
  const add = (raw: string): void => {
    const number = Number(raw);
    if (!Number.isInteger(number) || number < 1 || seen.has(number)) return;
    seen.add(number);
    numbers.push(number);
  };
  let repoIdentity = '';
  let repoSlug = '';
  try {
    const url = new URL(pullRequestUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const pullIndex = parts.lastIndexOf('pull');
    if (pullIndex >= 2) {
      repoSlug = `${parts[pullIndex - 2]}/${parts[pullIndex - 1]}`.toLowerCase();
      repoIdentity = `${url.host}/${repoSlug}`.toLowerCase();
    }
  } catch {
    // No canonical PR URL means full issue URLs cannot be proven same-repo.
  }

  for (const line of body.split(/\r?\n/)) {
    if (/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|issue|issues|ticket|tickets|requirement|requirements)\b\s*:?/i.test(line)) {
      const hash = /#(\d+)/g;
      for (let match = hash.exec(line); match; match = hash.exec(line)) {
        const qualified = line.slice(0, match.index).match(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/)?.[1]?.toLowerCase();
        if (!qualified || (repoSlug && qualified === repoSlug)) add(match[1]!);
      }
    }
  }
  const issueUrl = /https?:\/\/([^/]+)\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)/gi;
  for (let match = issueUrl.exec(body); match; match = issueUrl.exec(body)) {
    const identity = `${match[1]}/${match[2]}/${match[3]}`.toLowerCase();
    if (repoIdentity && identity === repoIdentity) add(match[4]!);
  }
  return numbers.slice(0, MAX_LINKED_ISSUES);
}

function parseLinkedIssueRequirement(value: unknown): GithubLinkedIssueRequirement | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.number !== 'number' || !Number.isInteger(row.number) || row.number < 1 ||
    typeof row.title !== 'string' || typeof row.url !== 'string' ||
    (row.state !== 'OPEN' && row.state !== 'CLOSED')
  ) return null;
  const labels = Array.isArray(row.labels)
    ? row.labels.flatMap((label) => label && typeof label === 'object' && typeof (label as Record<string, unknown>).name === 'string'
      ? [(label as Record<string, unknown>).name as string]
      : []).slice(0, 20)
    : [];
  return {
    number: row.number,
    title: row.title,
    body: typeof row.body === 'string' ? row.body.slice(0, 20_000) : '',
    state: row.state,
    url: row.url,
    labels,
  };
}

function parseMarkdownReviewRules(content: string, source: string): GithubReviewRule[] {
  const seen = new Set<string>();
  const rules: GithubReviewRule[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\[(required|advisory)\]\s+(.+?)\s*$/i);
    if (!match) continue;
    const level = match[1]!.toLowerCase() as 'required' | 'advisory';
    const text = match[2]!.trim().slice(0, 1_000);
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rules.push({ id, level, text, source });
    if (rules.length >= MAX_REVIEW_RULES) break;
  }
  return rules;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A truthful "no blast radius" annotation (never a fabricated graph). */
function skippedImpact(reason: string, changedSymbols: readonly string[] = []): PrImpactAnnotation {
  return {
    available: false,
    reason,
    source: 'recodergit',
    scope: 'unavailable',
    risk: 'UNKNOWN',
    partial: false,
    changedSymbols,
    symbols: [],
    files: [],
    tests: [],
    processes: [],
    consumers: [],
    summary: emptyImpactSummary(),
  };
}

interface NormalizedPrImpact {
  available: boolean;
  reason?: string;
  risk: PrImpactRisk;
  scope: PrImpactScope;
  partial: boolean;
  files: PrImpactFile[];
  tests: PrImpactFile[];
  processes: PrImpactProcess[];
  consumers: CodeImpactConsumer[];
  summary: PrImpactAnnotation['summary'];
}

interface MutableImpactFile {
  path: string;
  isTest: boolean;
  minDepth: number;
  directions: Set<PrImpactDirection>;
  changedSymbols: Set<string>;
  symbols: Set<string>;
  relationTypes: Set<string>;
  processes: Set<string>;
  coChange?: { commits: number; confidence: number };
}

const IMPACT_RISK_ORDER: Record<PrImpactRisk, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Fold raw RecoderGit impact readings into a bounded, transport-safe ledger. */
function normalizePrImpact(symbols: readonly PrSymbolImpact[]): NormalizedPrImpact {
  const files = new Map<string, MutableImpactFile>();
  const processes = new Map<string, PrImpactProcess>();
  const consumers = new Map<string, CodeImpactConsumer>();
  const reasons = new Set<string>();
  let available = false;
  let partial = false;
  let degraded = false;
  let risk: PrImpactRisk = 'UNKNOWN';
  let reportedCrossRepositoryFiles = 0;
  let reportedConsumerRepositories = 0;
  const scopes = new Set<'symbol' | 'file'>();

  for (const symbol of symbols) {
    for (const [direction, value] of [
      ['upstream', symbol.references],
      ['downstream', symbol.callGraph],
    ] as const) {
      if (value === null) {
        if (symbol.reason) reasons.add(symbol.reason);
        degraded = true;
        continue;
      }
      const result = asRecord(value);
      if (!result) {
        reasons.add(`invalid ${direction} impact result for ${symbol.symbol}`);
        degraded = true;
        continue;
      }
      if (typeof result.error === 'string' && result.error.trim()) {
        reasons.add(result.error.trim());
        degraded = true;
        continue;
      }

      available = true;
      scopes.add(result.scope === 'file-import-graph' ? 'file' : 'symbol');
      const readingRisk = normalizeImpactRisk(result.risk);
      if (IMPACT_RISK_ORDER[readingRisk] > IMPACT_RISK_ORDER[risk]) risk = readingRisk;
      if (
        result.partial === true ||
        result.status === 'ambiguous' ||
        asRecord(result.pagination)?.truncated === true
      ) partial = true;
      const rawSummary = asRecord(result.summary);
      reportedCrossRepositoryFiles = Math.max(
        reportedCrossRepositoryFiles,
        finitePositiveInt(rawSummary?.cross_repository_files) ?? 0,
      );
      reportedConsumerRepositories = Math.max(
        reportedConsumerRepositories,
        finitePositiveInt(rawSummary?.consumer_repositories) ?? 0,
      );

      if (!addImpactProcesses(processes, result.affected_processes)) partial = true;
      const byDepth = asRecord(result.byDepth);
      if (!byDepth) continue;
      for (const [depthKey, rawItems] of Object.entries(byDepth)) {
        if (!Array.isArray(rawItems)) continue;
        const parsedDepth = Number.parseInt(depthKey, 10);
        const fallbackDepth = Number.isFinite(parsedDepth) && parsedDepth > 0 ? parsedDepth : 1;
        for (const rawItem of rawItems) {
          const item = asRecord(rawItem);
          if (!item) continue;
          const path = normalizeImpactPath(item.filePath);
          if (!path) continue;
          const itemDepth = typeof item.depth === 'number' && item.depth > 0
            ? Math.floor(item.depth)
            : fallbackDepth;
          const itemProcesses = normalizeImpactProcesses(item.processes);
          for (const process of itemProcesses) {
            if (!addImpactProcess(processes, process)) partial = true;
          }

          let file = files.get(path);
          if (!file) {
            if (files.size >= MAX_IMPACT_FILES) {
              partial = true;
              continue;
            }
            file = {
              path,
              isTest: isTestImpactPath(path),
              minDepth: itemDepth,
              directions: new Set(),
              changedSymbols: new Set(),
              symbols: new Set(),
              relationTypes: new Set(),
              processes: new Set(),
            };
            files.set(path, file);
          }
          file.minDepth = Math.min(file.minDepth, itemDepth);
          file.directions.add(direction);
          file.changedSymbols.add(symbol.symbol);
          const reachedSymbol = stringValue(item.name);
          if (reachedSymbol) file.symbols.add(reachedSymbol);
          const relationType = stringValue(item.relationType);
          if (relationType) file.relationTypes.add(relationType);
          for (const process of itemProcesses) file.processes.add(process.label);
        }
      }

      const rawCoChanges = result.coChanges;
      if (Array.isArray(rawCoChanges)) {
        for (const rawItem of rawCoChanges) {
          const item = asRecord(rawItem);
          if (!item) continue;
          const path = normalizeImpactPath(item.filePath);
          const commits = finitePositiveInt(item.commits);
          const confidence = finiteProbability(item.confidence);
          if (!path || commits === null || confidence === null) continue;
          const itemProcesses = normalizeImpactProcesses(item.processes);
          for (const process of itemProcesses) {
            if (!addImpactProcess(processes, process)) partial = true;
          }
          let file = files.get(path);
          if (!file) {
            if (files.size >= MAX_IMPACT_FILES) {
              partial = true;
              continue;
            }
            file = {
              path,
              isTest: isTestImpactPath(path),
              minDepth: 1,
              directions: new Set(),
              changedSymbols: new Set(),
              symbols: new Set(),
              relationTypes: new Set(),
              processes: new Set(),
            };
            files.set(path, file);
          }
          file.changedSymbols.add(symbol.symbol);
          file.relationTypes.add('CO_CHANGED_WITH');
          for (const process of itemProcesses) file.processes.add(process.label);
          if (
            !file.coChange ||
            confidence > file.coChange.confidence ||
            (confidence === file.coChange.confidence && commits > file.coChange.commits)
          ) {
            file.coChange = { commits, confidence };
          }
        }
      }

      if (Array.isArray(result.crossRepository)) {
        for (const rawConsumer of result.crossRepository) {
          const consumer = normalizeImpactConsumer(rawConsumer);
          if (!consumer) continue;
          const key = `${consumer.repoId}\0${consumer.path}\0${consumer.packageName}`;
          if (consumers.size >= MAX_IMPACT_CONSUMERS && !consumers.has(key)) {
            partial = true;
            continue;
          }
          consumers.set(key, consumer);
        }
      }
    }
  }

  const normalizedFiles = [...files.values()]
    .sort((a, b) => a.minDepth - b.minDepth || a.path.localeCompare(b.path))
    .map((file): PrImpactFile => ({
      path: file.path,
      isTest: file.isTest,
      minDepth: file.minDepth,
      directions: [...file.directions].sort(),
      changedSymbols: [...file.changedSymbols].sort(),
      symbols: [...file.symbols].sort(),
      relationTypes: [...file.relationTypes].sort(),
      processes: [...file.processes].sort(),
      ...(file.coChange ? { coChange: file.coChange } : {}),
    }));
  const tests = normalizedFiles.filter(file => file.isTest);
  const normalizedProcesses = [...processes.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, MAX_IMPACT_PROCESSES);
  if (processes.size > MAX_IMPACT_PROCESSES) partial = true;
  const normalizedConsumers = [...consumers.values()]
    .sort((a, b) => a.repoId.localeCompare(b.repoId) || a.path.localeCompare(b.path))
    .slice(0, MAX_IMPACT_CONSUMERS);
  const consumerRepositories = new Set(normalizedConsumers.map((item) => item.repoId)).size;

  return {
    available,
    ...(reasons.size > 0 ? { reason: [...reasons].slice(0, 3).join('; ') } : {}),
    risk,
    scope: scopes.size > 1 ? 'mixed' : scopes.has('file') ? 'file' : scopes.has('symbol') ? 'symbol' : 'unavailable',
    partial: partial || (available && degraded),
    files: normalizedFiles,
    tests,
    processes: normalizedProcesses,
    consumers: normalizedConsumers,
    summary: {
      impactedFiles: normalizedFiles.length,
      affectedTests: tests.length,
      upstreamFiles: normalizedFiles.filter(file => file.directions.includes('upstream')).length,
      downstreamFiles: normalizedFiles.filter(file => file.directions.includes('downstream')).length,
      affectedProcesses: normalizedProcesses.length,
      coChangedFiles: normalizedFiles.filter((file) => file.coChange !== undefined).length,
      crossRepositoryFiles: Math.max(normalizedConsumers.length, reportedCrossRepositoryFiles),
      consumerRepositories: Math.max(consumerRepositories, reportedConsumerRepositories),
    },
  };
}

function emptyImpactSummary(): PrImpactAnnotation['summary'] {
  return {
    impactedFiles: 0,
    affectedTests: 0,
    upstreamFiles: 0,
    downstreamFiles: 0,
    affectedProcesses: 0,
    coChangedFiles: 0,
    crossRepositoryFiles: 0,
    consumerRepositories: 0,
  };
}

function normalizeImpactConsumer(value: unknown): CodeImpactConsumer | null {
  const row = asRecord(value);
  const repoId = stringValue(row?.repoId)?.slice(0, 200);
  const filePath = normalizeImpactPath(row?.filePath);
  const ecosystem = row?.ecosystem;
  const packageName = stringValue(row?.packageName)?.slice(0, 300);
  const importSpecifier = stringValue(row?.importSpecifier)?.slice(0, 500);
  if (
    !repoId || !filePath || !packageName || !importSpecifier ||
    (ecosystem !== 'npm' && ecosystem !== 'python' && ecosystem !== 'go' && ecosystem !== 'cargo')
  ) return null;
  return {
    repoId,
    path: filePath,
    ecosystem,
    packageName,
    importSpecifier,
    relationType: 'CONSUMED_BY',
  };
}

function finitePositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function finiteProbability(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function normalizeImpactRisk(value: unknown): PrImpactRisk {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL'
    ? value
    : 'UNKNOWN';
}

function normalizeImpactPath(value: unknown): string | null {
  const candidate = stringValue(value)?.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!candidate || candidate.startsWith('/') || /^[a-z]:\//i.test(candidate)) return null;
  if (candidate.split('/').some(part => part === '..' || part === '')) return null;
  return candidate.slice(0, 500);
}

function isTestImpactPath(path: string): boolean {
  const normalized = `/${path.toLowerCase().replaceAll('\\', '/')}`;
  return normalized.includes('.test.') ||
    normalized.includes('.spec.') ||
    normalized.includes('/__tests__/') ||
    normalized.includes('/__mocks__/') ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/') ||
    normalized.includes('/testing/') ||
    normalized.includes('/fixtures/') ||
    normalized.endsWith('_test.go') ||
    normalized.endsWith('_test.py') ||
    normalized.endsWith('_spec.rb') ||
    normalized.endsWith('_test.rb') ||
    normalized.includes('/spec/') ||
    normalized.includes('/test_') ||
    normalized.includes('/conftest.');
}

function addImpactProcesses(target: Map<string, PrImpactProcess>, value: unknown): boolean {
  let complete = true;
  for (const process of normalizeImpactProcesses(value)) {
    if (!addImpactProcess(target, process)) complete = false;
  }
  return complete;
}

function addImpactProcess(target: Map<string, PrImpactProcess>, process: PrImpactProcess): boolean {
  if (target.size >= MAX_IMPACT_PROCESSES && !target.has(process.label)) return false;
  target.set(process.label, target.get(process.label) ?? process);
  return true;
}

function normalizeImpactProcesses(value: unknown): PrImpactProcess[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): PrImpactProcess[] => {
    if (typeof raw === 'string') {
      const label = raw.trim().slice(0, 200);
      return label ? [{ label }] : [];
    }
    const process = asRecord(raw);
    const label = stringValue(process?.label) ?? stringValue(process?.name);
    if (!label) return [];
    const id = stringValue(process?.id);
    const processType = stringValue(process?.processType);
    const filePath = normalizeImpactPath(process?.filePath);
    return [{
      ...(id ? { id } : {}),
      label,
      ...(processType ? { processType } : {}),
      ...(filePath ? { filePath } : {}),
    }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
}
