// @vitest-environment jsdom
/**
 * Plan badge render test.
 *
 * Boots the REAL cockpit <App/> against a real in-process stub conductor (so the
 * board authenticates and `wasAuthed` flips true, revealing the account block),
 * with a `signOut` bridge injected so the header's signed-in identity + plan
 * badge render. We assert:
 *   1. The muted `.account-plan` badge renders the resolved plan tier, and
 *   2. It DEFAULTS to "Free" when the injected identity carries no plan — never
 *      fabricating a paid tier.
 *
 * Nothing about the cockpit is stubbed: the stub conductor is an external HTTP
 * seam (real TCP + real fetch), exactly like the integration harness.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { App } from './App';
import { setRuntimeToken, setRuntimeIdentity } from './lib/config';
import { startStubConductor, type StubConductor } from './test/stub-conductor';

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
  await stub.close();
});

/** Flush microtasks + timers so in-flight polls settle. */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Wait until the account plan badge appears (the board must authenticate first). */
async function waitForBadge(timeoutMs = 8000): Promise<HTMLElement> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = container.querySelector('.account-plan') as HTMLElement | null;
    if (el) return el;
    await flush(120);
  }
  throw new Error(`plan badge never rendered.\nDOM:\n${container.innerHTML}`);
}

/**
 * Inject the shell config the desktop would provide. A `signOut` function is
 * required for the header account block (it renders only when hasDesktopSignOut()).
 */
function injectConfig(identity?: { email?: string; plan?: string }): void {
  window.__RECODER_COCKPIT__ = {
    backendUrl: stub.baseUrl,
    identity,
    signOut: async () => ({ ok: true }),
  };
}

describe('cockpit header plan badge', () => {
  it('renders the resolved plan tier when identity carries a plan', async () => {
    injectConfig({ email: 'dev@recoder.xyz', plan: 'pro' });
    await act(async () => {
      render(<App />, container);
    });
    const badge = await waitForBadge();
    expect(badge.textContent?.trim()).toBe('Pro');
  });

  it('defaults to "Free" when identity has no plan (never fabricates a paid tier)', async () => {
    injectConfig({ email: 'dev@recoder.xyz' });
    await act(async () => {
      render(<App />, container);
    });
    const badge = await waitForBadge();
    expect(badge.textContent?.trim()).toBe('Free');
  });
});
