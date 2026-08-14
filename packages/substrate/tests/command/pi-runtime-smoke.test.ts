/**
 * pi-runtime smoke test — guards the PRIMARY export `resolveRuntimeCommand`
 * against regressions in the recently-promoted `pi` headless invocation
 * (`pi --mode json -p <prompt> --no-extensions`, see runtime-specs.ts). Asserts the full
 * ResolvedRuntimeCommand shape and that the UNTRUSTED prompt stays contained
 * and ordered correctly when model + extraArgs are supplied together.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeCommand } from '../../src/command/index.js';

test('resolveRuntimeCommand("pi", ...) returns a well-formed headless command', () => {
  const resolved = resolveRuntimeCommand('pi', { prompt: 'do the task' });

  assert.equal(resolved.runtimeId, 'pi');
  assert.equal(resolved.bin, 'pi');
  assert.equal(resolved.commandLine, "pi --mode json -p 'do the task' --no-extensions");
  // The prompt must remain single-quoted (the untrusted chokepoint), and the
  // headless flags must bracket it: -p before, --no-extensions after.
  assert.ok(resolved.commandLine.startsWith("pi --mode json -p '"));
  assert.ok(resolved.commandLine.endsWith("' --no-extensions"));
});

test('resolveRuntimeCommand("pi", ...) appends model then extraArgs in order', () => {
  const resolved = resolveRuntimeCommand('pi', {
    prompt: 'do the task',
    model: 'opus-4',
    extraArgs: ['--debug'],
  });

  assert.equal(resolved.commandLine, "pi --mode json -p 'do the task' --no-extensions --model 'opus-4' --debug");
});
