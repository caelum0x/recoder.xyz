/**
 * Preview-verify WIRING — proves the conductor module actually FIRES the (until
 * now dark) preview verification on the run lifecycle, not just that the service
 * works in isolation (that is `services/preview-verify.service.test.ts`):
 *
 *  - AUTO-FIRE: `setPreviewUrl` persists the URL AND fires a fire-and-forget
 *    verification of it — bounded-deadline, never awaited, never able to stall or
 *    fail the persist (a verify that never settles, or throws, leaves the persist
 *    a truthful `ok:true`);
 *  - EXPLICIT: `verifyPreview` runs the real navigate → assert → screenshot chain
 *    through the browser-use client and SEALS the summary + screenshot artifact
 *    ids into the governance audit chain;
 *  - DEGRADE-TRUTHFUL: no verifier wired ⇒ `verifyPreview` is a truthful
 *    `skipped(degraded)` and `setPreviewUrl` never fires an auto-verify (no
 *    preview_verify audit) — never a faked pass, never a block;
 *  - DOUBLE-GATE: `setPreviewUrl` passes the `workspace.preview_url` gate, but the
 *    auto-fire independently crosses `workspace.preview_verify`; a deny there is a
 *    truthful no-op — logged, never a block on the already-succeeded persist, and
 *    no verification is run.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import type { EngineClientPort, EngineCall } from '../engines/ports/engine-client.port.js';
import type { InvokeResult } from '../engines/types.js';
import type { GovernanceEffect } from '../governance/types.js';
import type {
  AuditEntryInput,
  GateVerdict,
  GovernanceGatePort,
} from './ports/index.js';
import type {
  PreviewVerification,
  PreviewVerifyPort,
  PreviewVerifyRequest,
} from './ports/preview-verify.port.js';
import { createBrowserPreviewVerifier, DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS } from './adapters/browser-preview-verify.adapter.js';
// The real engines executor, injected as the conductor `BrowserVerifyRunner` port.
import { executeBrowserVerification } from '../engines/adapters/sidecar/browser-verification.executor.js';
import { PREVIEW_VERIFY_ACTION } from './services/preview-verify.service.js';
import {
  composeConductor,
  makeCreateInput,
  makeGate,
  makePrincipal,
  FakeSubstrate,
  type FakeGate,
} from './__fixtures__/harness.js';

const principal = makePrincipal();
const LOOPBACK_URL = 'http://127.0.0.1:5173/';
const NORMALIZED_URL = 'http://localhost:5173/';

/** Spin the event loop until `cond` holds (the fire-and-forget chain resolves). */
async function waitFor(cond: () => boolean, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** A recording stub {@link PreviewVerifyPort} — proves whether/what the module fired. */
function makeStubVerifier(
  behavior: (request: PreviewVerifyRequest) => Promise<PreviewVerification> = async () => ({
    status: 'passed',
    degraded: false,
    summary: 'stub passed',
    checks: [],
    artifacts: [],
  }),
): { verifier: PreviewVerifyPort; calls: PreviewVerifyRequest[] } {
  const calls: PreviewVerifyRequest[] = [];
  return {
    calls,
    verifier: {
      async verify(request) {
        calls.push(request);
        return behavior(request);
      },
    },
  };
}

/** A recording fake browser-use client (mirrors the service test's sidecar fake). */
function makeBrowserClient(pageText: string): EngineClientPort {
  return {
    id: 'browser-use',
    transport: 'sidecar',
    async start() {},
    async stop() {},
    async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
      const input = call.input as { url?: string };
      switch (call.op) {
        case 'navigate':
          return { ok: true, value: { url: input.url, title: 'Preview App' } };
        case 'extract':
          return { ok: true, value: { text: pageText } };
        case 'screenshot':
          return { ok: true, value: { imageBase64: 'iVBORw0KGgo— fake png' } };
        default:
          return { ok: false, reason: `unexpected op ${call.op}` };
      }
    },
    async health() {
      return { engineId: 'browser-use', transport: 'sidecar', status: 'up', checkedAt: new Date().toISOString() };
    },
  };
}

/**
 * A per-action governance gate: `allow` for everything EXCEPT the actions in
 * `denyActions`. Mirrors the harness `makeGate` shape (records every audit) so the
 * double-gate test can allow `workspace.preview_url` yet deny `preview_verify`.
 */
function makeSelectiveGate(denyActions: readonly string[]): FakeGate {
  const audits: AuditEntryInput[] = [];
  const decisions: string[] = [];
  const effectFor = (action: string): GovernanceEffect =>
    denyActions.includes(action) ? 'deny' : 'allow';
  const verdict = (action: string): GateVerdict => {
    const effect = effectFor(action);
    return {
      verdictId: `verdict_${action}`,
      requestId: `req_${action}`,
      effect,
      tier: 'low',
      reason: effect === 'allow' ? 'allowed' : `${effect} by policy`,
      degraded: false,
      engine: 'ts',
      createdAt: new Date().toISOString(),
    };
  };
  return {
    audits,
    decisions,
    setEffect() {
      /* selective gate is action-driven; global setEffect is a no-op here */
    },
    async decide(action) {
      decisions.push(action);
      return verdict(action);
    },
    async enforceTool() {
      return { outcome: 'allowed', reason: 'x', degraded: false, engine: 'ts' };
    },
    async route(action) {
      return { routable: true, tier: 'low', reason: 'x', target: action };
    },
    async recordAudit(entry) {
      audits.push(entry);
      return {
        id: `audit_${audits.length}`,
        seq: audits.length,
        prevHash: '0'.repeat(64),
        entryHash: 'h'.repeat(64),
        actorId: entry.actorId,
        action: entry.action,
        resource: entry.resource,
        effect: entry.effect,
        riskTier: entry.riskTier,
        degraded: entry.degraded,
        payload: entry.payload,
        createdAt: new Date().toISOString(),
      };
    },
    async verifyAudit() {
      return { ok: true, entries: audits.length, tipHash: 'h'.repeat(64) };
    },
  } as unknown as FakeGate;
}

async function createRunningWorkspace(
  module: ReturnType<typeof composeConductor>['module'],
): Promise<Workspace> {
  const created = await module.createWorkspace(makeCreateInput() as never, principal);
  expect(created.ok).toBe(true);
  return created.value!;
}

describe('conductor preview-verify wiring — auto-fire on setPreviewUrl', () => {
  it('fires the verifier fire-and-forget with a bounded deadline after the persist', async () => {
    const { verifier, calls } = makeStubVerifier();
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], previewVerify: verifier });
    const workspace = await createRunningWorkspace(module);

    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    // The persist is awaited + truthful; the verify is a side effect that does not
    // gate the return.
    expect(result.ok).toBe(true);
    expect(result.value?.metadata?.previewUrl).toBe(NORMALIZED_URL);

    await waitFor(() => calls.length === 1);
    expect(calls).toHaveLength(1);
    // It verified the just-persisted (normalized) URL, and passed a bounded deadline.
    expect(calls[0]?.url).toBe(NORMALIZED_URL);
    expect(calls[0]?.timeoutMs).toBe(DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS);
  });

  it('never stalls or fails the persist when the verify never settles', async () => {
    // A verify that hangs forever (a wedged preview) must not touch the persist.
    const { verifier, calls } = makeStubVerifier(() => new Promise<PreviewVerification>(() => {}));
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], previewVerify: verifier });
    const workspace = await createRunningWorkspace(module);

    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    expect(result.ok).toBe(true);
    // The verify WAS dispatched (fire-and-forget), it simply never resolves.
    await waitFor(() => calls.length === 1);
    expect(calls).toHaveLength(1);
  });

  it('a throwing verify never fails the persist (fault is swallowed)', async () => {
    const { verifier, calls } = makeStubVerifier(() => {
      throw new Error('verifier blew up');
    });
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], previewVerify: verifier });
    const workspace = await createRunningWorkspace(module);

    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    expect(result.ok).toBe(true);
    expect(result.value?.metadata?.previewUrl).toBe(NORMALIZED_URL);
    // Let the swallowed rejection settle — no unhandled rejection, persist intact.
    await waitFor(() => calls.length === 1);
  });

  it('does NOT fire an auto-verify when no verifier is wired (no preview_verify audit)', async () => {
    const { module, gate } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);

    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    expect(result.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gate.audits.some((e) => e.action === PREVIEW_VERIFY_ACTION)).toBe(false);
  });
});

describe('conductor preview-verify wiring — explicit verifyPreview', () => {
  it('runs the real navigate→assert→screenshot chain and seals evidence artifact ids', async () => {
    const gate: FakeGate = makeGate();
    const verifier = createBrowserPreviewVerifier(makeBrowserClient('Welcome to the Preview App'), executeBrowserVerification);
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], previewVerify: verifier, gate });
    const workspace = await createRunningWorkspace(module);
    await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);

    const result = await module.verifyPreview(workspace.workspaceId, principal, {
      assertions: [{ expected: 'Preview App' }],
    });

    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe('passed');
    expect(result.value?.degraded).toBe(false);
    const kinds = result.value?.artifacts.map((a) => a.kind) ?? [];
    expect(kinds).toContain('screenshot');
    expect(kinds).toContain('verification_summary');

    // Evidence sealed into the durable audit chain.
    const audit = gate.audits.find((e) => e.action === PREVIEW_VERIFY_ACTION);
    expect(audit).toBeDefined();
    expect(audit?.payload?.status).toBe('passed');
    expect((audit?.payload?.artifactIds as string[]).length).toBeGreaterThan(0);
  });

  it('degrades truthful (skipped) when no verifier is wired at all', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);
    await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);

    const result = await module.verifyPreview(workspace.workspaceId, principal);
    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe('skipped');
    expect(result.value?.degraded).toBe(true);
    expect(result.value?.reason).toMatch(/not wired/);
  });
});

describe('conductor preview-verify wiring — double-gate no-op', () => {
  it('setPreviewUrl succeeds while a preview_verify deny is a logged no-op (nothing run)', async () => {
    const gate = makeSelectiveGate([PREVIEW_VERIFY_ACTION]);
    const { verifier, calls } = makeStubVerifier();
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], previewVerify: verifier, gate });
    const workspace = await createRunningWorkspace(module);

    // The preview_url gate ALLOWS: the persist succeeds with the URL written.
    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    expect(result.ok).toBe(true);
    expect(result.value?.metadata?.previewUrl).toBe(NORMALIZED_URL);

    // The independent preview_verify gate DENIES: the auto-fire is a truthful
    // no-op — the verifier never ran and no passed preview_verify audit exists.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(0);
    expect(
      gate.audits.some((e) => e.action === PREVIEW_VERIFY_ACTION && e.payload?.status === 'passed'),
    ).toBe(false);

    // The explicit path is likewise a truthful deny — blocked, no run.
    const explicit = await module.verifyPreview(workspace.workspaceId, principal);
    expect(explicit.ok).toBe(false);
    expect(explicit.verdict.effect).toBe('deny');
    expect(calls).toHaveLength(0);
  });
});
