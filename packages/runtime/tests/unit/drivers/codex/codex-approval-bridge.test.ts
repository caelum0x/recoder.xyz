import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectApprovalRequest,
  toApprovalFrame,
  serializeApprovalResponse,
} from '../../../../src/drivers/codex/codex-approval-bridge';

test('detects a command_execution awaiting approval -> before_execution', () => {
  const req = detectApprovalRequest({
    type: 'item.started',
    item: { id: 'a1', item_type: 'command_execution', command: 'rm -rf x', status: 'awaiting_approval' },
  });
  assert.ok(req);
  assert.equal(req.requiredAt, 'before_execution');
  assert.equal(req.target?.command, 'rm -rf x');
  const frame = toApprovalFrame(req);
  assert.equal(frame.kind, 'approval');
  assert.equal(frame.approvalId, 'a1');
});

test('detects a file_change awaiting approval -> before_write', () => {
  const req = detectApprovalRequest({
    type: 'item.updated',
    item: { id: 'p1', item_type: 'file_change', status: 'pending_approval' },
  });
  assert.ok(req);
  assert.equal(req.requiredAt, 'before_write');
  assert.equal(req.target?.toolName, 'apply_patch');
});

test('detects the legacy exec_approval_request msg', () => {
  const req = detectApprovalRequest({
    id: '1',
    msg: { type: 'exec_approval_request', call_id: 'c9', command: ['git', 'push'] },
  });
  assert.ok(req);
  assert.equal(req.approvalId, 'c9');
  assert.equal(req.requiredAt, 'before_execution');
  assert.match(req.reason, /git push/);
});

test('returns null for non-approval events', () => {
  assert.equal(detectApprovalRequest({ type: 'turn.completed' }), null);
  assert.equal(
    detectApprovalRequest({ type: 'item.completed', item: { item_type: 'agent_message', text: 'x' } }),
    null,
  );
});

test('serializeApprovalResponse encodes approved/denied decisions', () => {
  const approved = serializeApprovalResponse('a1', true) as { op: { decision: string } };
  assert.equal(approved.op.decision, 'approved');
  const denied = serializeApprovalResponse('a1', false) as { op: { decision: string } };
  assert.equal(denied.op.decision, 'denied');
});
