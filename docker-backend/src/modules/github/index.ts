/**
 * GitHubModule — the composed owner of the GitHub domain. See
 * docs/RECODER-MODULES.md §3.
 *
 * Composes the three absorbed engines behind ONE interface (see ./types):
 *   analyzeRepo / domainMap   → RecoderGitService  (./code-intel — in-process recodergit)
 *   reviewPR                  → pr-swarm-review     (./review)
 *   openPR / comment / search → gh CLI ops          (./ops — owned here)
 *   health                    → truthful liveness    (./health)
 *
 * Every dependency is injectable so the module and its callers are testable
 * without a real gh CLI, clone, or index. Degrade-safe throughout: nothing here
 * throws into a request path; unavailable engines report truthfully.
 *
 * `getGitHubModule()` returns the process-wide singleton the MCP `recoder.github`
 * dispatchers call; `createGitHubModule(deps)` builds a fresh, fully-injected one
 * for tests and for the service-container wiring (which passes the shared
 * code-graph instance so there is a single index owner).
 */

import { execFileSync } from 'node:child_process';

import {
  RecoderGitService,
  createRecoderGitService,
  createPrReviewEngine,
  type PrReviewEngine,
} from './deps';
import { defaultGhRunner, ghSearchRepos, ghOpenPr, ghComment, type GhRunner } from './ops';
import { analyzeRepo as analyzeRepoImpl, domainMap as domainMapImpl } from './code-intel';
import { reviewPR as reviewPRImpl } from './review';
import { health as healthImpl } from './health';
import type {
  GitHubModule,
  CodeGraph,
  RouteMap,
  PrTarget,
  ReviewResult,
  ReviewMode,
  OpenPrInput,
  PrRef,
  RepoOrGithub,
  Match,
  GitHubHealth,
} from './types';

/** Bounded `git grep -n` for the local-tree search scope. Injectable. */
export type GitGrep = (query: string, cwd: string, limit: number) => Match[];

function defaultGitGrep(query: string, cwd: string, limit: number): Match[] {
  try {
    const out = execFileSync('git', ['grep', '-n', '-I', '--', query], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    });
    return out
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .slice(0, limit)
      .map((line) => {
        const [file, ...rest] = line.split(':');
        return { ref: file, snippet: rest.join(':').trim() };
      });
  } catch {
    // No match / not a git repo / git absent → truthfully empty.
    return [];
  }
}

export interface GitHubModuleDeps {
  /** The code-intel service (analyze/domainMap). Defaults to a fresh instance. */
  codeGraph?: RecoderGitService;
  /** The pr-swarm-review engine. Defaults to a fresh instance. */
  prReview?: PrReviewEngine;
  /** The gh CLI runner. Defaults to `gh` via execFileSync. */
  ghRunner?: GhRunner;
  /** Local-tree search. Defaults to `git grep`. */
  gitGrep?: GitGrep;
  /** Default working dir for gh writes / local search. */
  baseRepoRoot?: string;
}

class ComposedGitHubModule implements GitHubModule {
  private readonly codeGraph: RecoderGitService;
  private readonly prReview: PrReviewEngine;
  private readonly ghRunner: GhRunner;
  private readonly gitGrep: GitGrep;
  private readonly baseRepoRoot: string | undefined;

  constructor(deps: GitHubModuleDeps = {}) {
    this.codeGraph = deps.codeGraph ?? createRecoderGitService();
    this.prReview = deps.prReview ?? createPrReviewEngine();
    this.ghRunner = deps.ghRunner ?? defaultGhRunner();
    this.gitGrep = deps.gitGrep ?? defaultGitGrep;
    this.baseRepoRoot = deps.baseRepoRoot;
  }

  analyzeRepo(repoPath: string): Promise<CodeGraph> {
    return analyzeRepoImpl(this.codeGraph, repoPath);
  }

  domainMap(repoPath: string): Promise<RouteMap> {
    return domainMapImpl(this.codeGraph, repoPath);
  }

  reviewPR(target: PrTarget, mode: ReviewMode = 'swarm'): Promise<ReviewResult> {
    return reviewPRImpl(this.prReview, target, mode);
  }

  async openPR(input: OpenPrInput): Promise<PrRef> {
    const cwd = input.repoPath ?? this.baseRepoRoot;
    const result = ghOpenPr(
      this.ghRunner,
      {
        title: input.title,
        body: input.body,
        repo: input.repo,
        head: input.head,
        base: input.base,
        draft: input.draft,
      },
      cwd,
    );
    return { url: result.url, title: result.title, repo: input.repo, repoPath: input.repoPath };
  }

  async comment(pr: PrRef, body: string): Promise<void> {
    const number = pr.number ?? extractPrNumber(pr.url);
    if (!number) throw new Error('pr number is required (PrRef.number or a /pull/N url)');
    const cwd = pr.repoPath ?? this.baseRepoRoot;
    ghComment(this.ghRunner, { number, body, repo: pr.repo }, cwd);
  }

  async search(query: string, where: RepoOrGithub): Promise<Match[]> {
    if (where.scope === 'github') {
      const hits = ghSearchRepos(this.ghRunner, query, where.limit ?? 20);
      return hits.map((h) => ({
        ref: h.fullName ?? '',
        description: h.description,
        url: h.url,
        stars: h.stargazersCount,
      }));
    }
    const cwd = where.repoPath ?? this.baseRepoRoot ?? process.cwd();
    return this.gitGrep(query, cwd, where.limit ?? 50);
  }

  async health(): Promise<GitHubHealth> {
    return healthImpl(this.codeGraph, this.ghRunner);
  }
}

/** Extract the PR number from a canonical /pull/N url, when present. */
function extractPrNumber(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = /\/pull\/(\d+)\b/.exec(url);
  return m ? m[1] : undefined;
}

/** Build a fresh, fully-injected GitHubModule. */
export function createGitHubModule(deps: GitHubModuleDeps = {}): GitHubModule {
  return new ComposedGitHubModule(deps);
}

// ─── process-wide singleton (what the MCP dispatchers call) ──────────────────

let singleton: GitHubModule | null = null;

/**
 * Return the process-wide GitHubModule, building it from `deps` on first use.
 * The MCP `recoder.github` tool handlers call this so the gh logic lives in the
 * module, not the engine. The service-container wiring may pre-seed the shared
 * code-graph instance via {@link setGitHubModule} so there is a single index owner.
 * Subsequent calls return the cached instance (later `deps` are ignored).
 */
export function getGitHubModule(deps: GitHubModuleDeps = {}): GitHubModule {
  if (!singleton) {
    singleton = createGitHubModule(deps);
  }
  return singleton;
}

/** Override the singleton (service-container wiring / tests). */
export function setGitHubModule(module: GitHubModule): void {
  singleton = module;
}

/** Reset the singleton. Test-only. */
export function resetGitHubModule(): void {
  singleton = null;
}

export type { GitHubModule } from './types';
export * from './types';
