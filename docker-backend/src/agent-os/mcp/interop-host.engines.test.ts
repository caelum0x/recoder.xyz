/**
 * Proves the docker-backend interop host bundle INJECTS the concrete engines
 * behind the runtime-agnostic `@recoder/agent-mcp` git_nexus/tasks/runs servers:
 *
 *  - git_nexus.context_pack, called THROUGH the gated host, returns NON-EMPTY
 *    real dependency edges parsed by the `@recoder/recodergit` indexer over a
 *    real on-disk fixture repo — proving the recodergit engine is wired, not the
 *    package fake.
 *  - tasks.create -> tasks.get, called THROUGH the gated host, materializes a
 *    real TaskSpec in the injected agent-os repository — proving the canonical
 *    store backs the task/run ports, not an internal package mirror.
 *
 * Both calls traverse the full interop gate (authorize -> risk -> execute ->
 * audit); the assertions read real engine output + real repository state.
 */
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentProfile } from '@recoder/agent-os';
import { gitNexusMcpServer, tasksMcpServer, memoryMcpServer } from '@recoder/agent-mcp';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';
import { InteropHostBundle } from './interop-host';

/**
 * A small but REAL fixture repo: a -> b -> c TypeScript import chain. The
 * recodergit indexer must parse these edges; if the host were wired to a fake,
 * the dependency graph would be empty.
 */
async function makeFixtureRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'interop-gitnexus-'));
  const base = path.join(root, 'packages', 'demo');
  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(path.join(base, 'c.ts'), `export const c = 1;\n`);
  await fs.writeFile(path.join(base, 'b.ts'), `import { c } from './c';\nexport const b = c + 1;\n`);
  await fs.writeFile(path.join(base, 'a.ts'), `import { b } from './b';\nexport const a = b + 1;\n`);
  return root;
}

function actor(): AgentProfile {
  return {
    agentId: 'agent_interop_test',
    permissions: { toolRules: [] },
  } as unknown as AgentProfile;
}

describe('InteropHostBundle concrete engine injection', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await makeFixtureRepo();
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('git_nexus.context_pack returns real recodergit dependency edges through the host', async () => {
    const repository = new InMemoryAgentOsRepository();
    const bundle = new InteropHostBundle({ repository, baseRepoRoot: repoRoot });

    const outcome = await bundle.call({
      server: gitNexusMcpServer,
      toolName: 'git_nexus.context_pack',
      actor: actor(),
      args: {
        // Absolute repo path -> the GitNexusPort resolver returns it verbatim
        // and the recodergit indexer walks it.
        repo: repoRoot,
        targetPaths: ['packages/demo/c.ts'],
      },
    });

    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') {
      throw new Error(`expected completed outcome, got ${outcome.status}`);
    }

    const pack = outcome.result.content as {
      dependencyGraph: { nodes: string[]; edges: Array<{ from: string; to: string }> };
    };

    // REAL edges parsed from the fixture import chain, not an empty envelope.
    expect(pack.dependencyGraph.edges.length).toBeGreaterThanOrEqual(2);
    expect(pack.dependencyGraph.nodes).toContain('packages/demo/a.ts');
    const hasAtoB = pack.dependencyGraph.edges.some(
      (e) => e.from === 'packages/demo/a.ts' && e.to === 'packages/demo/b.ts',
    );
    const hasBtoC = pack.dependencyGraph.edges.some(
      (e) => e.from === 'packages/demo/b.ts' && e.to === 'packages/demo/c.ts',
    );
    expect(hasAtoB).toBe(true);
    expect(hasBtoC).toBe(true);
  });

  it('tasks.create -> tasks.get materializes a real TaskSpec in the injected agent-os repository', async () => {
    const repository = new InMemoryAgentOsRepository();
    const bundle = new InteropHostBundle({ repository, baseRepoRoot: repoRoot });

    const createOutcome = await bundle.call({
      server: tasksMcpServer,
      toolName: 'tasks.create',
      actor: actor(),
      args: {
        title: 'Wire the MCP last mile',
        goal: 'Inject concrete engines into the interop host',
        spaceId: 'space_interop',
        intent: 'platform_hardening',
        targetPaths: ['docker-backend/src/agent-os/mcp/interop-host.ts'],
      },
    });

    expect(createOutcome.status).toBe('completed');
    if (createOutcome.status !== 'completed') {
      throw new Error(`expected completed outcome, got ${createOutcome.status}`);
    }
    const created = createOutcome.result.content as { taskId: string; title: string };
    expect(created.taskId).toBeTruthy();

    // The write went to the CANONICAL store, not a package-internal mirror.
    const stored = await repository.listTasks();
    expect(stored.some((task) => task.taskId === created.taskId)).toBe(true);

    // And a read back THROUGH the host reflects that same canonical state.
    const getOutcome = await bundle.call({
      server: tasksMcpServer,
      toolName: 'tasks.get',
      actor: actor(),
      args: { taskId: created.taskId },
    });

    expect(getOutcome.status).toBe('completed');
    if (getOutcome.status !== 'completed') {
      throw new Error(`expected completed outcome, got ${getOutcome.status}`);
    }
    const fetched = getOutcome.result.content as { task: { taskId: string; title: string } };
    expect(fetched.task.taskId).toBe(created.taskId);
    expect(fetched.task.title).toBe('Wire the MCP last mile');
  });

  it('memory.search executes through the gated host (not "no executor wired")', async () => {
    const repository = new InMemoryAgentOsRepository();
    // Seed a durable memory item so search has something real to return.
    await repository.upsertMemoryItem({
      memoryId: 'mem_1',
      scope: 'repo',
      title: 'Recoder is a terminal',
      body: 'The polyglot dirs are backend capabilities the agents use.',
      status: 'accepted',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      evidence: { taskId: 't', artifactId: 'a' },
    } as never);

    const bundle = new InteropHostBundle({ repository, baseRepoRoot: repoRoot });
    const outcome = await bundle.call({
      server: memoryMcpServer,
      toolName: 'memory.search',
      actor: actor(),
      args: { query: 'terminal', scope: 'repo' },
    });

    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') {
      throw new Error(`expected completed, got ${outcome.status}`);
    }
    const items = outcome.result.content as Array<{ memoryId: string; title: string }>;
    expect(items.some((i) => i.memoryId === 'mem_1')).toBe(true);
  });
});
