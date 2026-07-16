// @vitest-environment jsdom
/**
 * First-run sign-in gate (zero-config onboarding, product F1).
 *
 * Boots the REAL cockpit <App/> against a real in-process stub conductor.
 * Inside the desktop shell (a deviceLogin bridge is injected) with NO captured
 * identity, the SignIn panel must show PROACTIVELY — even though the backend
 * authenticates every poll — with the welcoming first-run copy, not a
 * rejection message. A successful device sign-in (ok, identity, NO token —
 * the shell keeps the session main-process-side) clears the gate. When the
 * shell injected a stored identity, or there is no bridge at all (standalone
 * browser), no gate appears.
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

describe('first-run sign-in gate', () => {
  it('shows SignIn proactively when the shell has a bridge but no identity', async () => {
    window.__RECODER_COCKPIT__ = {
      backendUrl: stub.baseUrl,
      deviceLogin: async (): Promise<CockpitAuthResult> => ({ ok: false, reason: 'not driven' }),
    };
    mountApp();
    await waitFor(() => container.querySelector('.signin-overlay') !== null);
    // First-run framing, not a backend rejection.
    expect(container.querySelector('.signin-sub')?.textContent).toContain('Sign in once');
    expect(container.querySelector('.signin-title')?.textContent).toBe('Sign in to Recoder');
  });

  it('clears the gate after a token-less identity-only device sign-in', async () => {
    window.__RECODER_COCKPIT__ = {
      backendUrl: stub.baseUrl,
      deviceLogin: async (): Promise<CockpitAuthResult> => ({
        ok: true,
        identity: { email: 'caelum@recoder.xyz', name: 'caelum0x' },
      }),
    };
    mountApp();
    await waitFor(() => container.querySelector('.signin-btn') !== null);
    await act(async () => {
      (container.querySelector('.signin-btn') as HTMLButtonElement).click();
    });
    await waitFor(() => container.querySelector('.signin-overlay') === null);
  });

  it('shows no gate when the shell injected a stored identity', async () => {
    window.__RECODER_COCKPIT__ = {
      backendUrl: stub.baseUrl,
      deviceLogin: async (): Promise<CockpitAuthResult> => ({ ok: false, reason: 'unused' }),
      identity: { email: 'caelum@recoder.xyz' },
    };
    mountApp();
    await flush(300);
    expect(container.querySelector('.signin-overlay')).toBeNull();
  });

  it('shows no gate outside the desktop shell (no bridge)', async () => {
    window.__RECODER_COCKPIT__ = { backendUrl: stub.baseUrl };
    mountApp();
    await flush(300);
    expect(container.querySelector('.signin-overlay')).toBeNull();
  });
});
