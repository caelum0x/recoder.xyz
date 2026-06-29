/**
 * e2e-conductor-uncommitted-merge — FAITHFUL repro of the live merge bug + its fix.
 *
 * The real desktop agent (`claude -p`) only EDITS files in its worktree; it does
 * NOT `git commit`. With the old code the agent branch carried no new commit, so
 * the LOCAL `git merge <agentBranch>` found "Already up to date" and the user's
 * edits NEVER landed — the workspace went to `failed`.
 *
 * This drives the REAL `mergeWorkspace` against a throwaway LOCAL git repo (NO
 * remote, NO `gh`) where the worktree has an UNCOMMITTED change (exactly like the
 * agent leaves it), and asserts:
 *
 *   1) mergeWorkspace COMMITS the worktree change onto the agent branch, then
 *   2) the change ACTUALLY LANDS on the base branch ON DISK, and
 *   3) the workspace state is `merged` (NOT `failed`).
 *
 * It also proves re-mergeability: a workspace stuck in `failed` from a prior merge
 * attempt is restored to review and re-merged successfully.
 *
 * Run:  npx tsx docker-backend/scripts/e2e-conductor-uncommitted-merge.ts
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ----- env BEFORE importing any conductor module (they read env at import) -----
const WORK_ROOT = mkdtempSync(join(tmpdir(), 'e2e-uncommitted-merge-'));
process.env.AGENT_OS_REPOSITORY = 'memory';
delete process.env.AGENT_OS_DATABASE_URL;
delete process.env.DATABASE_URL;
// Solo mode: a user-initiated merge click IS the approval (one-click local merge).
process.env.RECODER_SOLO_MODE = '1';

const exec = promisify(execFile);

import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../src/agent-os/service-container';
import { mergeWorkspace } from '../src/conductor/review-publish.js';

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

/** A LOCAL repo + agent worktree with an UNCOMMITTED edit (the agent's real state). */
async function makeRepoWithUncommittedAgentEdit(
  name: string,
  marker: string,
): Promise<{ repo: string; worktree: string; branch: string; file: string }> {
  const repo = join(WORK_ROOT, name);
  await exec('mkdir', ['-p', repo]);
  await git(repo, 'init', '-q', '-b', 'main');
  await git(repo, 'config', 'user.email', 'e2e@recoder.test');
  await git(repo, 'config', 'user.name', 'E2E');
  await git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README.md'), '# local repo (no remote)\n');
  await git(repo, 'add', 'README.md');
  await git(repo, 'commit', '-q', '-m', 'base commit');

  const branch = `recoder/feat-${name}`;
  const worktree = join(WORK_ROOT, `wt-${name}`);
  await git(repo, 'worktree', 'add', '-b', branch, worktree, 'main');
  // The agent EDITS a file but does NOT commit it (faithful `claude -p` behavior).
  const file = 'AGENT_EDIT.txt';
  writeFileSync(join(worktree, file), `${marker}\n`);
  return { repo, worktree, branch, file };
}

async function main(): Promise<void> {
  log('repository driver', agentOsContainer.repositoryDriver);
  if (agentOsContainer.repositoryDriver !== 'memory') {
    throw new Error(`expected in-memory agent-os repository, got ${agentOsContainer.repositoryDriver}`);
  }

  // ===== CASE 1: uncommitted agent edit lands via mergeWorkspace =====
  const marker = `uncommitted ${Date.now()}`;
  const { repo, worktree, branch, file } = await makeRepoWithUncommittedAgentEdit('case1', marker);

  assert((await git(repo, 'remote')) === '', 'repo has NO git remote (forces local merge)');
  assert((await git(worktree, 'status', '--porcelain')) !== '', 'worktree has UNCOMMITTED agent edit');
  assert(
    (await git(worktree, 'rev-parse', branch)) === (await git(repo, 'rev-parse', 'main')),
    'agent branch has NO new commit yet (tip == base) — this is what broke the old merge',
  );
  assert(!existsSync(join(repo, file)), 'base does NOT have the agent file before merge');

  const now = new Date().toISOString();
  const ws: Workspace = {
    workspaceId: `ws_case1_${Date.now()}`,
    spaceId: 'space_e2e',
    projectId: 'proj_e2e',
    taskId: `task_case1_${Date.now()}`,
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

  const result = await mergeWorkspace(ws.workspaceId, { intent: { approve: true, decidedBy: 'desktop-user' } });
  log('merge result', result);
  assert(result.merged === true, 'mergeWorkspace returned merged: true');

  // The previously-uncommitted edit was COMMITTED on the branch, then LANDED on base.
  const landed = existsSync(join(repo, file));
  assert(landed, 'agent edit NOW on the base branch on disk (LOCAL MERGE LANDED the uncommitted change)');
  if (landed) log('base AGENT_EDIT.txt', readFileSync(join(repo, file), 'utf8').trim());
  assert(
    (await git(worktree, 'rev-parse', branch)) !== (await git(repo, 'rev-parse', branch)) === false,
    'branch advanced past the base commit (merge committed the agent work)',
  );

  const merged = await Promise.resolve(agentOsContainer.repository.getWorkspace(ws.workspaceId));
  assert(merged?.state === 'merged', `workspace is merged (NOT failed) after the merge (got ${merged?.state})`);
  assert((merged?.metadata as Record<string, unknown>)?.mergeMode === 'local', 'merge used the LOCAL path (no gh)');

  // ===== CASE 2: a workspace stuck in `failed` is re-mergeable =====
  const marker2 = `recover ${Date.now()}`;
  const c2 = await makeRepoWithUncommittedAgentEdit('case2', marker2);
  const ws2: Workspace = {
    workspaceId: `ws_case2_${Date.now()}`,
    spaceId: 'space_e2e',
    projectId: 'proj_e2e',
    taskId: `task_case2_${Date.now()}`,
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: c2.branch,
    baseRef: 'main',
    worktreePath: c2.worktree,
    // Simulate the workspace left in `failed` by a prior (pre-fix) merge attempt.
    state: 'failed',
    createdBy: 'desktop-user',
    createdAt: now,
    updatedAt: now,
    metadata: { mergeError: 'previous attempt landed nothing', mergeMode: 'local' },
  };
  await Promise.resolve(agentOsContainer.repository.upsertWorkspace(ws2));
  log('case2 starting state', (await Promise.resolve(agentOsContainer.repository.getWorkspace(ws2.workspaceId)))?.state);

  const result2 = await mergeWorkspace(ws2.workspaceId, { intent: { approve: true, decidedBy: 'desktop-user' } });
  assert(result2.merged === true, 're-merge from failed returned merged: true');
  assert(existsSync(join(c2.repo, c2.file)), 're-merge landed the agent edit on base on disk');
  const merged2 = await Promise.resolve(agentOsContainer.repository.getWorkspace(ws2.workspaceId));
  assert(merged2?.state === 'merged', `re-merged workspace ends merged (got ${merged2?.state})`);

  if (failures > 0) throw new Error(`${failures} assertion(s) failed`);
  log('RESULT', 'PASS — uncommitted agent edits are committed + landed on base; failed workspaces are re-mergeable');
}

main()
  .then(() => { try { rmSync(WORK_ROOT, { recursive: true, force: true }); } catch {} process.exit(0); })
  .catch((err) => {
    console.error('[e2e] FAILED:', err instanceof Error ? err.stack ?? err.message : err);
    try { rmSync(WORK_ROOT, { recursive: true, force: true }); } catch {}
    process.exit(1);
  });
