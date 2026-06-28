import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AgentProfile, TaskSpec } from '@recoder/agent-os';
import { McpRegistry } from '../registry';
import { McpToolRouter } from '../host/tool-router';
import { GitNexusPort, gitNexusMcpServer, registerGitNexusMcpTools } from './git-nexus-server';

/**
 * Build a small but REAL fixture repo on disk: three TS files with a real import
 * chain a -> b -> c. The recodergit indexer must parse these edges and the
 * git_nexus handlers must surface them — proving the server is backed by the
 * real engine, not a stub.
 */
async function makeFixtureRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'gitnexus-fixture-'));
  await fs.mkdir(path.join(root, 'packages', 'demo'), { recursive: true });
  const base = path.join(root, 'packages', 'demo');
  await fs.writeFile(path.join(base, 'c.ts'), `export const c = 1;\n`);
  await fs.writeFile(path.join(base, 'b.ts'), `import { c } from './c';\nexport const b = c + 1;\n`);
  await fs.writeFile(
    path.join(base, 'a.ts'),
    `import { b } from './b';\nexport const NEEDLE_TOKEN = b + 1;\n`,
  );
  return root;
}

function actor(): AgentProfile {
  return { agentId: 'agent_test', permissions: { toolRules: [] } } as unknown as AgentProfile;
}

function task(repoRoot: string, targetPaths: string[]): TaskSpec {
  return {
    taskId: 'task_gn_1',
    title: 'fixture',
    intent: 'research',
    goal: 'index fixture',
    spaceId: 'space_1',
    repo: repoRoot,
    targetPaths,
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
}

function makeRouter(repoRoot: string): McpToolRouter {
  const router = new McpToolRouter(new McpRegistry());
  const port: GitNexusPort = { resolveRepoRoot: () => repoRoot };
  registerGitNexusMcpTools(router, port);
  return router;
}

test('git_nexus.context_pack returns non-empty real dependency edges from a fixture repo', async () => {
  const repoRoot = await makeFixtureRepo();
  try {
    const router = makeRouter(repoRoot);
    const result = await router.call({
      server: gitNexusMcpServer,
      toolName: 'git_nexus.context_pack',
      actor: actor(),
      task: task(repoRoot, ['packages/demo/c.ts']),
      args: {},
    });
    const pack = result.content as {
      dependencyGraph: { nodes: string[]; edges: Array<{ from: string; to: string }> };
    };

    // REAL edges, not an empty envelope.
    assert.ok(pack.dependencyGraph.edges.length >= 2, 'expected >= 2 import edges');
    assert.ok(pack.dependencyGraph.nodes.includes('packages/demo/a.ts'));
    const hasAtoB = pack.dependencyGraph.edges.some(
      (e) => e.from === 'packages/demo/a.ts' && e.to === 'packages/demo/b.ts',
    );
    const hasBtoC = pack.dependencyGraph.edges.some(
      (e) => e.from === 'packages/demo/b.ts' && e.to === 'packages/demo/c.ts',
    );
    assert.ok(hasAtoB, 'expected a.ts -> b.ts edge');
    assert.ok(hasBtoC, 'expected b.ts -> c.ts edge');
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('git_nexus.impact_report computes real reverse reachability over the fixture graph', async () => {
  const repoRoot = await makeFixtureRepo();
  try {
    const router = makeRouter(repoRoot);
    const result = await router.call({
      server: gitNexusMcpServer,
      toolName: 'git_nexus.impact_report',
      actor: actor(),
      args: { repo: repoRoot, changedPaths: ['packages/demo/c.ts'] },
    });
    const report = result.content as { seeds: string[]; impactedFiles: string[]; edgeCount: number };

    // Changing c.ts impacts b.ts (imports c) and a.ts (imports b, transitively).
    assert.deepEqual(report.seeds, ['packages/demo/c.ts']);
    assert.ok(report.impactedFiles.includes('packages/demo/b.ts'));
    assert.ok(report.impactedFiles.includes('packages/demo/a.ts'));
    assert.ok(report.edgeCount >= 2);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('git_nexus.search_code greps real indexed source files', async () => {
  const repoRoot = await makeFixtureRepo();
  try {
    const router = makeRouter(repoRoot);
    const result = await router.call({
      server: gitNexusMcpServer,
      toolName: 'git_nexus.search_code',
      actor: actor(),
      args: { repo: repoRoot, query: 'NEEDLE_TOKEN' },
    });
    const body = result.content as { matches: Array<{ path: string; line: number; snippet: string }> };
    assert.ok(body.matches.length >= 1, 'expected a real grep hit');
    assert.equal(body.matches[0]?.path, 'packages/demo/a.ts');
    assert.ok(body.matches[0]?.snippet.includes('NEEDLE_TOKEN'));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('git_nexus surfaces a truthful error when the repo root is unresolved', async () => {
  const router = new McpToolRouter(new McpRegistry());
  registerGitNexusMcpTools(router, { resolveRepoRoot: () => '' });
  await assert.rejects(
    () =>
      router.call({
        server: gitNexusMcpServer,
        toolName: 'git_nexus.context_pack',
        actor: actor(),
        args: {},
      }),
    /could not be resolved/,
  );
});
