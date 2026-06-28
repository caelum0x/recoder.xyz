/**
 * Tests for completion-watcher — the autonomous "landing the plane" mechanism.
 *
 * The watcher polls `running` workspaces, asks the substrate whether the agent is
 * still alive + its exit code, and on completion auto-transitions the workspace to
 * `awaiting_review` with a delivery summary + memory candidate in metadata.
 *
 * These drive the REAL watcher over the REAL in-memory AgentOsRepository singleton
 * and the REAL delivery-summary builders (which degrade to an empty diff against
 * the seeded-but-missing worktree, exactly like delivery-summary.test.ts). The
 * watcher's private poll loop is exercised the way production runs it: through the
 * real interval, driven deterministically with fake timers.
 *
 * The ONLY external-IO seam stubbed is the substrate's liveness/exit probe: a
 * controllable `in_process` substrate is installed via the REAL `registerSubstrate`
 * registry so we can say "this agent is dead with exit 0" vs "still running"
 * without launching a real agent. The watcher logic + repo + state machine stay
 * unstubbed. Mirrors conductor-locks.test.ts (injected engine) and
 * batch-ops.test.ts (controllable teardown).
 *
 * Skips on a Postgres driver rather than mutate a real database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '@recoder/agent-os';

// Shrink the poll interval BEFORE completion-watcher.js evaluates (it reads the
// env at module load). vi.hoisted runs before the static imports below, so the
// watcher's real interval is a few ms — fast enough to drive on REAL timers
// (completion runs real git I/O the fake-timer clock cannot flush).
const POLL_INTERVAL_MS = vi.hoisted(() => {
  process.env.CONDUCTOR_WATCHER_INTERVAL_MS = '20';
  return 20;
});

import { agentOsContainer } from '../agent-os/service-container';
import {
  registerSubstrate,
  getSubstrate,
  type ConductorSubstrate,
  type SubstrateHandle,
} from './substrate.js';
import { startCompletionWatcher, stopCompletionWatcher } from './completion-watcher.js';

const usingMemoryRepo = agentOsContainer.repositoryDriver === 'memory';

describe.skipIf(!usingMemoryRepo)('completion-watcher (real watcher + repo + delivery builders)', () => {
  const repo = agentOsContainer.repository;

  let originalInProcess: ConductorSubstrate;
  // Per-workspace liveness/exit programmed by each test.
  const aliveByRef = new Map<string, boolean>();
  const exitByRef = new Map<string, number | null | undefined>();
  let aliveCalls: string[] = [];

  beforeEach(() => {
    aliveByRef.clear();
    exitByRef.clear();
    aliveCalls = [];
    originalInProcess = getSubstrate('in_process');

    // Controllable in_process substrate: alive/exitCode answer from the test's
    // programmed maps (the external probe seam). Everything else delegates to the
    // real impl so nothing about the contract is faked beyond the probe result.
    const controllable: ConductorSubstrate = {
      ...originalInProcess,
      async alive(handle: SubstrateHandle): Promise<boolean> {
        aliveCalls.push(handle.ref);
        return aliveByRef.get(handle.ref) ?? true;
      },
      async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
        return exitByRef.get(handle.ref);
      },
    };
    registerSubstrate(controllable);
  });

  afterEach(() => {
    stopCompletionWatcher();
    registerSubstrate(originalInProcess);
    vi.restoreAllMocks();
  });

  /** Poll the repo until the predicate holds or the deadline passes. */
  async function waitFor(
    predicate: () => Promise<boolean>,
    timeoutMs = 4000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return true;
      await new Promise((r) => setTimeout(r, 15));
    }
    return predicate();
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function seedRunning(overrides: Partial<Workspace> = {}): Promise<Workspace> {
    const now = new Date().toISOString();
    const workspaceId = `ws_${randomUUID()}`;
    const ws: Workspace = {
      workspaceId,
      spaceId: 'space_watch',
      projectId: 'proj_watch',
      taskId: `task_${randomUUID()}`,
      runtimeId: 'claude_code',
      substrate: 'in_process',
      branch: 'recoder/watch-test',
      baseRef: 'HEAD',
      // Missing worktree -> real workspaceDiff degrades to empty (no fake diff).
      worktreePath: `/tmp/recoder-nonexistent-${workspaceId}`,
      sessionName: workspaceId,
      state: 'running',
      runId: `run_${workspaceId}`,
      createdBy: 'watch-test',
      createdAt: now,
      updatedAt: now,
      metadata: {},
      ...overrides,
    };
    return repo.upsertWorkspace(ws);
  }

  it('completes a dead exit-0 workspace exactly once: transitions to awaiting_review with artifacts', async () => {
    const ws = await seedRunning();
    aliveByRef.set(ws.workspaceId, false); // agent finished
    exitByRef.set(ws.workspaceId, 0); // clean exit

    startCompletionWatcher();
    const transitioned = await waitFor(
      async () => (await repo.getWorkspace(ws.workspaceId))?.state === 'awaiting_review',
    );
    expect(transitioned).toBe(true);

    const after = await repo.getWorkspace(ws.workspaceId);
    expect(after?.state).toBe('awaiting_review');
    // Delivery artifacts were attached truthfully.
    expect(after?.metadata?.exitCode).toBe(0);
    expect(after?.metadata?.completedAt).toBeTypeOf('string');
    // The delivery summary ran (empty diff via the missing-worktree fallback).
    expect(after?.metadata?.delivery).toBeDefined();
    const updatedAt1 = after?.updatedAt;

    // Idempotent: subsequent polls must NOT re-fire. The workspace is no longer
    // `running`, so the watcher's running-filter excludes it and nothing changes.
    await sleep(POLL_INTERVAL_MS * 4);
    const again = await repo.getWorkspace(ws.workspaceId);
    expect(again?.state).toBe('awaiting_review');
    expect(again?.updatedAt).toBe(updatedAt1);
  });

  it('does NOT complete a still-running workspace', async () => {
    const ws = await seedRunning();
    aliveByRef.set(ws.workspaceId, true); // agent still alive

    startCompletionWatcher();
    // Let several polls run; the running-filter selects it but alive=true blocks completion.
    await waitFor(async () => aliveCalls.includes(ws.workspaceId));
    await sleep(POLL_INTERVAL_MS * 2);

    const after = await repo.getWorkspace(ws.workspaceId);
    // Still running — no transition, no artifacts.
    expect(after?.state).toBe('running');
    expect(after?.metadata?.delivery).toBeUndefined();
    // The watcher did probe it (proves the running-filter selected it).
    expect(aliveCalls).toContain(ws.workspaceId);
  });

  it('records a non-zero exit on the completed workspace (truthful failure)', async () => {
    const ws = await seedRunning();
    aliveByRef.set(ws.workspaceId, false);
    exitByRef.set(ws.workspaceId, 1); // crashed

    startCompletionWatcher();
    const transitioned = await waitFor(
      async () => (await repo.getWorkspace(ws.workspaceId))?.state === 'awaiting_review',
    );
    expect(transitioned).toBe(true);

    const after = await repo.getWorkspace(ws.workspaceId);
    expect(after?.state).toBe('awaiting_review');
    expect(after?.metadata?.exitCode).toBe(1);
  });

  it('ignores a running workspace with no session (cannot probe a non-launched agent)', async () => {
    const ws = await seedRunning({ sessionName: undefined });
    aliveByRef.set(ws.workspaceId, false);
    exitByRef.set(ws.workspaceId, 0);

    startCompletionWatcher();
    await sleep(POLL_INTERVAL_MS * 4);

    const after = await repo.getWorkspace(ws.workspaceId);
    // No sessionName -> checkWorkspaceCompletion returns early, no transition.
    expect(after?.state).toBe('running');
    // And it was never probed (the early return precedes the alive() call).
    expect(aliveCalls).not.toContain(ws.workspaceId);
  });

  it('completes a dead workspace in a poll and leaves a live one running', async () => {
    const dead = await seedRunning();
    const live = await seedRunning();
    aliveByRef.set(dead.workspaceId, false);
    exitByRef.set(dead.workspaceId, 0);
    aliveByRef.set(live.workspaceId, true);

    startCompletionWatcher();
    const transitioned = await waitFor(
      async () => (await repo.getWorkspace(dead.workspaceId))?.state === 'awaiting_review',
    );
    expect(transitioned).toBe(true);

    expect((await repo.getWorkspace(dead.workspaceId))?.state).toBe('awaiting_review');
    expect((await repo.getWorkspace(live.workspaceId))?.state).toBe('running');
  });
});
