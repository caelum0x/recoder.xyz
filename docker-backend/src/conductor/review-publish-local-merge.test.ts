/**
 * mergeWorkspace LOCAL-merge path — on a plain LOCAL repo (no GitHub remote, no
 * `gh` PR), Merge must land the agent branch on the base branch ON DISK via a
 * local `git merge`, moving the workspace awaiting_review -> merged. This is the
 * core fix that makes the Merge button work for the local chat product.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { mergeWorkspace } from './review-publish.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const tmpRoots: string[] = [];
afterEach(() => {
  for (const r of tmpRoots.splice(0)) rmSync(r, { recursive: true, force: true });
  delete process.env.RECODER_SOLO_MODE;
});

describe('mergeWorkspace local merge (no GitHub remote)', () => {
  it('lands the agent branch on the base branch on disk and marks the workspace merged', async () => {
    expect(agentOsContainer.repositoryDriver).toBe('memory');
    process.env.RECODER_SOLO_MODE = '1'; // user click = approval (one-click local merge)

    const root = mkdtempSync(join(tmpdir(), 'recoder-local-merge-'));
    tmpRoots.push(root);
    const repo = join(root, 'repo');
    execFileSync('git', ['init', '-q', '-b', 'main', repo]);
    git(repo, 'config', 'user.email', 'e2e@recoder.test');
    git(repo, 'config', 'user.name', 'E2E');
    git(repo, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(repo, 'README.md'), 'base\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'base');

    expect(git(repo, 'remote')).toBe(''); // genuinely no remote

    const branch = `recoder/feat-${randomUUID().slice(0, 8)}`;
    const worktree = join(root, 'wt');
    git(repo, 'worktree', 'add', '-b', branch, worktree, 'main');
    git(worktree, 'config', 'user.email', 'e2e@recoder.test');
    git(worktree, 'config', 'user.name', 'E2E');
    const marker = `landed ${randomUUID()}`;
    writeFileSync(join(worktree, 'FEATURE.txt'), `${marker}\n`);
    git(worktree, 'add', '.');
    git(worktree, 'commit', '-q', '-m', 'feature change');

    const now = new Date().toISOString();
    const ws: Workspace = {
      workspaceId: `ws_${randomUUID()}`,
      spaceId: 'space_t',
      projectId: 'proj_t',
      taskId: `task_${randomUUID()}`,
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch,
      baseRef: 'main',
      worktreePath: worktree,
      state: 'awaiting_review',
      createdBy: 'desktop-user',
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
    await Promise.resolve(agentOsContainer.repository.upsertWorkspace(ws));

    expect(existsSync(join(repo, 'FEATURE.txt'))).toBe(false); // not on base yet

    const result = await mergeWorkspace(ws.workspaceId, {
      intent: { approve: true, decidedBy: 'desktop-user' },
    });
    expect(result.merged).toBe(true);

    // The change LANDED on the base branch on disk — no gh, no PR.
    expect(existsSync(join(repo, 'FEATURE.txt'))).toBe(true);

    const fresh = await Promise.resolve(agentOsContainer.repository.getWorkspace(ws.workspaceId));
    expect(fresh?.state).toBe('merged');
    expect((fresh?.metadata as Record<string, unknown>)?.mergeMode).toBe('local');
  });
});
