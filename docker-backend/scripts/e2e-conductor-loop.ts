/**
 * e2e-conductor-loop — headless end-to-end PROOF that the fused Conductor loop
 * executes a real run WITHOUT a BYOK key.
 *
 * WHAT THIS PROVES (the real, fused engines actually run end-to-end):
 *   1. The control-plane WorkspaceEngine (@recoder/substrate, wired by
 *      docker-backend/src/conductor/workspace-service.ts) persists a Workspace as
 *      the state of record, admits it, launches the selected substrate, creates a
 *      TaskRun, transitions created → setting_up → ready → running, and starts the
 *      run-tailer — all on the in-memory agent-os repository.
 *   2. The run-tailer (@recoder/substrate observe loop, wired by run-tailer.ts)
 *      polls the substrate and emits REAL RunEvents into the agent-os repository
 *      sink: `started` → `log` → terminal `completed`.
 *   3. The completion-watcher (completion-watcher.ts) detects the agent finished,
 *      runs the post-run delivery workflow (delivery summary + memory candidate),
 *      and transitions the workspace running → awaiting_review with a review
 *      summary in metadata.
 *
 * NO BYOK KEY: instead of the default in_process runtime substrate (which drives
 * @recoder/runtime → recoder_code → pi/in-process tool-loop and needs a model key
 * or CLI), this harness registers a STUB substrate under the `in_process` id. The
 * stub is a real, honest substrate — it provisions a real isolated git worktree,
 * "runs" a trivial agent (echoes a couple of lines + writes a file), and reports a
 * truthful exitCode 0. It overrides ONLY the substrate execution layer; every
 * other engine on the path (WorkspaceEngine, run-tailer, completion-watcher,
 * delivery-summary, RunEvent sink, state machine) is the REAL product code.
 *
 * This is a faithful drive of the actual loop with a swapped-in execution
 * substrate — exactly the "stub/echo runtime substrate" the proof calls for.
 *
 * Run:  pnpm --filter @recoder/docker-backend exec tsx scripts/e2e-conductor-loop.ts
 *  or:  npx tsx docker-backend/scripts/e2e-conductor-loop.ts
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskSpec } from '@recoder/agent-os';

// ----- env BEFORE importing any conductor module (they read env at import) -----
// In-memory agent-os repository (no Postgres), isolated worktree root, fast watcher.
const WORK_ROOT = mkdtempSync(join(tmpdir(), 'e2e-conductor-'));
process.env.AGENT_OS_REPOSITORY = 'memory';
delete process.env.AGENT_OS_DATABASE_URL;
delete process.env.DATABASE_URL;
process.env.CONDUCTOR_WORKTREE_ROOT = join(WORK_ROOT, 'worktrees');
process.env.CONDUCTOR_WATCHER_INTERVAL_MS = '500';

const exec = promisify(execFile);

// ----- import the REAL product modules under test -----
import { agentOsContainer } from '../src/agent-os/service-container';
import {
  registerSubstrate,
  type ConductorSubstrate,
  type SubstrateHandle,
  type SubstrateLaunchInput,
  type SubstrateDiff,
} from '../src/conductor/substrate.js';
import { createWorkspace, getWorkspace, listWorkspaceEvents } from '../src/conductor/workspace-service.js';

type StubRun = {
  worktreePath: string;
  output: string[];
  done: boolean;
  exitCode: number;
};

const stubRuns = new Map<string, StubRun>();

/**
 * Stub `in_process` substrate: a REAL git worktree + a trivial echo "agent" that
 * finishes with exit 0. Registered under `in_process` so a workspace created with
 * `substrate: 'in_process'` resolves to it — overriding the BYOK-needing runtime
 * substrate for this headless proof. Everything it reports is truthful (real
 * worktree, real file change, real exit code) — no faked success.
 */
const stubSubstrate: ConductorSubstrate = {
  id: 'in_process',

  async available() {
    return { available: true };
  },

  async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    const worktreePath = join(process.env.CONDUCTOR_WORKTREE_ROOT!, `stub-${input.workspaceId}`);
    // Real isolated worktree on its own branch (parallel-safe, exactly like the
    // real substrates) — proves the diff/review path over real git state.
    await exec('git', [
      '-C', input.repoPath, 'worktree', 'add', '-B', input.branch, worktreePath, input.baseRef || 'HEAD',
    ]);

    const run: StubRun = { worktreePath, output: [], done: false, exitCode: 0 };
    stubRuns.set(input.workspaceId, run);

    // "Run" the agent: echo a couple of lines (captured → `log` RunEvents) and
    // make a real change so the delivery diff is non-empty. Then finish exit 0.
    run.output.push(`[stub-agent] starting on ${input.branch}`);
    run.output.push(`[stub-agent] prompt: ${(input.prompt ?? input.command ?? '').slice(0, 80)}`);
    writeFileSync(join(worktreePath, 'E2E_PROOF.txt'), 'conductor loop e2e proof\n');
    await exec('git', ['-C', worktreePath, 'add', 'E2E_PROOF.txt']);
    run.output.push('[stub-agent] wrote E2E_PROOF.txt');
    run.output.push('[stub-agent] done (exit 0)');
    // Mark done shortly after launch so the run-tailer captures `log` then
    // observes the agent finished and emits the terminal `completed`.
    setTimeout(() => {
      run.done = true;
    }, 50);

    return { ref: input.workspaceId, worktreePath, sessionName: input.workspaceId };
  },

  async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
    const run = stubRuns.get(handle.ref);
    if (!run) return null;
    return run.output.slice(-lines).join('\n');
  },

  async alive(handle: SubstrateHandle): Promise<boolean> {
    const run = stubRuns.get(handle.ref);
    return run ? !run.done : false;
  },

  async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
    const run = stubRuns.get(handle.ref);
    if (!run) return null;
    if (!run.done) return undefined;
    return run.exitCode;
  },

  async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
    const cwd = handle.worktreePath ?? stubRuns.get(handle.ref)?.worktreePath;
    if (!cwd) throw new Error('stub diff requires a worktree path');
    const base = baseRef || 'HEAD';
    const run = async (args: string[]): Promise<string> =>
      (await exec('git', ['-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout;
    const [stat, patch, status] = await Promise.all([
      run(['--no-pager', 'diff', '--stat', '--cached', base]),
      run(['--no-pager', 'diff', '--cached', base]),
      run(['status', '--porcelain']),
    ]);
    const untracked = status
      .split('\n')
      .filter((l) => l.startsWith('??'))
      .map((l) => l.slice(3).trim())
      .filter(Boolean);
    const changedFiles =
      stat.trim().split('\n').filter((l) => l.includes('|')).length + untracked.length;
    return { stat: stat.trim(), patch, untracked, changedFiles };
  },

  async teardown(handle: SubstrateHandle): Promise<void> {
    const run = stubRuns.get(handle.ref);
    const worktreePath = handle.worktreePath ?? run?.worktreePath;
    if (worktreePath) {
      await exec('git', ['-C', worktreePath, 'worktree', 'remove', '--force', worktreePath]).catch(
        () => exec('rm', ['-rf', worktreePath]).catch(() => {}),
      );
    }
    stubRuns.delete(handle.ref);
  },
};

function log(step: string, detail?: unknown): void {
  const suffix = detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  // eslint-disable-next-line no-console
  console.log(`[e2e] ${step}${suffix}`);
}

async function sh(cwd: string, args: string[]): Promise<void> {
  await exec('git', ['-C', cwd, ...args]);
}

async function makeOriginRepo(): Promise<string> {
  const repo = join(WORK_ROOT, 'origin-repo');
  await exec('mkdir', ['-p', repo]);
  await exec('git', ['-C', repo, 'init', '-q']);
  await sh(repo, ['config', 'user.email', 'e2e@recoder.dev']);
  await sh(repo, ['config', 'user.name', 'E2E Harness']);
  await sh(repo, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repo, 'README.md'), '# e2e conductor loop fixture\n');
  await sh(repo, ['add', 'README.md']);
  await sh(repo, ['commit', '-q', '-m', 'init']);
  return repo;
}

async function waitFor<T>(
  label: string,
  fn: () => Promise<T | undefined>,
  timeoutMs = 30_000,
  pollMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

let failures = 0;
function assert(cond: boolean, message: string): void {
  if (cond) {
    log('PASS', message);
  } else {
    failures += 1;
    log('FAIL', message);
  }
}

async function main(): Promise<void> {
  log('repository driver', agentOsContainer.repositoryDriver);
  if (agentOsContainer.repositoryDriver !== 'memory') {
    throw new Error(`expected in-memory agent-os repository, got ${agentOsContainer.repositoryDriver}`);
  }

  // Override the in_process substrate with the BYOK-free stub. registerSubstrate
  // upserts by id, so this replaces the real runtime substrate in the SAME
  // registry the WorkspaceEngine resolves through.
  registerSubstrate(stubSubstrate);
  log('registered stub in_process substrate (BYOK-free)');

  const repo = await makeOriginRepo();
  log('origin repo', repo);

  // Seed a canonical TaskSpec (state of record) the conductor plans/locks over.
  const taskId = `task_e2e_${Date.now()}`;
  const task: TaskSpec = {
    taskId,
    spaceId: 'space_e2e',
    title: 'E2E: prove conductor loop runs without BYOK',
    intent: 'feature_delivery',
    goal: 'Touch a file to prove the fused conductor loop executes end-to-end.',
    repo,
    branchPolicy: 'create_worktree_branch',
    targetPaths: ['E2E_PROOF.txt'],
    forbiddenPaths: [],
    acceptanceCriteria: ['E2E_PROOF.txt exists'],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
  await Promise.resolve(agentOsContainer.repository.upsertTask(task));
  log('seeded TaskSpec', taskId);

  // ----- DRIVE THE REAL LOOP -----
  const workspace = await createWorkspace({
    spaceId: 'space_e2e',
    projectId: 'proj_e2e',
    taskId,
    runtimeId: 'recoder_code',
    substrate: 'in_process',
    repoPath: repo,
    prompt: 'Create E2E_PROOF.txt with a one-line proof message.',
    createdBy: 'e2e-harness',
  });
  log('createWorkspace returned', { workspaceId: workspace.workspaceId, state: workspace.state, runId: workspace.runId });

  assert(
    workspace.state === 'running',
    `workspace reached running after launch (got ${workspace.state})`,
  );
  assert(workspace.substrate === 'in_process', 'workspace bound to in_process substrate');
  assert(Boolean(workspace.runId), 'a TaskRun id was created for the workspace');

  const wsId = workspace.workspaceId;
  const runId = `run_${wsId}`;

  // 1) Run-tailer emits real RunEvents: started -> log -> completed.
  const startedEvents = await waitFor('started RunEvent', async () => {
    const events = await listWorkspaceEvents(wsId);
    return events.some((e) => e.type === 'started') ? events : undefined;
  });
  assert(true, `run-tailer emitted ${startedEvents.length} RunEvent(s); started present`);

  const completedEvents = await waitFor('completed RunEvent', async () => {
    const events = await listWorkspaceEvents(wsId);
    return events.some((e) => e.type === 'completed') ? events : undefined;
  });
  const types = completedEvents.map((e) => e.type);
  log('RunEvent types', types);
  assert(types.includes('started'), 'RunEvent stream includes `started`');
  assert(types.includes('log'), 'RunEvent stream includes `log` (captured agent output)');
  assert(types.includes('completed'), 'RunEvent stream includes terminal `completed`');
  assert(
    completedEvents.every((e) => e.runId === runId),
    'all RunEvents are bound to the workspace run id',
  );
  const completed = completedEvents.find((e) => e.type === 'completed');
  assert(completed?.data?.exitCode === 0, 'terminal `completed` carries truthful exitCode 0');

  // 2) Completion-watcher drives running -> awaiting_review with a review summary.
  // Import + run a single watcher pass directly (deterministic, no 0.5s timer race).
  const { startCompletionWatcher, stopCompletionWatcher } = await import(
    '../src/conductor/completion-watcher.js'
  );
  startCompletionWatcher();
  let reviewed;
  try {
    reviewed = await waitFor('workspace awaiting_review', async () => {
      const fresh = await getWorkspace(wsId);
      return fresh && fresh.state === 'awaiting_review' ? fresh : undefined;
    });
  } finally {
    stopCompletionWatcher();
  }
  log('final workspace state', reviewed.state);
  assert(reviewed.state === 'awaiting_review', 'workspace transitioned running -> awaiting_review');

  const md = (reviewed.metadata ?? {}) as Record<string, unknown>;
  assert(md.exitCode === 0, 'review metadata records truthful exitCode 0');
  const delivery = md.delivery as { changedFiles?: number; success?: boolean; diffStat?: string } | undefined;
  assert(Boolean(delivery), 'review metadata includes a delivery summary');
  assert((delivery?.changedFiles ?? 0) >= 1, 'delivery summary saw the real file change (>=1)');
  assert(delivery?.success === true, 'delivery summary marks the run successful');
  log('delivery summary', delivery);
  if (md.memoryCandidate) log('memory candidate', md.memoryCandidate);

  // Final ledger of the real run for the audit trail.
  const finalEvents = await listWorkspaceEvents(wsId);
  log('total RunEvents recorded', finalEvents.length);

  if (failures > 0) {
    throw new Error(`${failures} assertion(s) failed`);
  }
  log('RESULT', 'PASS — conductor loop ran end-to-end without a BYOK key');
}

main()
  .then(() => {
    // Best-effort cleanup of the temp worktree root.
    try {
      rmSync(WORK_ROOT, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[e2e] FAILED:', err instanceof Error ? err.stack ?? err.message : err);
    try {
      rmSync(WORK_ROOT, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
