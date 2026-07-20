/**
 * MCP binders for the two catalog servers that were ADVERTISED but had no bound
 * handlers (the "github.* / repo.* 404" gap):
 *  - `githubEngineBinder(module)` binds `recoder.github`'s tools
 *    (`github.search` / `github.pr.create` / `github.pr.comment` /
 *    `github.pr_review`) over the unified {@link GithubModule} (gh CLI seam).
 *  - `repoEngineBinder(deps)` binds `recoder.repo`'s tools (`repo.read` /
 *    `repo.search` / `repo.diff`) over bounded `git` + fs primitives scoped to
 *    a resolved repo root (path-traversal guarded).
 *
 * Handlers surface failure TRUTHFULLY: a module `{ ok:false }` or an invalid
 * input throws an Error with the real reason, which the interop host records —
 * never a fabricated success. The composer passes both binders into the
 * `InteropHostBundle({ engineBinders })` so every call still traverses the
 * `authorize → risk → execute → audit` gate.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { githubMcpServer, repoMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolResult } from '@recoder/agent-mcp';
import type { InvokeResult } from '../types.js';
import { runCli } from '../adapters/cli/cli-exec.js';
import type { GithubCliRunner, GithubModule } from './github-module.js';

const SEARCH_TIMEOUT_MS = 10_000;
const DIFF_TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS = 200_000;
const DEFAULT_SEARCH_MATCHES = 50;
const MAX_SEARCH_MATCHES = 200;

/** Register the `recoder.github` tool handlers over the unified module. */
export function githubEngineBinder(module: GithubModule): (router: McpToolRouter) => void {
  return (router) => {
    router.register(githubMcpServer, 'github.search', async (input) => {
      const result = await module.search({
        query: requireString(input.args.query, 'github.search requires args.query'),
        ...(typeof input.args.limit === 'number' ? { limit: input.args.limit } : {}),
      });
      return unwrap(result, 'github.search');
    });

    router.register(githubMcpServer, 'github.pr.create', async (input) => {
      const result = await module.openPR({
        title: requireString(input.args.title, 'github.pr.create requires args.title'),
        ...(optionalString(input.args.body) ? { body: optionalString(input.args.body) as string } : {}),
        ...(optionalString(input.args.base) ? { base: optionalString(input.args.base) as string } : {}),
        ...(optionalString(input.args.head) ? { head: optionalString(input.args.head) as string } : {}),
        ...(optionalString(input.args.repoRoot)
          ? { repoRoot: optionalString(input.args.repoRoot) as string }
          : {}),
      });
      return unwrap(result, 'github.pr.create');
    });

    router.register(githubMcpServer, 'github.pr.comment', async (input) => {
      const result = await module.comment({
        pr: requirePr(input.args.pr),
        body: requireString(input.args.body, 'github.pr.comment requires args.body'),
        ...(optionalString(input.args.repoRoot)
          ? { repoRoot: optionalString(input.args.repoRoot) as string }
          : {}),
      });
      return unwrap(result, 'github.pr.comment');
    });

    router.register(githubMcpServer, 'github.pr_review', async (input) => {
      const result = await module.reviewPR({
        pr: requirePr(input.args.pr),
        ...(optionalString(input.args.repoRoot)
          ? { repoRoot: optionalString(input.args.repoRoot) as string }
          : {}),
        ...(optionalString(input.args.repoId)
          ? { repoId: optionalString(input.args.repoId) as string }
          : {}),
      });
      return unwrap(result, 'github.pr_review');
    });
  };
}

export interface RepoToolsDeps {
  /** Default repo root when the call does not pass `args.repoRoot`. */
  readonly repoRoot?: string | null;
  /** Injectable bounded CLI runner (git). Defaults to the shared `runCli`. */
  readonly runCli?: GithubCliRunner;
  /** Injectable file reader (test seam). Defaults to `fs.readFile(utf8)`. */
  readonly readFile?: (absolutePath: string) => Promise<string>;
}

/** Register the `recoder.repo` tool handlers (git + fs, repo-root scoped). */
export function repoEngineBinder(deps: RepoToolsDeps = {}): (router: McpToolRouter) => void {
  const run = deps.runCli ?? runCli;
  const read = deps.readFile ?? ((absolutePath: string) => readFile(absolutePath, 'utf8'));

  return (router) => {
    router.register(repoMcpServer, 'repo.read', async (input) => {
      const root = resolveRepoRoot(input.args, deps);
      const rel = requireString(input.args.path, 'repo.read requires args.path');
      const absolute = resolveWithinRoot(root, rel);
      const raw = await read(absolute);
      return {
        content: {
          path: rel,
          content: raw.slice(0, MAX_TEXT_CHARS),
          truncated: raw.length > MAX_TEXT_CHARS,
        },
        metadata: { engine: 'repo', repoRoot: root },
      };
    });

    router.register(repoMcpServer, 'repo.search', async (input) => {
      const root = resolveRepoRoot(input.args, deps);
      const query = requireString(input.args.query, 'repo.search requires args.query');
      const limit = clampMatches(input.args.limit);
      const result = await run('git', ['grep', '-n', '-I', '--no-color', '-e', query, '--'], {
        cwd: root,
        timeoutMs: SEARCH_TIMEOUT_MS,
      });
      // `git grep` exits 1 on zero matches — a truthful empty result, not an error.
      if (!result.ok && result.code !== 1) {
        throw new Error(`repo.search failed: ${result.reason ?? 'git grep error'}`);
      }
      const matches = parseGrepLines(result.stdout, limit);
      return {
        content: { query, matches, truncated: matches.length >= limit },
        metadata: { engine: 'repo', repoRoot: root, matchCount: matches.length },
      };
    });

    router.register(repoMcpServer, 'repo.diff', async (input) => {
      const root = resolveRepoRoot(input.args, deps);
      const args = ['diff'];
      const base = optionalString(input.args.base);
      if (base) args.push(base);
      const target = optionalString(input.args.path);
      if (target) args.push('--', target);
      const result = await run('git', args, { cwd: root, timeoutMs: DIFF_TIMEOUT_MS });
      if (!result.ok) {
        throw new Error(`repo.diff failed: ${result.reason ?? 'git diff error'}`);
      }
      return {
        content: {
          diff: result.stdout.slice(0, MAX_TEXT_CHARS),
          truncated: result.stdout.length > MAX_TEXT_CHARS,
        },
        metadata: { engine: 'repo', repoRoot: root, ...(base ? { base } : {}) },
      };
    });
  };
}

/** Unwrap a module `InvokeResult` into a tool result; failure throws truthfully. */
function unwrap(result: InvokeResult<unknown>, toolName: string): McpToolResult {
  if (!result.ok) throw new Error(result.reason);
  return { content: result.value, metadata: { engine: 'github', tool: toolName } };
}

function resolveRepoRoot(args: Record<string, unknown>, deps: RepoToolsDeps): string {
  const root = optionalString(args.repoRoot) ?? deps.repoRoot ?? null;
  if (!root) {
    throw new Error('repo tools require a repoRoot (pass args.repoRoot or configure engines repoRoot)');
  }
  return path.resolve(root);
}

/** Resolve `rel` inside `root`, rejecting traversal outside the repo root. */
export function resolveWithinRoot(root: string, rel: string): string {
  const absolute = path.resolve(root, rel);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error(`repo path escapes the repo root: ${JSON.stringify(rel)}`);
  }
  return absolute;
}

/** Parse `git grep -n` lines ("path:line:text") into typed matches. */
export function parseGrepLines(
  stdout: string,
  limit: number,
): ReadonlyArray<{ path: string; line: number; text: string }> {
  const matches: Array<{ path: string; line: number; text: string }> = [];
  for (const raw of stdout.split('\n')) {
    if (matches.length >= limit) break;
    const match = /^([^:]+):(\d+):(.*)$/.exec(raw);
    if (!match) continue;
    matches.push({ path: match[1] as string, line: Number(match[2]), text: match[3] as string });
  }
  return matches;
}

function requireString(value: unknown, errorMessage: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(errorMessage);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requirePr(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return requireString(value, 'github pr tools require args.pr (number or url)');
}

function clampMatches(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_SEARCH_MATCHES;
  return Math.min(Math.floor(value), MAX_SEARCH_MATCHES);
}
