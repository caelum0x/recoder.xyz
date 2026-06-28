/**
 * factory tests (design §11): the composition root builds a registry from the
 * supplied substrates and resolves the real host clock/id defaults — without
 * inventing any stub substrate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSubstrateRegistry, resolvePorts, systemClock, uuidId } from '../../src/factory/index.js';
import { SubstrateNotRegisteredError } from '../../src/errors/index.js';
import { FakeSubstrate } from '../helpers/fake-substrate.ts';
import type { WorkspaceRepositoryPort, LoggerPort, RunEventSink } from '../../src/ports/index.js';

test('createSubstrateRegistry with no substrates fails truthfully on get', () => {
  const registry = createSubstrateRegistry();
  assert.deepEqual(registry.list(), []);
  assert.throws(() => registry.get('tmux_worktree'), SubstrateNotRegisteredError);
});

test('createSubstrateRegistry registers every supplied substrate', () => {
  const registry = createSubstrateRegistry({
    substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), new FakeSubstrate({ id: 'daytona' })],
  });
  assert.equal(registry.has('tmux_worktree'), true);
  assert.equal(registry.has('daytona'), true);
  assert.equal(registry.list().length, 2);
});

test('systemClock returns a valid ISO timestamp and epoch ms', () => {
  const iso = systemClock.now();
  assert.ok(!Number.isNaN(Date.parse(iso)));
  assert.equal(typeof systemClock.nowMs(), 'number');
});

test('uuidId returns distinct uuid-shaped ids', () => {
  const a = uuidId.newId();
  const b = uuidId.newId();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('resolvePorts fills clock/id with real host defaults', () => {
  const noopLogger: LoggerPort = { info() {}, warn() {}, error() {} };
  const repository = {} as WorkspaceRepositoryPort;
  const eventSink = {} as RunEventSink;
  const ports = resolvePorts({ logger: noopLogger, repository, eventSink });
  assert.equal(ports.clock, systemClock);
  assert.equal(ports.id, uuidId);
  assert.equal(ports.logger, noopLogger);
});

test('resolvePorts keeps explicit clock/id overrides', () => {
  const noopLogger: LoggerPort = { info() {}, warn() {}, error() {} };
  const fixedClock = { now: () => '2026-01-01T00:00:00.000Z', nowMs: () => 0 };
  const ports = resolvePorts({
    logger: noopLogger,
    repository: {} as WorkspaceRepositoryPort,
    eventSink: {} as RunEventSink,
    clock: fixedClock,
  });
  assert.equal(ports.clock, fixedClock);
});
