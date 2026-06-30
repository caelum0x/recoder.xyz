/**
 * pi-runtime smoke test — guards the PRIMARY export `resolveRuntimeCommand`
 * against regressions in the recently-promoted `pi` headless invocation
 * (`pi --print <prompt> -ne`, see runtime-specs.ts). Asserts the full
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
  assert.equal(resolved.commandLine, "pi --print 'do the task' -ne");
  // The prompt must remain single-quoted (the untrusted chokepoint), and the
  // headless flags must bracket it: --print before, -ne after.
  assert.ok(resolved.commandLine.startsWith("pi --print '"));
  assert.ok(resolved.commandLine.endsWith("' -ne"));
});

test('resolveRuntimeCommand("pi", ...) appends model then extraArgs in order', () => {
  const resolved = resolveRuntimeCommand('pi', {
    prompt: 'do the task',
    model: 'opus-4',
    extraArgs: ['--debug'],
  });

  assert.equal(resolved.commandLine, "pi --print 'do the task' -ne --model 'opus-4' --debug");
});
