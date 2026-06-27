import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  classifyToolModes,
  extractToolPaths,
  toNormalizedToolCall,
  toNormalizedToolResult,
  type OpenCodeToolPart,
} from '../../../../src/drivers/opencode/opencode-tool-mapper';

test('classifyToolModes maps known tools to policy modes', () => {
  assert.deepEqual(classifyToolModes('read'), ['read']);
  assert.deepEqual(classifyToolModes('write'), ['write']);
  assert.deepEqual(classifyToolModes('edit'), ['write']);
  assert.deepEqual(classifyToolModes('bash'), ['execute']);
  assert.deepEqual(classifyToolModes('webfetch'), ['network']);
});

test('classifyToolModes is conservative for unknown tools (custom, never empty)', () => {
  assert.deepEqual(classifyToolModes('some_mystery_tool'), ['custom']);
});

test('extractToolPaths pulls filePath + nested edit paths', () => {
  const paths = extractToolPaths({
    filePath: 'a.ts',
    edits: [{ path: 'b.ts' }, { filePath: 'c.ts' }],
  });
  assert.deepEqual(paths, ['a.ts', 'b.ts', 'c.ts']);
});

test('extractToolPaths returns undefined when no path keys present', () => {
  assert.equal(extractToolPaths({ command: 'ls' }), undefined);
  assert.equal(extractToolPaths(undefined), undefined);
});

test('toNormalizedToolCall carries id, name, modes, input, paths', () => {
  const part: OpenCodeToolPart = {
    type: 'tool',
    tool: 'edit',
    callID: 'call_1',
    state: { status: 'running', input: { filePath: 'x.ts' } },
  };
  assert.deepEqual(toNormalizedToolCall(part), {
    toolCallId: 'call_1',
    toolName: 'edit',
    modes: ['write'],
    input: { filePath: 'x.ts' },
    paths: ['x.ts'],
  });
});

test('toNormalizedToolResult maps completed -> ok:true with output', () => {
  const part: OpenCodeToolPart = {
    type: 'tool',
    tool: 'read',
    callID: 'c1',
    state: { status: 'completed', output: 'contents' },
  };
  assert.deepEqual(toNormalizedToolResult(part), {
    toolCallId: 'c1',
    toolName: 'read',
    ok: true,
    output: 'contents',
  });
});

test('toNormalizedToolResult maps error -> ok:false with errorMessage', () => {
  const part: OpenCodeToolPart = {
    type: 'tool',
    tool: 'bash',
    callID: 'c2',
    state: { status: 'error', error: 'boom' },
  };
  assert.deepEqual(toNormalizedToolResult(part), {
    toolCallId: 'c2',
    toolName: 'bash',
    ok: false,
    errorMessage: 'boom',
  });
});

test('toNormalizedToolResult returns null for non-terminal tool states', () => {
  const part: OpenCodeToolPart = {
    type: 'tool',
    tool: 'read',
    callID: 'c3',
    state: { status: 'pending' },
  };
  assert.equal(toNormalizedToolResult(part), null);
});
