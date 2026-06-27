import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeArgs } from '../../../../src/drivers/claude-code/claude-args';

const permission = {
  permissionMode: 'default' as const,
  allowedTools: [] as string[],
  disallowedTools: [] as string[],
};

test('base args drive headless bidirectional stream-json', () => {
  const args = buildClaudeArgs({ permission });
  assert.deepEqual(args.slice(0, 6), [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--input-format',
    'stream-json',
  ]);
  assert.ok(args.includes('--permission-mode'));
  assert.ok(args.includes('default'));
});

test('disallowedTools are joined into a single --disallowedTools flag', () => {
  const args = buildClaudeArgs({
    permission: { ...permission, disallowedTools: ['Bash', 'WebFetch'] },
  });
  const idx = args.indexOf('--disallowedTools');
  assert.ok(idx >= 0);
  assert.equal(args[idx + 1], 'Bash,WebFetch');
});

test('allowedTools omitted when empty, present when set', () => {
  assert.ok(!buildClaudeArgs({ permission }).includes('--allowedTools'));
  const args = buildClaudeArgs({ permission: { ...permission, allowedTools: ['Read'] } });
  const idx = args.indexOf('--allowedTools');
  assert.equal(args[idx + 1], 'Read');
});

test('mcp config, resume session, and model flags are wired when provided', () => {
  const args = buildClaudeArgs({
    permission,
    mcpConfigPath: '/tmp/.mcp.json',
    resumeSessionId: 'sess_1',
    model: 'claude-opus-4-8',
  });
  assert.equal(args[args.indexOf('--mcp-config') + 1], '/tmp/.mcp.json');
  assert.equal(args[args.indexOf('--resume') + 1], 'sess_1');
  assert.equal(args[args.indexOf('--model') + 1], 'claude-opus-4-8');
});

test('optional flags are absent when not provided', () => {
  const args = buildClaudeArgs({ permission });
  assert.ok(!args.includes('--mcp-config'));
  assert.ok(!args.includes('--resume'));
  assert.ok(!args.includes('--model'));
});
