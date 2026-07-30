/**
 * Per-repo setup scripts — the config seam + the worktree-create run hook.
 *
 * Proves:
 *  - setScript is a GOVERNED write: an allow persists it (readable back) AND
 *    seals a `workspace.repo_setup` audit; a deny BLOCKS it (nothing stored, no
 *    audit) — never a faked success;
 *  - runSetup runs the configured script inside the fresh worktree (right cwd,
 *    `bash -lc <script>`) and captures the real output + exit code;
 *  - runSetup is degrade-truthful + NON-blocking: no script configured is a
 *    truthful skip (`ran:false`); a failing script is a CAPTURED failure
 *    (`ran:true, ok:false` with the exit code + stderr), never a throw;
 *  - repoKeyFor derives a stable, path-safe key (projectId preferred).
 */
import { describe, it, expect } from 'vitest';
import { ExecError } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import {
  RepoSetupService,
  repoKeyFor,
  type RepoSetupExec,
} from './services/repo-setup.service.js';
import { createInMemoryRepoSetupStore } from './adapters/repo-setup-store.adapter.js';
import {
  makeGate,
  makeLogger,
  makePrincipal,
  type FakeGate,
} from './__fixtures__/harness.js';

interface Recorded {
  bin: string;
  args: readonly string[];
  options: ExecOptions;
}

/** A recording exec seam whose result/throw is configurable per test. */
function makeExec(behavior: (rec: Recorded) => ExecResult | ExecError): {
  exec: RepoSetupExec;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const exec: RepoSetupExec = async (bin, args, options) => {
    const rec: Recorded = { bin, args, options };
    calls.push(rec);
    const outcome = behavior(rec);
    if (outcome instanceof ExecError) throw outcome;
    return outcome;
  };
  return { exec, calls };
}

function makeService(
  overrides: { gate?: FakeGate; exec?: RepoSetupExec } = {}
) {
  const store = createInMemoryRepoSetupStore();
  const gate = overrides.gate ?? makeGate('allow');
  const service = new RepoSetupService({
    store,
    gate,
    logger: makeLogger(),
    ...(overrides.exec ? { exec: overrides.exec } : {}),
    now: () => new Date('2026-07-19T00:00:00.000Z'),
  });
  return { service, store, gate };
}

describe('repoKeyFor', () => {
  it('prefers projectId, lowercased', () => {
    expect(repoKeyFor('Project_ABC', '/tmp/x')).toBe('project_abc');
  });

  it('normalizes a repoPath when no projectId', () => {
    expect(repoKeyFor(undefined, '/Users/me/My Repo')).toBe(
      '__users__me__my__repo'
    );
  });

  it('is "unknown" for empty input (never throws)', () => {
    expect(repoKeyFor(undefined, undefined)).toBe('unknown');
    expect(repoKeyFor('', '  ')).toBe('unknown');
  });
});

describe('repo setup config (gated)', () => {
  it('persists an allowed setScript and seals a repo_setup audit', async () => {
    const { service, gate } = makeService();
    const result = await service.setScript(
      'repo_1',
      'pnpm install',
      makePrincipal('user_bob')
    );

    expect(result.ok).toBe(true);
    expect(result.value?.script).toBe('pnpm install');
    expect(result.value?.updatedBy).toBe('user_bob');

    const read = await service.getScript('repo_1');
    expect(read?.script).toBe('pnpm install');

    const audit = gate.audits.find(a => a.action === 'workspace.repo_setup');
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe('user_bob');
    // The audit payload records length, NEVER the script body.
    expect(JSON.stringify(audit?.payload)).not.toContain('pnpm install');
  });

  it('blocks setScript when the gate denies (nothing stored, no audit)', async () => {
    const { service, gate } = makeService({ gate: makeGate('deny') });
    const result = await service.setScript(
      'repo_1',
      'rm -rf /',
      makePrincipal()
    );

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect(await service.getScript('repo_1')).toBeNull();
    expect(gate.audits).toHaveLength(0);
  });

  it('an empty script clears the repo (legal value)', async () => {
    const { service } = makeService();
    await service.setScript('repo_1', 'pnpm install', makePrincipal());
    const cleared = await service.setScript('repo_1', '', makePrincipal());
    expect(cleared.ok).toBe(true);
    expect((await service.getScript('repo_1'))?.script).toBe('');
  });
});

describe('repo setup run hook (create)', () => {
  it('runs the configured script in the worktree and captures output', async () => {
    const { exec, calls } = makeExec(() => ({
      stdout: 'installed 42 packages\n',
      stderr: '',
      code: 0,
    }));
    const { service } = makeService({ exec });
    await service.setScript('repo_1', 'pnpm install', makePrincipal());

    const result = await service.runSetup({
      repoKey: 'repo_1',
      worktreePath: '/tmp/wt/ws_1',
      workspaceId: 'ws_1',
    });

    expect(result).toEqual({
      ran: true,
      ok: true,
      exitCode: 0,
      stdout: 'installed 42 packages\n',
      stderr: '',
    });
    // Ran the right command in the right worktree.
    expect(calls).toHaveLength(1);
    expect(calls[0].bin).toBe('bash');
    expect(calls[0].args).toEqual(['-lc', 'pnpm install']);
    expect(calls[0].options.cwd).toBe('/tmp/wt/ws_1');
    // No port passed ⇒ no env overlay injected (script just doesn't see the var).
    expect(calls[0].options.env).toBeUndefined();
  });

  it('injects RECODER_PORT into the setup script env when a port is given', async () => {
    const { exec, calls } = makeExec(() => ({ stdout: '', stderr: '', code: 0 }));
    const { service } = makeService({ exec });
    await service.setScript('repo_1', 'echo $RECODER_PORT', makePrincipal());

    await service.runSetup({
      repoKey: 'repo_1',
      worktreePath: '/tmp/wt/ws_1',
      workspaceId: 'ws_1',
      recoderPort: 4321,
    });

    expect(calls[0].options.env).toEqual({ RECODER_PORT: '4321' });
  });

  it('is a truthful skip when no script is configured (never runs anything)', async () => {
    const { exec, calls } = makeExec(() => ({
      stdout: '',
      stderr: '',
      code: 0,
    }));
    const { service } = makeService({ exec });

    const result = await service.runSetup({
      repoKey: 'repo_unset',
      worktreePath: '/tmp/wt',
    });

    expect(result).toEqual({
      ran: false,
      reason: 'no setup script configured',
    });
    expect(calls).toHaveLength(0);
  });

  it('captures a failing script truthfully and NEVER throws (non-blocking)', async () => {
    const { exec } = makeExec(rec => {
      return new ExecError(rec.bin, rec.args, {
        code: 1,
        stdout: 'resolving…\n',
        stderr: 'ERR_PNPM_NO_LOCKFILE\n',
        message: 'command failed: bash (code 1)',
      });
    });
    const { service } = makeService({ exec });
    await service.setScript(
      'repo_1',
      'pnpm install --frozen-lockfile',
      makePrincipal()
    );

    const result = await service.runSetup({
      repoKey: 'repo_1',
      worktreePath: '/tmp/wt',
    });

    expect(result.ran).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ERR_PNPM_NO_LOCKFILE');
    expect(result.reason).toContain('code 1');
  });
});
