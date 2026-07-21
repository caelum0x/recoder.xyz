/**
 * Preview-verify fusion — proves the conductor turns "preview stored" into
 * "preview VERIFIED":
 *
 *  - FIRES the executor: the browser-use client's navigate → extract →
 *    screenshot ops are actually invoked on the workspace's stored preview URL,
 *    and a matching assertion passes;
 *  - ATTACHES evidence: the verification summary + evidence artifact ids are
 *    sealed into the governance audit chain (the recording gate captures them);
 *  - DEGRADES truthful: no browser-use client wired ⇒ a `skipped`, `degraded`
 *    outcome with the real reason, still audited — never a faked pass, never a
 *    thrown error;
 *  - GATED: a governance deny blocks the verification with the deny verdict and
 *    NO run/audit;
 *  - GUARDS inputs: a missing workspace, or a workspace with no stored preview
 *    URL, is a truthful `ok:false` with nothing run.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { EngineCall } from '../../engines/ports/engine-client.port.js';
import type { InvokeResult } from '../../engines/types.js';
import { createBrowserPreviewVerifier } from '../adapters/browser-preview-verify.adapter.js';
// The real engines executor, injected as the conductor `BrowserVerifyRunner` port.
import { executeBrowserVerification } from '../../engines/adapters/sidecar/browser-verification.executor.js';
import {
  verifyWorkspacePreview,
  PREVIEW_VERIFY_ACTION,
  type PreviewVerifyDeps,
} from './preview-verify.service.js';
import type { PreviewVerificationRecord } from '../ports/preview-verify.port.js';
import { makeGate, makePrincipal } from '../__fixtures__/harness.js';

const principal = makePrincipal();
const PREVIEW_URL = 'http://localhost:5173/';

/** A recording fake browser-use client — proves which sidecar ops the run fired. */
function makeBrowserClient(opts: { down?: boolean; pageText?: string } = {}): {
  client: EngineClientPort;
  ops: string[];
} {
  const ops: string[] = [];
  const client: EngineClientPort = {
    id: 'browser-use',
    transport: 'sidecar',
    async start() {},
    async stop() {},
    async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
      ops.push(call.op);
      if (opts.down) return { ok: false, reason: 'browser-use sidecar not supervised', code: 'unavailable' };
      const input = call.input as { url?: string };
      switch (call.op) {
        case 'navigate':
          return { ok: true, value: { url: input.url, title: 'Preview App' } };
        case 'extract':
          return { ok: true, value: { text: opts.pageText ?? '' } };
        case 'screenshot':
          return { ok: true, value: { imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA— fake png' } };
        default:
          return { ok: false, reason: `unexpected op ${call.op}` };
      }
    },
    async health() {
      return {
        engineId: 'browser-use',
        transport: 'sidecar',
        status: opts.down ? 'down' : 'up',
        ...(opts.down ? { reason: 'sidecar not supervised' } : {}),
        checkedAt: new Date().toISOString(),
      };
    },
  };
  return { client, ops };
}

/** A workspace whose preview URL was already stored via `setPreviewUrl`. */
function workspaceWithPreview(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    taskId: 'task_1',
    metadata: { previewUrl: PREVIEW_URL },
    ...overrides,
  } as unknown as Workspace;
}

function makeDeps(
  gate = makeGate(),
  client: EngineClientPort | null = makeBrowserClient({ pageText: 'Welcome to the Preview App' }).client,
  workspace: Workspace | null = workspaceWithPreview(),
): PreviewVerifyDeps {
  return {
    gate,
    verifier: createBrowserPreviewVerifier(client, executeBrowserVerification),
    getWorkspace: async () => workspace,
  };
}

describe('verifyWorkspacePreview — fusion fires', () => {
  it('runs navigate → extract → screenshot on the stored preview URL and passes a matching assertion', async () => {
    const { client, ops } = makeBrowserClient({ pageText: 'Welcome to the Preview App' });
    const gate = makeGate();
    const deps = makeDeps(gate, client);

    const result = await verifyWorkspacePreview(deps, 'ws_1', principal, {
      assertions: [{ expected: 'Preview App' }],
    });

    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe('passed');
    expect(result.value?.degraded).toBe(false);
    // The executor actually drove the sidecar surface on the stored URL.
    expect(ops).toEqual(['navigate', 'extract', 'screenshot']);
  });

  it('attaches the verification summary + evidence artifact ids into the governance audit chain', async () => {
    const gate = makeGate();
    const { client } = makeBrowserClient({ pageText: 'Welcome to the Preview App' });
    const result = await verifyWorkspacePreview(makeDeps(gate, client), 'ws_1', principal, {
      assertions: [{ expected: 'Preview App' }],
    });

    // A screenshot + a verification-summary artifact rode along as evidence.
    const kinds = result.value?.artifacts.map((a) => a.kind) ?? [];
    expect(kinds).toContain('screenshot');
    expect(kinds).toContain('verification_summary');

    // The gate sealed that evidence into the durable audit chain.
    const audit = gate.audits.find((entry) => entry.action === PREVIEW_VERIFY_ACTION);
    expect(audit).toBeDefined();
    expect(audit?.payload?.status).toBe('passed');
    expect(audit?.payload?.url).toBe(PREVIEW_URL);
    expect((audit?.payload?.artifactIds as string[]).length).toBeGreaterThan(0);
    expect(typeof audit?.payload?.summary).toBe('string');
  });

  it('fails (not skips) when the asserted text is absent but the page opened', async () => {
    const { client } = makeBrowserClient({ pageText: 'a different page' });
    const result = await verifyWorkspacePreview(makeDeps(makeGate(), client), 'ws_1', principal, {
      assertions: [{ expected: 'Preview App' }],
    });
    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe('failed');
    expect(result.value?.degraded).toBe(false);
  });
});

describe('verifyWorkspacePreview — truthful degrade', () => {
  it('skips (never fakes a pass) when the engine is down mid-run, still auditing', async () => {
    const gate = makeGate();
    const { client, ops } = makeBrowserClient({ down: true });
    const result = await verifyWorkspacePreview(makeDeps(gate, client), 'ws_1', principal, {
      assertions: [{ expected: 'Preview App' }],
    });
    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe('skipped');
    expect(result.value?.degraded).toBe(true);
    expect(result.value?.reason).toBeTruthy();
    expect(ops).toEqual(['navigate']); // stopped at the first engine-down op
    expect(gate.audits.some((e) => e.action === PREVIEW_VERIFY_ACTION && e.payload?.degraded === true)).toBe(true);
  });

  it('skips when no browser-use client is wired at all', async () => {
    const deps = makeDeps(makeGate(), null);
    const result = await verifyWorkspacePreview(deps, 'ws_1', principal);
    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe('skipped');
    expect(result.value?.degraded).toBe(true);
    expect(result.value?.reason).toMatch(/not wired/);
  });
});

describe('verifyWorkspacePreview — write-back seam', () => {
  /** A recording persist seam: captures each record + the audit count at call time. */
  function makePersist(gate: ReturnType<typeof makeGate>) {
    const calls: { workspaceId: string; record: PreviewVerificationRecord; auditsAtCall: number }[] = [];
    const persistVerification = async (workspaceId: string, record: PreviewVerificationRecord) => {
      calls.push({ workspaceId, record, auditsAtCall: gate.audits.length });
    };
    return { calls, persistVerification };
  }

  it('persists the compact summary AFTER recording the audit (passed run)', async () => {
    const gate = makeGate();
    const { client } = makeBrowserClient({ pageText: 'Welcome to the Preview App' });
    const { calls, persistVerification } = makePersist(gate);
    const deps: PreviewVerifyDeps = { ...makeDeps(gate, client), persistVerification };

    const result = await verifyWorkspacePreview(deps, 'ws_1', principal, {
      assertions: [{ expected: 'Preview App' }],
    });

    expect(result.value?.status).toBe('passed');
    // Called exactly once, for the right workspace, with the passed summary.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.workspaceId).toBe('ws_1');
    expect(calls[0]?.record.status).toBe('passed');
    expect(calls[0]?.record.degraded).toBe(false);
    expect(typeof calls[0]?.record.checkedAt).toBe('string');
    expect(typeof calls[0]?.record.summary).toBe('string');
    // The screenshot rode along as an opaque artifact id (never a fetchable image).
    expect(calls[0]?.record.screenshotArtifactId).toBeTruthy();
    // Ordering law: the audit was already sealed before the write-back ran.
    expect(calls[0]?.auditsAtCall).toBeGreaterThanOrEqual(1);
  });

  it('persists a truthful skipped(degraded) record with its reason (no fabricated pass)', async () => {
    const gate = makeGate();
    const { calls, persistVerification } = makePersist(gate);
    // A wired verifier whose browser-use client is null ⇒ skipped(degraded).
    const deps: PreviewVerifyDeps = { ...makeDeps(gate, null), persistVerification };

    const result = await verifyWorkspacePreview(deps, 'ws_1', principal);

    expect(result.value?.status).toBe('skipped');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.record.status).toBe('skipped');
    expect(calls[0]?.record.degraded).toBe(true);
    expect(calls[0]?.record.reason).toMatch(/not wired/);
    // A skip retained no screenshot artifact.
    expect(calls[0]?.record.screenshotArtifactId).toBeUndefined();
  });

  it('does NOT write back when governance denies (nothing ran)', async () => {
    const gate = makeGate('deny');
    const { calls, persistVerification } = makePersist(gate);
    const deps: PreviewVerifyDeps = { ...makeDeps(gate), persistVerification };

    const result = await verifyWorkspacePreview(deps, 'ws_1', principal);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('verifyWorkspacePreview — gate + input guards', () => {
  it('blocks the verification when governance denies (no run, no audit)', async () => {
    const gate = makeGate('deny');
    const { client, ops } = makeBrowserClient({ pageText: 'Preview App' });
    const result = await verifyWorkspacePreview(makeDeps(gate, client), 'ws_1', principal);
    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect(ops).toEqual([]);
    expect(gate.audits).toHaveLength(0);
  });

  it('is a truthful failure when the workspace has no stored preview URL', async () => {
    const workspace = workspaceWithPreview({ metadata: {} });
    const result = await verifyWorkspacePreview(
      makeDeps(makeGate(), makeBrowserClient().client, workspace),
      'ws_1',
      principal,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no preview url stored/);
  });

  it('is a truthful failure when the workspace is not found', async () => {
    const result = await verifyWorkspacePreview(
      makeDeps(makeGate(), makeBrowserClient().client, null),
      'ws_missing',
      principal,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });
});
