/**
 * Tests for batch-ops — the operator surface that lists workspaces by state and
 * bulk-cancels / bulk-archives them.
 *
 * These drive the REAL module over the REAL in-memory AgentOsRepository singleton
 * (default when no AGENT_OS_DATABASE_URL is set). Workspaces are seeded into the
 * real repo; listByState/bulkCancel/bulkArchive read + transition them through the
 * real workspace-service state machine (running -> cancelled -> archived).
 *
 * The ONLY external-IO seam stubbed is the execution substrate: a controllable
 * `in_process` substrate is installed through the REAL `registerSubstrate`
 * registry so `teardown` (which would otherwise shell out to tmux/git) is a no-op
 * we can assert on. The batch-ops logic, the repository, and the agent-os state
 * machine all stay unstubbed. This mirrors how conductor-locks.test.ts injects a
 * failing engine and delivery-summary.test.ts points at a missing worktree.
 *
 * Skips on a Postgres driver rather than mutate a real database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { registerSubstrate, getSubstrate, type ConductorSubstrate } from './substrate.js';
import { listByState, bulkCancel, bulkArchive } from './batch-ops.js';

const usingMemoryRepo = agentOsContainer.repositoryDriver === 'memory';

describe.skipIf(!usingMemoryRepo)('batch-ops (real in-memory AgentOsRepository + state machine)', () => {
  const repo = agentOsContainer.repository;
  // Fresh project + creator ids per test so each test's project/creator filter
  // only ever matches its OWN seeds (the in-memory repo is a shared singleton
  // that accumulates workspaces across tests).
  let PROJECT: string;
  let CREATOR: string;

  // Capture the real in_process substrate so we can restore it after the suite.
  let originalInProcess: ConductorSubstrate;
  const teardowns: string[] = [];

  beforeEach(() => {
    PROJECT = `proj_batch_${randomUUID()}`;
    CREATOR = `user_batch_${randomUUID()}`;
    originalInProcess = getSubstrate('in_process');
    teardowns.length = 0;
    // Install a controllable in_process substrate via the REAL registry. Its
    // teardown records the ref instead of shelling out to git/tmux (the external
    // IO seam) — everything else (repo, state machine) is the real path.
    const controllable: ConductorSubstrate = {
      ...originalInProcess,
      async teardown(handle) {
        teardowns.push(handle.ref);
      },
    };
    registerSubstrate(controllable);
  });

  afterEach(() => {
    // Restore the genuine in_process substrate so no state leaks to other suites.
    registerSubstrate(originalInProcess);
    vi.restoreAllMocks();
  });

  function seedWorkspace(overrides: Partial<Workspace> = {}): Promise<Workspace> {
    const now = new Date().toISOString();
    const workspaceId = `ws_${randomUUID()}`;
    const ws: Workspace = {
      workspaceId,
      spaceId: 'space_batch',
      projectId: PROJECT,
      taskId: `task_${randomUUID()}`,
      runtimeId: 'claude_code',
      substrate: 'in_process',
      branch: 'recoder/batch-test',
      baseRef: 'HEAD',
      // No worktreePath/sessionName by default -> archive teardown has nothing to
      // remove and bulkCancel skips the session-kill branch unless we set one.
      state: 'running',
      createdBy: CREATOR,
      createdAt: now,
      updatedAt: now,
      metadata: {},
      ...overrides,
    };
    return repo.upsertWorkspace(ws);
  }

  describe('listByState', () => {
    it('returns exactly the workspaces in the requested state', async () => {
      const r1 = await seedWorkspace({ state: 'running' });
      const r2 = await seedWorkspace({ state: 'running' });
      await seedWorkspace({ state: 'awaiting_review' });
      await seedWorkspace({ state: 'failed' });

      const running = await listByState('running');
      const runningIds = running.map((w) => w.workspaceId);
      // Both running ones are present; the awaiting_review/failed ones are not.
      expect(runningIds).toContain(r1.workspaceId);
      expect(runningIds).toContain(r2.workspaceId);
      expect(running.every((w) => w.state === 'running')).toBe(true);
    });

    it('returns an empty set for a state with no matching workspaces', async () => {
      await seedWorkspace({ state: 'running' });
      const merged = await listByState('merged');
      expect(merged.every((w) => w.state === 'merged')).toBe(true);
      // None of OUR seeded workspaces are merged.
      expect(merged.some((w) => w.projectId === PROJECT)).toBe(false);
    });
  });

  describe('bulkCancel', () => {
    it('cancels every non-terminal workspace for a project and reports per-item success', async () => {
      const a = await seedWorkspace({ state: 'running' });
      const b = await seedWorkspace({ state: 'awaiting_review' });
      // Terminal workspaces must NOT be cancelled.
      const failed = await seedWorkspace({ state: 'failed' });

      const result = await bulkCancel({ projectId: PROJECT });

      expect(result.total).toBe(2);
      expect(result.processed).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Each matched workspace was actually transitioned to cancelled in the repo.
      expect((await repo.getWorkspace(a.workspaceId))?.state).toBe('cancelled');
      expect((await repo.getWorkspace(b.workspaceId))?.state).toBe('cancelled');
      // The already-failed workspace is untouched.
      expect((await repo.getWorkspace(failed.workspaceId))?.state).toBe('failed');
    });

    it('only cancels workspaces matching the createdBy filter', async () => {
      const mine = await seedWorkspace({ state: 'running', createdBy: CREATOR });
      const other = await seedWorkspace({ state: 'running', createdBy: `someone_else_${randomUUID()}` });

      const result = await bulkCancel({ projectId: PROJECT, createdBy: CREATOR });

      expect(result.total).toBe(1);
      expect(result.processed).toBe(1);
      expect((await repo.getWorkspace(mine.workspaceId))?.state).toBe('cancelled');
      // The other creator's workspace is left running.
      expect((await repo.getWorkspace(other.workspaceId))?.state).toBe('running');
    });

    it('tears down the tmux/sandbox session when one exists', async () => {
      const ws = await seedWorkspace({ state: 'running', sessionName: 'recoder-batch-session' });

      const result = await bulkCancel({ projectId: PROJECT });

      expect(result.processed).toBe(1);
      // The controllable substrate's teardown was invoked for this workspace.
      expect(teardowns).toContain(ws.workspaceId);
      expect((await repo.getWorkspace(ws.workspaceId))?.state).toBe('cancelled');
    });

    it('reports a per-item error (and keeps going) when a transition is illegal', async () => {
      const ok = await seedWorkspace({ state: 'running' });
      // `merging` is non-terminal w.r.t. bulkCancel's filter (it only excludes
      // archived/merged/failed/cancelled), so it IS selected — but the agent-os
      // state machine has no `merging -> cancelled` edge, so the real
      // transitionWorkspace throws and batch-ops records a truthful per-item
      // error rather than silently skipping it. Walk the legal path to `merging`.
      const ghost = await seedWorkspace({ state: 'running' });
      await repo.upsertWorkspace({ ...ghost, state: 'awaiting_review', updatedAt: new Date().toISOString() });
      await repo.upsertWorkspace({ ...ghost, state: 'merging', updatedAt: new Date().toISOString() });

      const result = await bulkCancel({ projectId: PROJECT });

      expect(result.errors.some((e) => e.workspaceId === ghost.workspaceId)).toBe(true);
      // The healthy workspace still cancels (one bad item does not abort the batch).
      expect((await repo.getWorkspace(ok.workspaceId))?.state).toBe('cancelled');
      // Truthful accounting: processed + errors == total.
      expect(result.processed + result.errors.length).toBe(result.total);
    });
  });

  describe('bulkArchive', () => {
    it('archives terminal workspaces and leaves non-terminal ones alone', async () => {
      const merged = await seedWorkspace({ state: 'merged' });
      const failed = await seedWorkspace({ state: 'failed' });
      const running = await seedWorkspace({ state: 'running' });

      const result = await bulkArchive({ projectId: PROJECT });

      expect(result.total).toBe(2);
      expect(result.processed).toBe(2);
      expect(result.errors).toHaveLength(0);

      expect((await repo.getWorkspace(merged.workspaceId))?.state).toBe('archived');
      expect((await repo.getWorkspace(failed.workspaceId))?.state).toBe('archived');
      // The running workspace is not in the terminal set -> untouched.
      expect((await repo.getWorkspace(running.workspaceId))?.state).toBe('running');
    });

    it('honors an explicit states filter', async () => {
      const cancelled = await seedWorkspace({ state: 'cancelled' });
      const failed = await seedWorkspace({ state: 'failed' });

      const result = await bulkArchive({ projectId: PROJECT, states: ['cancelled'] });

      expect(result.total).toBe(1);
      expect((await repo.getWorkspace(cancelled.workspaceId))?.state).toBe('archived');
      // Not in the states filter -> left failed.
      expect((await repo.getWorkspace(failed.workspaceId))?.state).toBe('failed');
    });

    it('never re-archives an already-archived workspace', async () => {
      const archived = await seedWorkspace({ state: 'merged' });
      // First pass archives it.
      await bulkArchive({ projectId: PROJECT });
      expect((await repo.getWorkspace(archived.workspaceId))?.state).toBe('archived');

      // Second pass finds nothing terminal-but-not-archived for this project.
      const second = await bulkArchive({ projectId: PROJECT });
      expect(second.total).toBe(0);
      expect(second.errors).toHaveLength(0);
    });
  });
});
