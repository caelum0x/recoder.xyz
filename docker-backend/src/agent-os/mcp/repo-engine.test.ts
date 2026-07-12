/**
 * repo-engine — governed read-only repo tools over a REAL temp git repo.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpRegistry, McpToolRouter, repoMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import { registerRepoMcpTools } from './repo-engine';

const actor = { agentId: 'a', permissions: { toolRules: [] } } as unknown as AgentProfile;

describe('registerRepoMcpTools (real temp repo)', () => {
  let repo: string;
  let router: McpToolRouter;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'repo-engine-'));
    execFileSync('git', ['-C', repo, 'init', '-q']);
    execFileSync('git', ['-C', repo, 'config', 'user.email', 't@t.co']);
    execFileSync('git', ['-C', repo, 'config', 'user.name', 't']);
    mkdirSync(path.join(repo, 'src'));
    writeFileSync(path.join(repo, 'src', 'app.ts'), 'export const AppName = "recoder";\n');
    execFileSync('git', ['-C', repo, 'add', '-A']);
    execFileSync('git', ['-C', repo, 'commit', '-qm', 'init']);
    router = new McpToolRouter(new McpRegistry());
    registerRepoMcpTools(router, { baseRepoRoot: repo });
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('repo.read returns file contents', async () => {
    const out = await router.call({
      server: repoMcpServer,
      toolName: 'repo.read',
      actor,
      args: { path: 'src/app.ts' },
    });
    expect((out.content as { content: string }).content).toContain('AppName');
  });

  it('repo.read rejects path traversal', async () => {
    await expect(
      router.call({ server: repoMcpServer, toolName: 'repo.read', actor, args: { path: '../../etc/passwd' } }),
    ).rejects.toThrow(/escapes the repository/i);
  });

  it('repo.search finds matches via git grep', async () => {
    const out = await router.call({
      server: repoMcpServer,
      toolName: 'repo.search',
      actor,
      args: { query: 'AppName' },
    });
    const matches = (out.content as { matches: string[] }).matches;
    expect(matches.some((m) => m.includes('src/app.ts'))).toBe(true);
  });

  it('repo.search returns empty (not error) when nothing matches', async () => {
    const out = await router.call({
      server: repoMcpServer,
      toolName: 'repo.search',
      actor,
      args: { query: 'zzznotfoundzzz' },
    });
    expect((out.content as { matches: string[] }).matches).toEqual([]);
  });

  it('repo.diff reports working-tree changes', async () => {
    writeFileSync(path.join(repo, 'src', 'app.ts'), 'export const AppName = "recoder2";\n');
    const out = await router.call({ server: repoMcpServer, toolName: 'repo.diff', actor, args: {} });
    const c = out.content as { stat: string; patch: string };
    expect(c.stat).toContain('app.ts');
    expect(c.patch).toContain('recoder2');
  });

  it('repo.search routes to GitHub (gh) when a github repo is given', async () => {
    // Stub `gh`: a tiny script printing the gh search code JSON shape.
    const ghStub = path.join(repo, 'gh');
    writeFileSync(
      ghStub,
      '#!/bin/sh\ncat <<\'EOF\'\n[{"path":"src/index.ts","repository":{"nameWithOwner":"acme/widget","url":"https://github.com/acme/widget"},"textMatches":[{"fragment":"export const Widget = 1"}]}]\nEOF\n',
    );
    execFileSync('chmod', ['+x', ghStub]);
    process.env.RECODER_GH_BIN = ghStub;
    try {
      const out = await router.call({
        server: repoMcpServer,
        toolName: 'repo.search',
        actor,
        args: { query: 'Widget', github: 'acme/widget' },
      });
      const c = out.content as { source: string; matches: Array<{ repo: string; path: string; fragments: string[] }> };
      expect(c.source).toBe('github');
      expect(c.matches[0].repo).toBe('acme/widget');
      expect(c.matches[0].path).toBe('src/index.ts');
      expect(c.matches[0].fragments[0]).toContain('Widget');
    } finally {
      delete process.env.RECODER_GH_BIN;
    }
  });

  it('GitHub search surfaces a truthful error when gh is absent', async () => {
    process.env.RECODER_GH_BIN = '/no/such/gh';
    try {
      await expect(
        router.call({ server: repoMcpServer, toolName: 'repo.search', actor, args: { query: 'x', github: 'a/b' } }),
      ).rejects.toThrow(/gh|github/i);
    } finally {
      delete process.env.RECODER_GH_BIN;
    }
  });
});
