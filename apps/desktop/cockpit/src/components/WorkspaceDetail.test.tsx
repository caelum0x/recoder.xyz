// @vitest-environment jsdom
/**
 * WorkspaceDetail — two behavior contracts:
 *
 * A. INLINE GATE VERDICT (delivery-gate polish, the high-value cockpit improvement):
 *
 *    When the operator clicks "Open PR" or "Merge" and the conductor's delivery
 *    gate fires a 409 (awaiting_approval), WorkspaceDetail renders a structured
 *    inline gate verdict — action tier, approval ID, transition state, reason —
 *    right where the action was triggered. The operator no longer sees a cryptic
 *    error string; they see exactly what's blocking and what to do next.
 *
 *    Tests:
 *      1. 409 merge → InlineGateVerdict with correct action/tier/reason
 *      2. 409 PR → InlineGateVerdict for 'pr' action
 *      3. Non-409 error (500) → plain action-error (not the gate card)
 *      4. Successful merge (200) → action-note 'Merged.' (no gate card)
 *
 * B. CHAT TAB + "OPEN IN TERMINAL" HANDOFF (wave-desktop fusion §5):
 *
 *    The embedded terminal surfaces are retired. The Chat tab renders the calm
 *    ConversationView; the "Open in terminal" action hands the workspace's tmux
 *    session to the wave host via the preload bridge
 *    (window.__RECODER_COCKPIT__.openWorkspaceTerminal) — disabled with a
 *    truthful hint when the bridge is absent (plain browser).
 *
 * Drives the production <WorkspaceDetail/> Preact tree in a real jsdom DOM with
 * only the runtime seams doubled — `fetch`/`window` (api + config + host
 * bridge), exactly like WorkspaceCenter.test.tsx. Nothing in the cockpit is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { WorkspaceDetail, palPlanFromMetadata } from './WorkspaceDetail';
import type { Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

/**
 * Words that must NEVER reach the friendly CHAT surface — raw machine
 * internals. Note: the detail HEADER legitimately shows the substrate label
 * ("tmux_worktree"), a truthful control-plane fact, so we assert only over the
 * chat surface region, and the list targets genuine scary jargon (the dead-
 * pane banner, node-pty, the bare PTY/TTY acronyms) — not the substrate name.
 */
const SCARY_WORDS = ['Pane is dead', 'node-pty', 'PTY', 'TTY', 'stderr', 'exit code'];

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-detail',
    spaceId: 'default',
    projectId: 'default',
    taskId: 'task_1',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/x',
    baseRef: 'main',
    // A live tmux session is required for the Terminal tab to be enabled.
    sessionName: 'recoder-ws-detail',
    worktreePath: '/tmp/wt/ws-detail',
    state: 'running',
    createdBy: 'op',
    createdAt: new Date('2026-06-29T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-06-29T00:00:00Z').toISOString(),
    ...overrides,
  };
}

function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

/**
 * Install the wave host's open-as-terminal bridge on the injected cockpit
 * config (the same seam the desktop preload exposes). In the page the config
 * object is one global (`window === globalThis`); under vitest's jsdom the
 * two are distinct objects, so we set it on both — config.ts reads
 * `window.__RECODER_COCKPIT__`, lib/wave-bridge reads
 * `globalThis.__RECODER_COCKPIT__`. Returns the recorded calls so tests can
 * assert the real handoff payload.
 */
function installTerminalBridge(): {
  openCalls: Array<{ sessionName?: string; cwd?: string }>;
} {
  const openCalls: Array<{ sessionName?: string; cwd?: string }> = [];
  const config = {
    backendUrl: BACKEND_URL,
    token: 't',
    openWorkspaceTerminal: (req: { sessionName?: string; cwd?: string }) => {
      openCalls.push({ sessionName: req.sessionName, cwd: req.cwd });
    },
  };
  const realWindow = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
  realWindow.__RECODER_COCKPIT__ = config;
  (globalThis as Record<string, unknown>).__RECODER_COCKPIT__ = config;
  return { openCalls };
}

function mount(ws: Workspace): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<WorkspaceDetail workspace={ws} onClose={() => undefined} onChanged={() => undefined} />, c);
  });
  return c;
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function clickButtonByText(c: HTMLDivElement, text: string): void {
  const btn = Array.from(c.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').trim() === text,
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  act(() => {
    btn.click();
  });
}

/** Assert no scary jargon over the friendly chat surface (not the header). */
function assertNoScaryWording(c: HTMLDivElement): void {
  const surface = c.querySelector('.conv') ?? c.querySelector('.detail-body') ?? c;
  const text = surface.textContent ?? '';
  for (const word of SCARY_WORDS) {
    expect(text).not.toContain(word);
  }
}

beforeEach(() => {
  // The cockpit reads config off window.__RECODER_COCKPIT__; we layer it onto
  // jsdom's real window (kept, so xterm's DOM/host wiring works) rather than
  // replacing it. xterm.open() probes matchMedia for DPR — jsdom omits it, so we
  // provide a benign stub. None of this touches the component's own logic.
  const realWindow = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
  realWindow.__RECODER_COCKPIT__ = { backendUrl: BACKEND_URL, token: 't' };
  if (typeof realWindow.matchMedia !== 'function') {
    realWindow.matchMedia = () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    });
  }
  // jsdom omits ResizeObserver; provide a no-op stand-in so any component that
  // observes its host for resize keeps working (irrelevant to these tests).
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver !== 'function') {
    class NoopResizeObserver {
      observe(): void {
        /* no-op */
      }
      unobserve(): void {
        /* no-op */
      }
      disconnect(): void {
        /* no-op */
      }
    }
    (globalThis as Record<string, unknown>).ResizeObserver = NoopResizeObserver;
    realWindow.ResizeObserver = NoopResizeObserver;
  }
  delete (globalThis as Record<string, unknown>).WebSocket;
  // Every backend GET returns an empty success envelope; the toggle/terminal
  // behavior under test does not depend on event/diff/health content.
  (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
    makeResponse({ status: 200, ok: true, body: { success: true, data: [] } }),
  );
});

afterEach(() => {
  if (container) {
    act(() => {
      render(null, container as HTMLDivElement);
    });
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
  // Keep jsdom's real window; just clear the props we layered onto it and the
  // installed bridge so each test starts from a clean seam.
  const realWindow = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
  if (realWindow) {
    delete realWindow.__RECODER_COCKPIT__;
    delete realWindow.recoderDesktop;
  }
  delete (globalThis as Record<string, unknown>).__RECODER_COCKPIT__;
  delete (globalThis as Record<string, unknown>).fetch;
});

describe('WorkspaceDetail chat tab + "Open in terminal" handoff (fusion §5)', () => {
  it('offers no embedded Terminal tab any more — Chat renders the calm conversation', async () => {
    const c = mount(workspace());
    await flush(10);

    // The terminal-era tab and toggle are retired.
    const tabTexts = Array.from(c.querySelectorAll('.detail-tabs .tab')).map((t) =>
      (t.textContent ?? '').trim(),
    );
    expect(tabTexts).not.toContain('Terminal');
    expect(c.querySelector('.detail-terminal-toggle')).toBeNull();

    clickButtonByText(c, 'Chat');
    await flush(10);

    // The calm conversation skin, never an embedded terminal.
    expect(c.querySelector('.conv')).toBeTruthy();
    expect(c.querySelector('.rterm')).toBeNull();
    expect(c.querySelector('.terminal-shell')).toBeNull();
    assertNoScaryWording(c);
  });

  it('hands the tmux session to the wave host via the bridge with sessionName + cwd', async () => {
    const { openCalls } = installTerminalBridge();
    const c = mount(workspace());
    await flush(10);

    const btn = Array.from(c.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Open in terminal',
    ) as HTMLButtonElement;
    expect(btn, 'the Open in terminal action is rendered next to the tab strip').toBeTruthy();
    expect(btn.disabled).toBe(false);

    await act(async () => {
      btn.click();
    });
    await flush(10);

    // The REAL handoff payload: this workspace's tmux session + worktree cwd.
    expect(openCalls).toEqual([
      { sessionName: 'recoder-ws-detail', cwd: '/tmp/wt/ws-detail' },
    ]);
    // No inline failure note on a successful handoff.
    expect(c.querySelector('.open-in-terminal-error')).toBeNull();
  });

  it('disables the action with a truthful hint when the bridge is absent (plain browser)', async () => {
    const c = mount(workspace());
    await flush(10);

    const btn = Array.from(c.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Open in terminal',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain('Recoder desktop app');
  });

  it('disables the action when the workspace has no tmux session yet', async () => {
    installTerminalBridge();
    const c = mount(workspace({ sessionName: undefined }));
    await flush(10);

    const btn = Array.from(c.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Open in terminal',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain('No agent session');
  });
});

/**
 * Delivery-gate polish: inline gate verdict in WorkspaceDetail.
 *
 * When the operator clicks "Open PR" or "Merge" and the conductor gate fires a
 * 409 awaiting_approval, WorkspaceDetail renders a structured InlineGateVerdict
 * card right where the action was triggered — action tier, approval ID,
 * transition state, and reason — instead of a cryptic error string. For any
 * other failure (5xx, network, etc.) the plain .action-error is shown.
 *
 * All four tests drive the REAL WorkspaceDetail + REAL api client. Only `fetch`
 * (the network seam) is doubled.
 */
describe('WorkspaceDetail inline gate verdict', () => {
  /** A reviewable workspace (awaiting_review allows Merge). */
  function reviewWs(overrides: Partial<Workspace> = {}): Workspace {
    return {
      workspaceId: 'ws-gate',
      spaceId: 'default',
      projectId: 'default',
      taskId: 'task_gate',
      runtimeId: 'claude',
      substrate: 'tmux_worktree',
      branch: 'feature/gate-test',
      baseRef: 'main',
      state: 'awaiting_review',
      createdBy: 'op',
      createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-01T00:00:00Z').toISOString(),
      ...overrides,
    };
  }

  function mount(ws: Workspace): HTMLDivElement {
    const c = document.createElement('div');
    document.body.appendChild(c);
    container = c;
    act(() => {
      render(<WorkspaceDetail workspace={ws} onClose={() => undefined} onChanged={() => undefined} />, c);
    });
    return c;
  }

  /**
   * Build a 409 delivery-gate response: the conductor's DeliveryApprovalRequiredError
   * serialises to { success:false, error:<reason>, data:{ state, action, approvalId, transitioned } }.
   */
  function gate409(action: string, approvalId?: string): Response {
    return makeResponse({
      status: 409,
      ok: false,
      body: {
        success: false,
        error: `Delivery blocked: no approving Approval for action '${action}'`,
        data: { state: 'awaiting_approval', action, approvalId, transitioned: true },
      },
    });
  }

  it('shows the structured gate verdict when merge is blocked (409 awaiting_approval)', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) return gate409('merge');
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = mount(reviewWs());
    await flush(20);

    // Click the Merge action button.
    clickButtonByText(c, 'Merge');
    await flush(20);

    // The gate verdict card is rendered — not a plain error string.
    const verdict = c.querySelector('.detail-gate-verdict');
    expect(verdict).toBeTruthy();

    // It shows the gate blocked the merge.
    expect(verdict?.textContent).toContain('Merge');
    expect(verdict?.textContent).toContain('blocked by delivery gate');

    // The action tier row is visible.
    expect(verdict?.textContent).toContain('Action tier');
    expect(verdict?.textContent).toContain('merge');

    // The reason from the backend error message is shown.
    expect(verdict?.textContent).toContain("Delivery blocked");

    // The "what to do" hint is present.
    expect(verdict?.textContent).toContain('approving Approval');

    // The plain action-error element is NOT shown (this is not a raw error).
    expect(c.querySelector('.action-error')).toBeNull();
  });

  it('shows the gate verdict for a blocked PR action with an approval ID', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/pr')) return gate409('pr.create', 'appr_abc123');
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    // 'running' state allows PR.
    const c = mount(reviewWs({ state: 'running' }));
    await flush(20);

    clickButtonByText(c, 'Open PR');
    await flush(20);

    const verdict = c.querySelector('.detail-gate-verdict');
    expect(verdict).toBeTruthy();

    // Shows PR-specific copy.
    expect(verdict?.textContent).toContain('Open PR');
    expect(verdict?.textContent).toContain('blocked by delivery gate');

    // The approval ID from the backend response is surfaced.
    expect(verdict?.textContent).toContain('appr_abc123');
  });

  it('shows plain action-error (not the gate card) for a non-409 backend failure', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) {
        return makeResponse({
          status: 500,
          ok: false,
          body: { success: false, error: 'internal server error' },
        });
      }
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = mount(reviewWs());
    await flush(20);

    clickButtonByText(c, 'Merge');
    await flush(20);

    // A 500 is a backend error, not a gate verdict.
    expect(c.querySelector('.detail-gate-verdict')).toBeNull();
    expect(c.querySelector('.action-error')).toBeTruthy();
    expect(c.querySelector('.action-error')?.textContent).toContain('Backend error');
  });

  it('shows the success note and no gate card when merge succeeds', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) {
        return makeResponse({
          status: 200,
          ok: true,
          body: { success: true, data: { workspaceId: 'ws-gate', branch: 'feature/gate-test', merged: true } },
        });
      }
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = mount(reviewWs());
    await flush(20);

    clickButtonByText(c, 'Merge');
    await flush(20);

    // On success: the success note is shown, the gate card is not.
    expect(c.querySelector('.detail-gate-verdict')).toBeNull();
    expect(c.querySelector('.action-error')).toBeNull();
    expect(c.querySelector('.action-note')).toBeTruthy();
    expect(c.querySelector('.action-note')?.textContent).toContain('Merged.');
  });
});

/**
 * PAL plan provenance (INTEGRATION-PLAN §a.4 step 4, display half).
 *
 * The workspace create path persists the PALPlan annotation onto
 * `workspace.metadata.palPlan` (runtime team, substrate, D1 advisory risk tier).
 * WorkspaceDetail must SHOW that provenance — and, per the cockpit frontend
 * rule, truthfully show "not recorded" when the annotation is absent or
 * malformed instead of hiding the missing source or faking state.
 */
describe('WorkspaceDetail PAL plan provenance', () => {
  /** A full persisted annotation, with values distinct from the workspace's own fields. */
  const fullPlan = {
    runtimeId: 'codex',
    substrate: 'daytona',
    reviewerRuntimeId: 'claude',
    browserVerification: true,
    skills: ['recoder-platform', 'tdd'],
    mcpTools: ['workspace_diff'],
    risk: 'high',
    generatedAt: '2026-07-01T00:00:00Z',
  };

  it('renders the persisted palPlan — team, substrate, risk badge, verification, counts', async () => {
    const c = mount(workspace({ metadata: { palPlan: fullPlan } }));
    await flush(10);

    const plan = c.querySelector('.detail-plan');
    expect(plan).toBeTruthy();
    const text = plan?.textContent ?? '';
    // Runtime team: runtimeId → reviewerRuntimeId.
    expect(text).toContain('codex → claude');
    // Substrate from the plan (not the workspace's own tmux_worktree field).
    expect(text).toContain('daytona');
    // D1 advisory risk tier — raw string, shown as a badge.
    expect(text).toContain('high');
    expect(plan?.querySelector('.badge')?.textContent).toContain('high');
    // Browser verification + skill/tool counts.
    expect(text).toContain('browser verification: yes');
    expect(text).toContain('skills: 2');
    expect(text).toContain('tools: 1');
    // The truthful missing-state line is NOT shown when the plan exists.
    expect(text).not.toContain('not recorded');
  });

  it('omits the reviewer arrow when reviewerRuntimeId is null', async () => {
    const c = mount(
      workspace({ metadata: { palPlan: { ...fullPlan, reviewerRuntimeId: null } } }),
    );
    await flush(10);

    const text = c.querySelector('.detail-plan')?.textContent ?? '';
    expect(text).toContain('codex');
    expect(text).not.toContain('→');
  });

  it("renders 'PAL plan: not recorded' when the workspace has no palPlan", async () => {
    const c = mount(workspace());
    await flush(10);

    const missing = c.querySelector('.detail-plan-missing');
    expect(missing).toBeTruthy();
    expect(missing?.textContent).toContain('PAL plan: not recorded');
    expect(c.querySelector('.detail-plan')).toBeNull();
  });

  it("renders 'not recorded' (and does not crash) for a malformed palPlan", async () => {
    const c = mount(workspace({ metadata: { palPlan: 'garbage — not an object' } }));
    await flush(10);

    const missing = c.querySelector('.detail-plan-missing');
    expect(missing).toBeTruthy();
    expect(missing?.textContent).toContain('PAL plan: not recorded');
    expect(c.querySelector('.detail-plan')).toBeNull();
  });

  describe('palPlanFromMetadata boundary narrowing', () => {
    it('returns null for absent metadata, absent palPlan, and non-object palPlan', () => {
      expect(palPlanFromMetadata(undefined)).toBeNull();
      expect(palPlanFromMetadata({})).toBeNull();
      expect(palPlanFromMetadata({ palPlan: 'nope' })).toBeNull();
      expect(palPlanFromMetadata({ palPlan: null })).toBeNull();
      expect(palPlanFromMetadata({ palPlan: 42 })).toBeNull();
      expect(palPlanFromMetadata({ palPlan: ['array'] })).toBeNull();
    });

    it('narrows each field defensively — wrong-typed fields drop to undefined', () => {
      const plan = palPlanFromMetadata({
        palPlan: {
          runtimeId: 'codex',
          substrate: 7, // wrong type → dropped
          reviewerRuntimeId: null,
          browserVerification: 'yes', // wrong type → dropped
          skills: ['a', 3, 'b'], // non-strings filtered
          mcpTools: 'not-an-array', // wrong type → dropped
          risk: 'medium',
          generatedAt: '2026-07-01T00:00:00Z',
        },
      });
      expect(plan).toEqual({
        runtimeId: 'codex',
        substrate: undefined,
        reviewerRuntimeId: null,
        browserVerification: undefined,
        skills: ['a', 'b'],
        mcpTools: undefined,
        risk: 'medium',
        generatedAt: '2026-07-01T00:00:00Z',
      });
    });
  });
});

/**
 * Cross-workspace state bleed — the App keys WorkspaceDetail by workspaceId.
 *
 * WorkspaceDetail carries per-workspace LOCAL state (the active `tab`, the
 * `actionOutcome` from an Open-PR/Merge/Archive action, and the in-flight
 * `busy` flag). At App.tsx the panel is rendered with `key={selected.workspaceId}`
 * so switching the selected workspace REMOUNTS the panel and resets that state,
 * instead of misattributing workspace A's governance outcome / error / busy
 * state / tab selection to workspace B (a truthfulness violation).
 *
 * These tests reproduce App's render decision faithfully: a keyed root remounts
 * on id change (the fix), while the unkeyed variant bleeds A's state onto B (the
 * bug the key closes).
 */
describe('WorkspaceDetail cross-workspace state bleed (keyed by workspaceId)', () => {
  function reviewWs(overrides: Partial<Workspace> = {}): Workspace {
    return workspace({ state: 'awaiting_review', ...overrides });
  }

  const wsA = reviewWs({ workspaceId: 'ws-A', taskId: 'task_A', branch: 'feature/a' });
  const wsB = reviewWs({ workspaceId: 'ws-B', taskId: 'task_B', branch: 'feature/b' });

  /** A 409 delivery-gate response, exactly as the conductor serialises it. */
  function gate409(action: string): Response {
    return makeResponse({
      status: 409,
      ok: false,
      body: {
        success: false,
        error: `Delivery blocked: no approving Approval for action '${action}'`,
        data: { state: 'awaiting_approval', action, transitioned: true },
      },
    });
  }

  /** App.tsx renders `<WorkspaceDetail key={selected.workspaceId} … />`. */
  function KeyedHarness({ ws }: { ws: Workspace }) {
    return (
      <WorkspaceDetail key={ws.workspaceId} workspace={ws} onClose={() => undefined} onChanged={() => undefined} />
    );
  }

  /** The pre-fix render: no key, so the instance (and its state) is reused. */
  function UnkeyedHarness({ ws }: { ws: Workspace }) {
    return <WorkspaceDetail workspace={ws} onClose={() => undefined} onChanged={() => undefined} />;
  }

  function tabButton(c: HTMLDivElement, text: string): HTMLButtonElement {
    const btn = Array.from(c.querySelectorAll('.detail-tabs .tab')).find(
      (b) => (b.textContent ?? '').trim() === text,
    );
    if (!btn) throw new Error(`tab "${text}" not found`);
    return btn as HTMLButtonElement;
  }

  it('remounts on workspace switch — B never shows A\'s gate verdict / error / tab', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) return gate409('merge');
      if (typeof url === 'string' && url.endsWith('/diff')) {
        return makeResponse({
          status: 200,
          ok: true,
          body: {
            success: true,
            data: {
              workspaceId: 'ws-A',
              baseRef: 'main',
              branch: 'feature/a',
              stat: ' README.md | 1 +',
              patch: 'diff --git a/README.md b/README.md',
              untracked: [],
              changedFiles: 1,
            },
          },
        });
      }
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = document.createElement('div');
    document.body.appendChild(c);
    container = c;

    // Workspace A: select the Diff tab, then Merge → the delivery gate fires.
    act(() => render(<KeyedHarness ws={wsA} />, c));
    await flush(20);
    act(() => tabButton(c, 'Diff').click());
    await flush(20);
    clickButtonByText(c, 'Merge');
    await flush(20);

    // A shows its gate verdict on the Diff tab.
    expect(c.querySelector('.detail-gate-verdict'), 'A shows its own gate verdict').toBeTruthy();
    expect(tabButton(c, 'Diff').classList.contains('tab-active')).toBe(true);

    // Operator clicks workspace B in the sidebar → App re-renders the keyed panel.
    act(() => render(<KeyedHarness ws={wsB} />, c));
    await flush(20);

    // B must NOT inherit A's governance outcome, error, or tab selection.
    expect(c.querySelector('.detail-gate-verdict'), 'B must not show A\'s gate verdict').toBeNull();
    expect(c.querySelector('.action-error')).toBeNull();
    expect(c.querySelector('.action-note')).toBeNull();
    // Tab reset to the default (Changes), not the Diff tab A had open.
    expect(tabButton(c, 'Changes').classList.contains('tab-active')).toBe(true);
    expect(tabButton(c, 'Diff').classList.contains('tab-active')).toBe(false);
  });

  it('the in-flight busy state does not disable B\'s buttons after the switch', async () => {
    let releaseMerge: () => void = () => undefined;
    const mergePending = new Promise<void>((resolve) => {
      releaseMerge = resolve;
    });
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) {
        await mergePending; // hold the action in-flight → busy === 'merge'
        return makeResponse({ status: 200, ok: true, body: { success: true, data: {} } });
      }
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = document.createElement('div');
    document.body.appendChild(c);
    container = c;

    act(() => render(<KeyedHarness ws={wsA} />, c));
    await flush(20);
    clickButtonByText(c, 'Merge');
    await flush(20);

    // A's Merge button is now busy: relabeled and disabled.
    const mergeBtnA = Array.from(c.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').trim() === 'Merging…',
    ) as HTMLButtonElement | undefined;
    expect(mergeBtnA, 'A\'s merge is in-flight').toBeTruthy();
    expect(mergeBtnA?.disabled).toBe(true);

    // Switch to B while A's merge is still in-flight.
    act(() => render(<KeyedHarness ws={wsB} />, c));
    await flush(20);

    // B is a fresh instance: its Merge button is enabled and reads 'Merge'.
    expect(
      Array.from(c.querySelectorAll('button')).some((b) => (b.textContent ?? '').trim() === 'Merging…'),
      'B must not inherit A\'s busy label',
    ).toBe(false);
    const mergeBtnB = Array.from(c.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').trim() === 'Merge',
    ) as HTMLButtonElement | undefined;
    expect(mergeBtnB, 'B offers a fresh, ready Merge').toBeTruthy();
    expect(mergeBtnB?.disabled).toBe(false);
    // The Archive action is likewise not disabled by A's stale busy flag.
    const archiveBtnB = Array.from(c.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').trim() === 'Archive',
    ) as HTMLButtonElement | undefined;
    expect(archiveBtnB?.disabled).toBe(false);

    // Release A's in-flight merge so the test leaves no dangling work.
    releaseMerge();
    await flush(10);
  });

  it('WITHOUT the key the same instance bleeds A\'s gate verdict onto B (documents the bug)', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.endsWith('/merge')) return gate409('merge');
      return makeResponse({ status: 200, ok: true, body: { success: true, data: [] } });
    });

    const c = document.createElement('div');
    document.body.appendChild(c);
    container = c;

    act(() => render(<UnkeyedHarness ws={wsA} />, c));
    await flush(20);
    clickButtonByText(c, 'Merge');
    await flush(20);
    expect(c.querySelector('.detail-gate-verdict')).toBeTruthy();

    // Re-render the SAME position with B but no key → Preact reuses the instance,
    // so A's gate verdict wrongly persists. This is exactly what the App-level
    // `key={selected.workspaceId}` prevents.
    act(() => render(<UnkeyedHarness ws={wsB} />, c));
    await flush(20);
    expect(
      c.querySelector('.detail-gate-verdict'),
      'unkeyed: A\'s verdict bleeds onto B — the bug the key fixes',
    ).toBeTruthy();
  });
});
