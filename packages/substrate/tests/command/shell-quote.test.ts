/**
 * shell-quote tests (design §11): the security-critical chokepoint must produce
 * a single shell word for UNTRUSTED prompts — single quotes, $(...), backticks,
 * and `&&`/`;` must all be neutralised.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { shellQuote } from '../../src/command/index.js';
import { resolveRuntimeCommand } from '../../src/command/index.js';

/** Run a value through `/bin/sh` after quoting and return what the shell saw. */
function echoThrough(value: string): string {
  const line = `printf %s ${shellQuote(value)}`;
  return execFileSync('/bin/sh', ['-c', line], { encoding: 'utf8' });
}

test('wraps a plain value in single quotes', () => {
  assert.equal(shellQuote('hello'), "'hello'");
});

test('escapes an embedded single quote (the classic break-out)', () => {
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});

test('a command substitution is passed through literally, never executed', () => {
  const malicious = '$(touch /tmp/recoder-substrate-pwned)';
  // The shell must see the literal text, not run the substitution.
  assert.equal(echoThrough(malicious), malicious);
});

test('backticks are passed through literally, never executed', () => {
  const malicious = '`id`';
  assert.equal(echoThrough(malicious), malicious);
});

test('shell metacharacters (; && | > rm) survive as literal text', () => {
  const malicious = "'; rm -rf / # && echo pwned | cat > /tmp/x";
  assert.equal(echoThrough(malicious), malicious);
});

test('a malicious prompt cannot escape the resolved command word', () => {
  const malicious = "x'; rm -rf ~ #";
  const resolved = resolveRuntimeCommand('claude_code', { prompt: malicious });
  // The injection payload is fully contained inside the quoted prompt argument.
  assert.ok(resolved.commandLine.startsWith("claude -p '"));
  // Reconstruct the prompt the shell would actually pass to `claude -p` and
  // confirm it is exactly the malicious string (not a second command).
  const line = `printf %s ${resolved.commandLine.replace(/^claude -p /, '').replace(/ --permission-mode acceptEdits$/, '')}`;
  const seen = execFileSync('/bin/sh', ['-c', line], { encoding: 'utf8' });
  assert.equal(seen, malicious);
});
