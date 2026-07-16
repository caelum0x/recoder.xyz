// @vitest-environment jsdom
/**
 * Multi-agent parallelism (product F3).
 *
 * Ticking another available agent in "Also run in parallel" launches ONE
 * workspace per agent — same folder + task prompt, each with its own taskId —
 * against the REAL stub conductor. Nothing extra launches when nothing is
 * ticked, and the row offers only OTHER available agents.
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

async function waitFor(pred: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await flush(120);
  }
  throw new Error(`condition never met.\nDOM:\n${container.innerHTML}`);
}

function setFolder(path: string): void {
  const input = container.querySelector('input[placeholder="/Users/you/project"]') as HTMLInputElement;
  input.value = path;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('parallel agent launch', () => {
  it('launches one workspace per ticked agent (same task, own worktrees)', async () => {
    act(() => {
      render(<NewWorkspaceForm onCreated={() => {}} onClose={() => {}} />, container);
    });
    // Agent preselect resolved + the parallel row offers the OTHER available agent.
    await waitFor(() => (container.querySelector('select[required]') as HTMLSelectElement)?.value === 'claude');
    await waitFor(() => container.querySelector('.field-check-row') !== null);
    const row = container.querySelector('.field-check-row')!;
    expect(row.textContent).toContain('opencode');
    expect(row.textContent).not.toContain('codex'); // unavailable → never offered

    await act(async () => {
      setFolder('/tmp/parallel-repo');
      (row.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
    await act(async () => {
      (container.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    await waitFor(() => stub.workspaces().length === 2);

    const agents = stub.workspaces().map((w) => w.runtimeId).sort();
    expect(agents).toEqual(['claude', 'opencode']);
    const [a, b] = stub.workspaces();
    expect(a.taskId).not.toBe(b.taskId); // own task/worktree each
  });

  it('launches exactly one workspace when nothing extra is ticked', async () => {
    act(() => {
      render(<NewWorkspaceForm onCreated={() => {}} onClose={() => {}} />, container);
    });
    await waitFor(() => (container.querySelector('select[required]') as HTMLSelectElement)?.value === 'claude');
    await act(async () => {
      setFolder('/tmp/solo-repo');
    });
    await act(async () => {
      (container.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    await waitFor(() => stub.workspaces().length === 1);
    expect(stub.workspaces()[0].runtimeId).toBe('claude');
  });
});
