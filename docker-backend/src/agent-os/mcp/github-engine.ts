/**
 * github-engine — the THIN MCP DISPATCHER behind the `recoder.github` server.
 * Lets an AGENT act on GitHub: find repositories, open a PR, comment on a PR,
 * and request a swarm PR-review. Runs behind the interop gate (a write like
 * github.pr.create is a high-risk action the policy can require approval for).
 *
 * The gh CLI logic itself is OWNED by the GitHubModule (docker-backend/src/
 * modules/github): search/openPR/comment live in modules/github/ops.ts and the
 * review composes conductor/github-engine/pr-review. This file only unwraps MCP
 * args and dispatches to that module — no gh command construction lives here.
 * MCP tool names + response shapes are unchanged (the bridge .cjs stays valid).
 *
 * Requires `gh` installed AND authenticated; a truthful error otherwise. The
 * runner is injectable so the wiring is testable without hitting GitHub.
 */
import { githubMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';
import {
  getGitHubModule,
  createGitHubModule,
  type GitHubModule,
} from '../../modules/github';
import { defaultGhRunner, ghComment, str, type GhRunner } from '../../modules/github/ops';

export type { GhRunner } from '../../modules/github/ops';

function repoCwd(input: McpToolCallInput, baseRepoRoot?: string): string | undefined {
  return str(input.args.repoPath) ?? baseRepoRoot;
}

export function registerGithubMcpTools(
  router: McpToolRouter,
  options: { runner?: GhRunner; baseRepoRoot?: string; module?: GitHubModule } = {},
): void {
  // The module owns all gh logic. An injected module or runner is authoritative
  // (service-container wiring / tests) and gets a fresh, fully-seeded module;
  // the bare production path (runner defaulted) uses the process-wide singleton
  // so there is one shared instance. The `runner` is shared with the module so
  // the one op the module exposes as void (comment) can still be dispatched to
  // the owned op through the same seam.
  const runner = options.runner ?? defaultGhRunner();
  const gh =
    options.module ??
    (options.runner
      ? createGitHubModule({ ghRunner: runner, baseRepoRoot: options.baseRepoRoot })
      : getGitHubModule({ ghRunner: runner, baseRepoRoot: options.baseRepoRoot }));

  router.register(githubMcpServer, 'github.search', async (input) => {
    const query = str(input.args.query);
    if (!query) throw new Error('query is required');
    const limitRaw = input.args.limit;
    const limit = typeof limitRaw === 'number' ? limitRaw : Number(limitRaw ?? 20) || 20;
    const matches = await gh.search(query, { scope: 'github', limit });
    // Preserve the legacy wire shape: raw gh repo rows.
    const content = matches.map((m) => ({
      fullName: m.ref,
      description: m.description,
      url: m.url,
      stargazersCount: m.stars,
    }));
    return { content };
  });

  router.register(githubMcpServer, 'github.pr.create', async (input) => {
    const title = str(input.args.title);
    if (!title) throw new Error('title is required');
    const ref = await gh.openPR({
      title,
      body: str(input.args.body) ?? '',
      repo: str(input.args.repo),
      head: str(input.args.head) ?? str(input.args.branch),
      base: str(input.args.base),
      draft: input.args.draft === true,
      repoPath: repoCwd(input, options.baseRepoRoot),
    });
    return { content: { url: ref.url, title: ref.title } };
  });

  router.register(githubMcpServer, 'github.pr.comment', async (input) => {
    const number = str(input.args.number) ?? str(input.args.pr);
    const body = str(input.args.body);
    if (!number) throw new Error('pr number is required');
    if (!body) throw new Error('body is required');
    // The gh command is owned by the module's ops; dispatch to it (the module's
    // comment() is void, so the owned op is used to preserve the legacy shape).
    const result = ghComment(
      runner,
      { number, body, repo: str(input.args.repo) },
      repoCwd(input, options.baseRepoRoot),
    );
    return { content: { commented: true, url: result.url } };
  });

  // github.pr_review — the recodergit swarm-review engine, reachable by agents.
  // Returns the compiled multi-persona review bundle (orchestration + 7 lane
  // specs, parameterized for the target PR) that an agent can then execute as
  // its own review. Truthful when GitHub auth or the review pack is absent
  // (never fabricates a review).
  router.register(githubMcpServer, 'github.pr_review', async (input) => {
    const repo = str(input.args.repo);
    const prUrl = str(input.args.prUrl) ?? str(input.args.url);
    const prNumberRaw = str(input.args.prNumber) ?? str(input.args.number) ?? str(input.args.pr);
    const prNumber = prNumberRaw ? Number(prNumberRaw) : undefined;
    const mode = str(input.args.mode) === 'solo' ? 'solo' : 'swarm';
    const result = await gh.reviewPR({ repo, prUrl, prNumber }, mode);
    return { content: result };
  });
}
