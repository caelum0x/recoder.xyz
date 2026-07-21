/**
 * FUSION PROOF — the `browser-check` workflow node fires the browser-use engine.
 *
 * These tests prove the DEEP merge: a stored `browser-check` node, dispatched
 * through the frozen `@recoder/agent-workflows` runner (the SAME path
 * `WorkflowService.dispatch` takes in production), actually drives the injected
 * browser-use `EngineClientPort` (navigate → extract → screenshot) and attaches
 * the captured evidence to the run — NOT a compile-only bridge.
 *
 * The truthful-degrade law is proven too: no engine → node `skipped` (never a
 * faked pass), a real assertion failure → node `failed`, and an engine-down
 * invoke → `skipped` + degraded.
 */
import { describe, it, expect } from 'vitest';
import type {
  WorkflowDefinition,
  WorkflowExecutionContext,
  WorkflowNode,
} from '@recoder/agent-workflows';
import type { EngineCall, EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { BrowserExtPort } from '../../engines/adapters/sidecar/browser-ext.client.js';
import { fail, ok, up, type InvokeResult } from '../../engines/types.js';
import { AgentOsWorkflowRunnerDriver } from '../adapters/agent-os-workflow-runner.driver.js';
import { createBrowserCheckWorkflowHandler } from '../adapters/browser-check-workflow.handler.js';
// The real engines executor, injected as the `BrowserVerifyRunner` port (tests may
// value-import across domains; bootstrap does the same at the composition root).
import { executeBrowserVerification } from '../../engines/adapters/sidecar/browser-verification.executor.js';

type Op = 'navigate' | 'extract' | 'screenshot';
type OpHandler = (input: Record<string, unknown>) => InvokeResult<unknown>;

/** A browser-use client that records the ops it received (proves the fusion fires). */
function recordingClient(handlers: Partial<Record<Op, OpHandler>>): {
  client: EngineClientPort;
  ops: string[];
} {
  const ops: string[] = [];
  const client: EngineClientPort = {
    id: 'browser-use',
    transport: 'sidecar',
    async start() {},
    async stop() {},
    async invoke(call: EngineCall<unknown>) {
      ops.push(call.op);
      const handler = handlers[call.op as Op];
      if (!handler) return fail(`no handler for op '${call.op}'`);
      return handler((call.input ?? {}) as Record<string, unknown>);
    },
    async health() {
      return up('browser-use', 'sidecar');
    },
  };
  return { client, ops };
}

const HEALTHY: Partial<Record<Op, OpHandler>> = {
  navigate: (input) => ok({ status: 'ok', url: String(input.url), title: 'Example' }),
  extract: () => ok({ status: 'ok', text: 'Welcome — deploy succeeded on prod' }),
  screenshot: () => ok({ status: 'ok', imageBase64: 'aGVsbG8=' }),
};

function browserCheckNode(config: Record<string, unknown>): WorkflowNode {
  return { nodeId: 'verify-preview', kind: 'browser-check', label: 'Browser Check', config };
}

function definition(node: WorkflowNode): WorkflowDefinition {
  return { workflowId: 'wf-1', name: 'verify flow', version: '1', nodes: [node] };
}

const CONTEXT = { workflowRunId: 'run-1' } as unknown as WorkflowExecutionContext;

describe('createBrowserCheckWorkflowHandler (direct — the runBrowserCheck port)', () => {
  it('FIRES the engine (navigate→extract→screenshot) and attaches evidence artifacts', async () => {
    const { client, ops } = recordingClient(HEALTHY);
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client });

    const result = await handler(
      browserCheckNode({
        browserChecks: [{ url: 'https://preview.example.com', assertions: [{ expected: 'deploy succeeded' }] }],
      }),
      CONTEXT,
    );

    // The fusion fired: the engine actually saw all three ops.
    expect(ops).toEqual(['navigate', 'extract', 'screenshot']);
    expect(result.status).toBe('completed');
    // Evidence rode along: a screenshot + a verification-summary artifact.
    const kinds = (result.artifacts ?? []).map((artifact) => artifact.kind).sort();
    expect(kinds).toEqual(['screenshot', 'verification']);
    const shot = (result.artifacts ?? []).find((artifact) => artifact.kind === 'screenshot');
    expect(shot?.metadata?.imageBase64).toBe('aGVsbG8=');
    expect(shot?.runId).toBe('run-1');
    expect(shot?.createdBy).toBe('agent-os/browser-check');
    const output = result.output as { checks: Array<{ status: string }>; evidenceArtifacts: string[] };
    expect(output.checks[0]?.status).toBe('passed');
    expect(output.evidenceArtifacts.length).toBe(2);
  });

  it('is a truthful `failed` when a reachable page misses the expected text', async () => {
    const { client } = recordingClient({
      ...HEALTHY,
      extract: () => ok({ status: 'ok', text: 'totally different content' }),
    });
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client });

    const result = await handler(
      browserCheckNode({ browserChecks: [{ url: 'https://x', assertions: [{ expected: 'deploy succeeded' }] }] }),
      CONTEXT,
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain('deploy succeeded');
    // A failed verify STILL carries its evidence screenshot.
    expect((result.artifacts ?? []).some((artifact) => artifact.kind === 'screenshot')).toBe(true);
  });

  it('degrades to a truthful `skipped` (never a faked pass) when no engine is wired', async () => {
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client: null });

    const result = await handler(
      browserCheckNode({ browserChecks: [{ url: 'https://x', assertions: [{ expected: 'ok' }] }] }),
      CONTEXT,
    );

    expect(result.status).toBe('skipped');
    expect(result.artifacts ?? []).toEqual([]);
    expect((result.output as { reason: string }).reason).toContain('not wired');
  });

  it('degrades to `skipped` (+ engine-down reason) when the engine is unavailable', async () => {
    const { client } = recordingClient({
      navigate: () => fail('sidecar down', 'unavailable'),
    });
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client });

    const result = await handler(
      browserCheckNode({ browserChecks: [{ url: 'https://x', assertions: [{ expected: 'ok' }] }] }),
      CONTEXT,
    );

    expect(result.status).toBe('skipped');
    const output = result.output as { checks: Array<{ degraded: boolean; reason?: string }> };
    expect(output.checks[0]?.degraded).toBe(true);
    expect(output.checks[0]?.reason).toContain('sidecar down');
  });

  it('runs the autonomous `run_task` deep-op as a research/verification sub-step', async () => {
    const { client } = recordingClient(HEALTHY);
    const seen: string[] = [];
    const ext: BrowserExtPort = {
      async extractStructured() {
        return ok({});
      },
      async runTask(input) {
        seen.push(input.task);
        return ok({ status: 'done', answer: 'the pricing page lists 3 tiers' });
      },
      async screenshotAnnotate() {
        return ok({});
      },
      async fillForm() {
        return ok({});
      },
    };
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client, ext });

    const result = await handler(
      browserCheckNode({ researchTask: { task: 'how many pricing tiers are shown?', maxSteps: 5 } }),
      CONTEXT,
    );

    expect(seen).toEqual(['how many pricing tiers are shown?']);
    expect(result.status).toBe('completed');
    expect((result.output as { research: { status: string } }).research.status).toBe('completed');
  });
});

describe('browser-check FIRES through the real AgentOsWorkflowRunnerDriver (dispatch path)', () => {
  it('runs a browser-check node in the DAG walk and lands evidence on the run', async () => {
    const { client, ops } = recordingClient(HEALTHY);
    const driver = new AgentOsWorkflowRunnerDriver({
      ports: { runBrowserCheck: createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client }) },
    });

    const run = await driver.start(
      definition(
        browserCheckNode({
          browserChecks: [{ url: 'https://preview.example.com', assertions: [{ expected: 'deploy succeeded' }] }],
        }),
      ),
    );

    // The engine fired inside the runner's node dispatch — not a stub.
    expect(ops).toEqual(['navigate', 'extract', 'screenshot']);
    expect(run.status).toBe('completed');
    const node = run.nodeExecutions?.find((execution) => execution.nodeId === 'verify-preview');
    expect(node?.status).toBe('completed');
    // Evidence surfaced onto the run's artifacts (approval/PR steps can read it).
    const kinds = (run.artifacts ?? []).map((artifact) => artifact.kind).sort();
    expect(kinds).toEqual(['screenshot', 'verification']);
  });

  it('an unwired browser-check node degrades to `skipped` without blocking the run', async () => {
    const driver = new AgentOsWorkflowRunnerDriver(); // no ports at all

    const run = await driver.start(definition(browserCheckNode({ browserChecks: [{ url: 'https://x' }] })));

    // The run still completes (browsing never hard-fails an otherwise-green flow).
    expect(run.status).toBe('completed');
    const node = run.nodeExecutions?.find((execution) => execution.nodeId === 'verify-preview');
    expect(node?.status).toBe('skipped');
  });
});

/**
 * REGRESSION-LOCK (browser-use fusion §8.6) — the `browser-check` node + the
 * `.ext().run_task` research step are LIVE (Wave-4-shipped); these gates pin the
 * multiplicity + truthful-degrade contracts so a refactor can't silently regress
 * them. No handler rewrite — assertions only.
 */
describe('browser-check regression-lock — multiplicity + run_task truthful-degrade', () => {
  it('fires ONE executor cycle + a screenshot+summary evidence pair PER browserChecks[] entry', async () => {
    const { client, ops } = recordingClient(HEALTHY);
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client });
    const urls = ['https://a.preview.example', 'https://b.preview.example', 'https://c.preview.example'];

    const result = await handler(
      browserCheckNode({
        browserChecks: urls.map((url) => ({ url, assertions: [{ expected: 'deploy succeeded' }] })),
      }),
      CONTEXT,
    );

    // N entries ⇒ N executor cycles (each cycle = navigate→extract→screenshot).
    expect(ops.filter((op) => op === 'navigate').length).toBe(urls.length);
    expect(ops.filter((op) => op === 'extract').length).toBe(urls.length);
    expect(ops.filter((op) => op === 'screenshot').length).toBe(urls.length);
    expect(result.status).toBe('completed');

    // N evidence pairs on the run: N screenshots + N verification summaries.
    const kinds = (result.artifacts ?? []).map((artifact) => artifact.kind);
    expect(kinds.filter((kind) => kind === 'screenshot').length).toBe(urls.length);
    expect(kinds.filter((kind) => kind === 'verification').length).toBe(urls.length);

    const output = result.output as {
      checks: Array<{ url: string; status: string }>;
      evidenceArtifacts: string[];
    };
    // One check row per entry, every entry passed, and every artifact id surfaced.
    expect(output.checks.map((check) => check.url)).toEqual(urls);
    expect(output.checks.every((check) => check.status === 'passed')).toBe(true);
    expect(output.evidenceArtifacts.length).toBe(urls.length * 2);
  });

  it('lands N evidence artifacts on the RUN through the real dispatch driver', async () => {
    const { client, ops } = recordingClient(HEALTHY);
    const driver = new AgentOsWorkflowRunnerDriver({
      ports: { runBrowserCheck: createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client }) },
    });
    const urls = ['https://one.example', 'https://two.example'];

    const run = await driver.start(
      definition(browserCheckNode({ browserChecks: urls.map((url) => ({ url })) })),
    );

    expect(ops.filter((op) => op === 'navigate').length).toBe(urls.length);
    expect(run.status).toBe('completed');
    // Every entry's screenshot + summary rode onto the run's artifacts.
    const kinds = (run.artifacts ?? []).map((artifact) => artifact.kind);
    expect(kinds.filter((kind) => kind === 'screenshot').length).toBe(urls.length);
    expect(kinds.filter((kind) => kind === 'verification').length).toBe(urls.length);
  });

  it('does NOT touch the run_task deep-op when a node carries no researchTask', async () => {
    const { client } = recordingClient(HEALTHY);
    const seen: string[] = [];
    const ext: BrowserExtPort = {
      async extractStructured() {
        return ok({});
      },
      async runTask(input) {
        seen.push(input.task);
        return ok({ status: 'done' });
      },
      async screenshotAnnotate() {
        return ok({});
      },
      async fillForm() {
        return ok({});
      },
    };
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client, ext });

    const result = await handler(
      browserCheckNode({ browserChecks: [{ url: 'https://x', assertions: [{ expected: 'deploy succeeded' }] }] }),
      CONTEXT,
    );

    // The autonomous browse loop is opt-in: a pure browser-check never fires it.
    expect(seen).toEqual([]);
    expect(result.status).toBe('completed');
    expect((result.output as Record<string, unknown>).research).toBeUndefined();
  });

  it('is a truthful `skipped` (never a faked verdict) when the run_task sidecar is unavailable', async () => {
    const { client } = recordingClient(HEALTHY);
    const ext: BrowserExtPort = {
      async extractStructured() {
        return ok({});
      },
      async runTask() {
        return fail('deep-op sidecar 503', 'unavailable');
      },
      async screenshotAnnotate() {
        return ok({});
      },
      async fillForm() {
        return ok({});
      },
    };
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client, ext });

    const result = await handler(browserCheckNode({ researchTask: { task: 'how many tiers?' } }), CONTEXT);

    // Sidecar down ⇒ the research sub-step is a truthful skip, the node does not fail.
    expect(result.status).toBe('skipped');
    const research = (result.output as { research: { status: string; reason?: string } }).research;
    expect(research.status).toBe('skipped');
    expect(research.reason).toContain('deep-op sidecar 503');
    expect(result.error).toBeUndefined();
  });

  it('is a truthful `skipped` for a researchTask when no deep-op sidecar is wired', async () => {
    const { client } = recordingClient(HEALTHY);
    const handler = createBrowserCheckWorkflowHandler({ runBrowserVerify: executeBrowserVerification, client, ext: null });

    const result = await handler(browserCheckNode({ researchTask: { task: 'how many tiers?' } }), CONTEXT);

    expect(result.status).toBe('skipped');
    const research = (result.output as { research: { status: string; reason?: string } }).research;
    expect(research.status).toBe('skipped');
    expect(research.reason).toContain('not wired');
  });
});
