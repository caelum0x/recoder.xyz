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
   * Review context for a PR: `gh pr view --json …` + `gh pr diff` (bounded).
   * The diff is best-effort — its failure degrades to `diff: null` with the
   * truthful `diffUnavailable` reason, never a fabricated diff.
   */
  async reviewPR(
    input: GithubReviewPrInput,
  ): Promise<InvokeResult<{ pr: unknown; diff: string | null; diffTruncated: boolean; diffUnavailable?: string }>> {
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
    return ok({
      pr: parsed,
      diff,
      diffTruncated: diffResult.ok && diffResult.stdout.length > MAX_DIFF_CHARS,
      ...(diffResult.ok ? {} : { diffUnavailable: diffResult.reason ?? 'gh pr diff failed' }),
    });
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
