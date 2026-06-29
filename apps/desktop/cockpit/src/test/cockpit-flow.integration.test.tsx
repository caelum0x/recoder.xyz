// @vitest-environment jsdom
/**
 * Cockpit integration smoke harness.
 *
 * Boots the REAL cockpit UI (the production <App/> Preact tree, its real `api`
 * client, `usePoll`, and the real workspace state machine) inside a real jsdom
 * DOM, pointed at a STUB conductor backend — a real in-process HTTP server we own
 * (src/test/stub-conductor.ts) returning real-shaped /api/conductor envelopes.
 *
 * The stub is an EXTERNAL SEAM, not a mock of the cockpit: every assertion below
 * is about what the production components render in response to real HTTP traffic.
 * We drive the documented lifecycle end to end —
 *
 *   create -> events -> diff -> terminate
 *
 * — and assert the board reflects each state as the conductor transitions it:
 *   1. Operator fills the real NewWorkspaceForm and submits -> POST /workspaces.
 *      The new card appears in the "Queued" column (state: created).
 *   2. Conductor advances setting_up -> ready -> running. The card moves to the
 *      "Running" column and the live event log shows the state_transition events.
 *   3. Operator opens the Diff tab -> GET /diff renders the real patch text.
 *   4. Conductor advances to awaiting_review (card -> "Review" column).
 *   5. Operator clicks Archive -> POST /archive terminates the workspace; the
 *      card lands in the "Done" column (state: archived) and the stub recorded
 *      exactly one archive call.
 *
 * No production code is stubbed and no UI behavior is faked: jsdom + a real TCP
 * server are the only test doubles, both standing in for the host environment.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { App } from '../App';
import { setRuntimeToken, COCKPIT_NAVIGATE_EVENT } from '../lib/config';
import { startStubConductor, type StubConductor } from './stub-conductor';
import type { WorkspaceState } from '../types';

let stub: StubConductor;
let container: HTMLDivElement;

beforeEach(async () => {
  stub = await startStubConductor();
  // The Electron shell injects this global; here the integration test plays the
  // shell, pointing the real renderer at our real stub server. No token needed —
  // the stub does not gate on auth — but we clear any runtime token from a prior
  // test so config resolution is deterministic.
  setRuntimeToken(undefined);
  window.__RECODER_COCKPIT__ = { backendUrl: stub.baseUrl };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    render(null, container); // unmount -> stops every usePoll interval
  });
  container.remove();
  delete window.__RECODER_COCKPIT__;
  await stub.close();
});

/** Flush microtasks + the next macrotask so in-flight fetches/polls settle. */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/**
 * Poll the rendered DOM until `predicate` holds or the deadline passes. Real
 * timers: the cockpit polls /workspaces every 2s, so a transition can take up to
 * one poll interval to surface. We re-flush act() between checks so Preact
 * effects and the next poll run.
 */
async function waitForDom(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  // Fast initial settle, then poll.
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await flush(120);
  }
  if (!predicate()) {
    throw new Error(`waitForDom timed out after ${timeoutMs}ms.\nDOM:\n${container.innerHTML}`);
  }
}

function text(): string {
  return container.textContent || '';
}

/** Find the board column element by its visible title, or null if not rendered. */
function findColumn(title: string): Element | null {
  const cols = Array.from(container.querySelectorAll('.board-col'));
  return cols.find((c) => c.querySelector('.board-col-title')?.textContent === title) || null;
}

/** Find the board column element by its visible title (throws for assertions). */
function column(title: string): Element {
  const found = findColumn(title);
  if (!found) throw new Error(`column "${title}" not found in:\n${container.innerHTML}`);
  return found;
}

/**
 * True when a card whose badge reads `stateLabel` lives in the named column.
 * Safe to call inside a waitForDom predicate: returns false (never throws) when
 * the board has not yet rendered that column.
 */
function cardInColumn(columnTitle: string, stateLabel: string): boolean {
  const col = findColumn(columnTitle);
  if (!col) return false;
  const badges = Array.from(col.querySelectorAll('.card .badge'));
  return badges.some((b) => b.textContent === stateLabel);
}

describe('cockpit create -> events -> diff -> terminate (real UI vs stub conductor)', () => {
  it('drives the full workspace lifecycle and the board reflects each state', async () => {
    // --- Mount the real cockpit shell ---
    await act(async () => {
      render(<App />, container);
    });
    // Let the initial /workspaces, /runtimes, /substrates, /connectors polls land.
    await flush(50);

    // Board starts empty: the stub has no workspaces yet.
    await waitForDom(() => text().includes('No workspaces yet') || text().includes('Create your first workspace'));
    expect(stub.workspaces()).toHaveLength(0);

    // --- 1. CREATE: open the real NewWorkspaceForm and submit ---
    const newBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'New workspace' || b.textContent === 'Create your first workspace',
    );
    expect(newBtn, 'a create-workspace button is rendered').toBeTruthy();
    await act(async () => {
      newBtn!.click();
    });

    // Wait until the form is open AND its runtime <select> has been populated
    // from the modal's own GET /runtimes poll (the claude option appears).
    await waitForDom(
      () =>
        container.querySelector('form.new-workspace') !== null &&
        Array.from(container.querySelectorAll('form.new-workspace select option')).some(
          (o) => (o as HTMLOptionElement).value === 'claude',
        ),
    );

    // Drive the real controlled inputs, exactly like a user typing/selecting.
    // Each interaction re-queries the live element because every state update
    // re-renders the form (and replaces the DOM nodes), then dispatches the
    // exact DOM event (input/change) the production handlers listen for.
    async function setControl(
      selector: string,
      value: string,
      eventName: 'input' | 'change',
    ): Promise<void> {
      await act(async () => {
        const el = container.querySelector(selector) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement;
        if (!el) throw new Error(`control not found: ${selector}\n${container.innerHTML}`);
        el.value = value;
        el.dispatchEvent(new Event(eventName, { bubbles: true }));
      });
    }

    await setControl('input[placeholder="/Users/you/project"]', '/Users/op/demo-repo', 'input');
    await setControl('form.new-workspace textarea', 'Add a greeting to the README', 'input');
    // Choose the available runtime (claude). The stub marks codex unavailable, so
    // selecting it proves the gating: only available runtimes are pickable.
    await setControl('form.new-workspace select', 'claude', 'change');

    // Submit the real form by dispatching its submit event (what the production
    // <form onSubmit> handler listens for) -> POST /workspaces on the stub.
    await act(async () => {
      const form = container.querySelector('form.new-workspace') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // The POST /workspaces hit the stub: exactly one workspace now exists, with
    // the runtime we selected. No production code was stubbed — this is the real
    // create path end to end.
    await waitForDom(() => stub.workspaces().length === 1);
    const created = stub.workspaces()[0];
    expect(created.state).toBe('created');
    expect(created.runtimeId).toBe('claude');
    expect(created.metadata).toBeDefined();
    // The board refreshes on create and the new card lands in "Queued".
    await waitForDom(() => cardInColumn('Queued', 'created'));

    const id = created.workspaceId;

    // --- 2. EVENTS: conductor advances the workspace; board + log follow ---
    const queuedSteps: WorkspaceState[] = ['setting_up', 'ready'];
    for (const s of queuedSteps) {
      stub.advance(id, s, `transition to ${s}`);
    }
    // setting_up + ready are both in the "Queued" column per BOARD_COLUMNS.
    await waitForDom(() => cardInColumn('Queued', 'ready'));

    stub.advance(id, 'running', 'agent started working');
    stub.emit(id, { type: 'log', message: 'editing README.md' });
    // running lives in the "Running" column.
    await waitForDom(() => cardInColumn('Running', 'running'));
    // And it left "Queued".
    expect(cardInColumn('Queued', 'ready')).toBe(false);

    // Open the detail panel by clicking the running card.
    const runningCard = column('Running').querySelector('.card') as HTMLButtonElement;
    expect(runningCard).toBeTruthy();
    await act(async () => {
      runningCard.click();
    });

    // The live event log (GET /events) shows the real state_transition + log lines.
    await waitForDom(
      () =>
        container.querySelector('.detail-panel') !== null &&
        text().includes('agent started working') &&
        text().includes('editing README.md'),
    );

    // --- 3. DIFF: open the Diff tab; GET /diff renders the real patch ---
    const diffTab = Array.from(container.querySelectorAll('.detail-tabs .tab')).find(
      (t) => t.textContent === 'Diff',
    ) as HTMLButtonElement;
    expect(diffTab).toBeTruthy();
    expect(diffTab.disabled, 'Diff tab is enabled once the workspace is running').toBe(false);
    await act(async () => {
      diffTab.click();
    });
    await waitForDom(() => text().includes('Added by claude on') && text().includes('README.md'));

    // --- 4. REVIEW: conductor moves it to awaiting_review ---
    stub.advance(id, 'awaiting_review', 'work ready for review');
    await waitForDom(() => cardInColumn('Review', 'awaiting review'));
    expect(cardInColumn('Running', 'running')).toBe(false);

    // --- 5. TERMINATE: operator archives the workspace ---
    const archiveBtn = Array.from(container.querySelectorAll('.detail-actions button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    expect(archiveBtn).toBeTruthy();
    expect(archiveBtn.disabled, 'Archive is allowed from awaiting_review').toBe(false);
    await act(async () => {
      archiveBtn.click();
    });

    // POST /archive hit the stub exactly once and terminated the workspace.
    await waitForDom(() => stub.archiveCalls() === 1 && stub.workspaces()[0]?.state === 'archived');
    // The card lands in the "Done" column as "archived".
    await waitForDom(() => cardInColumn('Done', 'archived'));
    expect(cardInColumn('Review', 'awaiting review')).toBe(false);

    // Final truth check: one archive call, terminal state, full lifecycle walked.
    expect(stub.archiveCalls()).toBe(1);
    expect(stub.workspaces()[0].state).toBe('archived');
  }, 30_000);

  it('exposes dmux as a discoverable top-level surface reachable by tab and by deep-link', async () => {
    await act(async () => {
      render(<App />, container);
    });
    await flush(50);

    // dmux is an advanced surface, so it lives under the "More" menu (the top
    // nav stays plain). Open the menu and find the dmux item inside it.
    const moreTrigger = Array.from(container.querySelectorAll('.view-tabs .view-tab')).find(
      (b) => b.textContent?.startsWith('More'),
    ) as HTMLButtonElement;
    expect(moreTrigger, 'a "More" menu trigger is rendered').toBeTruthy();
    await act(async () => {
      moreTrigger.click();
    });
    const dmuxItem = Array.from(container.querySelectorAll('.view-more-menu .view-more-item')).find(
      (b) => b.textContent === 'dmux',
    ) as HTMLButtonElement;
    expect(dmuxItem, 'a "dmux" item is reachable from the More menu').toBeTruthy();

    // Clicking it opens the real DmuxPanel, which renders from GET /dmux on the
    // stub (availability + bin + tmux binding).
    await act(async () => {
      dmuxItem.click();
    });
    await waitForDom(
      () =>
        container.querySelector('.dmux-panel') !== null &&
        text().includes('dmux console') &&
        text().includes('available'),
    );
    // The real bin/tmux metadata from the stub's DmuxStatus is shown.
    expect(text()).toContain('/usr/local/bin/dmux');

    // Deep-link path: the desktop "Open dmux Console" menu item dispatches the
    // navigate event; switch to the board first, then prove the event returns us
    // to dmux without a reload.
    const boardTab = Array.from(container.querySelectorAll('.view-tabs .view-tab')).find(
      (b) => b.textContent === 'Board',
    ) as HTMLButtonElement;
    await act(async () => {
      boardTab.click();
    });
    await waitForDom(() => container.querySelector('.dmux-panel') === null);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(COCKPIT_NAVIGATE_EVENT, { detail: { view: 'dmux' } }),
      );
    });
    await waitForDom(() => container.querySelector('.dmux-panel') !== null);
  }, 20_000);
});
