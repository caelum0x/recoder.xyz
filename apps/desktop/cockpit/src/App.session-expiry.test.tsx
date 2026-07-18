// @vitest-environment jsdom
/**
 * Session-expiry recovery (defect: silent auth-refresh effect self-cancels).
 *
 * Boots the REAL cockpit <App/> against the in-process stub conductor as an
 * already-signed-in desktop user (an identity is injected, so the first-run gate
 * is OFF). Once a working poll is observed, the stub starts returning 401 the way
 * the live backend does when the device token expires mid-session.
 *
 * The cockpit must attempt ONE transparent device-token refresh and, when it
 * fails, surface the SignIn panel with the calm "session expired" framing. The
 * regression this guards: the refresh effect used to list `refreshing` in its
 * dep array, so `setRefreshing(true)` re-ran the effect, cancelled its own
 * pending refresh, and left `refreshAttempted=false` / `refreshing=true`
 * forever — showSignIn stayed false and the unauthenticated banner was
 * suppressed, wedging the user on a blank board with no recovery path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { App } from './App';
import { setRuntimeToken, setRuntimeIdentity } from './lib/config';
import { startStubConductor, type StubConductor } from './test/stub-conductor';
import type { CockpitAuthResult } from './types';

let stub: StubConductor;
let container: HTMLDivElement;

beforeEach(async () => {
  stub = await startStubConductor();
  setRuntimeToken(undefined);
  setRuntimeIdentity(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    render(null, container);
  });
  container.remove();
  delete window.__RECODER_COCKPIT__;
  setRuntimeIdentity(undefined);
  setRuntimeToken(undefined);
  await stub.close();
});

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function mountApp(): void {
  act(() => {
    render(<App />, container);
  });
}

async function waitFor(pred: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await flush(120);
  }
  throw new Error(`condition never met.\nDOM:\n${container.innerHTML}`);
}

describe('session-expiry recovery', () => {
  it('surfaces the SignIn panel after a failed refresh instead of wedging on a blank board', async () => {
    let refreshCalls = 0;
    window.__RECODER_COCKPIT__ = {
      backendUrl: stub.baseUrl,
      // Already signed in this session (identity injected) → no first-run gate;
      // the SignIn overlay can therefore only appear via the expiry recovery path.
      identity: { email: 'caelum@recoder.xyz', name: 'caelum0x' },
      deviceLogin: async (): Promise<CockpitAuthResult> => ({ ok: false, reason: 'not driven' }),
      refreshToken: async (): Promise<CockpitAuthResult> => {
        refreshCalls += 1;
        return { ok: false, reason: 'refresh token expired' };
      },
    };

    mountApp();
    // A working authenticated session is observed first (empty board renders).
    await waitFor(() => container.querySelector('.board-empty') !== null);
    expect(container.querySelector('.signin-overlay')).toBeNull();

    // The device token now expires mid-session — the next poll 401s.
    stub.setUnauthorized(true);

    // The silent refresh runs once, fails, and the SignIn panel appears with the
    // "session expired" framing. Under the regression this never happens.
    await waitFor(() => container.querySelector('.signin-overlay') !== null);
    expect(container.querySelector('.signin-title')?.textContent).toBe('Your session expired');
    expect(refreshCalls).toBe(1);
  });
});
