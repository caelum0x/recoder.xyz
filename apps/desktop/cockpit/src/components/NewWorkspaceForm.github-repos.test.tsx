// @vitest-environment jsdom
/**
 * GitHub repo hint on the folder field (product F2 remainder).
 *
 * While the folder input is EMPTY, the form shows a small reference select of
 * the repos detected on the user's GitHub account (GET /github/repos, keyed
 * `{ repos }`). It is a HINT only: the folder input stays authoritative, and
 * once a folder path is typed the select disappears (no leftover chrome).
 * Renders the REAL form against the real stub conductor over real fetch.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { NewWorkspaceForm } from './NewWorkspaceForm';
import { startStubConductor, type StubConductor } from '../test/stub-conductor';

let stub: StubConductor;
let container: HTMLDivElement;

beforeEach(async () => {
  stub = await startStubConductor();
  window.__RECODER_COCKPIT__ = { backendUrl: stub.baseUrl };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    render(null, container);
  });
  container.remove();
  delete window.__RECODER_COCKPIT__;
  await stub.close();
});

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function repoHintSelect(): HTMLSelectElement | null {
  return container.querySelector(
    'select[aria-label="Your GitHub repos (reference)"]',
  ) as HTMLSelectElement | null;
}

async function waitForRepoHint(timeoutMs = 8000): Promise<HTMLSelectElement> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = repoHintSelect();
    if (el) return el;
    await flush(120);
  }
  throw new Error(`github repo hint select never appeared.\nDOM:\n${container.innerHTML}`);
}

describe('new-workspace GitHub repo hint', () => {
  it('lists the detected repos while the folder is empty, and stays reference-only', async () => {
    act(() => {
      render(<NewWorkspaceForm onCreated={() => {}} onClose={() => {}} />, container);
    });
    const hint = await waitForRepoHint();

    const values = [...hint.querySelectorAll('option')].map((o) => o.value);
    expect(values).toContain('stub-login/stub-repo');
    expect(values).toContain('stub-login/other-repo');

    // Selecting a repo is a reference only — the folder input stays untouched
    // (we never fabricate a local clone path).
    act(() => {
      hint.value = 'stub-login/stub-repo';
      hint.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    const folder = container.querySelector('input[placeholder="/Users/you/project"]') as HTMLInputElement;
    expect(folder.value).toBe('');
    expect(container.textContent).toContain('stub-login/stub-repo is cloned');
  });

  it('disappears once a folder path is typed (folder input authoritative)', async () => {
    act(() => {
      render(<NewWorkspaceForm onCreated={() => {}} onClose={() => {}} />, container);
    });
    await waitForRepoHint();

    const folder = container.querySelector('input[placeholder="/Users/you/project"]') as HTMLInputElement;
    act(() => {
      folder.value = '/Users/me/project';
      folder.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(repoHintSelect()).toBeNull();
  });
});
