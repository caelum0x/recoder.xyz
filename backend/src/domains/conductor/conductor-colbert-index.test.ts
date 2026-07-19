/**
 * Conductor per-repo ColBERT index-build fusion. On a workspace create the run
 * flow chunks the repo's text files (`readRepoPassages`) and builds/refreshes the
 * late-interaction PLAID collection through the injected `ColbertSearchPort`. Proves
 * — with a real temp repo + an in-memory index seam:
 *  - the build FIRES on create (real passages ⇒ `ensureIndex(repo_<repoId>, …)`),
 *  - it is degrade-truthful: an unconfigured daemon (`configured():false`) ⇒ NO build,
 *  - it is degrade-safe: an `ensureIndex` throw never blocks the launch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ColbertIndexBuildResult,
  ColbertSearchPort,
  ColbertSearchResult,
} from '../memory/ports/colbert-search.port.js';
import { composeConductor, FakeSubstrate, makeCreateInput, makePrincipal } from './__fixtures__/harness.js';

interface RecordingColbert extends ColbertSearchPort {
  readonly builds: Array<{ collection: string; passages: readonly string[]; overwrite?: boolean }>;
}

function makeColbert(opts: { configured?: boolean; throwOnBuild?: boolean } = {}): RecordingColbert {
  const builds: RecordingColbert['builds'] = [];
  const configured = opts.configured ?? true;
  return {
    builds,
    configured() {
      return configured;
    },
    async search(): Promise<ColbertSearchResult> {
      return { available: false, hits: [], reason: 'not exercised' };
    },
    async ensureIndex(collection, passages, o): Promise<ColbertIndexBuildResult> {
      builds.push({ collection, passages, ...(o?.overwrite !== undefined ? { overwrite: o.overwrite } : {}) });
      if (opts.throwOnBuild) throw new Error('colbert daemon down');
      return { built: true, collection, documents: passages.length };
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Poll until `predicate` holds or the deadline elapses (the fire-and-forget
 * repo walk + index build resolve on a later tick than createWorkspace). */
async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(10);
  }
}

describe('conductor per-repo ColBERT index build', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'recoder-colbert-'));
    await writeFile(join(repoRoot, 'main.ts'), 'export const answer = 42;\nconsole.log(answer);\n', 'utf8');
    await writeFile(join(repoRoot, 'README.md'), '# Fixture repo\n\nSome passage text.\n', 'utf8');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('FIRES the build on create with real passages, keyed by repo_<repoId>', async () => {
    const colbertIndex = makeColbert({ configured: true });
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      colbertIndex,
    });

    const result = await module.createWorkspace(
      makeCreateInput({ repoPath: repoRoot }),
      makePrincipal('user_ann'),
    );
    await waitFor(() => colbertIndex.builds.length > 0);

    expect(result.ok).toBe(true);
    expect(colbertIndex.builds).toHaveLength(1);
    // projectId 'project_1' → deterministic repoId → collection `repo_project_1`.
    expect(colbertIndex.builds[0]!.collection).toBe('repo_project_1');
    expect(colbertIndex.builds[0]!.overwrite).toBe(true);
    // Real passages were chunked out of the temp repo's text files.
    expect(colbertIndex.builds[0]!.passages.length).toBeGreaterThan(0);
    expect(colbertIndex.builds[0]!.passages.some((p) => p.includes('answer = 42'))).toBe(true);
  });

  it('degrade-truthful: an unconfigured daemon builds NOTHING', async () => {
    const colbertIndex = makeColbert({ configured: false });
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      colbertIndex,
    });

    const result = await module.createWorkspace(
      makeCreateInput({ repoPath: repoRoot }),
      makePrincipal(),
    );
    // Give the fire-and-forget hook ample time; an unconfigured daemon must never build.
    await sleep(200);

    expect(result.ok).toBe(true);
    expect(colbertIndex.builds).toHaveLength(0);
  });

  it('degrade-safe: an ensureIndex throw never blocks the launch', async () => {
    const colbertIndex = makeColbert({ configured: true, throwOnBuild: true });
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      colbertIndex,
    });

    const result = await module.createWorkspace(
      makeCreateInput({ repoPath: repoRoot }),
      makePrincipal(),
    );
    await waitFor(() => colbertIndex.builds.length > 0);

    // The build was attempted, then faulted — the launch still succeeded.
    expect(colbertIndex.builds).toHaveLength(1);
    expect(result.ok).toBe(true);
  });
});
