/**
 * e2e-conductor-local-merge-continue — headless end-to-end PROOF of the three
 * gaps that make Conductor a usable LOCAL chat product, on a throwaway LOCAL git
 * repo with NO github remote and NO `gh`:
 *
 *   1) LOCAL MERGE: a real agent run (stub/in_process) lands a file in its
 *      worktree; the user merges; the change ACTUALLY LANDS on the base branch on
 *      disk — via a LOCAL `git merge` (no gh, no PR). The workspace ends `merged`.
 *
 *   2) CONTINUE / CHAT: a 2nd user message starts a 2nd run in the SAME worktree
 *      (the agent sees the prior changes) and lands its own change. We assert a new
 *      run started and the worktree carries BOTH the first and second changes.
 *
 *   3) FRIENDLY EVENTS: the terminal RunEvent message is the friendly
 *      "Agent finished" (not "Agent session ended"), with the technical message
 *      preserved on `data` for the audit trail.
 *
 * Everything on the path is the REAL product code: the WorkspaceEngine, the
 * run-tailer (+ friendly-message sink), the completion-watcher, the real
 * delivery-approval gate (solo mode records the user's approval), and the real
 * `mergeWorkspace` local-merge path. Only the EXECUTION substrate is a BYOK-free
 * stub (real git worktree + a trivial agent that writes a file, exit 0) so no
 * model key is needed.
 *
 * Run:  npx tsx docker-backend/scripts/e2e-conductor-local-merge-continue.ts
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ----- env BEFORE importing any conductor module (they read env at import) -----
const WORK_ROOT = mkdtempSync(join(tmpdir(), 'e2e-conductor-local-'));
process.env.AGENT_OS_REPOSITORY = 'memory';
delete process.env.AGENT_OS_DATABASE_URL;
delete process.env.DATABASE_URL;
process.env.CONDUCTOR_WORKTREE_ROOT = join(WORK_ROOT, 'worktrees');
process.env.CONDUCTOR_WATCHER_INTERVAL_MS = '300';
// Solo mode: a user-initiated merge click IS the approval (one-click local merge).
process.env.RECODER_SOLO_MODE = '1';

const exec = promisify(execFile);

// ----- import the REAL product modules under test -----
import type { TaskSpec } from '@recoder/agent-os';
import { agentOsContainer } from '../src/agent-os/service-container';
import {
  registerSubstrate,
  type ConductorSubstrate,
  type ContinueRunInput,
  type SubstrateHandle,
  type SubstrateLaunchInput,
  type SubstrateDiff,
} from '../src/conductor/substrate.js';
import { createWorkspace, getWorkspace, listWorkspaceEvents } from '../src/conductor/workspace-service.js';
import { mergeWorkspace } from '../src/conductor/review-publish.js';
import { continueWorkspace } from '../src/conductor/continue-workspace.js';
import { startCompletionWatcher, stopCompletionWatcher } from '../src/conductor/completion-watcher.js';

type StubRun = { worktreePath: string; output: string[]; done: boolean; exitCode: number };
const stubRuns = new Map<string, StubRun>();

/** Run a real agent "step" in `worktreePath`: write a file tagged with `tag`, commit it. */
async function runStubAgent(workspaceId: string, worktreePath: string, branch: string, tag: string): Promise<void> {
  const run: StubRun = { worktreePath, output: [], done: false, exitCode: 0 };
  stubRuns.set(workspaceId, run);
  run.output.push(`[stub-agent] starting on ${branch} (${tag})`);
  const file = `${tag}.txt`;
  writeFileSync(join(worktreePath, file), `${tag} landed ${workspaceId}\n`);
  await exec('git', ['-C', worktreePath, 'add', file]);
  await exec('git', ['-C', worktreePath, 'commit', '-q', '-m', `${tag} change`]);
  run.output.push(`[stub-agent] wrote + committed ${file}`);
  run.output.push('[stub-agent] done (exit 0)');
  // Finish shortly after launch so the run-tailer captures `log` then `completed`.
  setTimeout(() => { run.done = true; }, 40);
}

/**
 * Stub `in_process` substrate with a REAL worktree, a trivial committing "agent",
 * and a real `continueRun` (relaunch in the SAME worktree — proves chat continue).
 */
const stubSubstrate: ConductorSubstrate = {
  id: 'in_process',
  async available() { return { available: true }; },

  async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    const worktreePath = join(process.env.CONDUCTOR_WORKTREE_ROOT!, `stub-${input.workspaceId}`);
    await exec('git', ['-C', input.repoPath, 'worktree', 'add', '-B', input.branch, worktreePath, input.baseRef || 'HEAD']);
    await exec('git', ['-C', worktreePath, 'config', 'user.email', 'e2e@recoder.test']);
    await exec('git', ['-C', worktreePath, 'config', 'user.name', 'E2E']);
    await runStubAgent(input.workspaceId, worktreePath, input.branch, 'FIRST');
    return { ref: input.workspaceId, worktreePath, sessionName: input.workspaceId };
  },

  async continueRun(handle: SubstrateHandle, input: ContinueRunInput): Promise<SubstrateHandle> {
    const worktreePath = input.worktreePath || handle.worktreePath!;
    // SAME worktree — the prior change must already be present here.
    await runStubAgent(handle.ref, worktreePath, 'continue', 'SECOND');
    return { ref: handle.ref, worktreePath, sessionName: handle.ref };
  },

  async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
    const run = stubRuns.get(handle.ref);
    return run ? run.output.slice(-lines).join('\n') : null;
  },
  async alive(handle: SubstrateHandle): Promise<boolean> {
    const run = stubRuns.get(handle.ref);
    return run ? !run.done : false;
  },
  async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
    const run = stubRuns.get(handle.ref);
    if (!run) return null;
    return run.done ? run.exitCode : undefined;
  },
  async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
    const cwd = handle.worktreePath ?? stubRuns.get(handle.ref)?.worktreePath;
    if (!cwd) throw new Error('stub diff requires a worktree path');
    const base = baseRef || 'HEAD';
    const g = async (args: string[]): Promise<string> =>
      (await exec('git', ['-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout;
    const [stat, patch] = await Promise.all([
      g(['--no-pager', 'diff', '--stat', base]),
      g(['--no-pager', 'diff', base]),
    ]);
    const changedFiles = stat.trim().split('\n').filter((l) => l.includes('|')).length;
    return { stat: stat.trim(), patch, untracked: [], changedFiles };
  },
  async teardown(handle: SubstrateHandle): Promise<void> {
    stubRuns.delete(handle.ref);
  },
};

let failures = 0;
function assert(cond: boolean, message: string): void {
  console.log(`[e2e] ${cond ? 'PASS' : 'FAIL'} ${message}`);
  if (!cond) failures += 1;
}
function log(step: string, detail?: unknown): void {
  console.log(`[e2e] ${step}${detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
async function waitFor<T>(label: string, fn: () => Promise<T | undefined>, timeoutMs = 20_000, pollMs = 150): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

/** A LOCAL repo with a base branch and NO remote (a plain folder). */
async function makeLocalRepo(): Promise<{ repo: string; base: string }> {
  const repo = join(WORK_ROOT, 'local-repo');
  await exec('mkdir', ['-p', repo]);
  await exec('git', ['-C', repo, 'init', '-q', '-b', 'main']);
  await exec('git', ['-C', repo, 'config', 'user.email', 'e2e@recoder.test']);
  await exec('git', ['-C', repo, 'config', 'user.name', 'E2E']);
  await exec('git', ['-C', repo, 'config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repo, 'README.md'), '# local repo (no remote)\n');
  await exec('git', ['-C', repo, 'add', 'README.md']);
  await exec('git', ['-C', repo, 'commit', '-q', '-m', 'base commit']);
  return { repo, base: 'main' };
}

async function main(): Promise<void> {
  log('repository driver', agentOsContainer.repositoryDriver);
  if (agentOsContainer.repositoryDriver !== 'memory') {
    throw new Error(`expected in-memory agent-os repository, got ${agentOsContainer.repositoryDriver}`);
  }
  registerSubstrate(stubSubstrate);
  log('registered stub in_process substrate (BYOK-free, real worktree + continueRun)');

  const { repo, base } = await makeLocalRepo();
  log('LOCAL repo (no remote)', repo);
  // Prove there is genuinely no remote — the merge MUST use the local path.
  const remotes = (await exec('git', ['-C', repo, 'remote'])).stdout.trim();
  assert(remotes === '', 'repo has NO git remote (forces local merge)');

  const taskId = `task_local_${Date.now()}`;
  const task: TaskSpec = {
    taskId,
    spaceId: 'space_e2e',
    title: 'E2E: local merge + continue',
    intent: 'feature_delivery',
    goal: 'Land a change locally then continue with a second message.',
    repo,
    branchPolicy: 'create_worktree_branch',
    targetPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
  await Promise.resolve(agentOsContainer.repository.upsertTask(task));

  // ----- DRIVE THE REAL LOOP (first run) -----
  const ws = await createWorkspace({
    spaceId: 'space_e2e',
    projectId: 'proj_e2e',
    taskId,
    runtimeId: 'recoder_code',
    substrate: 'in_process',
    repoPath: repo,
    baseRef: base,
    prompt: 'Create FIRST.txt',
    createdBy: 'desktop-user',
  });
  const wsId = ws.workspaceId;
  const branch = ws.branch;
  const worktree = ws.worktreePath!;
  log('workspace', { wsId, state: ws.state, branch });
  assert(ws.state === 'running', `first run reached running (got ${ws.state})`);

  // run-tailer terminal event is the FRIENDLY message (gap #3).
  const completedEvents = await waitFor('completed RunEvent', async () => {
    const events = await listWorkspaceEvents(wsId);
    return events.some((e) => e.type === 'completed') ? events : undefined;
  });
  const completed = completedEvents.find((e) => e.type === 'completed')!;
  log('terminal event', { type: completed.type, message: completed.message });
  assert(completed.message === 'Agent finished', `terminal message is friendly "Agent finished" (got "${completed.message}")`);
  assert(completed.data?.exitCode === 0, 'terminal event carries truthful exitCode 0');
  assert(completed.data?.technicalMessage === 'Agent session ended', 'technical message preserved on data for audit');

  // completion-watcher: running -> awaiting_review (exit 0 must NOT be `failed`).
  startCompletionWatcher();
  try {
    await waitFor('awaiting_review', async () => {
      const fresh = await getWorkspace(wsId);
      return fresh && fresh.state === 'awaiting_review' ? fresh : undefined;
    });
  } finally {
    stopCompletionWatcher();
  }
  const reviewed = (await getWorkspace(wsId))!;
  assert(reviewed.state === 'awaiting_review', 'first run exit 0 -> awaiting_review (NOT failed)');
  assert(existsSync(join(worktree, 'FIRST.txt')), 'worktree has FIRST.txt from the first run');

  // ----- GAP 2: CONTINUE / CHAT — 2nd message = 2nd run in the SAME worktree -----
  const startedBefore = (await listWorkspaceEvents(wsId)).filter((e) => e.type === 'started').length;
  const cont = await continueWorkspace(wsId, { text: 'Now also create SECOND.txt', createdBy: 'desktop-user' });
  log('continue result', cont);
  assert(cont.state === 'running', '2nd message moved workspace back to running');
  const continuedWs = (await getWorkspace(wsId))!;
  assert(continuedWs.worktreePath === worktree, '2nd run uses the SAME worktree as the first run');

  // Wait for the 2nd run to finish; prove BOTH changes coexist (agent saw prior work).
  await waitFor('second run finished', async () => {
    const run = stubRuns.get(wsId);
    return run && run.done ? true : undefined;
  });
  const bothPresent = existsSync(join(worktree, 'FIRST.txt')) && existsSync(join(worktree, 'SECOND.txt'));
  assert(bothPresent, '2nd run added SECOND.txt while FIRST.txt (prior change) is intact (same worktree)');

  // The 2nd run emitted its own RunEvents in the SAME workspace log (chat continuity).
  startCompletionWatcher();
  try {
    await waitFor('awaiting_review again', async () => {
      const fresh = await getWorkspace(wsId);
      return fresh && fresh.state === 'awaiting_review' ? fresh : undefined;
    });
  } finally {
    stopCompletionWatcher();
  }
  const startedAfter = (await listWorkspaceEvents(wsId)).filter((e) => e.type === 'started').length;
  assert(startedAfter > startedBefore, `2nd run emitted its own started RunEvent (${startedBefore} -> ${startedAfter})`);

  // ----- GAP 1: LOCAL MERGE lands BOTH changes on base (no gh) -----
  assert(!existsSync(join(repo, 'FIRST.txt')), 'base did NOT have FIRST.txt before merge');
  assert(!existsSync(join(repo, 'SECOND.txt')), 'base did NOT have SECOND.txt before merge');
  const mergeRes = await mergeWorkspace(wsId, { intent: { approve: true, decidedBy: 'desktop-user' } });
  log('merge result', mergeRes);
  const merged = await getWorkspace(wsId);
  assert(merged?.state === 'merged', `workspace is merged after local merge (got ${merged?.state})`);
  assert((merged?.metadata as Record<string, unknown>)?.mergeMode === 'local', 'merge used the LOCAL path (no gh)');
  const firstOnBase = existsSync(join(repo, 'FIRST.txt'));
  const secondOnBase = existsSync(join(repo, 'SECOND.txt'));
  assert(firstOnBase && secondOnBase, 'FIRST.txt + SECOND.txt NOW on base branch on disk (LOCAL MERGE LANDED)');
  if (firstOnBase) log('base FIRST.txt', readFileSync(join(repo, 'FIRST.txt'), 'utf8').trim());
  if (secondOnBase) log('base SECOND.txt', readFileSync(join(repo, 'SECOND.txt'), 'utf8').trim());

  if (failures > 0) throw new Error(`${failures} assertion(s) failed`);
  log('RESULT', 'PASS — local merge lands on base (no gh); 2nd message runs in the same worktree; events are friendly');
}

main()
  .then(() => { try { rmSync(WORK_ROOT, { recursive: true, force: true }); } catch {} process.exit(0); })
  .catch((err) => {
    console.error('[e2e] FAILED:', err instanceof Error ? err.stack ?? err.message : err);
    try { rmSync(WORK_ROOT, { recursive: true, force: true }); } catch {}
    process.exit(1);
  });
