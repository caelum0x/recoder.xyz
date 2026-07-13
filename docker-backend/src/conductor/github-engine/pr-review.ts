/**
 * GitHub PR-review engine — wires the vendored `pr-swarm-review` prompt pack
 * (ts/recodergit/pr-swarm-review: orchestration.md + personas/01–07) into the
 * conductor as an importable capability.
 *
 * WHAT THIS IS: pr-swarm-review is NOT code — it is a CLI-neutral prompt pack
 * whose 7 review lanes drive the read-only `gh` CLI (gh pr view/diff/checks,
 * gh issue view) and NEVER post to GitHub. This module:
 *  1. verifies GitHub auth truthfully (GITHUB_TOKEN/GH_TOKEN env or `gh auth
 *     status`) and reports 'not_configured' when absent — no fake reviews;
 *  2. LAZILY loads the pack from disk (nothing is read until a review is
 *     requested) and compiles it into a single parameterized instruction
 *     bundle — the upstream pack hardcodes `abhigyanpatwari/RecoderGit`, which
 *     is rewritten to the requested target repo;
 *  3. hands the bundle to an injectable executor (a conductor run / agent
 *     runtime). When no executor is configured it returns a truthful
 *     'unavailable' WITH the compiled bundle so the caller can dispatch it;
 *  4. parses the pack's fixed classifications (final verdict, merge state,
 *     branch hygiene) out of a completed review into typed values.
 *
 * SAFETY CONTRACT (binding — .claude/rules/production.md):
 * - Degrade-safe: reviewPullRequest NEVER throws — every failure maps to a
 *   truthful 'invalid_input' / 'not_configured' / 'unavailable' result.
 * - No network and no `gh` in tests: auth check, pack loader, and executor are
 *   all injectable seams.
 * - Read-only: nothing here (or in the compiled bundle) edits files, commits,
 *   or posts to GitHub.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Vendored prompt pack, relative to this file
// (docker-backend/src/conductor/github-engine -> ../../../.. = repo root).
const PACK_RELATIVE = ['..', '..', '..', '..', 'ts', 'recodergit', 'pr-swarm-review'] as const;

// Upstream hardcodes its own repo in orchestration.md + persona 01. The
// compiled bundle MUST be parameterized to the requested target repo.
const UPSTREAM_REPO_URL = 'https://github.com/abhigyanpatwari/RecoderGit';
const UPSTREAM_REPO_FULL_NAME = 'abhigyanpatwari/RecoderGit';

const GH_AUTH_TIMEOUT_MS = 10_000;

// ─── Classifications (fixed by pr-swarm-review/orchestration.md) ─────────────

/** Ordered for matching: at equal index the LONGER literal wins (see findClassification). */
export const FINAL_VERDICTS = [
  'production-ready with minor follow-ups',
  'rebase/split required before final review',
  'not production-ready',
  'production-ready',
] as const;
export type PrReviewVerdict = (typeof FINAL_VERDICTS)[number];

export const MERGE_STATES = [
  'blocked by conflicts',
  'checks pending',
  'checks failing',
  'review blocked',
  'draft/WIP',
  'closed without merge',
  'visibility incomplete',
  'mergeable',
  'merged',
] as const;
export type PrMergeState = (typeof MERGE_STATES)[number];

export const BRANCH_HYGIENE_CLASSIFICATIONS = [
  'merge-from-main commit present but harmless and merge-safe',
  'polluted by unrelated merge/churn',
  'rebase/split required',
  'clean feature/fix PR',
] as const;
export type PrBranchHygiene = (typeof BRANCH_HYGIENE_CLASSIFICATIONS)[number];

export interface ParsedReviewClassifications {
  verdict: PrReviewVerdict | null;
  mergeState: PrMergeState | null;
  branchHygiene: PrBranchHygiene | null;
}

// ─── Inputs / results ─────────────────────────────────────────────────────────

/** Swarm = parallel subagents (Claude Code); Solo = any single agent, lanes in dependency order. */
export type ReviewMode = 'swarm' | 'solo';

export interface ReviewPullRequestInput {
  /** GitHub `owner/repo` full name. Optional when `prUrl` carries it. */
  repo?: string;
  prNumber?: number;
  /** Full PR URL (https://github.com/owner/repo/pull/N). Wins over prNumber. */
  prUrl?: string;
  mode?: ReviewMode;
}

export interface ReviewBundle {
  /** Target `owner/repo`. */
  repo: string;
  /** Target PR URL (canonicalized). */
  target: string;
  mode: ReviewMode;
  /** Parameterized orchestration.md (coordinator contract). */
  orchestration: string;
  /** Parameterized persona lane specs (01–07), sorted by filename. */
  personas: Array<{ name: string; content: string }>;
  /** Single compiled instruction document ready for a conductor run. */
  instructions: string;
}

export type GitHubAuthStatus =
  | { configured: true; via: 'env' | 'gh-cli' }
  | { configured: false; reason: string };

export type ReviewPullRequestResult =
  | { status: 'invalid_input'; reason: string }
  | { status: 'not_configured'; reason: string }
  | { status: 'unavailable'; reason: string; bundle?: ReviewBundle }
  | { status: 'completed'; bundle: ReviewBundle; raw: string; classifications: ParsedReviewClassifications };

// ─── Injectable seams ─────────────────────────────────────────────────────────

export type GitHubAuthCheck = () => Promise<GitHubAuthStatus>;

export interface ReviewPack {
  orchestration: string;
  personas: Array<{ name: string; content: string }>;
}

/** Resolves the raw (unparameterized) prompt pack, or null when it is absent. */
export type ReviewPackLoader = () => Promise<ReviewPack | null>;

/**
 * Executes a compiled bundle (e.g. dispatches a conductor run against a
 * workspace agent) and resolves the full review text. Absent by default —
 * reviewPullRequest then returns a truthful 'unavailable' carrying the bundle.
 */
export type ReviewExecutor = (bundle: ReviewBundle) => Promise<string>;

export interface PrReviewEngineLogger {
  error: (message: string, error: unknown) => void;
}

export interface PrReviewEngineDeps {
  checkAuth?: GitHubAuthCheck;
  loadPack?: ReviewPackLoader;
  executor?: ReviewExecutor | null;
  logger?: PrReviewEngineLogger;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/** Absolute path of the vendored pr-swarm-review pack. */
export function defaultPackDir(): string {
  return path.resolve(__dirname, ...PACK_RELATIVE);
}

/**
 * Default auth check: GITHUB_TOKEN/GH_TOKEN env wins (no spawn); else a
 * bounded `gh auth status` probe. Truthful 'not configured' otherwise.
 */
export const defaultCheckGitHubAuth: GitHubAuthCheck = async () => {
  const envToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (envToken) {
    return { configured: true, via: 'env' };
  }
  if (await ghAuthStatusOk()) {
    return { configured: true, via: 'gh-cli' };
  }
  return {
    configured: false,
    reason:
      'GitHub auth not configured: set GITHUB_TOKEN/GH_TOKEN or authenticate the gh CLI (`gh auth login`) in the workspace',
  };
};

function ghAuthStatusOk(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const child = spawn('gh', ['auth', 'status'], { stdio: ['ignore', 'ignore', 'ignore'] });
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // already gone
        }
        settle(false);
      }, GH_AUTH_TIMEOUT_MS);
      timer.unref?.();
      child.on('error', () => {
        clearTimeout(timer);
        settle(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        settle(code === 0);
      });
    } catch {
      settle(false);
    }
  });
}

/** Default pack loader: read orchestration.md + personas/*.md from the vendored dir. */
export const defaultLoadReviewPack: ReviewPackLoader = async () => {
  const dir = defaultPackDir();
  const orchestrationPath = path.join(dir, 'orchestration.md');
  if (!existsSync(orchestrationPath)) {
    return null;
  }
  const orchestration = await readFile(orchestrationPath, 'utf8');
  const personasDir = path.join(dir, 'personas');
  let personas: Array<{ name: string; content: string }> = [];
  if (existsSync(personasDir)) {
    const files = (await readdir(personasDir)).filter((f) => f.endsWith('.md')).sort();
    personas = await Promise.all(
      files.map(async (name) => ({
        name,
        content: await readFile(path.join(personasDir, name), 'utf8'),
      })),
    );
  }
  return { orchestration, personas };
};

// ─── Compilation ──────────────────────────────────────────────────────────────

/**
 * Rewrite the pack's hardcoded upstream repo to the target repo. URL first so
 * the bare-name pass never mangles a URL, then the bare `owner/repo`, then the
 * one prose reference in orchestration.md.
 */
export function parameterizeForRepo(content: string, repoFullName: string): string {
  return content
    .split(UPSTREAM_REPO_URL)
    .join(`https://github.com/${repoFullName}`)
    .split(UPSTREAM_REPO_FULL_NAME)
    .join(repoFullName)
    .split('the RecoderGit repository')
    .join('the target repository');
}

/** Compile the raw pack into a single parameterized instruction bundle. */
export function compileReviewBundle(
  pack: ReviewPack,
  target: { repo: string; target: string; mode: ReviewMode },
): ReviewBundle {
  const orchestration = parameterizeForRepo(pack.orchestration, target.repo);
  const personas = pack.personas.map((persona) => ({
    name: persona.name,
    content: parameterizeForRepo(persona.content, target.repo),
  }));

  const header = [
    '# PR Swarm Review — compiled instruction bundle',
    '',
    `Target repository: ${target.repo}`,
    `Target pull request: ${target.target}`,
    `Execution mode: ${target.mode}`,
    '',
    'Read-only contract: investigate and report only. Never edit files, commit,',
    'or post to GitHub (no `gh pr comment` / `gh pr review`).',
  ].join('\n');

  const personaSections = personas.map(
    (persona) => `## Persona: ${persona.name}\n\n${persona.content}`,
  );
  const instructions = [header, orchestration, ...personaSections].join('\n\n---\n\n');

  return { repo: target.repo, target: target.target, mode: target.mode, orchestration, personas, instructions };
}

// ─── Verdict parsing ──────────────────────────────────────────────────────────

/**
 * Earliest-match classification scan: pick the candidate with the smallest
 * index; on a tie the LONGER literal wins (so 'not production-ready' and
 * 'production-ready with minor follow-ups' beat bare 'production-ready').
 */
function findClassification<T extends string>(text: string, candidates: readonly T[]): T | null {
  const lower = text.toLowerCase();
  let best: { index: number; value: T } | null = null;
  for (const candidate of candidates) {
    const index = lower.indexOf(candidate.toLowerCase());
    if (index === -1) continue;
    if (!best || index < best.index || (index === best.index && candidate.length > best.value.length)) {
      best = { index, value: candidate };
    }
  }
  return best?.value ?? null;
}

/**
 * Parse the pack's typed classifications out of a completed review. The final
 * verdict is scanned from the LAST "Final verdict" heading onward (the 12th
 * required section) so the classification tables earlier in the review cannot
 * shadow it; merge state / branch hygiene scan the whole text.
 * Null = truthfully unparsed, never a guess.
 */
export function parseReviewClassifications(raw: string): ParsedReviewClassifications {
  const lower = raw.toLowerCase();
  const verdictAnchor = lower.lastIndexOf('final verdict');
  const verdictRegion = verdictAnchor >= 0 ? raw.slice(verdictAnchor) : raw;
  return {
    verdict: findClassification(verdictRegion, FINAL_VERDICTS),
    mergeState: findClassification(raw, MERGE_STATES),
    branchHygiene: findClassification(raw, BRANCH_HYGIENE_CLASSIFICATIONS),
  };
}

// ─── Target resolution ────────────────────────────────────────────────────────

const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/;
const PR_URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+)\/pull\/(\d+)$/;

function resolveTarget(
  input: ReviewPullRequestInput,
): { repo: string; target: string } | { error: string } {
  if (input.prUrl !== undefined) {
    const trimmed = input.prUrl.trim();
    const match = PR_URL_RE.exec(trimmed);
    if (!match) {
      return { error: `invalid prUrl (expected https://github.com/owner/repo/pull/N): ${JSON.stringify(input.prUrl)}` };
    }
    const urlRepo = match[1];
    if (input.repo && input.repo.trim().toLowerCase() !== urlRepo.toLowerCase()) {
      return { error: `repo ${JSON.stringify(input.repo)} does not match prUrl repo ${JSON.stringify(urlRepo)}` };
    }
    return { repo: urlRepo, target: trimmed };
  }

  const repo = input.repo?.trim();
  if (!repo || !REPO_RE.test(repo)) {
    return { error: `repo must be a GitHub "owner/name" full name, got ${JSON.stringify(input.repo)}` };
  }
  if (!Number.isInteger(input.prNumber) || (input.prNumber as number) <= 0) {
    return { error: 'prNumber must be a positive integer (or pass prUrl)' };
  }
  return { repo, target: `https://github.com/${repo}/pull/${input.prNumber}` };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export interface PrReviewEngine {
  reviewPullRequest: (input: ReviewPullRequestInput) => Promise<ReviewPullRequestResult>;
}

export function createPrReviewEngine(deps: PrReviewEngineDeps = {}): PrReviewEngine {
  const checkAuth = deps.checkAuth ?? defaultCheckGitHubAuth;
  const loadPack = deps.loadPack ?? defaultLoadReviewPack;
  const executor = deps.executor ?? null;
  const logger = deps.logger ?? { error: (message, error) => console.error(message, error) };

  return {
    async reviewPullRequest(input: ReviewPullRequestInput): Promise<ReviewPullRequestResult> {
      // 1. Validate the target BEFORE any IO.
      const resolved = resolveTarget(input);
      if ('error' in resolved) {
        return { status: 'invalid_input', reason: resolved.error };
      }
      const mode: ReviewMode = input.mode ?? 'solo';

      // 2. Truthful auth gate — no auth, no review (and no pack IO).
      let auth: GitHubAuthStatus;
      try {
        auth = await checkAuth();
      } catch (error: unknown) {
        logger.error('[pr-review] GitHub auth check failed (treating as not configured)', error);
        return { status: 'not_configured', reason: 'GitHub auth check failed' };
      }
      if (!auth.configured) {
        return { status: 'not_configured', reason: auth.reason };
      }

      // 3. Lazily load + compile the prompt pack.
      let bundle: ReviewBundle;
      try {
        const pack = await loadPack();
        if (!pack) {
          return {
            status: 'unavailable',
            reason: `pr-swarm-review prompt pack not found (expected at ${defaultPackDir()})`,
          };
        }
        bundle = compileReviewBundle(pack, { repo: resolved.repo, target: resolved.target, mode });
      } catch (error: unknown) {
        logger.error('[pr-review] prompt pack load/compile failed', error);
        return { status: 'unavailable', reason: 'pr-swarm-review prompt pack could not be loaded' };
      }

      // 4. Execute — or truthfully report that no executor is configured,
      //    returning the compiled bundle so the caller can dispatch it.
      if (!executor) {
        return {
          status: 'unavailable',
          reason: 'no review executor configured (dispatch the returned bundle as a conductor run)',
          bundle,
        };
      }
      try {
        const raw = await executor(bundle);
        return { status: 'completed', bundle, raw, classifications: parseReviewClassifications(raw) };
      } catch (error: unknown) {
        logger.error('[pr-review] review execution failed', error);
        return { status: 'unavailable', reason: 'review execution failed', bundle };
      }
    },
  };
}

/** Convenience one-shot wrapper around createPrReviewEngine. */
export function reviewPullRequest(
  input: ReviewPullRequestInput,
  deps: PrReviewEngineDeps = {},
): Promise<ReviewPullRequestResult> {
  return createPrReviewEngine(deps).reviewPullRequest(input);
}
