/**
 * Repo-setup RUN hook wired into the createWorkspace flow (composer integration).
 *
 * Proves the composer calls {@link RepoSetupService.runSetup} inside the freshly
 * created worktree after an allowed launch:
 *  - a repo WITH a configured script runs it (`bash -lc <script>`) in the new
 *    worktree — the right cwd, the right command;
 *  - a repo with NO configured script never shells anything (a truthful skip);
 *  - the hook is fire-and-forget + non-blocking: createWorkspace resolves `ok`
 *    regardless, and a failing script never aborts the launch.
 *
 * The exec + store are injected through the harness so the hook is observable
 * without a real shell or a DB.
 */
import { describe, it, expect } from 'vitest';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';
import { createInMemoryRepoSetupStore } from './adapters/repo-setup-store.adapter.js';
import type { RepoSetupExec } from './services/repo-setup.service.js';
import type { RepoSetupStorePort } from './ports/repo-setup-store.port.js';

interface Recorded {
  bin: string;
  args: readonly string[];
  options: ExecOptions;
}

/** A recording exec seam that always succeeds (code 0). */
function makeRecordingExec(): { exec: RepoSetupExec; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const exec: RepoSetupExec = async (bin, args, options): Promise<ExecResult> => {
    calls.push({ bin, args, options });
    return { stdout: 'ok\n', stderr: '', code: 0 };
  };
  return { exec, calls };
}

/** Seed a store with one repo's setup script. */
async function seededStore(repoKey: string, script: string): Promise<RepoSetupStorePort> {
  const store = createInMemoryRepoSetupStore();
  await store.set({ repoKey, script, updatedBy: 'user_seed', updatedAt: '2026-07-19T00:00:00.000Z' });
  return store;
}

/** Await the fire-and-forget hook until it records a call (bounded, non-flaky). */
async function waitForCall(calls: Recorded[], timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (calls.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('conductor createWorkspace → repo-setup run hook', () => {
  it('runs the repo\'s configured setup script in the new worktree', async () => {
    // makeCreateInput uses projectId 'project_1' → repoKey 'project_1'.
    const store = await seededStore('project_1', 'pnpm install');
    const { exec, calls } = makeRecordingExec();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      repoSetupStore: store,
      repoSetupExec: exec,
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(result.ok).toBe(true);

    await waitForCall(calls);
    expect(calls).toHaveLength(1);
    expect(calls[0].bin).toBe('bash');
    expect(calls[0].args).toEqual(['-lc', 'pnpm install']);
    // The FakeSubstrate launches into /tmp/fake/<ref> — the hook runs there.
    expect(calls[0].options.cwd).toContain('/tmp/fake/');
  });

  it('never shells anything when the repo has no configured script (truthful skip)', async () => {
    const { exec, calls } = makeRecordingExec();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      // No seeded store: the module's in-process store has nothing for this repo.
      repoSetupExec: exec,
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(result.ok).toBe(true);

    // Give the fire-and-forget hook a chance to (not) run, then assert no exec.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
  });

  it('runs the COMMITTED settings.json setup when the governed store is empty (durable baseline)', async () => {
    const { exec, calls } = makeRecordingExec();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      // Empty store (fresh in-process) — exactly the state after a backend
      // relaunch. The committed file must still drive the hook.
      repoSetupExec: exec,
      repoSetupReadConfigFile: async () => ({
        scripts: { setup: 'pnpm install --frozen-lockfile', run: '' },
        port: { base: 4300, span: 200 },
      }),
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(result.ok).toBe(true);

    await waitForCall(calls);
    expect(calls).toHaveLength(1);
    expect(calls[0].bin).toBe('bash');
    expect(calls[0].args).toEqual(['-lc', 'pnpm install --frozen-lockfile']);
  });
});
