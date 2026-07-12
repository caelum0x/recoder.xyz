/**
 * repo-engine — the concrete executor behind the `recoder.repo` MCP server.
 *
 * Gives an AGENT governed, audited repository reads: read a file, search the
 * tree, and see the working-tree diff — over a resolved repo root. Runs behind
 * the interop gate like every other capability. Read-only by design (no writes,
 * no checkout, no network); a coding agent mutates files through its own edit
 * tools, so this surface is deliberately inspection-only.
 *
 * Safe by construction: paths are resolved against the repo root and rejected
 * if they escape it (no `../` traversal); reads are size-capped; search uses
 * `git grep` (respects .gitignore, never scans node_modules). Degrade-safe:
 * a missing repo/file/binary returns a truthful error, never a fake result.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve, relative } from 'node:path';
import { repoMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';

const MAX_READ_BYTES = 256 * 1024; // 256 KB — enough for source files, capped.
const MAX_SEARCH_LINES = 200;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Resolve the repo root for a call: an absolute `repo` arg wins; otherwise the
 * injected base root; else cwd. The path must exist and be a directory.
 */
export function resolveRepoRoot(input: McpToolCallInput, baseRepoRoot?: string): string {
  const fromArg = str(input.args.repo) ?? str(input.args.repoPath);
  const candidate =
    fromArg && isAbsolute(fromArg)
      ? fromArg
      : (baseRepoRoot || process.env.CONDUCTOR_REPO_ROOT || process.cwd());
  if (!existsSync(candidate) || !statSync(candidate).isDirectory()) {
    throw new Error(`repo root not found or not a directory: ${candidate}`);
  }
  return resolve(candidate);
}

/** Resolve a repo-relative path safely under root (rejects traversal). */
function resolveWithin(root: string, p: string): string {
  const abs = resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes the repository: ${p}`);
  }
  return abs;
}

/** The `gh` binary (honoring an override), used for GitHub code search. */
function ghBin(): string {
  return process.env.RECODER_GH_BIN?.trim() || process.env.GH_BIN?.trim() || 'gh';
}

interface GithubSearchResult {
  query: string;
  source: 'github';
  repo?: string;
  owner?: string;
  matches: Array<{ repo: string; path: string; url?: string; fragments: string[] }>;
}

/**
 * Search code across GitHub repositories via `gh search code`. Requires the gh
 * CLI to be installed AND authenticated (gh auth login / GH_TOKEN). Returns a
 * truthful error otherwise. Scoped to a repo (owner/name) or an owner.
 */
export function githubCodeSearch(
  query: string,
  opts: { repo?: string; owner?: string; language?: string; limit?: number },
): GithubSearchResult {
  const args = ['search', 'code', query, '--json', 'path,repository,textMatches', '--limit', String(opts.limit ?? 30)];
  if (opts.repo) args.push('--repo', opts.repo);
  if (opts.owner) args.push('--owner', opts.owner);
  if (opts.language) args.push('--language', opts.language);

  let out = '';
  try {
    out = execFileSync(ghBin(), args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (/ENOENT|not found|command not found/i.test(msg)) {
      throw new Error('GitHub search needs the `gh` CLI installed');
    }
    if (/auth|login|token|401|403/i.test(msg)) {
      throw new Error('GitHub search needs `gh` authenticated (run `gh auth login` or set GH_TOKEN)');
    }
    throw new Error(`github search failed: ${msg.slice(0, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(out.trim() || '[]');
  } catch {
    parsed = [];
  }
  const rows = Array.isArray(parsed) ? parsed : [];
  const matches = rows.slice(0, MAX_SEARCH_LINES).map((row) => {
    const r = row as {
      path?: string;
      repository?: { nameWithOwner?: string; name?: string; url?: string };
      textMatches?: Array<{ fragment?: string }>;
    };
    return {
      repo: r.repository?.nameWithOwner ?? r.repository?.name ?? '?',
      path: r.path ?? '?',
      url: r.repository?.url,
      fragments: (r.textMatches ?? [])
        .map((t) => (t.fragment ?? '').trim())
        .filter(Boolean)
        .slice(0, 3),
    };
  });
  return { query, source: 'github', repo: opts.repo, owner: opts.owner, matches };
}

export function registerRepoMcpTools(
  router: McpToolRouter,
  options: { baseRepoRoot?: string } = {},
): void {
  router.register(repoMcpServer, 'repo.read', async (input) => {
    const root = resolveRepoRoot(input, options.baseRepoRoot);
    const path = str(input.args.path);
    if (!path) throw new Error('path is required');
    const abs = resolveWithin(root, path);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      throw new Error(`file not found: ${path}`);
    }
    const size = statSync(abs).size;
    const buf = readFileSync(abs);
    const text = buf.subarray(0, MAX_READ_BYTES).toString('utf8');
    return {
      content: {
        path,
        truncated: size > MAX_READ_BYTES,
        bytes: size,
        content: text,
      },
    };
  });

  router.register(repoMcpServer, 'repo.search', async (input) => {
    const query = str(input.args.query) ?? str(input.args.pattern);
    if (!query) throw new Error('query is required');

    // GitHub code search: when a `github` repo (owner/name) or `githubOwner` is
    // given, search REMOTE repositories via the `gh` CLI instead of the local
    // tree — an agent can grep any GitHub project, not just its worktree.
    const githubRepo = str(input.args.github) ?? str(input.args.githubRepo);
    const githubOwner = str(input.args.githubOwner) ?? str(input.args.owner);
    if (githubRepo || githubOwner) {
      return { content: githubCodeSearch(query, { repo: githubRepo, owner: githubOwner, language: str(input.args.language) }) };
    }

    // Local: git grep — fast, gitignore-aware, never scans node_modules.
    const root = resolveRepoRoot(input, options.baseRepoRoot);
    let out = '';
    try {
      out = execFileSync('git', ['-C', root, 'grep', '-n', '-I', '--', query], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      // git grep exits 1 when there are NO matches — that's not an error.
      const e = err as { status?: number };
      if (e.status === 1) out = '';
      else throw new Error(`search failed: ${(err as Error).message?.slice(0, 200)}`);
    }
    const lines = out.split('\n').filter(Boolean).slice(0, MAX_SEARCH_LINES);
    return {
      content: {
        query,
        source: 'local',
        matches: lines,
        truncated: out.split('\n').filter(Boolean).length > MAX_SEARCH_LINES,
      },
    };
  });

  router.register(repoMcpServer, 'repo.diff', async (input) => {
    const root = resolveRepoRoot(input, options.baseRepoRoot);
    const base = str(input.args.base);
    const args = ['-C', root, 'diff', '--stat'];
    if (base) args.push(base);
    let stat = '';
    let patch = '';
    try {
      stat = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      patch = execFileSync('git', ['-C', root, 'diff', ...(base ? [base] : [])], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (err) {
      throw new Error(`diff failed: ${(err as Error).message?.slice(0, 200)}`);
    }
    return { content: { stat: stat.trim(), patch: patch.slice(0, 200 * 1024) } };
  });
}
