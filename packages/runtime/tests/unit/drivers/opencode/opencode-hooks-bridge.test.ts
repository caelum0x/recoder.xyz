import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { bridgeOpenCodeEvent } from '../../../../src/drivers/opencode/opencode-hooks-bridge';
import type { OpenCodeJsonEvent } from '../../../../src/drivers/opencode/opencode-event-stream';

function writeEvent(tool: string): OpenCodeJsonEvent {
  return {
    type: 'tool_use',
    part: {
      type: 'tool',
      tool,
      callID: `call_${tool}`,
      state: { status: 'completed', input: { filePath: 'x.ts' }, output: 'ok' },
    },
  };
}

const ids = () => {
  let n = 0;
  return () => `appr_${++n}`;
};

test('without approveBeforeWrite, frames pass through unchanged', () => {
  const frames = bridgeOpenCodeEvent(writeEvent('edit'), {
    approveBeforeWrite: false,
    nextApprovalId: ids(),
  });
  assert.deepEqual(
    frames.map((f) => f.kind),
    ['tool_call', 'tool_result'],
  );
});

test('write tool raises a before_write approval ahead of the tool_call', () => {
  const frames = bridgeOpenCodeEvent(writeEvent('edit'), {
    approveBeforeWrite: true,
    nextApprovalId: ids(),
  });
  assert.deepEqual(
    frames.map((f) => f.kind),
    ['approval', 'tool_call', 'tool_result'],
  );
  const approval = frames[0] as { requiredAt: string; target?: { toolName?: string } };
  assert.equal(approval.requiredAt, 'before_write');
  assert.equal(approval.target?.toolName, 'edit');
});

test('execute tool raises a before_execution approval', () => {
  const frames = bridgeOpenCodeEvent(writeEvent('bash'), {
    approveBeforeWrite: true,
    nextApprovalId: ids(),
  });
  const approval = frames.find((f) => f.kind === 'approval') as { requiredAt: string };
  assert.equal(approval.requiredAt, 'before_execution');
});

test('read tool is not gated even when approveBeforeWrite is on', () => {
  const frames = bridgeOpenCodeEvent(writeEvent('read'), {
    approveBeforeWrite: true,
    nextApprovalId: ids(),
  });
  assert.equal(
    frames.some((f) => f.kind === 'approval'),
    false,
  );
});
