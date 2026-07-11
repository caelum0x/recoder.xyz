// @vitest-environment jsdom
/**
 * GovernancePanel audit trail — the panel surfaces the REAL Merkle chain from
 * GET /governance/audit: a verified badge (genuine full-chain check) + the
 * sealed entries. Truthful degraded states: a broken chain reads CHAIN BROKEN,
 * an unreachable backend reads unavailable — never a fabricated green.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { GovernancePanel } from './GovernancePanel';

let container: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<GovernancePanel />, c);
  });
  return c;
}

async function flush(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const ENTRY = {
  seq: 4,
  timestamp: '2026-07-11T00:00:00.000Z',
  actor: 'conductor:claude_code',
  action: 'decision.made',
  detail: 'merge ws_abc — tier high',
  outcome: 'needs_approval',
  prevHash: 'a'.repeat(64),
  hash: 'b'.repeat(64),
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/governance/audit')) {
        return jsonResponse({
          verified: { ok: true, tipHash: 'b'.repeat(64), entries: 5 },
          entries: [ENTRY],
        });
      }
      if (u.includes('/workspaces')) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (container) {
    render(null, container);
    container.remove();
    container = null;
  }
});

describe('GovernancePanel audit trail', () => {
  it('renders the chain-verified badge and the sealed entries', async () => {
    const c = mount();
    await flush();
    expect(c.textContent).toContain('chain verified');
    expect(c.textContent).toContain('5 entries');
    expect(c.textContent).toContain('decision.made');
    expect(c.textContent).toContain('needs_approval');
    expect(c.textContent).toContain('merge ws_abc — tier high');
  });

  it('a broken chain is shown truthfully as CHAIN BROKEN', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/governance/audit')) {
        return jsonResponse({
          verified: { ok: false, brokenAtSeq: 2, entries: 5 },
          entries: [ENTRY],
        });
      }
      return jsonResponse([]);
    });
    const c = mount();
    await flush();
    expect(c.textContent).toContain('CHAIN BROKEN at seq 2');
  });

  it('an unreachable audit endpoint reads unavailable (no fake green)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/governance/audit')) throw new TypeError('fetch failed');
      return jsonResponse([]);
    });
    const c = mount();
    await flush();
    expect(c.textContent).toContain('audit unavailable');
    expect(c.textContent).not.toContain('chain verified');
  });
});
