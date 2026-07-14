/**
 * Daytona substrate tests.
 *
 * Two layers, both safe to run in CI:
 *
 *  1. Marker-parsing unit tests (always run): mock the Daytona client and prove
 *     the hardened `alive()` / `exitCode()` correctly read the `.recoder/agent.exit`
 *     sentinel and — critically — distinguish a transient/unreachable sandbox from
 *     a finished one (the bug being fixed: a blip must NOT finalize a live remote
 *     workspace).
 *
 *  2. A real end-to-end integration test (GATED): only runs when DAYTONA_API_KEY
 *     and DAYTONA_TEST_REPO_URL are set AND DAYTONA_USE_SDK=true. Without them it
 *     skips cleanly (no failure, no network).
 *
 * The substrate calls getDaytonaClient() internally, so layer (1) mocks that
 * module to inject deterministic exec outputs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SubstrateHandle } from './substrate.js';

const HANDLE: SubstrateHandle = { ref: 'sandbox_test', worktreePath: '/work/repo', sessionName: 'sandbox_test' };

// ---------------------------------------------------------------------------
// Layer 1: marker-parsing unit tests (mocked daytona client) — always run.
// ---------------------------------------------------------------------------

describe('daytona substrate — alive()/exitCode() marker parsing', () => {
  const execMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    execMock.mockReset();
    // Mock the daytona-client module so the substrate's getDaytonaClient() returns
    // a stub whose execCommand we fully control. isDaytonaSdkEnabled must be true
    // so the substrate registers; we don't hit a real API in this layer.
    vi.doMock('../daytona-client.js', () => ({
      getDaytonaClient: () => ({ execCommand: execMock }),
    }));
    vi.doMock('../daytona-sdk.js', () => ({ isDaytonaSdkEnabled: () => true }));
  });

  afterEach(() => {
    vi.doUnmock('../daytona-client.js');
    vi.doUnmock('../daytona-sdk.js');
    vi.resetModules();
  });

  async function loadSubstrate() {
    // Re-import after registering mocks so the registry holds the mocked variant.
    const sub = await import('./substrate.js');
    await import('./substrate-daytona.js').then((m) => m.registerDaytonaSubstrate());
    return sub.getSubstrate('daytona');
  }

  it('alive() returns false when the exit marker is present (finished)', async () => {
    execMock.mockResolvedValue({ output: '__FINISHED__\n', exitCode: 0 });
    const substrate = await loadSubstrate();
    expect(await substrate.alive(HANDLE)).toBe(false);
  });

  it('alive() returns true when the exit marker is absent (running)', async () => {
    execMock.mockResolvedValue({ output: '__RUNNING__\n', exitCode: 0 });
    const substrate = await loadSubstrate();
    expect(await substrate.alive(HANDLE)).toBe(true);
  });

  it('alive() returns true (assume alive) on a transient/unreachable probe error', async () => {
    execMock.mockRejectedValue(new Error('ECONNRESET'));
    const substrate = await loadSubstrate();
    // The fix: a blip must NOT be reported as "finished".
    expect(await substrate.alive(HANDLE)).toBe(true);
  });

  it('alive() returns true when no marker token comes back (garbled output is transient)', async () => {
    execMock.mockResolvedValue({ output: '', exitCode: 0 });
    const substrate = await loadSubstrate();
    expect(await substrate.alive(HANDLE)).toBe(true);
  });

  it('exitCode() reads 0 from a clean-exit sentinel', async () => {
    execMock.mockResolvedValue({ output: '__EXIT__0\n', exitCode: 0 });
    const substrate = await loadSubstrate();
    expect(await substrate.exitCode?.(HANDLE)).toBe(0);
  });

  it('exitCode() reads a non-zero failure code from the sentinel', async () => {
    execMock.mockResolvedValue({ output: '__EXIT__137\n', exitCode: 0 });
    const substrate = await loadSubstrate();
    expect(await substrate.exitCode?.(HANDLE)).toBe(137);
  });

  it('exitCode() returns undefined while still running (no sentinel yet)', async () => {
    execMock.mockResolvedValue({ output: '__NONE__\n', exitCode: 0 });
    const substrate = await loadSubstrate();
    expect(await substrate.exitCode?.(HANDLE)).toBeUndefined();
  });

  it('exitCode() returns undefined (unknown, not fabricated 0) on a transient error', async () => {
    execMock.mockRejectedValue(new Error('sandbox unreachable'));
    const substrate = await loadSubstrate();
    expect(await substrate.exitCode?.(HANDLE)).toBeUndefined();
  });

  it('exitCode() returns undefined on garbled output (no marker)', async () => {
    execMock.mockResolvedValue({ output: 'something unexpected', exitCode: 0 });
    const substrate = await loadSubstrate();
    expect(await substrate.exitCode?.(HANDLE)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Layer 2: real Daytona integration — GATED, skips cleanly without credentials.
// ---------------------------------------------------------------------------

const DAYTONA_KEY = process.env.DAYTONA_API_KEY;
const DAYTONA_REPO = process.env.DAYTONA_TEST_REPO_URL;
const SDK_ENABLED = process.env.DAYTONA_USE_SDK === 'true';
const canRunIntegration = Boolean(DAYTONA_KEY && DAYTONA_REPO && SDK_ENABLED);

describe.skipIf(!canRunIntegration)('daytona substrate — real integration (gated)', { timeout: 600_000 }, () => {
  let handle: SubstrateHandle | undefined;
  let registerDaytonaSubstrate: () => void;
  let getSubstrate: (id: 'daytona') => import('./substrate.js').ConductorSubstrate;

  beforeEach(async () => {
    vi.resetModules();
    const sub = await import('./substrate.js');
    getSubstrate = sub.getSubstrate as typeof getSubstrate;
    registerDaytonaSubstrate = (await import('./substrate-daytona.js')).registerDaytonaSubstrate;
    registerDaytonaSubstrate();
  });

  afterEach(async () => {
    if (handle) {
      try {
        await getSubstrate('daytona').teardown(handle);
      } catch {
        /* best effort */
      }
      handle = undefined;
    }
  });

  it('reports available when configured', async () => {
    const avail = await getSubstrate('daytona').available();
    expect(avail.available).toBe(true);
  });

  it('launches a quick command and observes a clean exit code', async () => {
    const substrate = getSubstrate('daytona');
    // NOTE: launch resolves the repo's git remote from the local cwd; for the
    // gated test we pass DAYTONA_TEST_REPO_URL via a repo dir whose origin is it.
    // The harness assumes the test runner's cwd is a clone of DAYTONA_TEST_REPO_URL,
    // or DAYTONA_TEST_REPO_PATH is set to such a clone.
    const repoPath = process.env.DAYTONA_TEST_REPO_PATH || process.cwd();
    handle = await substrate.launch({
      workspaceId: `ws_daytona_test_${Date.now()}`,
      command: 'echo agent-ran && true',
      repoPath,
      branch: `recoder/daytona-test-${Date.now()}`,
      baseRef: 'HEAD',
    });
    expect(handle.ref).toBeTruthy();

    // Poll until the agent finishes (alive flips to false), then read the code.
    let alive = true;
    for (let i = 0; i < 60 && alive; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      alive = await substrate.alive(handle);
    }
    expect(alive).toBe(false);
    const code = await substrate.exitCode?.(handle);
    expect(code).toBe(0);
  });
});
