/**
 * Daytona substrate tests (design §11).
 *
 * Ported from docker-backend/src/conductor/substrate-daytona.test.ts to the
 * package's node:test runner + an injected fake DaytonaClientPort (no module
 * mocking, no real network). They prove the hardened `alive()` / `exitCode()`
 * correctly read the `.recoder/agent.exit` sentinel and — critically —
 * distinguish a transient/unreachable sandbox from a finished one (a blip must
 * NOT finalize a live remote workspace), plus truthful availability and the
 * shared diff shape.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDaytonaSubstrate } from '../../src/remote/index.js';
import type {
  DaytonaClientPort,
  DaytonaExecOptions,
  DaytonaExecResult,
  DaytonaSandboxRef,
} from '../../src/ports/index.js';
import type { SubstrateHandle } from '../../src/contract/index.js';

const HANDLE: SubstrateHandle = {
  ref: 'sandbox_test',
  worktreePath: '/work/repo',
  sessionName: 'sandbox_test',
  sandboxId: 'sandbox_test',
};

interface FakeClientOptions {
  enabled?: boolean;
  available?: boolean | (() => Promise<boolean>);
  exec?: (sandboxId: string, command: string, options?: DaytonaExecOptions) => Promise<DaytonaExecResult>;
  createSandbox?: () => Promise<DaytonaSandboxRef>;
  getWorkDir?: () => Promise<string>;
}

/** A real, fully-controllable DaytonaClientPort for deterministic unit tests. */
function fakeClient(options: FakeClientOptions = {}): DaytonaClientPort & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    isEnabled: () => options.enabled ?? true,
    isAvailable: async () =>
      typeof options.available === 'function' ? options.available() : (options.available ?? true),
    createSandbox: async () => (options.createSandbox ? options.createSandbox() : { id: 'sandbox_new' }),
    getWorkDir: async () => (options.getWorkDir ? options.getWorkDir() : '/work'),
    execCommand: async (sandboxId, command, opts) =>
      options.exec ? options.exec(sandboxId, command, opts) : { output: '' },
    deleteSandbox: async (sandboxId) => {
      deleted.push(sandboxId);
    },
  };
}

// --- availability --------------------------------------------------------

test('available() reports false (degrade-safe) when Daytona is not enabled', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ enabled: false }) });
  const avail = await substrate.available();
  assert.equal(avail.available, false);
  assert.match(avail.reason ?? '', /not configured/i);
});

test('available() reports false when the API is unreachable', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ available: false }) });
  const avail = await substrate.available();
  assert.equal(avail.available, false);
  assert.match(avail.reason ?? '', /unreachable/i);
});

test('available() reports true when enabled and reachable', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ available: true }) });
  const avail = await substrate.available();
  assert.equal(avail.available, true);
});

// --- capabilities --------------------------------------------------------

test('capabilities() declare a remote, polling, non-pty substrate', () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient() });
  const caps = substrate.capabilities();
  assert.equal(caps.remote, true);
  assert.equal(caps.supportsPty, false);
  assert.equal(caps.capturesByPolling, true);
  assert.equal(caps.supportsDiff, true);
  assert.equal(caps.supportsIsolationRemoval, true);
  assert.equal(substrate.id, 'daytona');
});

// --- alive() marker parsing ----------------------------------------------

test('alive() returns false when the exit marker is present (finished)', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ exec: async () => ({ output: '__FINISHED__\n' }) }) });
  assert.equal(await substrate.alive(HANDLE), false);
});

test('alive() returns true when the exit marker is absent (running)', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ exec: async () => ({ output: '__RUNNING__\n' }) }) });
  assert.equal(await substrate.alive(HANDLE), true);
});

test('alive() returns true (assume alive) on a transient/unreachable probe error', async () => {
  const substrate = createDaytonaSubstrate({
    client: fakeClient({ exec: async () => { throw new Error('ECONNRESET'); } }),
  });
  // The fix: a blip must NOT be reported as "finished".
  assert.equal(await substrate.alive(HANDLE), true);
});

test('alive() returns true when no marker token comes back (garbled output is transient)', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ exec: async () => ({ output: '' }) }) });
  assert.equal(await substrate.alive(HANDLE), true);
});

// --- exitCode() marker parsing -------------------------------------------

test('exitCode() reads 0 from a clean-exit sentinel', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ exec: async () => ({ output: '__EXIT__0\n' }) }) });
  assert.equal(await substrate.exitCode?.(HANDLE), 0);
});

test('exitCode() reads a non-zero failure code from the sentinel', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ exec: async () => ({ output: '__EXIT__137\n' }) }) });
  assert.equal(await substrate.exitCode?.(HANDLE), 137);
});

test('exitCode() returns undefined while still running (no sentinel yet)', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ exec: async () => ({ output: '__NONE__\n' }) }) });
  assert.equal(await substrate.exitCode?.(HANDLE), undefined);
});

test('exitCode() returns undefined (unknown, not fabricated 0) on a transient error', async () => {
  const substrate = createDaytonaSubstrate({
    client: fakeClient({ exec: async () => { throw new Error('sandbox unreachable'); } }),
  });
  assert.equal(await substrate.exitCode?.(HANDLE), undefined);
});

test('exitCode() returns undefined on garbled output (no marker)', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ exec: async () => ({ output: 'something unexpected' }) }) });
  assert.equal(await substrate.exitCode?.(HANDLE), undefined);
});

// --- capture() -----------------------------------------------------------

test('capture() returns tailed log output', async () => {
  const substrate = createDaytonaSubstrate({ client: fakeClient({ exec: async () => ({ output: 'line1\nline2\n' }) }) });
  assert.equal(await substrate.capture(HANDLE), 'line1\nline2\n');
});

test('capture() returns null when the probe throws (handle gone)', async () => {
  const substrate = createDaytonaSubstrate({
    client: fakeClient({ exec: async () => { throw new Error('gone'); } }),
  });
  assert.equal(await substrate.capture(HANDLE), null);
});

// --- diff() feeds the shared parser --------------------------------------

test('diff() runs git in the sandbox and produces a SubstrateDiff', async () => {
  const substrate = createDaytonaSubstrate({
    client: fakeClient({
      exec: async (_id, command) => {
        if (command.includes('--stat')) return { output: ' a.ts | 2 +-\n 1 file changed' };
        if (command.includes('status --porcelain')) return { output: '?? new.ts\n' };
        return { output: 'diff --git a/a.ts b/a.ts\n' }; // the full patch
      },
    }),
  });
  const diff = await substrate.diff(HANDLE, 'HEAD');
  assert.equal(diff.stat, 'a.ts | 2 +-\n 1 file changed');
  assert.match(diff.patch, /diff --git/);
  assert.deepEqual(diff.untracked, ['new.ts']);
  assert.ok(diff.changedFiles >= 1);
});

// --- teardown() ----------------------------------------------------------

test('teardown() best-effort deletes the sandbox', async () => {
  const client = fakeClient();
  const substrate = createDaytonaSubstrate({ client });
  await substrate.teardown(HANDLE);
  assert.deepEqual(client.deleted, [HANDLE.ref]);
});

test('teardown() swallows a delete failure (best effort)', async () => {
  const client: DaytonaClientPort = {
    ...fakeClient(),
    deleteSandbox: async () => { throw new Error('already gone'); },
  };
  const substrate = createDaytonaSubstrate({ client });
  // Must not throw.
  await substrate.teardown(HANDLE);
});
