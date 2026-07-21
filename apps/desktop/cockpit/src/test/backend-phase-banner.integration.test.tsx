// @vitest-environment jsdom
/**
 * backend-phase-banner integration harness.
 *
 * Boots the REAL cockpit <App/> against a CLOSED backend port so the board poll
 * rejects with a network error -> BackendUnreachableError -> unreachable=true,
 * exactly the state in which the phase banner must engage. We then play the
 * Electron shell by injecting window.__RECODER_COCKPIT__.backendStatus() and
 * assert the production banner surfaces the REAL supervisor phase
 * (starting/restarting/failed) instead of the generic "unreachable" copy.
 *
 * The separate no-bridge case proves the degrade-truthful fallback: with NO
 * backendStatus injected, the original generic banner still renders — no
 * regression, no fabricated phase.
 *
 * No production code is stubbed: jsdom + a real (closed) TCP port are the only
 * test doubles, both standing in for the host environment.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { createServer } from 'node:http';
import { App } from '../App';
import { setRuntimeToken } from '../lib/config';
import type { BackendPhaseSnapshot } from '../types';

let container: HTMLDivElement;

/** Resolve a loopback port that is guaranteed CLOSED (bound then released). */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
  const { port } = addr;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

beforeEach(() => {
  setRuntimeToken(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    render(null, container);
  });
  container.remove();
  delete window.__RECODER_COCKPIT__;
});

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function waitForDom(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await flush(80);
  }
  if (!predicate()) {
    throw new Error(`waitForDom timed out after ${timeoutMs}ms.\nDOM:\n${container.innerHTML}`);
  }
}

function bannerText(): string {
  const banner = container.querySelector('.banner-error');
  return banner?.textContent || '';
}

function snap(overrides: Partial<BackendPhaseSnapshot>): BackendPhaseSnapshot {
  return {
    phase: 'idle',
    ready: false,
    restartCount: 0,
    userMessage: null,
    logPath: null,
    ...overrides,
  };
}

async function mountUnreachableWith(
  backendStatus?: () => Promise<BackendPhaseSnapshot | null>,
): Promise<void> {
  const port = await closedPort();
  // NO deviceLogin -> no first-run SignIn gate; the closed port makes the board
  // poll reject -> unreachable=true.
  window.__RECODER_COCKPIT__ = { backendUrl: `http://127.0.0.1:${port}`, backendStatus };
  await act(async () => {
    render(<App />, container);
  });
}

describe('backend phase banner (real App vs closed backend port)', () => {
  it('shows "Starting the backend…" while the supervisor is starting', async () => {
    await mountUnreachableWith(async () => snap({ phase: 'starting' }));
    await waitForDom(() => bannerText().includes('Starting the backend…'));
    expect(bannerText()).not.toContain('Backend unreachable.');
  });

  it('shows the restart count while the backend is crash-restarting', async () => {
    await mountUnreachableWith(async () => snap({ phase: 'crashed', restartCount: 3 }));
    await waitForDom(() => bannerText().includes('Backend restarting (crashed 3 time(s))…'));
  });

  it('surfaces the failure message and log-path evidence when the backend failed', async () => {
    await mountUnreachableWith(async () =>
      snap({ phase: 'failed', userMessage: 'tmux binary missing', logPath: '/tmp/backend.log' }),
    );
    await waitForDom(
      () =>
        bannerText().includes('Backend could not start — tmux binary missing.') &&
        bannerText().includes('Log: /tmp/backend.log'),
    );
  });

  it('degrade-truthful: with NO backendStatus bridge the generic banner still renders', async () => {
    await mountUnreachableWith(undefined);
    await waitForDom(() => bannerText().includes('Backend unreachable.'));
    expect(bannerText()).toContain("Can't reach the backend at");
  });
});
