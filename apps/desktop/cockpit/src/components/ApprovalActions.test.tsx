// @vitest-environment jsdom
/**
 * ApprovalActions — inline approve/reject on the awaiting_approval workspace
 * (GAP-AUDIT Wave 10: the card was display-only; the approvals resolve API
 * existed but nothing in the cockpit called it).
 *
 * Contracts under test (real component + real api client; only `fetch` and
 * the window config seam are doubled — nothing in the cockpit is stubbed):
 *
 *  1. Pending approvals for the workspace's task are fetched from
 *     GET /api/agent-os/approvals?taskId=…&status=pending and rendered with
 *     Approve / Reject actions per record.
 *  2. Approve POSTs {decision:'approved'} to /approvals/:id/decide, then shows
 *     the truthful "retry the blocked action" note (deciding never advances
 *     the workspace by itself) and notifies the parent (onChanged).
 *  3. Reject POSTs {decision:'denied'} and shows the truthful rejected note.
 *  4. A backend failure on decide reverts to actionable buttons with the REAL
 *     error message — no fake success.
 *  5. No pending record → an explicit truthful empty state.
 *  6. A failing approvals list fetch → the real error, never a silent blank.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ApprovalActions } from './ApprovalActions';
import type { ApprovalRecord, Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-appr',
    spaceId: 'default',
    projectId: 'default',
    taskId: 'task_gate',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/approval',
    baseRef: 'main',
    state: 'awaiting_approval',
    createdBy: 'op',
    createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-07-01T00:00:00Z').toISOString(),
    ...overrides,
  };
}

function approval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: 'appr_1',
    taskId: 'task_gate',
    action: 'workspace.merge',
    riskTier: 'high',
    status: 'pending',
    requestedBy: 'agent_claude',
    reason: 'delivery is approval-gated',
    createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
    ...overrides,
  };
}

function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

/** Success envelope with a keyed approvals list. */
function approvalsList(records: ApprovalRecord[]): Response {
  return makeResponse({ body: { success: true, data: { approvals: records } } });
}

function mount(ws: Workspace, onChanged: () => void = () => undefined): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<ApprovalActions workspace={ws} onChanged={onChanged} />, c);
  });
  return c;
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function clickButtonByText(c: HTMLDivElement, text: string): void {
  const btn = Array.from(c.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === text,
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  act(() => {
    btn.click();
  });
}

beforeEach(() => {
  const realWindow = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
  realWindow.__RECODER_COCKPIT__ = { backendUrl: BACKEND_URL, token: 't' };
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
  const realWindow = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
  if (realWindow) delete realWindow.__RECODER_COCKPIT__;
  delete (globalThis as Record<string, unknown>).fetch;
});

describe('ApprovalActions inline approve/reject', () => {
  it('lists pending approvals for the workspace task with Approve/Reject actions', async () => {
    const fetchMock = vi.fn(async (_url: string) => approvalsList([approval()]));
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount(workspace());
    await flush(10);

    // The REAL filter hits the approvals API scoped to this task, pending only.
    const listCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/agent-os/approvals'),
    );
    expect(listCall).toBeTruthy();
    expect(String(listCall![0])).toContain('taskId=task_gate');
    expect(String(listCall![0])).toContain('status=pending');

    // The record renders truthfully: action, tier, requester, reason, actions.
    const row = c.querySelector('.approval-row');
    expect(row).toBeTruthy();
    expect(row?.textContent).toContain('workspace.merge');
    expect(row?.textContent).toContain('high');
    expect(row?.textContent).toContain('requested by agent_claude');
    expect(row?.textContent).toContain('delivery is approval-gated');
    const labels = Array.from(row!.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Approve', 'Reject']);
  });

  it('Approve POSTs the decide and shows the truthful retry note (+ onChanged)', async () => {
    const decideBodies: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/approvals/appr_1/decide')) {
        decideBodies.push(JSON.parse(String(init?.body)));
        return makeResponse({
          body: { success: true, data: { approval: { ...approval(), status: 'approved' } } },
        });
      }
      return approvalsList([approval()]);
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;
    const onChanged = vi.fn();

    const c = mount(workspace(), onChanged);
    await flush(10);

    clickButtonByText(c, 'Approve');
    await flush(10);

    // The real decide call carried the decision; the decider is server-side.
    expect(decideBodies).toEqual([{ decision: 'approved' }]);
    // Truthful outcome: approved, but the workspace only advances on retry.
    const decided = c.querySelector('.approval-row-decided');
    expect(decided).toBeTruthy();
    expect(decided?.textContent).toContain('approved');
    expect(decided?.textContent).toContain('retry the blocked action');
    expect(onChanged).toHaveBeenCalled();
    // No error surface on success.
    expect(c.querySelector('.approval-row-error')).toBeNull();
  });

  it('Reject POSTs decision denied and shows the truthful rejected note', async () => {
    const decideBodies: unknown[] = [];
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/approvals/appr_1/decide')) {
        decideBodies.push(JSON.parse(String(init?.body)));
        return makeResponse({
          body: { success: true, data: { approval: { ...approval(), status: 'denied' } } },
        });
      }
      return approvalsList([approval()]);
    });

    const c = mount(workspace());
    await flush(10);

    clickButtonByText(c, 'Reject');
    await flush(10);

    expect(decideBodies).toEqual([{ decision: 'denied' }]);
    const decided = c.querySelector('.approval-row-decided');
    expect(decided).toBeTruthy();
    expect(decided?.textContent).toContain('denied');
    expect(decided?.textContent).toContain('stays blocked');
  });

  it('reverts to actionable buttons with the REAL error when decide fails', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (String(url).endsWith('/decide')) {
        return makeResponse({
          status: 500,
          ok: false,
          body: { success: false, error: 'approval store unavailable' },
        });
      }
      return approvalsList([approval()]);
    });
    const onChanged = vi.fn();

    const c = mount(workspace(), onChanged);
    await flush(10);

    clickButtonByText(c, 'Approve');
    await flush(10);

    // No fake success: the failure is shown with the backend's real message…
    const error = c.querySelector('.approval-row-error');
    expect(error).toBeTruthy();
    expect(error?.textContent).toContain("Couldn't approve");
    expect(error?.textContent).toContain('approval store unavailable');
    expect(c.querySelector('.approval-row-decided')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
    // …and the row is actionable again (buttons re-enabled for a retry).
    const buttons = Array.from(c.querySelectorAll('.approval-row-actions button'));
    expect(buttons.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, false]);
  });

  it('shows the truthful empty state when no pending approval record exists', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => approvalsList([]));

    const c = mount(workspace());
    await flush(10);

    expect(c.querySelector('.approval-row')).toBeNull();
    const note = c.querySelector('.approval-actions-note');
    expect(note).toBeTruthy();
    expect(note?.textContent).toContain('No pending approval record');
  });

  it('does not leak a decided outcome across a workspace/task switch (same instance)', async () => {
    // Task A has appr_1 pending; task B has appr_2 pending. The same
    // ApprovalActions instance is reused when the operator switches workspaces.
    const apprB = approval({ id: 'appr_2', taskId: 'task_gate_b', action: 'workspace.push' });
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (String(url).endsWith('/approvals/appr_1/decide')) {
        return makeResponse({
          body: { success: true, data: { approval: { ...approval(), status: 'approved' } } },
        });
      }
      // The list is scoped by taskId — return the matching task's pending record.
      if (String(url).includes('taskId=task_gate_b')) return approvalsList([apprB]);
      return approvalsList([approval()]);
    });

    // Decide the approval on task A, then confirm the decided note renders.
    const c = mount(workspace());
    await flush(10);
    clickButtonByText(c, 'Approve');
    await flush(10);
    expect(c.querySelector('.approval-row-decided')).toBeTruthy();

    // Switch to workspace B (different task) on the SAME instance/container.
    act(() => {
      render(
        <ApprovalActions workspace={workspace({ workspaceId: 'ws-b', taskId: 'task_gate_b' })} onChanged={() => undefined} />,
        c,
      );
    });
    await flush(10);

    // The stale decided note from task A must be gone; only task B's pending row shows.
    expect(c.querySelector('.approval-row-decided')).toBeNull();
    const row = c.querySelector('.approval-row');
    expect(row?.textContent).toContain('workspace.push');
    expect(row?.textContent).not.toContain('workspace.merge');
  });

  it('surfaces the real error when the approvals list itself cannot be fetched', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      makeResponse({ status: 503, ok: false, body: { success: false, error: 'governance down' } }),
    );

    const c = mount(workspace());
    await flush(10);

    const error = c.querySelector('.approval-actions-error');
    expect(error).toBeTruthy();
    expect(error?.textContent).toContain('governance down');
    // The empty-state note is NOT shown while the list is unavailable — that
    // would falsely imply "nothing pending" when we genuinely don't know.
    expect(c.querySelector('.approval-actions-note')).toBeNull();
  });
});
