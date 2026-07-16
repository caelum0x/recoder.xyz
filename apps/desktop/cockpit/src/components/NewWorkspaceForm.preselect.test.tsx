// @vitest-environment jsdom
/**
 * Agent auto-detect preselection (zero-config onboarding, product F1).
 *
 * The "New workspace" form must preselect the first AVAILABLE detected agent
 * CLI from GET /runtimes — the fresh form is ready to submit without touching
 * the dropdown. Renders the REAL form against the real stub conductor (the
 * stub serves the live keyed `{ runtimes: [...] }` contract).
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

async function waitForSelect(timeoutMs = 8000): Promise<HTMLSelectElement> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = container.querySelector('select') as HTMLSelectElement | null;
    if (el && el.value) return el;
    await flush(120);
  }
  throw new Error(`agent select never got a preselected value.\nDOM:\n${container.innerHTML}`);
}

describe('new-workspace agent preselection', () => {
  it('preselects the first available detected agent CLI', async () => {
    act(() => {
      render(<NewWorkspaceForm onCreated={() => {}} onClose={() => {}} />, container);
    });
    const select = await waitForSelect();
    // The stub's first available runtime must be preselected, not the blank
    // "choose an agent…" placeholder.
    expect(select.value).not.toBe('');
    const option = select.querySelector(`option[value="${select.value}"]`) as HTMLOptionElement;
    expect(option?.disabled).toBe(false);
  });
});
