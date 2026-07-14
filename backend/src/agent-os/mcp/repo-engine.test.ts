/**
 * repo-engine — governed read-only repo tools over a REAL temp git repo, plus
 * the hybrid `repo.search` that MERGES semantic + keyword + GitHub sources.
 * The semantic source is injected with a fake so nothing here touches a network.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpRegistry, McpToolRouter, repoMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import { registerRepoMcpTools, type RepoSearchMatch, type SemanticSearcher } from './repo-engine';

const actor = { agentId: 'a', permissions: { toolRules: [] } } as unknown as AgentProfile;

/** A semantic searcher that always degrades to [] (the unconfigured baseline). */
const noSemantic: SemanticSearcher = async () => [];

type SearchContent = {
  query: string;
  source: string;
  sources: string[];
  matches: RepoSearchMatch[];
  truncated: boolean;
  degraded?: { semantic?: string; keyword?: string; github?: string };
};

describe('registerRepoMcpTools (real temp repo)', () => {
  let repo: string;
  let router: McpToolRouter;

  function register(semanticSearch: SemanticSearcher | null = noSemantic): void {
    router = new McpToolRouter(new McpRegistry());
    registerRepoMcpTools(router, { baseRepoRoot: repo, semanticSearch });
  }

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'repo-engine-'));
    execFileSync('git', ['-C', repo, 'init', '-q']);
    execFileSync('git', ['-C', repo, 'config', 'user.email', 't@t.co']);
    execFileSync('git', ['-C', repo, 'config', 'user.name', 't']);
    mkdirSync(path.join(repo, 'src'));
    writeFileSync(path.join(repo, 'src', 'app.ts'), 'export const AppName = "recoder";\n');
    execFileSync('git', ['-C', repo, 'add', '-A']);
    execFileSync('git', ['-C', repo, 'commit', '-qm', 'init']);
    register();
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  async function search(args: Record<string, unknown>): Promise<SearchContent> {
    const out = await router.call({ server: repoMcpServer, toolName: 'repo.search', actor, args });
    return out.content as SearchContent;
  }

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

  it('repo.search finds keyword matches via git grep, labelled by source', async () => {
    const c = await search({ query: 'AppName' });
    expect(c.source).toBe('hybrid');
    expect(c.sources).toContain('keyword');
    const hit = c.matches.find((m) => m.path === 'src/app.ts');
    expect(hit).toBeDefined();
    expect(hit?.source).toBe('keyword');
    expect(hit?.line).toBe(1);
    expect(hit?.text).toContain('AppName');
  });

  it('repo.search returns empty matches (not error) when nothing matches', async () => {
    const c = await search({ query: 'zzznotfoundzzz' });
    expect(c.matches).toEqual([]);
    expect(c.sources).toEqual([]);
  });

  it('repo.diff reports working-tree changes', async () => {
    writeFileSync(path.join(repo, 'src', 'app.ts'), 'export const AppName = "recoder2";\n');
    const out = await router.call({ server: repoMcpServer, toolName: 'repo.diff', actor, args: {} });
    const c = out.content as { stat: string; patch: string };
    expect(c.stat).toContain('app.ts');
    expect(c.patch).toContain('recoder2');
  });

  it('MERGES semantic + keyword, labelled and de-duped by location', async () => {
    // Semantic returns the SAME location as the keyword hit (src/app.ts:1) plus a
    // semantic-only file. The shared location must appear once, labelled semantic.
    const fake: SemanticSearcher = async () => [
      { path: 'src/app.ts', startLine: 1, endLine: 1, score: 0.98, preview: 'export const AppName' },
      { path: 'src/only-semantic.ts', startLine: 12, endLine: 20, score: 0.71, preview: 'buried meaning' },
    ];
    register(fake);
    const c = await search({ query: 'AppName' });

    expect(c.sources).toContain('semantic');
    expect(c.sources).toContain('keyword');

    const appHits = c.matches.filter((m) => m.path === 'src/app.ts');
    expect(appHits).toHaveLength(1);
    expect(appHits[0].source).toBe('semantic');
    expect(appHits[0].score).toBeCloseTo(0.98);

    const semanticOnly = c.matches.find((m) => m.path === 'src/only-semantic.ts');
    expect(semanticOnly?.source).toBe('semantic');
    expect(semanticOnly?.line).toBe(12);
  });

  it('repo.search adds GitHub matches when a github repo is given', async () => {
    const ghStub = path.join(repo, 'gh');
    writeFileSync(
      ghStub,
      '#!/bin/sh\ncat <<\'EOF\'\n[{"path":"src/index.ts","repository":{"nameWithOwner":"acme/widget","url":"https://github.com/acme/widget"},"textMatches":[{"fragment":"export const Widget = 1"}]}]\nEOF\n',
    );
    execFileSync('chmod', ['+x', ghStub]);
    process.env.RECODER_GH_BIN = ghStub;
    try {
      const c = await search({ query: 'Widget', github: 'acme/widget' });
      expect(c.source).toBe('hybrid');
      expect(c.sources).toContain('github');
      const gh = c.matches.find((m) => m.source === 'github');
      expect(gh?.repo).toBe('acme/widget');
      expect(gh?.path).toBe('src/index.ts');
      expect(gh?.text).toContain('Widget');
    } finally {
      delete process.env.RECODER_GH_BIN;
    }
  });

  it('degrades truthfully (no throw) when gh is absent — keyword still returns', async () => {
    process.env.RECODER_GH_BIN = '/no/such/gh';
    try {
      const c = await search({ query: 'AppName', github: 'a/b' });
      // GitHub failed but the merged search still succeeds on keyword.
      expect(c.matches.some((m) => m.source === 'keyword' && m.path === 'src/app.ts')).toBe(true);
      expect(c.sources).not.toContain('github');
      expect(c.degraded?.github).toBeTruthy();
    } finally {
      delete process.env.RECODER_GH_BIN;
    }
  });

  it('default semantic searcher degrades to [] (no embeddings/Qdrant) without throwing', async () => {
    // Prove the DEFAULT (uninjected) path never throws and never touches a network
    // when no provider/store is configured — it falls back to keyword-only.
    const saved = {
      QDRANT_URL: process.env.QDRANT_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      TENSORZERO_URL: process.env.TENSORZERO_URL,
      EMBED_ENDPOINT: process.env.EMBED_ENDPOINT,
    };
    delete process.env.QDRANT_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.TENSORZERO_URL;
    delete process.env.EMBED_ENDPOINT;
    // Register WITHOUT a semanticSearch key ⇒ the built-in defaultSemanticSearch runs.
    router = new McpToolRouter(new McpRegistry());
    registerRepoMcpTools(router, { baseRepoRoot: repo });
    try {
      const c = await search({ query: 'AppName' });
      expect(c.sources).not.toContain('semantic');
      expect(c.matches.some((m) => m.source === 'keyword' && m.path === 'src/app.ts')).toBe(true);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
