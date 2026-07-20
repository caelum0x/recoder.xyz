import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNativeWorkflowHandler, type WorkflowEnginePort, type NativeWorkflowRunResult } from './native-workflow';
import type { WorkflowExecutionContext, WorkflowNodeHandlerResult } from './workflow-runner';
import type { WorkflowNode } from './workflow-definition';

/** A tool node carrying a native openfang workflow config. */
function nativeToolNode(config: Record<string, unknown>): WorkflowNode {
  return { nodeId: 'wf', kind: 'tool', label: 'Native workflow', config };
}

/** The runner passes a context; the handler only reads the node, so a bare cast is fine. */
const ctx = {} as WorkflowExecutionContext;

/** A stub engine whose registerAndRun returns a canned result and records its args. */
function stubEngine(result: NativeWorkflowRunResult): {
  engine: WorkflowEnginePort;
  calls: Array<{ workflowJson: string; input: string }>;
} {
  const calls: Array<{ workflowJson: string; input: string }> = [];
  return {
    calls,
    engine: {
      registerAndRun(workflowJson, input) {
        calls.push({ workflowJson, input });
        return result;
      },
    },
  };
}

test('native-workflow: completed — narrows a successful dispatch to a completed node', async () => {
  const { engine, calls } = stubEngine({ available: true, ok: true, runId: 'run_1', output: 'done' });
  const handler = createNativeWorkflowHandler(engine);

  const result: WorkflowNodeHandlerResult = await handler(
    nativeToolNode({ engine: 'openfang', workflow: '{"name":"wf"}', input: '{"seed":1}' }),
    ctx,
  );

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.output, { engine: 'openfang', runId: 'run_1', output: 'done' });
  // The config's workflow JSON + input were threaded to the port verbatim.
  assert.deepEqual(calls, [{ workflowJson: '{"name":"wf"}', input: '{"seed":1}' }]);
});

test('native-workflow: input defaults to {} when the node omits it', async () => {
  const { engine, calls } = stubEngine({ available: true, ok: true, runId: 'r', output: '' });
  const handler = createNativeWorkflowHandler(engine);

  await handler(nativeToolNode({ workflowJson: '{"name":"wf"}' }), ctx);

  assert.deepEqual(calls, [{ workflowJson: '{"name":"wf"}', input: '{}' }]);
});

test('native-workflow: skipped — an unavailable engine degrades truthfully (never blocks)', async () => {
  const { engine } = stubEngine({ available: false, reason: 'addon not built' });
  const handler = createNativeWorkflowHandler(engine);

  const result = await handler(nativeToolNode({ workflow: '{}' }), ctx);

  assert.equal(result.status, 'skipped');
  assert.deepEqual(result.output, { engine: 'openfang', reason: 'addon not built' });
});

test('native-workflow: failed — a value-level engine error is a workflow failure', async () => {
  const { engine } = stubEngine({ available: true, ok: false, error: 'bad workflow json' });
  const handler = createNativeWorkflowHandler(engine);

  const result = await handler(nativeToolNode({ workflow: '{bad}' }), ctx);

  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'bad workflow json');
});

test('native-workflow: a tool node with no workflow config is a truthful failed (handler owns only native)', async () => {
  const { engine, calls } = stubEngine({ available: true, ok: true, runId: 'r', output: '' });
  const handler = createNativeWorkflowHandler(engine);

  const result = await handler(nativeToolNode({ some: 'other-tool' }), ctx);

  assert.equal(result.status, 'failed');
  assert.match(String(result.error), /not a native openfang workflow/);
  // The engine was never touched for an unrelated tool node.
  assert.equal(calls.length, 0);
});
