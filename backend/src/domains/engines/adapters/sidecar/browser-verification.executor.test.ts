/**
 * Verification-executor tests: verify = navigate + assert + evidence snapshot
 * artifact, summarized through `@recoder/browser-verification`. The hard law
 * under test: a run whose engine is down proves NOTHING (`skipped` + degraded),
 * a reachable-but-wrong page fails truthfully, and a passing run carries a
 * screenshot artifact + a verification-summary artifact.
 */
import { describe, it, expect } from 'vitest';
import type { EngineCall, EngineClientPort } from '../../ports/engine-client.port.js';
import { fail, ok, up, type InvokeResult } from '../../types.js';
import { executeBrowserVerification } from './browser-verification.executor.js';

type OpHandler = (input: Record<string, unknown>) => InvokeResult<unknown>;

/** A mock browser-use client routing each engine op to a canned result. */
function fakeClient(handlers: Partial<Record<'navigate' | 'extract' | 'screenshot', OpHandler>>): EngineClientPort {
  return {
    id: 'browser-use',
    transport: 'sidecar',
    async start() {},
    async stop() {},
    async invoke(call: EngineCall<unknown>) {
      const handler = handlers[call.op as 'navigate' | 'extract' | 'screenshot'];
      if (!handler) return fail(`no handler for op '${call.op}'`);
      return handler((call.input ?? {}) as Record<string, unknown>);
    },
    async health() {
      return up('browser-use', 'sidecar');
    },
  };
}

const healthySidecar = fakeClient({
  navigate: (input) => ok({ status: 'ok', url: String(input.url), title: 'Example', driver: 'http' }),
  extract: () => ok({ status: 'ok', text: 'Welcome to Example — deploy succeeded', driver: 'http' }),
  screenshot: () => ok({ status: 'ok', imageBase64: 'aGVsbG8=', driver: 'http' }),
});

describe('executeBrowserVerification (happy path over a mocked sidecar)', () => {
  it('passes when the expected text is on the page, with screenshot + summary artifacts', async () => {
    const run = await executeBrowserVerification(healthySidecar, {
      url: 'https://example.com',
      taskId: 'task-1',
      assertions: [{ expected: 'deploy succeeded' }],
    });

    expect(run.degraded).toBe(false);
    expect(run.result.status).toBe('passed');
    expect(run.result.taskId).toBe('task-1');
    expect(run.result.checks.map((check) => [check.tool, check.status])).toEqual([
      ['recoder.browser.open_preview', 'passed'],
      ['recoder.browser.assert_text', 'passed'],
      ['recoder.browser.screenshot', 'passed'],
    ]);
    const kinds = run.result.artifacts.map((artifact) => artifact.kind);
    expect(kinds).toContain('screenshot');
    expect(kinds).toContain('verification_summary');
    const shot = run.result.artifacts.find((artifact) => artifact.kind === 'screenshot');
    expect(shot?.metadata?.imageBase64).toBe('aGVsbG8=');
    // The screenshot check cites the evidence artifact it produced.
    const shotCheck = run.result.checks.find((check) => check.tool === 'recoder.browser.screenshot');
    expect(shotCheck?.artifactIds).toEqual([shot?.artifactId]);
  });

  it('fails truthfully when the expected text is absent (page reachable, assertion wrong)', async () => {
    const run = await executeBrowserVerification(healthySidecar, {
      url: 'https://example.com',
      assertions: [{ expected: 'text that is not there' }],
    });
    expect(run.result.status).toBe('failed');
    const assertCheck = run.result.checks.find((check) => check.tool === 'recoder.browser.assert_text');
    expect(assertCheck?.status).toBe('failed');
    expect(assertCheck?.actual).toContain('Welcome to Example');
  });

  it('never flips a passing verification because evidence capture returned no image', async () => {
    const noImage = fakeClient({
      navigate: () => ok({ status: 'ok', url: 'https://example.com/' }),
      extract: () => ok({ status: 'ok', text: 'deploy succeeded' }),
      screenshot: () => ok({ status: 'ok' }), // heavy op omitted by the driver
    });
    const run = await executeBrowserVerification(noImage, {
      url: 'https://example.com',
      assertions: [{ expected: 'deploy succeeded' }],
    });
    expect(run.result.status).toBe('passed');
    const shotCheck = run.result.checks.find((check) => check.tool === 'recoder.browser.screenshot');
    expect(shotCheck?.status).toBe('skipped');
    expect(run.result.artifacts.map((artifact) => artifact.kind)).toEqual(['verification_summary']);
  });
});

describe('executeBrowserVerification (truthful degrade)', () => {
  it('reports skipped + degraded when the sidecar is down — never a fake verdict', async () => {
    const downClient = fakeClient({
      navigate: () => fail('no BROWSER_USE_URL sidecar and puppeteer not installed', 'unavailable'),
    });
    const run = await executeBrowserVerification(downClient, {
      url: 'https://example.com',
      assertions: [{ expected: 'deploy succeeded' }],
    });

    expect(run.degraded).toBe(true);
    expect(run.reason).toContain('puppeteer not installed');
    expect(run.result.status).toBe('skipped');
    expect(run.result.checks.every((check) => check.status === 'skipped')).toBe(true);
    const summary = run.result.artifacts.find((artifact) => artifact.kind === 'verification_summary');
    expect(summary?.metadata?.degraded).toBe(true);
  });

  it('marks an OPERATIONAL navigation failure as failed (not degraded)', async () => {
    const brokenPage = fakeClient({
      navigate: () => fail('net::ERR_CONNECTION_REFUSED', 'browser_error'),
    });
    const run = await executeBrowserVerification(brokenPage, { url: 'https://example.com' });
    expect(run.degraded).toBe(false);
    expect(run.result.status).toBe('failed');
    const openCheck = run.result.checks.find((check) => check.tool === 'recoder.browser.open_preview');
    expect(openCheck?.status).toBe('failed');
    expect(openCheck?.message).toContain('ERR_CONNECTION_REFUSED');
  });

  it('treats a bounded-deadline breach as a degraded skip — never hangs, never fabricates a verdict', async () => {
    // A client that HONORS timeoutMs by returning the adapter's truthful timeout
    // fail (the shape BrowserUseAdapter.invoke produces on a hung page).
    const hungPage: EngineClientPort = {
      id: 'browser-use',
      transport: 'sidecar',
      async start() {},
      async stop() {},
      async invoke(call: EngineCall<unknown>) {
        expect(call.timeoutMs).toBe(50); // the executor threaded the deadline through
        return fail(`browser-use ${call.op} exceeded ${call.timeoutMs}ms deadline`, 'timeout');
      },
      async health() {
        return up('browser-use', 'sidecar');
      },
    };
    const started = Date.now();
    const run = await executeBrowserVerification(hungPage, {
      url: 'https://example.com',
      assertions: [{ expected: 'deploy succeeded' }],
      timeoutMs: 50,
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(run.degraded).toBe(true);
    expect(run.reason).toContain('deadline');
    expect(run.result.status).toBe('skipped');
    expect(run.result.checks.every((check) => check.status === 'skipped')).toBe(true);
    const summary = run.result.artifacts.find((artifact) => artifact.kind === 'verification_summary');
    expect(summary?.metadata?.degraded).toBe(true);
  });

  it('skips assertions truthfully when text extraction is unavailable mid-run', async () => {
    const extractDown = fakeClient({
      navigate: () => ok({ status: 'ok', url: 'https://example.com/' }),
      extract: () => fail('sidecar went away', 'unavailable'),
      screenshot: () => ok({ status: 'ok', imageBase64: 'aGk=' }),
    });
    const run = await executeBrowserVerification(extractDown, {
      url: 'https://example.com',
      assertions: [{ expected: 'anything' }],
    });
    const assertCheck = run.result.checks.find((check) => check.tool === 'recoder.browser.assert_text');
    expect(assertCheck?.status).toBe('skipped');
    expect(assertCheck?.message).toContain('sidecar went away');
    // The run proved nothing about the assertion — never a fake overall pass.
    expect(run.degraded).toBe(true);
    expect(run.result.status).toBe('skipped');
  });
});
