/**
 * tmux control-mode INTEGRATION tests — a REAL control-mode client against the
 * repo tmux (`apps/desktop/engines/tmux/tmux`) on an isolated `-L` socket.
 *
 * Proves end-to-end on the actual binary: the `-V` probe passes the selection
 * gate; a `-C attach -r` client attached to a live session streams `%output`
 * into `log` RunEvents through the same sink the poll tailer feeds; capture()
 * is suppressed while the client is healthy. Skipped truthfully when the repo
 * tmux binary is not present on this checkout.
 */
import { spawn as nodeSpawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { describe, it, expect, afterAll } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { TailSubstrate } from '@recoder/substrate';
import {
  probeControlModeSupport,
  selectControlModeTail,
  TMUX_SUBSTRATE_ID,
  type ControlModeChild,
  type SpawnFn,
} from './tmux-control-mode.adapter.js';

const execFileAsync = promisify(execFile);

const REPO_TMUX = '/Users/arhansubasi/recoder.xyz/apps/desktop/engines/tmux/tmux';
/** Isolated per-run socket so these tests never touch a user's tmux server. */
const SOCKET = `recoder-cm-itest-${process.pid}`;
const SESSION = 'recoder-cm-itest';

const tmux = (...args: string[]) => execFileAsync(REPO_TMUX, ['-L', SOCKET, ...args]);

/** Real spawn, routed onto the isolated test socket. */
const socketSpawn: SpawnFn = (bin, args) =>
  nodeSpawn(bin, ['-L', SOCKET, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as unknown as ControlModeChild;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(50);
  }
  return predicate();
}

describe.skipIf(!existsSync(REPO_TMUX))('tmux control-mode (real repo tmux)', () => {
  afterAll(async () => {
    try {
      await tmux('kill-server');
    } catch {
      /* server already gone */
    }
  });

  it('the repo tmux passes the control-mode support probe', async () => {
    await expect(probeControlModeSupport({ tmuxBin: REPO_TMUX })).resolves.toBe(true);
  });

  it('streams live %output from a real session into log RunEvents (capture suppressed)', async () => {
    // A session that prints AFTER the client attaches (control mode streams
    // new output, not history), then lingers so nothing races teardown.
    await tmux(
      'new-session',
      '-d',
      '-s',
      SESSION,
      'sh -c "sleep 1; printf hello-from-control-mode; sleep 15"',
    );

    const events: RunEvent[] = [];
    const inner: TailSubstrate = {
      capture: async () => 'inner-pane\n',
      alive: async () => true,
    };

    const tail = await selectControlModeTail(
      {
        workspaceId: 'ws_itest',
        taskId: 'task_itest',
        runId: 'run_itest',
        substrateId: TMUX_SUBSTRATE_ID,
        sessionName: SESSION,
        inner,
        sink: { append: async (e) => void events.push(e) },
      },
      {
        config: { tmuxBin: REPO_TMUX, tmuxControlMode: true },
        spawn: socketSpawn,
        flushMs: 50,
      },
    );

    expect(tail).toBeDefined();
    try {
      const got = await waitFor(
        () => events.some((e) => e.message?.includes('hello-from-control-mode')),
        8000,
      );
      expect(got).toBe(true);

      const logEvent = events.find((e) => e.message?.includes('hello-from-control-mode'));
      expect(logEvent?.type).toBe('log');
      expect(logEvent?.data).toEqual({ source: 'tmux-control-mode' });

      // While the real client is healthy the poller's capture is suppressed.
      await expect(
        tail!.substrate.capture({ ref: 'ws_itest', sessionName: SESSION }),
      ).resolves.toBeNull();
    } finally {
      tail?.stop();
    }
  }, 20_000);
});
