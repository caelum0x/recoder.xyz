import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapClaudeToolUse,
  mapClaudeToolResult,
} from '../../../../src/drivers/claude-code/claude-tool-mapper';

test('Write maps to a write-bearing call with its path', () => {
  const call = mapClaudeToolUse({
    type: 'tool_use',
    id: 'toolu_w',
    name: 'Write',
    input: { file_path: '/repo/a.ts', content: 'x' },
  });
  assert.equal(call.toolCallId, 'toolu_w');
  assert.ok(call.modes.includes('write'));
  assert.deepEqual(call.paths, ['/repo/a.ts']);
});

test('Read maps to a read-only call', () => {
  const call = mapClaudeToolUse({ type: 'tool_use', id: 'r', name: 'Read', input: { file_path: '/x' } });
  assert.deepEqual([...call.modes], ['read']);
});

test('Bash with a write-bearing command picks up write + execute modes', () => {
  const call = mapClaudeToolUse({
    type: 'tool_use',
    id: 'b',
    name: 'Bash',
    input: { command: 'rm -rf node_modules && echo done > out.txt' },
  });
  assert.ok(call.modes.includes('execute'));
  assert.ok(call.modes.includes('write'));
});

test('Bash with a network command picks up network mode', () => {
  const call = mapClaudeToolUse({
    type: 'tool_use',
    id: 'b2',
    name: 'Bash',
    input: { command: 'curl https://example.com -o /tmp/x' },
  });
  assert.ok(call.modes.includes('network'));
});

test('a plain read-only Bash command is execute-only (no write)', () => {
  const call = mapClaudeToolUse({
    type: 'tool_use',
    id: 'b3',
    name: 'Bash',
    input: { command: 'ls -la && cat package.json' },
  });
  assert.ok(call.modes.includes('execute'));
  assert.ok(!call.modes.includes('write'));
});

test('an unknown MCP tool is classified as custom', () => {
  const call = mapClaudeToolUse({ type: 'tool_use', id: 'm', name: 'mcp__github__create_pr', input: {} });
  assert.deepEqual([...call.modes], ['custom']);
});

test('WebFetch is network-bearing', () => {
  const call = mapClaudeToolUse({ type: 'tool_use', id: 'wf', name: 'WebFetch', input: { url: 'https://x' } });
  assert.ok(call.modes.includes('network'));
});

test('an error tool_result is marked not-ok with a message', () => {
  const result = mapClaudeToolResult({
    type: 'tool_result',
    tool_use_id: 'toolu_e',
    content: 'permission denied',
    is_error: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.toolCallId, 'toolu_e');
  assert.equal(result.errorMessage, 'permission denied');
});

test('a success tool_result carries output and no error', () => {
  const result = mapClaudeToolResult({ type: 'tool_result', tool_use_id: 't', content: 'ok' });
  assert.equal(result.ok, true);
  assert.equal(result.output, 'ok');
  assert.equal(result.errorMessage, undefined);
});
