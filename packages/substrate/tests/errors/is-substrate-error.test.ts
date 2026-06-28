/**
 * errors tests (design §11): the typed hierarchy carries stable codes, the type
 * guard narrows, and toErrorPayload produces a truthful, client-SAFE payload
 * (never the cause or secret detail).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SubstrateError,
  SubstrateErrorCode,
  SubstrateUnavailableError,
  ProvisionError,
  LaunchError,
  HandleGoneError,
  DiffError,
  TeardownError,
  SubstrateNotRegisteredError,
  isSubstrateError,
  toErrorPayload,
} from '../../src/errors/index.js';

test('each subclass carries its stable code and is a SubstrateError', () => {
  const cases: Array<[SubstrateError, string]> = [
    [new SubstrateUnavailableError('tmux missing'), SubstrateErrorCode.UNAVAILABLE],
    [new ProvisionError('worktree add failed'), SubstrateErrorCode.PROVISION_FAILED],
    [new LaunchError('claude failed to start'), SubstrateErrorCode.LAUNCH_FAILED],
    [new HandleGoneError('session vanished'), SubstrateErrorCode.HANDLE_GONE],
    [new DiffError('git diff failed'), SubstrateErrorCode.DIFF_FAILED],
    [new TeardownError('cleanup failed'), SubstrateErrorCode.TEARDOWN_FAILED],
    [new SubstrateNotRegisteredError('daytona', ['tmux_worktree']), SubstrateErrorCode.NOT_REGISTERED],
  ];
  for (const [err, code] of cases) {
    assert.ok(err instanceof SubstrateError);
    assert.ok(err instanceof Error);
    assert.equal(err.code, code);
    assert.ok(err.name.length > 0);
  }
});

test('isSubstrateError narrows correctly', () => {
  assert.equal(isSubstrateError(new LaunchError('x')), true);
  assert.equal(isSubstrateError(new Error('x')), false);
  assert.equal(isSubstrateError('x'), false);
  assert.equal(isSubstrateError(null), false);
});

test('teardown is retryable; unavailable/handle-gone are not', () => {
  assert.equal(new TeardownError('x').retryable, true);
  assert.equal(new SubstrateUnavailableError('x').retryable, false);
  assert.equal(new HandleGoneError('x').retryable, false);
});

test('toErrorPayload exposes code/message/retryable but NEVER the cause', () => {
  const secret = new Error('contains $SECRET token');
  const err = new ProvisionError('worktree add failed', {
    substrateId: 'tmux_worktree',
    cause: secret,
    retryable: true,
  });
  const payload = toErrorPayload(err);
  assert.equal(payload.code, SubstrateErrorCode.PROVISION_FAILED);
  assert.equal(payload.message, 'worktree add failed');
  assert.equal(payload.retryable, true);
  assert.equal(payload.substrateId, 'tmux_worktree');
  assert.equal('cause' in payload, false);
  assert.equal('detail' in payload, false);
});

test('toErrorPayload maps a non-substrate error to a safe default', () => {
  const payload = toErrorPayload(new Error('raw boom'));
  assert.equal(payload.code, SubstrateErrorCode.LAUNCH_FAILED);
  assert.equal(payload.message, 'raw boom');
  assert.equal(payload.retryable, false);
});

test('SubstrateUnavailableError preserves a truthful reason', () => {
  const err = new SubstrateUnavailableError('daytona creds missing', { substrateId: 'daytona' });
  assert.equal(err.reason, 'daytona creds missing');
  assert.match(err.message, /daytona creds missing/);
  assert.equal(err.substrateId, 'daytona');
});
