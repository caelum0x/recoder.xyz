import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerification } from '../../../src/evidence/verification-runner';
import type { ExecutionEnvironment, ExecResult } from '../../../src/env/execution-environment';

/**
 * Truthfulness tests for verification-runner. The core Recoder rule is "never imply success
 * without evidence": an aborted plan must NOT report `passed: true`, because the commands that
 * did not run have no evidence behind them.
 */

type ExecStub = (command: string, args: readonly string[]) => ExecResult;

function fakeEnv(exec: ExecStub): ExecutionEnvironment {
  return {
    kind: 'test',
    async spawn() {
      throw new Error('not used');
    },
    async exec(input) {
      return exec(input.command, input.args);
    },
    async *execStream() {
      // no-op
    },
    async exists() {
      return true;
    },
    async dispose() {
      // no-op
    },
  };
}

const pass = (): ExecResult => ({ exitCode: 0, stdout: 'ok', stderr: '' });
const fail = (): ExecResult => ({ exitCode: 1, stdout: '', stderr: 'boom' });

test('empty plan passes with no commands (nothing to run)', async () => {
  const env = fakeEnv(pass);
  const result = await runVerification({ env, plan: { commands: [] }, cwd: '/tmp' });
  assert.equal(result.passed, true);
  assert.equal(result.aborted, false);
  assert.equal(result.results.length, 0);
});

test('all commands passing yields passed=true and every command ran', async () => {
  const env = fakeEnv(pass);
  const result = await runVerification({
    env,
    plan: { commands: ['pnpm check-types', 'pnpm test'] },
    cwd: '/tmp',
  });
  assert.equal(result.passed, true);
  assert.equal(result.aborted, false);
  assert.equal(result.results.length, 2);
});

test('a single non-zero exit fails the whole run', async () => {
  const env = fakeEnv((_command, _args) => fail());
  const result = await runVerification({
    env,
    plan: { commands: ['pnpm test'] },
    cwd: '/tmp',
  });
  assert.equal(result.passed, false);
  assert.equal(result.aborted, false);
  assert.equal(result.results[0]?.passed, false);
});

test('already-aborted signal: passed=false even with an all-pass exec (no evidence gathered)', async () => {
  const controller = new AbortController();
  controller.abort();
  const env = fakeEnv(pass);
  const result = await runVerification({
    env,
    plan: { commands: ['pnpm check-types', 'pnpm test'] },
    cwd: '/tmp',
    signal: controller.signal,
  });
  assert.equal(result.passed, false, 'aborted-before-start must never report success');
  assert.equal(result.aborted, true);
  assert.equal(result.results.length, 0);
});

test('abort mid-plan: completed commands passed, but un-run commands mean passed=false', async () => {
  const controller = new AbortController();
  let calls = 0;
  const env = fakeEnv(() => {
    calls += 1;
    // Abort right after the first command completes so the second never runs.
    if (calls === 1) controller.abort();
    return pass();
  });
  const result = await runVerification({
    env,
    plan: { commands: ['first', 'second'] },
    cwd: '/tmp',
    signal: controller.signal,
  });
  assert.equal(result.results.length, 1, 'only the first command ran');
  assert.equal(result.results[0]?.passed, true);
  assert.equal(result.aborted, true);
  assert.equal(
    result.passed,
    false,
    'not every planned command ran, so the run is not verified',
  );
});
