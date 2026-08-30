import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { composeConductor, makeCreateInput, makePrincipal } from '../__fixtures__/harness.js';
import { SpawningSubstrate } from '../__fixtures__/spawn-substrate.js';

function git(cwd: string, args: readonly string[]): void {
  execFileSync('git', [
    '-c', 'user.email=checkfix@recoder.local',
    '-c', 'user.name=Recoder Check Fix',
    '-c', 'commit.gpgsign=false',
    ...args,
  ], { cwd, stdio: 'ignore' });
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('named check remediation loop', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('reproduces failure, continues the real worktree process, and independently attests the rerun', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'recoder-checkfix-'));
    roots.push(root);
    const repo = path.join(root, 'repo');
    const bin = path.join(root, 'bin');
    const worktrees = path.join(root, 'worktrees');
    mkdirSync(path.join(repo, '.recoder'), { recursive: true });
    mkdirSync(bin, { recursive: true });
    mkdirSync(worktrees, { recursive: true });

    const checker = path.join(bin, 'recoder-check');
    const codex = path.join(bin, 'codex');
    writeFileSync(checker, '#!/bin/sh\nread value < check-state\n[ "$value" = pass ]\n');
    writeFileSync(codex, '#!/bin/sh\nexit 0\n');
    chmodSync(checker, 0o755);
    chmodSync(codex, 0o755);
    writeFileSync(path.join(repo, 'check-state'), 'fail\n');
    writeFileSync(path.join(repo, '.recoder', 'checks.json'), JSON.stringify({ checks: [{
      name: 'fixture check',
      command: checker,
      args: [],
      autofix: true,
      fixPrompt: 'Change only check-state from fail to pass.',
    }] }));
    git(repo, ['init', '-b', 'main']);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'seed failing check']);

    const substrate = new SpawningSubstrate({ worktreesDir: worktrees, pathDirs: [bin] });
    const { module, gate } = composeConductor({ substrates: [substrate] });
    const principal = makePrincipal('checkfix_operator');
    try {
      const created = await module.createWorkspace(makeCreateInput({
        repoPath: repo,
        runtimeId: 'codex',
        prompt: 'Prepare the fixture without changing files.',
      }), principal);
      expect(created.ok).toBe(true);
      const workspaceId = created.value!.workspaceId;

      const firstDeadline = Date.now() + 12_000;
      while ((await module.getWorkspace(workspaceId))?.state !== 'awaiting_review' && Date.now() < firstDeadline) {
        await sleep(100);
      }
      const before = await module.workspaceChecks(workspaceId);
      expect(before?.checks?.find(row => row.name === 'fixture check')).toMatchObject({
        conclusion: 'FAILURE',
        source: 'recoder',
        autofix: { prompt: expect.stringContaining('Change only check-state') },
      });

      // The second real process is the fixer. The substrate must genuinely spawn
      // this continuation; merely toggling an in-memory lifecycle bit cannot pass.
      writeFileSync(codex, '#!/bin/sh\nprintf "pass\\n" > check-state\nexit 0\n');
      chmodSync(codex, 0o755);
      const requested = await module.remediateWorkspaceCheck(workspaceId, 'fixture check', principal);
      expect(requested).toMatchObject({
        ok: true,
        value: { checkName: 'fixture check', state: 'running', beforeStatus: 'fail' },
      });

      const attestationDeadline = Date.now() + 12_000;
      let settled = await module.getWorkspace(workspaceId);
      while (
        (settled?.metadata?.checkRemediation as { state?: string } | undefined)?.state !== 'passed' &&
        Date.now() < attestationDeadline
      ) {
        await sleep(100);
        settled = await module.getWorkspace(workspaceId);
      }
      expect(settled?.state).toBe('awaiting_review');
      expect(settled?.metadata?.checkRemediation).toMatchObject({
        checkName: 'fixture check',
        state: 'passed',
        beforeStatus: 'fail',
        afterStatus: 'pass',
        agentOutcome: 'completed',
      });
      expect(readFileSync(path.join(settled!.worktreePath!, 'check-state'), 'utf8')).toBe('pass\n');
      expect(readFileSync(path.join(repo, 'check-state'), 'utf8')).toBe('fail\n');

      const after = await module.workspaceChecks(workspaceId);
      expect(after?.checks?.find(row => row.name === 'fixture check')).toMatchObject({
        conclusion: 'SUCCESS',
        remediation: { state: 'passed', afterStatus: 'pass' },
      });
      expect(gate.decisions).toContain('workspace.check-remediate');
      expect(gate.audits.some(entry => entry.action === 'workspace.check-remediate')).toBe(true);
    } finally {
      await module.stop();
    }
  }, 30_000);
});
