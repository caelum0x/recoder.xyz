/**
 * registry tests (design §11): register/get/has/list behave as an instance (not
 * a global), and an unregistered id throws the typed NotRegistered error.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SubstrateRegistry, selectSubstrate } from '../../src/registry/index.js';
import { SubstrateNotRegisteredError, SubstrateErrorCode } from '../../src/errors/index.js';
import { FakeSubstrate } from '../helpers/fake-substrate.ts';

test('register then get/has/list', () => {
  const registry = new SubstrateRegistry();
  const tmux = new FakeSubstrate({ id: 'tmux_worktree' });
  registry.register(tmux);

  assert.equal(registry.has('tmux_worktree'), true);
  assert.equal(registry.has('daytona'), false);
  assert.equal(registry.get('tmux_worktree'), tmux);
  assert.deepEqual(registry.list(), ['tmux_worktree']);
});

test('two registries are independent instances (not a process global)', () => {
  const a = new SubstrateRegistry();
  const b = new SubstrateRegistry();
  a.register(new FakeSubstrate({ id: 'tmux_worktree' }));
  assert.equal(a.has('tmux_worktree'), true);
  assert.equal(b.has('tmux_worktree'), false);
});

test('register replaces an existing substrate for the same id', () => {
  const registry = new SubstrateRegistry();
  const first = new FakeSubstrate({ id: 'daytona' });
  const second = new FakeSubstrate({ id: 'daytona' });
  registry.register(first);
  registry.register(second);
  assert.equal(registry.get('daytona'), second);
  assert.equal(registry.list().length, 1);
});

test('get on an unregistered id throws SubstrateNotRegisteredError', () => {
  const registry = new SubstrateRegistry();
  assert.throws(
    () => registry.get('daytona'),
    (err: unknown) => {
      assert.ok(err instanceof SubstrateNotRegisteredError);
      assert.equal((err as SubstrateNotRegisteredError).code, SubstrateErrorCode.NOT_REGISTERED);
      return true;
    },
  );
});

test('tryGet returns undefined instead of throwing', () => {
  const registry = new SubstrateRegistry();
  assert.equal(registry.tryGet('daytona'), undefined);
});

test('selectSubstrate resolves by Workspace.substrate', () => {
  const registry = new SubstrateRegistry();
  const tmux = new FakeSubstrate({ id: 'tmux_worktree' });
  registry.register(tmux);
  const selected = selectSubstrate(registry, { substrate: 'tmux_worktree' });
  assert.equal(selected, tmux);
});
