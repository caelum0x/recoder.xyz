/**
 * e2e-conductor-completion-commit — FAITHFUL repro of the "No changed files" bug.
 *
 * The real desktop agent creates a NEW file (e.g. `hi.txt`) in its worktree but
 * never `git commit`s it. A brand-new file is UNTRACKED, and `git diff <base>
 * --stat` does NOT list untracked files — so the review diff reported
 * `changedFiles: 0` and the panel showed "No changed files yet" even though the
 * agent clearly created a file (the run log even said "Created hi.txt").
 *
 * The fix commits the agent's pending work onto its branch the moment it finishes
 * (completion-watcher), via the shared `commitWorktreeChanges`. After that commit
 * the file is tracked and the SAME `workspaceDiff` reports it.
 *
 * This drives the REAL `workspaceDiff` + `commitWorktreeChanges` against a
 * throwaway LOCAL git repo and asserts the before/after change counts.
 *
 * Run:  npx tsx docker-backend/scripts/e2e-conductor-completion-commit.ts
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const WORK_ROOT = mkdtempSync(join(tmpdir(), 'e2e-completion-commit-'));
process.env.AGENT_OS_REPOSITORY = 'memory';
delete process.env.AGENT_OS_DATABASE_URL;
delete process.env.DATABASE_URL;

const exec = promisify(execFile);

import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../src/agent-os/service-container';
import { registerTmuxSubstrate } from '../src/conductor/substrate-tmux.js';
import { workspaceDiff } from '../src/conductor/review.js';
import { commitWorktreeChanges } from '../src/conductor/commit-worktree.js';

let failures = 0;
function assert(cond: boolean, message: string): void {
  console.log(`[e2e] ${cond ? 'PASS' : 'FAIL'} ${message}`);
  if (!cond) failures += 1;
}
function log(step: string, detail?: unknown): void {
  console.log(`[e2e] ${step}${detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec('git', ['-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
}

async function main(): Promise<void> {
  registerTmuxSubstrate();

  const repo = join(WORK_ROOT, 'repo');
  await exec('mkdir', ['-p', repo]);
  await git(repo, 'init', '-q', '-b', 'main');
  await git(repo, 'config', 'user.email', 'e2e@recoder.test');
  await git(repo, 'config', 'user.name', 'E2E');
  await git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README.md'), '# local repo\n');
  await git(repo, 'add', 'README.md');
  await git(repo, 'commit', '-q', '-m', 'base commit');

  const branch = 'recoder/feat-hi';
  const worktree = join(WORK_ROOT, 'wt');
  await git(repo, 'worktree', 'add', '-b', branch, worktree, 'main');

  // The agent creates a NEW file but does NOT commit it (the real `hi.txt` case).
  writeFileSync(join(worktree, 'hi.txt'), 'hi\n');
  assert(existsSync(join(worktree, 'hi.txt')), 'agent created hi.txt in the worktree');
  assert((await git(worktree, 'status', '--porcelain')).includes('?? hi.txt'), 'hi.txt is UNTRACKED (?? in porcelain)');

  const now = new Date().toISOString();
  const ws: Workspace = {
    workspaceId: `ws_hi_${Date.now()}`,
    spaceId: 'space_e2e',
    projectId: 'proj_e2e',
    taskId: `task_hi_${Date.now()}`,
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

  // BEFORE the completion commit: the working-tree diff counts the untracked file
  // (changedFiles includes untracked), BUT the agent branch carries no commit, so
  // a merge would deliver nothing and the work is not durably on the branch.
  const before = await workspaceDiff(ws.workspaceId);
  log('before commit', { changedFiles: before.changedFiles, untracked: before.untracked });
  assert(before.untracked.includes('hi.txt'), 'BEFORE: hi.txt only present as UNTRACKED (no commit on the branch)');
  assert(
    (await git(worktree, 'rev-parse', branch)) === (await git(repo, 'rev-parse', 'main')),
    'BEFORE: agent branch tip == base (NOTHING committed to merge — the merge bug)',
  );

  // The fix: commit the agent's pending work onto its branch (what the completion
  // watcher now does the instant the agent finishes).
  const committed = await commitWorktreeChanges(worktree, `agent: ${branch}`);
  assert(committed, 'commitWorktreeChanges committed the agent work onto the branch');

  // AFTER: the SAME diff now reports the file.
  const after = await workspaceDiff(ws.workspaceId);
  log('after commit', { changedFiles: after.changedFiles, stat: after.stat.split('\n').pop() });
  assert(after.changedFiles >= 1, 'AFTER: changedFiles >= 1 (review panel now shows the agent file)');
  assert(after.stat.includes('hi.txt'), 'AFTER: diff --stat lists hi.txt');
  assert(
    (await git(worktree, 'rev-parse', branch)) !== (await git(repo, 'rev-parse', 'main')),
    'AFTER: agent branch advanced past base (a real commit exists to merge)',
  );

  if (failures > 0) throw new Error(`${failures} assertion(s) failed`);
  log('RESULT', 'PASS — a new untracked file is committed at completion so the review diff shows it AND it is mergeable');
}

main()
  .then(() => { try { rmSync(WORK_ROOT, { recursive: true, force: true }); } catch {} process.exit(0); })
  .catch((err) => {
    console.error('[e2e] FAILED:', err instanceof Error ? err.stack ?? err.message : err);
    try { rmSync(WORK_ROOT, { recursive: true, force: true }); } catch {}
    process.exit(1);
  });
