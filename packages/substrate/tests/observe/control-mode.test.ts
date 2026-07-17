/**
 * observe/control-mode tests — the pure tmux `-CC` protocol pieces on captured
 * control-mode transcript lines: %output octal unescaping, %exit variants,
 * reply blocks, garbage detection, ANSI stripping, and the `-V` version gate
 * that selects control mode vs the poller.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeControlModeData,
  stripAnsi,
  stripDcsEnvelope,
  parseControlModeLine,
  supportsControlMode,
} from '../../src/observe/index.js';

// === decodeControlModeData — octal escape decoding ===

test('plain printable data passes through unchanged', () => {
  assert.equal(decodeControlModeData('hello world'), 'hello world');
});

test('octal escapes decode to their bytes (\\015\\012 -> CRLF)', () => {
  assert.equal(decodeControlModeData('line\\015\\012next'), 'line\r\nnext');
});

test('escaped backslash (\\\\) decodes to a single literal backslash', () => {
  assert.equal(decodeControlModeData('a\\\\b'), 'a\\b');
});

test('multi-byte UTF-8 reassembles from escaped bytes (\\342\\234\\223 -> check mark)', () => {
  assert.equal(decodeControlModeData('\\342\\234\\223 done'), '✓ done');
});

test('a lone trailing backslash is kept literally (defensive)', () => {
  assert.equal(decodeControlModeData('tail\\'), 'tail\\');
});

// === parseControlModeLine — one transcript line -> typed notification ===

test('%output parses pane id and decodes escaped data', () => {
  const parsed = parseControlModeLine('%output %1 hi\\015\\012');
  assert.deepEqual(parsed, { kind: 'output', paneId: '%1', text: 'hi\r\n' });
});

test('malformed %output (no pane id) is garbage, not a crash', () => {
  const parsed = parseControlModeLine('%output garbage-here');
  assert.equal(parsed.kind, 'garbage');
});

test('%exit with and without a reason parses as exited', () => {
  assert.deepEqual(parseControlModeLine('%exit'), { kind: 'exited', reason: undefined });
  assert.deepEqual(parseControlModeLine('%exit detached'), {
    kind: 'exited',
    reason: 'detached',
  });
  assert.deepEqual(parseControlModeLine('%exited'), { kind: 'exited', reason: undefined });
});

test('%begin/%end/%error delimit reply blocks', () => {
  assert.equal(parseControlModeLine('%begin 1717 0 0').kind, 'block-begin');
  assert.equal(parseControlModeLine('%end 1717 0 0').kind, 'block-end');
  assert.equal(parseControlModeLine('%error 1717 0 0').kind, 'block-end');
});

test('%session-changed parses id + name', () => {
  assert.deepEqual(parseControlModeLine('%session-changed $3 recoder-ws_1'), {
    kind: 'session-changed',
    sessionId: '$3',
    name: 'recoder-ws_1',
  });
});

test('unknown %-notifications are ignored (valid protocol we do not consume)', () => {
  assert.equal(parseControlModeLine('%window-add @5').kind, 'ignored');
  assert.equal(parseControlModeLine('%layout-change @1 b25d,80x24,0,0,1').kind, 'ignored');
  assert.equal(parseControlModeLine('').kind, 'ignored');
});

test('a non-notification line is garbage (protocol breakdown signal)', () => {
  const parsed = parseControlModeLine('not protocol output');
  assert.equal(parsed.kind, 'garbage');
});

// === stripAnsi / stripDcsEnvelope ===

test('stripAnsi removes CSI color/cursor sequences and normalizes CRLF', () => {
  assert.equal(stripAnsi('\x1b[31mred\x1b[0m\r\nnext\r'), 'red\nnext');
});

test('stripAnsi removes OSC title sequences', () => {
  assert.equal(stripAnsi('\x1b]0;title\x07visible'), 'visible');
});

test('stripDcsEnvelope removes the -CC DCS wrapper markers', () => {
  assert.equal(stripDcsEnvelope('\x1bP1000p%begin 1 0 0'), '%begin 1 0 0');
  assert.equal(stripDcsEnvelope('%exit\x1b\\'), '%exit');
});

// === supportsControlMode — the poller-vs-control-mode selection gate ===

test('modern releases support control mode', () => {
  assert.equal(supportsControlMode('tmux 3.7b'), true);
  assert.equal(supportsControlMode('tmux 1.8'), true);
  assert.equal(supportsControlMode('tmux 2.9a'), true);
});

test('development builds (next-/master/openbsd-) support control mode', () => {
  assert.equal(supportsControlMode('tmux next-3.7'), true);
  assert.equal(supportsControlMode('tmux master'), true);
  assert.equal(supportsControlMode('tmux openbsd-7.4'), true);
});

test('pre-1.8 tmux truthfully does NOT support control mode', () => {
  assert.equal(supportsControlMode('tmux 1.7'), false);
  assert.equal(supportsControlMode('tmux 1.5'), false);
});

test('garbage / non-tmux output selects the poller (false), never a fake attach', () => {
  assert.equal(supportsControlMode(''), false);
  assert.equal(supportsControlMode('screen 4.9.0'), false);
  assert.equal(supportsControlMode('tmux'), false);
  assert.equal(supportsControlMode('tmux weird'), false);
});
