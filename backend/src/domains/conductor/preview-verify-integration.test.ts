/**
 * Preview-verify INTEGRATION — proves the activated seam (a) end to end through
 * the REAL `createBrowserPreviewVerifier` + executor (not the stub-level wiring
 * proof in `preview-verify-wiring.test.ts`, nor the isolated service proof in
 * `services/preview-verify.service.test.ts`). This file locks the C5 behaviours:
 *
 *  1. DEFAULT-ON FIRE + EVIDENCE: `setPreviewUrl` fires ONE real verify over the
 *     browser-use client and SEALS the `verification_summary` + `screenshot`
 *     artifact ids into the `workspace.preview_verify` audit entry;
 *  2. DOUBLE-GATE: `setPreviewUrl` passes `workspace.preview_url`, but the auto-
 *     fire independently crosses `workspace.preview_verify` — a deny there skips
 *     the verify (the browser is never driven) yet NEVER fails the url persist;
 *  3. DEGRADE: a null-driver verifier (`createBrowserPreviewVerifier(null)`) and a
 *     workspace with no stored preview url each yield a truthful skip / `ok:false`
 *     with the real reason and NO evidence artifact — never a fabricated pass, the
 *     run/persist unaffected;
 *  4. FAULT ISOLATION: a throwing/never-settling verifier never fails the persist;
 *  5. BOUNDED DEADLINE (fix #2): a hung navigate — driven through the REAL
 *     `BrowserUseAdapter` over a never-settling driver — is aborted at the
 *     deadline, resolving to a truthful `skipped(degraded)` WITHIN the window; the
 *     fire-and-forget path never stalls the caller.
 */
import { describe, it, expect } from 'vitest';
import type { BrowserDriver } from '@recoder/agent-browser';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../shared/logger.js';
import type { EngineClientPort, EngineCall } from '../engines/ports/engine-client.port.js';
import type { InvokeResult, EngineHealth } from '../engines/types.js';
import { down } from '../engines/types.js';
import { enginesConfigSchema, type EnginesConfig } from '../engines/config.js';
import type {
  PreflightResult,
  SidecarHandle,
  SidecarSpec,
  SidecarSupervisorPort,
} from '../engines/ports/sidecar-supervisor.port.js';
import { BrowserUseAdapter } from '../engines/adapters/sidecar/browser-use.adapter.js';
import type { GovernanceEffect } from '../governance/types.js';
import type { AuditEntryInput, GateVerdict } from './ports/index.js';
import type {
  PreviewVerification,
  PreviewVerifyPort,
  PreviewVerifyRequest,
} from './ports/preview-verify.port.js';
import { createBrowserPreviewVerifier } from './adapters/browser-preview-verify.adapter.js';
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

/** A recording fake browser-use client — proves which sidecar ops the run fired. */
function makeBrowserClient(pageText: string): { client: EngineClientPort; ops: string[] } {
  const ops: string[] = [];
  const client: EngineClientPort = {
    id: 'browser-use',
    transport: 'sidecar',
    async start() {},
    async stop() {},
    async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
      ops.push(call.op);
      const input = call.input as { url?: string };
      switch (call.op) {
        case 'navigate':
          return { ok: true, value: { url: input.url, title: 'Preview App' } };
        case 'extract':
          return { ok: true, value: { text: pageText } };
        case 'screenshot':
          return { ok: true, value: { imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA— fake png' } };
        default:
          return { ok: false, reason: `unexpected op ${call.op}` };
      }
    },
    async health() {
      return { engineId: 'browser-use', transport: 'sidecar', status: 'up', checkedAt: new Date().toISOString() };
    },
  };
  return { client, ops };
}

/**
 * A per-action governance gate: `allow` everything EXCEPT the actions in
 * `denyActions`. Lets the double-gate test allow `workspace.preview_url` yet deny
 * `workspace.preview_verify` — records every audit like the harness gate.
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
      /* selective gate is action-driven; a global setEffect is a no-op here */
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

const previewVerifyAudit = (gate: FakeGate) =>
  gate.audits.find((entry) => entry.action === PREVIEW_VERIFY_ACTION);

describe('conductor preview-verify integration — default-on auto-fire seals evidence', () => {
  it('setPreviewUrl records ONE real verify and seals summary + screenshot artifact ids to the preview_verify audit', async () => {
    const gate = makeGate();
    const { client, ops } = makeBrowserClient('Welcome to the Preview App');
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      previewVerify: createBrowserPreviewVerifier(client, executeBrowserVerification),
      gate,
    });
    const workspace = await createRunningWorkspace(module);

    // The persist is awaited + truthful; the verify is a fire-and-forget side effect.
    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    expect(result.ok).toBe(true);
    expect(result.value?.metadata?.previewUrl).toBe(NORMALIZED_URL);

    // The auto-fire drove the real chain ONCE. It carries no assertions (the
    // freshest-url fire just proves reachability + evidence), so `extract` is
    // skipped — it navigates then captures the screenshot artifact.
    await waitFor(() => Boolean(previewVerifyAudit(gate)));
    expect(ops).toEqual(['navigate', 'screenshot']);

    // The evidence (summary + screenshot artifact ids) landed in the durable chain.
    const audit = previewVerifyAudit(gate);
    expect(audit).toBeDefined();
    expect(audit?.payload?.status).toBe('passed');
    expect(audit?.payload?.url).toBe(NORMALIZED_URL);
    expect((audit?.payload?.artifactIds as string[]).length).toBeGreaterThan(0);
    expect(typeof audit?.payload?.summary).toBe('string');
  });
});

describe('conductor preview-verify integration — double-gate no-op', () => {
  it('preview_url ALLOW + preview_verify DENY: url persists, the browser is never driven, no passed audit', async () => {
    const gate = makeSelectiveGate([PREVIEW_VERIFY_ACTION]);
    const { client, ops } = makeBrowserClient('Welcome to the Preview App');
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      previewVerify: createBrowserPreviewVerifier(client, executeBrowserVerification),
      gate,
    });
    const workspace = await createRunningWorkspace(module);

    // The preview_url gate ALLOWS → the persist succeeds with the URL written.
    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    expect(result.ok).toBe(true);
    expect(result.value?.metadata?.previewUrl).toBe(NORMALIZED_URL);

    // The independent preview_verify gate DENIES → the auto-fire is a truthful
    // no-op: the browser was never driven and no passed audit exists.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ops).toEqual([]);
    expect(
      gate.audits.some((e) => e.action === PREVIEW_VERIFY_ACTION && e.payload?.status === 'passed'),
    ).toBe(false);

    // The explicit path is likewise a truthful deny — blocked, nothing driven.
    const explicit = await module.verifyPreview(workspace.workspaceId, principal);
    expect(explicit.ok).toBe(false);
    expect(explicit.verdict.effect).toBe('deny');
    expect(ops).toEqual([]);
  });
});

describe('conductor preview-verify integration — truthful degrade', () => {
  it('null-driver verifier still FIRES + seals a skipped(degraded) audit with the real reason (no artifact)', async () => {
    const gate = makeGate();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      // A WIRED verifier whose browser-use client is null — distinct from "no
      // verifier at all": the auto-fire runs its gate and seals a truthful skip.
      previewVerify: createBrowserPreviewVerifier(null),
      gate,
    });
    const workspace = await createRunningWorkspace(module);

    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    expect(result.ok).toBe(true); // the persist is unaffected by the degraded verify

    await waitFor(() => Boolean(previewVerifyAudit(gate)));
    const audit = previewVerifyAudit(gate);
    expect(audit?.payload?.status).toBe('skipped');
    expect(audit?.payload?.degraded).toBe(true);
    expect(String(audit?.payload?.reason)).toMatch(/not wired/);
    expect((audit?.payload?.artifactIds as string[]).length).toBe(0);

    // The awaited twin is equally truthful — skipped, degraded, no evidence.
    const explicit = await module.verifyPreview(workspace.workspaceId, principal);
    expect(explicit.ok).toBe(true);
    expect(explicit.value?.status).toBe('skipped');
    expect(explicit.value?.degraded).toBe(true);
    expect(explicit.value?.artifacts).toHaveLength(0);
  });

  it('a workspace with no stored preview url is a truthful ok:false — never a fabricated pass', async () => {
    const gate = makeGate();
    const { client, ops } = makeBrowserClient('Welcome to the Preview App');
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      previewVerify: createBrowserPreviewVerifier(client, executeBrowserVerification),
      gate,
    });
    // A workspace whose preview url was NEVER set (no setPreviewUrl call).
    const workspace = await createRunningWorkspace(module);

    const explicit = await module.verifyPreview(workspace.workspaceId, principal);
    expect(explicit.ok).toBe(false);
    expect(explicit.reason).toMatch(/no preview url stored/);
    expect(ops).toEqual([]); // nothing was driven — no faked verdict
    expect(previewVerifyAudit(gate)).toBeUndefined();
  });
});

describe('conductor preview-verify integration — fault isolation', () => {
  it('a throwing verifier never fails the persist (the fault is swallowed)', async () => {
    const throwingVerifier: PreviewVerifyPort = {
      async verify(_request: PreviewVerifyRequest): Promise<PreviewVerification> {
        throw new Error('verifier blew up');
      },
    };
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      previewVerify: throwingVerifier,
    });
    const workspace = await createRunningWorkspace(module);

    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    expect(result.ok).toBe(true);
    expect(result.value?.metadata?.previewUrl).toBe(NORMALIZED_URL);
    // Let the swallowed rejection settle — no unhandled rejection, persist intact.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

// --- bounded deadline (fix #2), end to end through the REAL BrowserUseAdapter ---

const adapterLog = { warn() {}, info() {}, debug() {}, error() {}, child: () => adapterLog } as unknown as Logger;

function enginesConfig(): EnginesConfig {
  return enginesConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    repoRoot: null,
    palRootDir: null,
    napiPaths: { openfang: null, tensorzero: null, governance: null },
    daemonBins: { colbert: null, 'ops-recorder': null, multica: null, ziti: null, 'tensorzero-loopback': null },
    externalUrls: {
      colbert: null,
      'ops-recorder': null,
      multica: null,
      ziti: null,
      'tensorzero-loopback': null,
      mem0: null,
      'browser-use': null,
    },
    sidecarPython: { mem0: null, 'browser-use': null, 'pal-mcp': null },
    enabled: {},
    napiFirst: true,
  });
}

/** A supervisor that never spawns and always reports the engine down. */
const deadSupervisor: SidecarSupervisorPort = {
  async preflight(): Promise<PreflightResult> {
    return { ok: false, reason: 'venv absent' };
  },
  async ensureStarted(): Promise<SidecarHandle | null> {
    return null;
  },
  async stop(): Promise<void> {},
  handle(): SidecarHandle | null {
    return null;
  },
  async health(spec: SidecarSpec): Promise<EngineHealth> {
    return down(spec.engineId as never, 'sidecar', 'venv absent');
  },
  async stopAll(): Promise<void> {},
};

/** A driver whose navigate never settles — the hung-page / wedged-preview shape. */
const hangingDriver: BrowserDriver = {
  kind: 'test-hang',
  navigate: () => new Promise<never>(() => {}),
  extractText: () => new Promise<never>(() => {}),
  screenshot: () => new Promise<never>(() => {}),
};

describe('conductor preview-verify integration — bounded deadline (fix #2)', () => {
  it('a hung navigate is aborted at the deadline: verifyPreview resolves skipped(degraded) WITHIN the window', async () => {
    // The REAL adapter honours call.timeoutMs (C1) → the executor classifies the
    // `timeout` code as a degraded skip → the service seals it. Nothing hangs.
    const adapter = new BrowserUseAdapter({
      supervisor: deadSupervisor,
      config: enginesConfig(),
      log: adapterLog,
      driver: hangingDriver,
      env: {},
    });
    const gate = makeGate();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      previewVerify: createBrowserPreviewVerifier(adapter, executeBrowserVerification),
      gate,
    });
    const workspace = await createRunningWorkspace(module);
    await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);

    const started = Date.now();
    const result = await module.verifyPreview(workspace.workspaceId, principal, { timeoutMs: 40 });
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe('skipped'); // a hung page proved nothing
    expect(result.value?.degraded).toBe(true);
    expect(String(result.value?.reason)).toMatch(/deadline|exceeded/i);
    // Bounded: the caller is unblocked well within a test-safe window, never hangs.
    expect(elapsed).toBeLessThan(2000);
  });

  it('the fire-and-forget auto-verify never stalls the setPreviewUrl persist', async () => {
    // A verify that never settles (a wedged preview) must not touch the persist.
    const neverSettles: PreviewVerifyPort = {
      verify: () => new Promise<PreviewVerification>(() => {}),
    };
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      previewVerify: neverSettles,
    });
    const workspace = await createRunningWorkspace(module);

    const started = Date.now();
    const result = await module.setPreviewUrl(workspace.workspaceId, LOOPBACK_URL, principal);
    // The persist returns immediately even though the verify never resolves.
    expect(result.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
