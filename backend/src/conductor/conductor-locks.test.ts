/**
 * Tests for conductor-locks — the workspace collision-prevention moat.
 *
 * These drive the REAL `@recoder/coordination` engine (LockService + the
 * in-memory MemoryLockStore / MemoryLeaseFencer / UuidIdGenerator / SystemClock
 * that conductor-locks composes). Nothing in the package's lock logic is
 * stubbed: the disjoint/overlap/release behavior is the engine's real conflict
 * detection over its real Map-backed store.
 *
 * The ONLY place a test double is used is the degrade-safe case, where we inject
 * a FAILING `@recoder/coordination` (its `LockService` constructor throws) to
 * exercise conductor-locks' own catch path. The product code under test stays
 * unstubbed.
 *
 * Asserts:
 *  1. acquireWorkspaceLock -> 'acquired' for disjoint paths in the same repo.
 *  2. acquireWorkspaceLock -> 'conflict' (no second lock) when an overlapping
 *     lock is held by a DIFFERENT workspace; the conflict names the holder.
 *  3. A workspace never self-conflicts on its own overlapping globs.
 *  4. releaseWorkspaceLock removes only THIS workspace's locks (owner-scoped),
 *     leaves another workspace's lock intact, and is idempotent.
 *  5. Degrade-safe: 'skipped' when the engine cannot be constructed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SPACE = 'space_test';
const REPO = '/repos/demo';

describe('conductor-locks (real @recoder/coordination engine)', () => {
  beforeEach(() => {
    // Fresh module graph => fresh in-process lock engine (the store is a
    // module-level singleton in conductor-locks), so tests never leak locks.
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('acquires disjoint paths in the same repo without conflict', async () => {
    const locks = await import('./conductor-locks.js');

    const a = await locks.acquireWorkspaceLock({
      workspaceId: 'ws_a',
      spaceId: SPACE,
      taskId: 'task_a',
      repo: REPO,
      targetPaths: ['src/featureA'],
    });
    const b = await locks.acquireWorkspaceLock({
      workspaceId: 'ws_b',
      spaceId: SPACE,
      taskId: 'task_b',
      repo: REPO,
      targetPaths: ['src/featureB'],
    });

    expect(a.status).toBe('acquired');
    expect(b.status).toBe('acquired');
    if (a.status === 'acquired') expect(a.lockIds).toHaveLength(1);

    const active = await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO });
    expect(active).toHaveLength(2);
  });

  it('refuses an overlapping path held by another workspace and names the holder (no launch)', async () => {
    const locks = await import('./conductor-locks.js');

    const first = await locks.acquireWorkspaceLock({
      workspaceId: 'ws_holder',
      spaceId: SPACE,
      taskId: 'task_holder',
      repo: REPO,
      targetPaths: ['src/shared'],
    });
    expect(first.status).toBe('acquired');

    const second = await locks.acquireWorkspaceLock({
      workspaceId: 'ws_intruder',
      spaceId: SPACE,
      taskId: 'task_intruder',
      repo: REPO,
      targetPaths: ['src/shared'],
    });

    expect(second.status).toBe('conflict');
    if (second.status === 'conflict') {
      expect(second.conflicts).toHaveLength(1);
      // Conflict is surfaced truthfully: it names the HOLDER workspace + task.
      expect(second.conflicts[0].ownerAgentId).toBe('ws_holder');
      expect(second.conflicts[0].taskId).toBe('task_holder');
      expect(second.conflicts[0].pathGlob).toBe('src/shared/**');
    }

    // The conflicting acquire took/kept NO lock — only the holder's remains.
    const active = await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO });
    expect(active).toHaveLength(1);
    expect(active[0].ownerAgentId).toBe('ws_holder');
  });

  it('does not self-conflict on a workspace re-claiming its own overlapping scope', async () => {
    const locks = await import('./conductor-locks.js');

    const first = await locks.acquireWorkspaceLock({
      workspaceId: 'ws_self',
      spaceId: SPACE,
      taskId: 'task_self',
      repo: REPO,
      targetPaths: ['src/me'],
    });
    const again = await locks.acquireWorkspaceLock({
      workspaceId: 'ws_self',
      spaceId: SPACE,
      taskId: 'task_self',
      repo: REPO,
      targetPaths: ['src/me'],
    });

    expect(first.status).toBe('acquired');
    expect(again.status).toBe('acquired');
  });

  it('releases only this workspace\'s locks (owner-scoped) and is idempotent', async () => {
    const locks = await import('./conductor-locks.js');

    await locks.acquireWorkspaceLock({
      workspaceId: 'ws_one',
      spaceId: SPACE,
      taskId: 'task_one',
      repo: REPO,
      targetPaths: ['src/one'],
    });
    await locks.acquireWorkspaceLock({
      workspaceId: 'ws_two',
      spaceId: SPACE,
      taskId: 'task_two',
      repo: REPO,
      targetPaths: ['src/two'],
    });
    expect(await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO })).toHaveLength(2);

    const released = await locks.releaseWorkspaceLock({
      workspaceId: 'ws_one',
      spaceId: SPACE,
      taskId: 'task_one',
      repo: REPO,
    });
    expect(released.released).toHaveLength(1);

    // ws_two's lock is untouched.
    const remaining = await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].ownerAgentId).toBe('ws_two');

    // Idempotent: releasing again removes nothing and does not throw.
    const releasedAgain = await locks.releaseWorkspaceLock({
      workspaceId: 'ws_one',
      spaceId: SPACE,
      taskId: 'task_one',
      repo: REPO,
    });
    expect(releasedAgain.released).toHaveLength(0);
    expect(await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO })).toHaveLength(1);
  });

  it('release does not free another task\'s lock even with the same workspaceId', async () => {
    const locks = await import('./conductor-locks.js');

    await locks.acquireWorkspaceLock({
      workspaceId: 'ws_dual',
      spaceId: SPACE,
      taskId: 'task_x',
      repo: REPO,
      targetPaths: ['src/x'],
    });
    await locks.acquireWorkspaceLock({
      workspaceId: 'ws_dual',
      spaceId: SPACE,
      taskId: 'task_y',
      repo: REPO,
      targetPaths: ['src/y'],
    });

    const released = await locks.releaseWorkspaceLock({
      workspaceId: 'ws_dual',
      spaceId: SPACE,
      taskId: 'task_x',
      repo: REPO,
    });
    expect(released.released).toHaveLength(1);

    const remaining = await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].taskId).toBe('task_y');
  });

  it('degrade-safe: returns "skipped" (never fake-acquired) when the engine cannot be built', async () => {
    // Inject a FAILING coordination package: LockService construction throws, so
    // conductor-locks' getEngine() catch path flips degraded -> skipped. The
    // memory namespace is preserved so the static import still type-resolves.
    const real = await vi.importActual<typeof import('@recoder/coordination')>('@recoder/coordination');
    vi.doMock('@recoder/coordination', () => ({
      ...real,
      LockService: class {
        constructor() {
          throw new Error('coordination engine unavailable (injected failure)');
        }
      },
    }));

    const locks = await import('./conductor-locks.js');

    expect(locks.isLockingDegraded()).toBe(true);

    const result = await locks.acquireWorkspaceLock({
      workspaceId: 'ws_degraded',
      spaceId: SPACE,
      taskId: 'task_degraded',
      repo: REPO,
      targetPaths: ['src/anything'],
    });
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toBe('coordination-unavailable');
    }

    // Release is a safe no-op while degraded (never throws).
    const released = await locks.releaseWorkspaceLock({
      workspaceId: 'ws_degraded',
      spaceId: SPACE,
      taskId: 'task_degraded',
      repo: REPO,
    });
    expect(released.released).toHaveLength(0);

    // And no fake locks were recorded.
    expect(await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO })).toHaveLength(0);
  });
});

describe('reacquireWorkspaceLock (restart re-bind, self-safe)', () => {
  beforeEach(() => {
    // Drop any `vi.doMock('@recoder/coordination')` left registered by a prior
    // degrade-safe test (doMock survives resetModules), then reset the graph so we
    // get the REAL engine over an empty store — the post-restart state.
    vi.doUnmock('@recoder/coordination');
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@recoder/coordination');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('re-acquires a workspace lock into an empty store (post-restart)', async () => {
    const locks = await import('./conductor-locks.js');

    const result = await locks.reacquireWorkspaceLock({
      workspaceId: 'ws_live',
      spaceId: SPACE,
      taskId: 'task_live',
      repo: REPO,
      targetPaths: ['src/live'],
    });

    expect(result.status).toBe('acquired');
    if (result.status === 'acquired') {
      expect(result.lockIds).toHaveLength(1);
      expect(result.alreadyHeld).toHaveLength(0);
    }
    const active = await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO });
    expect(active).toHaveLength(1);
    expect(active[0].ownerAgentId).toBe('ws_live');
  });

  it('is idempotent + self-safe: a second re-acquire holds, never duplicates or self-conflicts', async () => {
    const locks = await import('./conductor-locks.js');

    const first = await locks.reacquireWorkspaceLock({
      workspaceId: 'ws_self',
      spaceId: SPACE,
      taskId: 'task_self',
      repo: REPO,
      targetPaths: ['src/me'],
    });
    const again = await locks.reacquireWorkspaceLock({
      workspaceId: 'ws_self',
      spaceId: SPACE,
      taskId: 'task_self',
      repo: REPO,
      targetPaths: ['src/me'],
    });

    expect(first.status).toBe('acquired');
    expect(again.status).toBe('acquired');
    if (again.status === 'acquired') {
      // The glob was already owned by THIS workspace => held, not re-locked.
      expect(again.lockIds).toHaveLength(0);
      expect(again.alreadyHeld).toHaveLength(1);
    }
    // Exactly ONE lock exists — no duplicate was created.
    const active = await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO });
    expect(active).toHaveLength(1);
  });

  it('reports a real conflict when a DIFFERENT workspace already holds the scope', async () => {
    const locks = await import('./conductor-locks.js');

    // A peer grabbed the scope first (e.g. the live workspace lost the race).
    const holder = await locks.acquireWorkspaceLock({
      workspaceId: 'ws_peer',
      spaceId: SPACE,
      taskId: 'task_peer',
      repo: REPO,
      targetPaths: ['src/contended'],
    });
    expect(holder.status).toBe('acquired');

    const result = await locks.reacquireWorkspaceLock({
      workspaceId: 'ws_late',
      spaceId: SPACE,
      taskId: 'task_late',
      repo: REPO,
      targetPaths: ['src/contended'],
    });

    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.conflicts[0].ownerAgentId).toBe('ws_peer');
    }
    // Only the peer's lock remains; the conflicting re-acquire took nothing.
    const active = await locks.listActiveWorkspaceLocks({ spaceId: SPACE, repo: REPO });
    expect(active).toHaveLength(1);
    expect(active[0].ownerAgentId).toBe('ws_peer');
  });

  it('degrade-safe: returns "skipped" when the engine cannot be built', async () => {
    const real = await vi.importActual<typeof import('@recoder/coordination')>('@recoder/coordination');
    vi.doMock('@recoder/coordination', () => ({
      ...real,
      LockService: class {
        constructor() {
          throw new Error('coordination engine unavailable (injected failure)');
        }
      },
    }));

    const locks = await import('./conductor-locks.js');
    const result = await locks.reacquireWorkspaceLock({
      workspaceId: 'ws_degraded',
      spaceId: SPACE,
      taskId: 'task_degraded',
      repo: REPO,
      targetPaths: ['src/anything'],
    });
    expect(result.status).toBe('skipped');
  });
});

describe('deriveLockGlobs (write-scope derivation)', () => {
  it('widens concrete paths to recursive globs and dedupes', async () => {
    const { deriveLockGlobs } = await import('./conductor-locks.js');
    expect(deriveLockGlobs(['src/a', 'src/a'])).toEqual(['src/a/**']);
    expect(deriveLockGlobs(['src/a', 'src/b'])).toEqual(['src/a/**', 'src/b/**']);
  });

  it('leaves an existing glob as-is', async () => {
    const { deriveLockGlobs } = await import('./conductor-locks.js');
    expect(deriveLockGlobs(['src/**/*.ts'])).toEqual(['src/**/*.ts']);
  });

  it('falls back to a repo-wide claim when no paths are declared', async () => {
    const { deriveLockGlobs } = await import('./conductor-locks.js');
    expect(deriveLockGlobs(undefined)).toEqual(['**']);
    expect(deriveLockGlobs([])).toEqual(['**']);
  });
});
