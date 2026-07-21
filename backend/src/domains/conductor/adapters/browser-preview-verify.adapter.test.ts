/**
 * Browser preview verifier — proves the V2 consumer-owned-port wiring:
 *
 *  - INJECTED RUNNER: with a client + the injected `BrowserVerifyRunner` the
 *    verifier delegates to the runner and maps its `BrowserVerificationRun` onto
 *    the lean `PreviewVerification` outcome — the same runtime call as the old
 *    direct executor import, now injected;
 *  - DEGRADE (no client): a null client is a truthful `skipped(degraded)` with the
 *    real reason — never a faked pass, never a call into the runner;
 *  - DEGRADE (no runner): an absent runner (the conductor-module null fallback,
 *    `createBrowserPreviewVerifier(null)`) is the same truthful skip — the conductor
 *    holds no value edge into the engines executor.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type {
  BrowserVerificationRun,
  BrowserVerifyRequest,
} from '../../engines/adapters/sidecar/browser-verification.executor.js';
import type { BrowserVerifyRunner } from '../ports/browser-verify.port.js';
import { createBrowserPreviewVerifier } from './browser-preview-verify.adapter.js';

/** A minimal client stand-in — never invoked when the runner is the seam. */
const CLIENT = { id: 'browser-use', transport: 'sidecar' } as unknown as EngineClientPort;

/** A runner that returns a passed run over a single opened check. */
function passingRunner(): BrowserVerifyRunner {
  return async (_client, request: BrowserVerifyRequest): Promise<BrowserVerificationRun> => ({
    result: {
      planId: 'plan_1',
      taskId: request.taskId ?? 'adhoc',
      status: 'passed',
      checks: [
        { tool: 'recoder.browser.open_preview', status: 'passed', target: request.url, message: 'ok' },
      ],
      artifacts: [
        { artifactId: 'sum_1', taskId: 'adhoc', kind: 'verification_summary', summary: 'all good' },
      ],
    } as unknown as BrowserVerificationRun['result'],
    degraded: false,
  });
}

describe('createBrowserPreviewVerifier — injected runner', () => {
  it('delegates to the injected runner and maps the outcome', async () => {
    const runner = vi.fn(passingRunner());
    const verifier = createBrowserPreviewVerifier(CLIENT, runner);

    const out = await verifier.verify({ workspaceId: 'ws_1', url: 'http://127.0.0.1:5173/' });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(out.status).toBe('passed');
    expect(out.degraded).toBe(false);
    expect(out.summary).toBe('all good');
  });
});

describe('createBrowserPreviewVerifier — degrade-truthful', () => {
  it('skips (degraded) with a null client, never calling the runner', async () => {
    const runner = vi.fn(passingRunner());
    const verifier = createBrowserPreviewVerifier(null, runner);

    const out = await verifier.verify({ workspaceId: 'ws_1', url: 'http://x/' });

    expect(runner).not.toHaveBeenCalled();
    expect(out.status).toBe('skipped');
    expect(out.degraded).toBe(true);
    expect(out.reason).toMatch(/not wired/);
  });

  it('skips (degraded) when the runner is absent (the conductor-module null fallback)', async () => {
    const verifier = createBrowserPreviewVerifier(null);
    const out = await verifier.verify({ workspaceId: 'ws_1', url: 'http://x/' });
    expect(out.status).toBe('skipped');
    expect(out.degraded).toBe(true);
  });
});
