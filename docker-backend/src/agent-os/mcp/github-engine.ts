/**
 * github-engine — the concrete executor behind the `recoder.github` MCP server.
 * Lets an AGENT act on GitHub via the `gh` CLI: find repositories, open a PR,
 * comment on a PR. Runs behind the interop gate (a write like github.pr.create
 * is a high-risk action the policy can require approval for).
 *
 * Requires `gh` installed AND authenticated; a truthful error otherwise. The
 * runner is injectable so the wiring is testable without hitting GitHub.
 */
import { execFileSync } from 'node:child_process';
import { githubMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';

export type GhRunner = (args: string[], cwd?: string) => string;

function ghBin(): string {
  return process.env.RECODER_GH_BIN?.trim() || process.env.GH_BIN?.trim() || 'gh';
}

function defaultRunner(): GhRunner {
  return (args, cwd) =>
    execFileSync(ghBin(), args, {
      cwd: cwd || process.env.CONDUCTOR_REPO_ROOT || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    });
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function ghGuard<T>(fn: () => T): T {
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

function repoCwd(input: McpToolCallInput, baseRepoRoot?: string): string | undefined {
  return str(input.args.repoPath) ?? baseRepoRoot;
}

export function registerGithubMcpTools(
  router: McpToolRouter,
  options: { runner?: GhRunner; baseRepoRoot?: string } = {},
): void {
  const run = options.runner ?? defaultRunner();

  router.register(githubMcpServer, 'github.search', async (input) => {
    const query = str(input.args.query);
    if (!query) throw new Error('query is required');
    const args = ['search', 'repos', query, '--json', 'fullName,description,url,stargazersCount', '--limit', String(input.args.limit ?? 20)];
    const out = ghGuard(() => run(args));
    let rows: unknown = [];
    try {
      rows = JSON.parse(out.trim() || '[]');
    } catch {
      rows = [];
    }
    return { content: Array.isArray(rows) ? rows : [] };
  });

  router.register(githubMcpServer, 'github.pr.create', async (input) => {
    const title = str(input.args.title);
    const body = str(input.args.body) ?? '';
    if (!title) throw new Error('title is required');
    const args = ['pr', 'create', '--title', title, '--body', body];
    const repo = str(input.args.repo);
    if (repo) args.push('--repo', repo);
    const head = str(input.args.head) ?? str(input.args.branch);
    if (head) args.push('--head', head);
    const base = str(input.args.base);
    if (base) args.push('--base', base);
    if (input.args.draft === true) args.push('--draft');
    const out = ghGuard(() => run(args, repoCwd(input, options.baseRepoRoot)));
    // gh pr create prints the PR URL.
    return { content: { url: out.trim(), title } };
  });

  router.register(githubMcpServer, 'github.pr.comment', async (input) => {
    const number = str(input.args.number) ?? str(input.args.pr);
    const body = str(input.args.body);
    if (!number) throw new Error('pr number is required');
    if (!body) throw new Error('body is required');
    const args = ['pr', 'comment', number, '--body', body];
    const repo = str(input.args.repo);
    if (repo) args.push('--repo', repo);
    const out = ghGuard(() => run(args, repoCwd(input, options.baseRepoRoot)));
    return { content: { commented: true, url: out.trim() } };
  });
}
