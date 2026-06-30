/**
 * resolve-command tests (design §11): each runtime builds its EXACT headless
 * line, and unsupported/empty inputs throw typed SubstrateErrors.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeCommand } from '../../src/command/index.js';
import { CONDUCTOR_RUNTIME_IDS } from '../../src/types/index.js';
import { SubstrateError, SubstrateErrorCode } from '../../src/errors/index.js';

const PROMPT = 'fix the bug';

// Exact expected command line per runtime, prompt single-quoted at the chokepoint.
const EXPECTED: Record<string, string> = {
  claude_code: "claude -p 'fix the bug' --permission-mode acceptEdits",
  codex: "codex exec 'fix the bug'",
  opencode: "opencode run 'fix the bug'",
  recoder_code: "recoder-code --prompt 'fix the bug'",
  pi: "pi --print 'fix the bug' -ne",
  gemini_cli: "gemini --prompt 'fix the bug'",
  qwen_code: "qwen --prompt 'fix the bug'",
  crush: "crush -p 'fix the bug'",
};

const EXPECTED_BIN: Record<string, string> = {
  claude_code: 'claude',
  codex: 'codex',
  opencode: 'opencode',
  recoder_code: 'recoder-code',
  pi: 'pi',
  gemini_cli: 'gemini',
  qwen_code: 'qwen',
  crush: 'crush',
};

test('every conductor runtime has an exact-line expectation (no missing CLI)', () => {
  for (const id of CONDUCTOR_RUNTIME_IDS) {
    assert.ok(EXPECTED[id], `missing expected line for ${id}`);
  }
  assert.equal(CONDUCTOR_RUNTIME_IDS.length, Object.keys(EXPECTED).length);
});

for (const id of CONDUCTOR_RUNTIME_IDS) {
  test(`${id} builds its exact headless line`, () => {
    const resolved = resolveRuntimeCommand(id, { prompt: PROMPT });
    assert.equal(resolved.runtimeId, id);
    assert.equal(resolved.bin, EXPECTED_BIN[id]);
    assert.equal(resolved.commandLine, EXPECTED[id]);
  });
}

test('model override is appended and shell-quoted for each runtime', () => {
  const claude = resolveRuntimeCommand('claude_code', { prompt: PROMPT, model: 'opus-4' });
  assert.equal(
    claude.commandLine,
    "claude -p 'fix the bug' --permission-mode acceptEdits --model 'opus-4'",
  );
  const codex = resolveRuntimeCommand('codex', { prompt: PROMPT, model: 'gpt-5' });
  assert.equal(codex.commandLine, "codex exec 'fix the bug' --model 'gpt-5'");
});

test('extraArgs are appended verbatim after the model flag', () => {
  const resolved = resolveRuntimeCommand('opencode', {
    prompt: PROMPT,
    model: 'sonnet',
    extraArgs: ['--verbose', '--no-color'],
  });
  assert.equal(resolved.commandLine, "opencode run 'fix the bug' --model 'sonnet' --verbose --no-color");
});

test('unsupported runtime throws a typed INVALID_INPUT SubstrateError', () => {
  assert.throws(
    () => resolveRuntimeCommand('not_a_runtime', { prompt: PROMPT }),
    (err: unknown) => {
      assert.ok(err instanceof SubstrateError);
      assert.equal(err.code, SubstrateErrorCode.INVALID_INPUT);
      return true;
    },
  );
});

test('empty/whitespace prompt throws a typed INVALID_INPUT SubstrateError', () => {
  for (const prompt of ['', '   ', '\n\t']) {
    assert.throws(
      () => resolveRuntimeCommand('claude_code', { prompt }),
      (err: unknown) => err instanceof SubstrateError && err.code === SubstrateErrorCode.INVALID_INPUT,
    );
  }
});
