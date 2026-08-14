import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resumePlan,
  dedupeKey,
  hasNativeResume,
} from '../../../src/resume/resume-registry';

test('claude_code resumes by id with the ref as a discrete argv datum', () => {
  const plan = resumePlan('claude_code', 'sess-abc-123');
  assert.deepEqual(plan, { argv: ['claude', '--resume', 'sess-abc-123'] });
});

test('opencode resumes via `run --session <id>`', () => {
  const plan = resumePlan('opencode', 'ses_01H');
  assert.deepEqual(plan, {
    argv: ['opencode', 'run', '--session', 'ses_01H'],
  });
});

test('codex resumes via the `resume <id>` subcommand', () => {
  const plan = resumePlan('codex', '0f9a-conv');
  assert.deepEqual(plan, { argv: ['codex', 'resume', '0f9a-conv'] });
});

test('pi resumes by the session id emitted in its JSON header', () => {
  const plan = resumePlan('pi', 'pi-session-1');
  assert.deepEqual(plan, {
    argv: ['pi', '--session', 'pi-session-1'],
  });
});

test('recoder_code shares pi session-id resume', () => {
  const plan = resumePlan('recoder_code', 'recoder-session-1');
  assert.deepEqual(plan, { argv: ['pi', '--session', 'recoder-session-1'] });
});

test('the ref is never interpolated — special chars stay one argv element', () => {
  // An id with a space must remain a single argv datum (no shell splitting here).
  const plan = resumePlan('pi', 'pi session');
  assert.deepEqual(plan, {
    argv: ['pi', '--session', 'pi session'],
  });
});

test('unknown runtime has no native resume → null', () => {
  assert.equal(resumePlan('cursor', 'sess-1'), null);
  assert.equal(resumePlan('', 'sess-1'), null);
  assert.equal(hasNativeResume('cursor'), false);
  assert.equal(hasNativeResume('claude_code'), true);
});

test('validation rejects empty / whitespace-only refs', () => {
  assert.equal(resumePlan('claude_code', ''), null);
  assert.equal(resumePlan('claude_code', '   '), null);
  // surrounding whitespace is refused (a well-formed id/path has none)
  assert.equal(resumePlan('claude_code', ' sess-1 '), null);
});

test('validation rejects overlong refs', () => {
  const long = 'a'.repeat(513);
  assert.equal(resumePlan('claude_code', long), null);
  // 512 is the boundary and is accepted.
  const boundary = 'a'.repeat(512);
  assert.deepEqual(resumePlan('claude_code', boundary), {
    argv: ['claude', '--resume', boundary],
  });
});

test('validation rejects control chars (newline / NUL / DEL)', () => {
  assert.equal(resumePlan('claude_code', 'sess\n1'), null);
  assert.equal(resumePlan('claude_code', 'sess\x001'), null);
  assert.equal(resumePlan('codex', 'a\x7fb'), null);
});

test('validation rejects a leading-dash ref (argv-flag injection guard)', () => {
  // A ref that could be re-read as a CLI flag must never reach argv.
  assert.equal(
    resumePlan('claude_code', '--dangerously-skip-permissions'),
    null
  );
  assert.equal(resumePlan('codex', '-c'), null);
});

test('id-kind refs do NOT require an absolute path', () => {
  assert.ok(resumePlan('claude_code', 'plain-id') != null);
  assert.ok(resumePlan('codex', 'plain-id') != null);
  assert.ok(resumePlan('pi', 'plain-id') != null);
});

test('dedupeKey is stable for identical inputs', () => {
  assert.equal(
    dedupeKey('claude_code', 'sess-1'),
    dedupeKey('claude_code', 'sess-1')
  );
});

test('dedupeKey is distinct across runtimes and refs', () => {
  assert.notEqual(
    dedupeKey('claude_code', 'sess-1'),
    dedupeKey('codex', 'sess-1')
  );
  assert.notEqual(
    dedupeKey('claude_code', 'sess-1'),
    dedupeKey('claude_code', 'sess-2')
  );
});
