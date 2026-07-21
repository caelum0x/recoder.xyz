/**
 * Binding tests for the `github.*` / `repo.*` MCP binders — the fix for the
 * "advertised in the catalog but 404 on call" gap:
 *  - COVERAGE: the two binders register a handler for EVERY tool the catalog
 *    advertises on `recoder.github` + `recoder.repo` (verified through the real
 *    `assertWiringComplete` guard, the same one that runs at boot).
 *  - EXECUTION: an authorized call through a real `McpToolRouter` reaches the
 *    (mocked) engine and returns its result; invalid input / an absent engine
 *    surfaces a truthful error, never a fabricated success.
 */
import { describe, it, expect } from 'vitest';
import {
  McpRegistry,
  McpToolRouter,
  githubMcpServer,
  repoMcpServer,
  type McpServerRegistration,
  type McpToolCallInput,
} from '@recoder/agent-mcp';
import type { Logger } from '../../../shared/logger.js';
import type { CliResult } from '../adapters/cli/cli-exec.js';
import { assertWiringComplete } from '../mcp/engine-registry.js';
import { GithubModule, type GithubCliRunner } from './github-module.js';
import { githubEngineBinder, repoEngineBinder, parseGrepLines, resolveWithinRoot } from './github-mcp.binder.js';

const log = { warn() {}, info() {}, debug() {}, error() {}, child: () => log } as unknown as Logger;

function fakeRun(
  handler: (bin: string, args: readonly string[]) => Partial<CliResult> | undefined,
): GithubCliRunner {
  return async (bin, args) => {
    const partial = handler(bin, args);
    if (!partial) {
      return { ok: false, code: null, stdout: '', stderr: '', reason: `spawn ${bin} ENOENT` };
    }
    return { ok: true, code: 0, stdout: '', stderr: '', ...partial };
  };
}

/** gh runner with version/auth up so module ops reach their real subcommand. */
function ghUpRun(
  handler: (bin: string, args: readonly string[]) => Partial<CliResult> | undefined = () => ({}),
): GithubCliRunner {
  return fakeRun((bin, args) => {
    if (args[0] === '--version') return { stdout: 'gh version 2.60.0' };
    if (args[0] === 'auth') return { stdout: 'Logged in' };
    return handler(bin, args);
  });
}

function call(server: McpServerRegistration, toolName: string, args: Record<string, unknown>): McpToolCallInput {
  return { server, toolName, actor: { agentId: 'test-agent' }, args } as unknown as McpToolCallInput;
}

function buildModule(runCli: GithubCliRunner): GithubModule {
  return new GithubModule({
    log,
    repoRoot: '/repo',
    runCli,
    resolveEngine: () => null,
    recodergit: { isEnabled: () => false } as never,
  });
}

describe('binder coverage (the boot wiring guard passes for github + repo)', () => {
  it('registers a handler for every advertised github.* and repo.* tool', () => {
    const keys = new Set<string>();
    const capture = {
      register: (server: McpServerRegistration, toolName: string) => {
        keys.add(`${server.serverId}:${toolName}`);
      },
    } as unknown as McpToolRouter;

    githubEngineBinder(buildModule(fakeRun(() => undefined)))(capture);
    repoEngineBinder({ repoRoot: '/repo' })(capture);

    // The SAME guard the host runs at boot: no missing server, no missing tool.
    expect(() =>
      assertWiringComplete({
        inProcServers: [githubMcpServer, repoMcpServer],
        engineServers: [githubMcpServer, repoMcpServer],
        handlerKeys: keys,
      }),
    ).not.toThrow();
  });
});

describe('github.* handlers execute through a real router', () => {
  function router(module: GithubModule): McpToolRouter {
    const built = new McpToolRouter(new McpRegistry());
    githubEngineBinder(module)(built);
    return built;
  }

  it('github.search resolves + executes over the mocked gh seam', async () => {
    const module = buildModule(
      ghUpRun((_bin, args) =>
        args[0] === 'search' ? { stdout: JSON.stringify([{ fullName: 'a/b' }]) } : {},
      ),
    );
    const result = await router(module).call(call(githubMcpServer, 'github.search', { query: 'agents' }));
    expect((result.content as { results: unknown[] }).results).toHaveLength(1);
    expect(result.metadata).toMatchObject({ engine: 'github' });
  });

  it('github.pr.create executes and returns the PR URL', async () => {
    const module = buildModule(ghUpRun(() => ({ stdout: 'https://github.com/a/b/pull/9\n' })));
    const result = await router(module).call(
      call(githubMcpServer, 'github.pr.create', { title: 'feat: y', body: 'b' }),
    );
    expect((result.content as { url: string }).url).toBe('https://github.com/a/b/pull/9');
  });

  it('github.pr_review executes over pr view + diff', async () => {
    const module = buildModule(
      ghUpRun((_bin, args) => {
        if (args[1] === 'view') return { stdout: JSON.stringify({ number: 9 }) };
        if (args[1] === 'diff') return { stdout: 'diff --git' };
        return {};
      }),
    );
    const result = await router(module).call(call(githubMcpServer, 'github.pr_review', { pr: 9 }));
    expect((result.content as { diff: string }).diff).toContain('diff --git');
  });

  it('github.pr.comment surfaces a truthful error when gh is absent (no faked success)', async () => {
    const module = buildModule(fakeRun(() => undefined));
    await expect(
      router(module).call(call(githubMcpServer, 'github.pr.comment', { pr: 9, body: 'x' })),
    ).rejects.toThrow(/gh CLI not found/);
  });

  it('rejects missing required args truthfully (no handler-missing 404)', async () => {
    const module = buildModule(fakeRun(() => undefined));
    await expect(router(module).call(call(githubMcpServer, 'github.search', {}))).rejects.toThrow(
      /requires args\.query/,
    );
  });
});

describe('repo.* handlers execute through a real router', () => {
  function router(deps: Parameters<typeof repoEngineBinder>[0]): McpToolRouter {
    const built = new McpToolRouter(new McpRegistry());
    repoEngineBinder(deps)(built);
    return built;
  }

  it('repo.read reads a file inside the repo root (bounded)', async () => {
    const built = router({
      repoRoot: '/repo',
      readFile: async (absolutePath) => `content of ${absolutePath}`,
    });
    const result = await built.call(call(repoMcpServer, 'repo.read', { path: 'src/a.ts' }));
    expect((result.content as { content: string }).content).toContain('/repo/src/a.ts');
    expect((result.content as { truncated: boolean }).truncated).toBe(false);
  });

  it('repo.read rejects path traversal outside the repo root', async () => {
    const built = router({ repoRoot: '/repo', readFile: async () => 'x' });
    await expect(
      built.call(call(repoMcpServer, 'repo.read', { path: '../../etc/passwd' })),
    ).rejects.toThrow(/escapes the repo root/);
  });

  it('repo.search parses git grep matches and treats exit 1 as truthful empty', async () => {
    const built = router({
      repoRoot: '/repo',
      runCli: fakeRun(() => ({ stdout: 'src/a.ts:3:hello world\nsrc/b.ts:9:hello again\n' })),
    });
    const result = await built.call(call(repoMcpServer, 'repo.search', { query: 'hello' }));
    const content = result.content as { matches: Array<{ path: string; line: number }> };
    expect(content.matches).toHaveLength(2);
    expect(content.matches[0]).toMatchObject({ path: 'src/a.ts', line: 3 });

    const empty = router({
      repoRoot: '/repo',
      runCli: async () => ({ ok: false, code: 1, stdout: '', stderr: '', reason: 'exit 1' }),
    });
    const emptyResult = await empty.call(call(repoMcpServer, 'repo.search', { query: 'nope' }));
    expect((emptyResult.content as { matches: unknown[] }).matches).toHaveLength(0);
  });

  it('repo.diff returns bounded git diff output and fails truthfully on git errors', async () => {
    const built = router({
      repoRoot: '/repo',
      runCli: fakeRun((_bin, args) => (args[0] === 'diff' ? { stdout: 'diff --git a b' } : {})),
    });
    const result = await built.call(call(repoMcpServer, 'repo.diff', { base: 'main' }));
    expect((result.content as { diff: string }).diff).toContain('diff --git');

    const broken = router({ repoRoot: '/repo', runCli: fakeRun(() => undefined) });
    await expect(broken.call(call(repoMcpServer, 'repo.diff', {}))).rejects.toThrow(/repo\.diff failed/);
  });

  it('repo.diff rejects a git-option-injecting base (arbitrary file write) before spawning git', async () => {
    const seen: string[][] = [];
    const built = router({
      repoRoot: '/repo',
      runCli: fakeRun((_bin, args) => {
        seen.push([...args]);
        return { stdout: '' };
      }),
    });
    await expect(
      built.call(call(repoMcpServer, 'repo.diff', { base: '--output=/tmp/pwned' })),
    ).rejects.toThrow(/must be a git ref/);
    // The guard fires before git is ever invoked — no arbitrary-write spawn.
    expect(seen).toHaveLength(0);
  });

  it('repo tools without any repoRoot surface a truthful configuration error', async () => {
    const built = router({});
    await expect(built.call(call(repoMcpServer, 'repo.read', { path: 'a.ts' }))).rejects.toThrow(
      /require a repoRoot/,
    );
  });
});

describe('helpers', () => {
  it('parseGrepLines caps matches at the limit', () => {
    const stdout = Array.from({ length: 10 }, (_, i) => `f.ts:${i + 1}:m`).join('\n');
    expect(parseGrepLines(stdout, 3)).toHaveLength(3);
  });

  it('resolveWithinRoot allows the root itself and nested paths', () => {
    expect(resolveWithinRoot('/repo', '.')).toBe('/repo');
    expect(resolveWithinRoot('/repo', 'a/b.ts')).toBe('/repo/a/b.ts');
    expect(() => resolveWithinRoot('/repo', '../x')).toThrow(/escapes/);
  });
});
