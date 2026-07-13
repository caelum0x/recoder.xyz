/**
 * GitHubModule — the single cohesive interface for the agents' complete GitHub
 * capability. See docs/RECODER-MODULES.md §3 (GITHUB module).
 *
 * This module OWNS the GitHub domain by unifying the three engines that today
 * live scattered:
 *   - recodergit code-intel  (agent-os/recodergit-service.ts — in-process analyze/domainMap)
 *   - gh CLI ops             (owned here in ./gh-ops.ts — search / openPR / comment)
 *   - pr-swarm-review        (conductor/github-engine/pr-review.ts — reviewPR)
 *
 * Callers depend on THIS interface, never on the vendored dist or the split
 * engines directly. The MCP `recoder.github` executor tools become thin
 * dispatchers to a GitHubModule instance; the code-graph routes call it too.
 *
 * SAFETY: every method is degrade-safe. No engine present / gh not authed /
 * code-graph flag off all map to truthful statuses — never a faked success.
 */

import type {
  DomainMap,
  ReviewPullRequestInput,
  ReviewPullRequestResult,
  ReviewMode,
} from './deps';

// ─── analyzeRepo / domainMap (recodergit code-intel) ─────────────────────────

/**
 * The result of an in-process `runFullAnalysis` over a repo, projected into a
 * Recoder-owned shape. `status:'unavailable'` when the engine could not index
 * (flag off, dist missing, analyze failure) — counts are then 0 and truthful.
 */
export interface CodeGraph {
  repoId: string;
  repoRoot: string;
  status: 'indexed' | 'unavailable' | 'disabled';
  nodes: number;
  edges: number;
  clusters?: number;
  flows?: number;
  /** ISO timestamp the graph was (re)built. */
  indexedAt: string | null;
  /** HEAD sha the graph reflects, when git is resolvable. */
  headSha: string | null;
}

/**
 * The engine's group / route-map projected into Recoder domains. Alias of the
 * recodergit-service `DomainMap` so the existing contract is preserved 1:1.
 */
export type RouteMap = DomainMap;

// ─── reviewPR (pr-swarm-review) ──────────────────────────────────────────────

/** Target of a PR review. Mirrors the pr-review engine input (repo/number/url). */
export type PrTarget = ReviewPullRequestInput;

/** The full typed review outcome (bundle + verdict/merge-state/hygiene). */
export type ReviewResult = ReviewPullRequestResult;

export type { ReviewMode };

// ─── openPR / comment / search (gh CLI, owned) ───────────────────────────────

export interface OpenPrInput {
  title: string;
  body?: string;
  /** `owner/repo`; omit to use the workspace's current repo. */
  repo?: string;
  /** Head branch (accepts the legacy `branch` alias at the call boundary). */
  head?: string;
  base?: string;
  draft?: boolean;
  /** Working directory to run `gh` in (defaults to the workspace repo root). */
  repoPath?: string;
}

/** A reference to a pull request. `url` is always present after openPR. */
export interface PrRef {
  url: string;
  number?: string;
  repo?: string;
  title?: string;
  /** Working directory for follow-up ops (comment) when the PR is local. */
  repoPath?: string;
}

/** Where a code search runs: the local workspace tree, or GitHub globally. */
export type RepoOrGithub =
  | { scope: 'github'; limit?: number }
  | { scope: 'repo'; repoPath?: string; limit?: number };

/** A single search hit. Shape covers both GitHub repo hits and local tree hits. */
export interface Match {
  /** `owner/repo` for GitHub hits; file path for local hits. */
  ref: string;
  description?: string;
  url?: string;
  stars?: number;
  /** For local tree hits: the matched line/snippet. */
  snippet?: string;
}

// ─── health ──────────────────────────────────────────────────────────────────

export interface GitHubHealth {
  /** recodergit in-process lib / index lifecycle. */
  recodergitLib: 'up' | 'down' | 'disabled';
  /** gh CLI auth state (env token or `gh auth status`). */
  gh: 'authed' | 'not_authed' | 'absent';
  /** True when RECODER_CODE_GRAPH_ENABLED is on. */
  codeGraphEnabled: boolean;
}

// ─── the interface ─────────────────────────────────────────────────────────────

export interface GitHubModule {
  /** Build/refresh the code-knowledge-graph for a repo (recodergit, in-process). */
  analyzeRepo(repoPath: string): Promise<CodeGraph>;
  /** Project the engine's route-map into Recoder domains (recodergit). */
  domainMap(repoPath: string): Promise<RouteMap>;
  /** Multi-persona PR review (pr-swarm-review). Default mode 'swarm'. */
  reviewPR(target: PrTarget, mode?: ReviewMode): Promise<ReviewResult>;
  /** Open a pull request (gh). High-risk write — gated at the interop host. */
  openPR(input: OpenPrInput): Promise<PrRef>;
  /** Comment on a pull request (gh). High-risk write — gated. */
  comment(pr: PrRef, body: string): Promise<void>;
  /** Search GitHub repos or the local workspace tree. */
  search(query: string, where: RepoOrGithub): Promise<Match[]>;
  /** Truthful liveness of each absorbed engine. Never fakes readiness. */
  health(): Promise<GitHubHealth>;
}
