// @vitest-environment jsdom
/**
 * Invisible-engine feedback (product F4).
 *
 * When the workspace launched with recalled context (the backend records
 * truthful provenance refs on metadata.knowledgeSources), the run header shows
 * ONE quiet count-only note — no engine names, ever. Absent/empty metadata
 * shows nothing (never fabricated).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { WorkspaceCenter } from './WorkspaceCenter';
import { startStubConductor, type StubConductor } from '../test/stub-conductor';
import type { Workspace } from '../types';

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

function ws(metadata?: Record<string, unknown>): Workspace {
  return {
    workspaceId: 'ws_recall',
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_recall',
    baseRef: 'main',
    state: 'running',
    createdBy: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  } as Workspace;
}

async function mount(workspace: Workspace): Promise<void> {
  await act(async () => {
    render(<WorkspaceCenter workspace={workspace} />, container);
  });
}

describe('recalled-context note', () => {
  it('shows a quiet count-only note when the run recalled past context', async () => {
    await mount(ws({ knowledgeSources: ['mem:abc', 'bead:rx-12', 'rag:src/app.ts'] }));
    const head = container.querySelector('.ws-center-head')!;
    expect(head.textContent).toContain('recalled 3 things from past runs');
    // Engines stay invisible: no engine name leaks into the UI.
    for (const engine of ['mem0', 'beads', 'colbert', 'retrieval']) {
      expect(head.textContent?.toLowerCase()).not.toContain(engine);
    }
  });

  it('shows nothing when no context was recalled', async () => {
    await mount(ws());
    expect(container.querySelector('.ws-center-head')?.textContent).not.toContain('recalled');
  });
});
