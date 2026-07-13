/**
 * ops — the `gh` CLI operations the GitHubModule OWNS (search / openPR /
 * comment / auth probe). Extracted from agent-os/mcp/github-engine.ts so the
 * MCP executor there becomes a thin dispatcher to these functions instead of
 * holding the logic itself.
 *
 * Requires `gh` installed AND authenticated; every failure maps to a truthful
 * error via ghGuard (never a fabricated success). The runner is injectable so
 * the module and its tests never hit GitHub.
 */
import { execFileSync } from 'node:child_process';

/** Runs `gh <args>` in `cwd`, returns stdout. Injectable for tests. */
export type GhRunner = (args: string[], cwd?: string) => string;

function ghBin(): string {
  return process.env.RECODER_GH_BIN?.trim() || process.env.GH_BIN?.trim() || 'gh';
}

/** Default runner: `gh <args>` via execFileSync in the workspace repo root. */
export function defaultGhRunner(): GhRunner {
  return (args, cwd) =>
    execFileSync(ghBin(), args, {
      cwd: cwd || process.env.CONDUCTOR_REPO_ROOT || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    });
}

/** Map raw gh/exec failures to truthful, actionable errors. */
export function ghGuard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (/ENOENT|not found|command not found/i.test(msg)) {
      throw new Error('GitHub actions need the `gh` CLI installed');
    }
    if (/auth|login|token|401|403/i.test(msg)) {
      throw new Error('GitHub actions need `gh` authenticated (run `gh auth login`)');
    }
    throw new Error(`gh failed: ${msg.slice(0, 300)}`);
  }
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// ─── search ──────────────────────────────────────────────────────────────────

export interface GhRepoHit {
  fullName?: string;
  description?: string;
  url?: string;
  stargazersCount?: number;
}

/** `gh search repos <query> --json ... --limit N`. Returns [] on parse failure. */
export function ghSearchRepos(run: GhRunner, query: string, limit = 20): GhRepoHit[] {
  const args = [
    'search',
    'repos',
    query,
    '--json',
    'fullName,description,url,stargazersCount',
    '--limit',
    String(limit),
  ];
  const out = ghGuard(() => run(args));
  try {
    const rows = JSON.parse(out.trim() || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// ─── openPR ──────────────────────────────────────────────────────────────────

export interface GhOpenPrInput {
  title: string;
  body?: string;
  repo?: string;
  head?: string;
  base?: string;
  draft?: boolean;
}

export interface GhOpenPrResult {
  url: string;
  title: string;
}

/** `gh pr create ...`. gh prints the PR URL on success. */
export function ghOpenPr(run: GhRunner, input: GhOpenPrInput, cwd?: string): GhOpenPrResult {
  const title = str(input.title);
  if (!title) throw new Error('title is required');
  const body = str(input.body) ?? '';
  const args = ['pr', 'create', '--title', title, '--body', body];
  const repo = str(input.repo);
  if (repo) args.push('--repo', repo);
  const head = str(input.head);
  if (head) args.push('--head', head);
  const base = str(input.base);
  if (base) args.push('--base', base);
  if (input.draft === true) args.push('--draft');
  const out = ghGuard(() => run(args, cwd));
  return { url: out.trim(), title };
}

// ─── comment ─────────────────────────────────────────────────────────────────

export interface GhCommentResult {
  url: string;
}

/** `gh pr comment <number> --body <body>`. */
export function ghComment(
  run: GhRunner,
  opts: { number: string; body: string; repo?: string },
  cwd?: string,
): GhCommentResult {
  const number = str(opts.number);
  if (!number) throw new Error('pr number is required');
  const body = str(opts.body);
  if (!body) throw new Error('body is required');
  const args = ['pr', 'comment', number, '--body', body];
  const repo = str(opts.repo);
  if (repo) args.push('--repo', repo);
  const out = ghGuard(() => run(args, cwd));
  return { url: out.trim() };
}

// ─── auth probe (for health) ──────────────────────────────────────────────────

export type GhAuthState = 'authed' | 'not_authed' | 'absent';

/**
 * Truthful gh auth state WITHOUT throwing: env token wins; else a bounded
 * `gh auth status` probe. 'absent' when the gh binary is missing.
 */
export function ghAuthState(run: GhRunner): GhAuthState {
  if (process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()) {
    return 'authed';
  }
  try {
    run(['auth', 'status']);
    return 'authed';
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (/ENOENT|not found|command not found/i.test(msg)) {
      return 'absent';
    }
    return 'not_authed';
  }
}
