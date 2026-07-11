/**
 * input-wait detector — pure pane-tail classifier: is the agent BLOCKED waiting
 * for operator input? Conservative by design: only well-known interactive
 * prompt shapes from the real agent CLIs count; ordinary logs never match
 * (a false "needs you" erodes trust in the triage).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectInputWait } from '../../src/observe/input-wait.js';

test('y/n confirmation tails are detected', () => {
  assert.equal(detectInputWait('building...\nOverwrite existing file? (y/n)'), 'Overwrite existing file? (y/n)');
  assert.equal(detectInputWait('step 1 done\nContinue? [y/N]'), 'Continue? [y/N]');
  assert.equal(detectInputWait('Proceed with merge? [Y/n]  '), 'Proceed with merge? [Y/n]');
  assert.equal(detectInputWait('Are you sure? (yes/no)'), 'Are you sure? (yes/no)');
});

test('claude-code style option dialogs are detected', () => {
  const pane = [
    'I need to run a command outside the sandbox.',
    'Do you want to allow this command?',
    '  ❯ 1. Yes',
    '    2. No, and tell Claude what to do differently',
  ].join('\n');
  assert.equal(detectInputWait(pane), 'Do you want to allow this command?');
});

test('trust-folder prompts are detected', () => {
  const pane = 'Do you trust the files in this folder?\n  1. Yes, proceed\n  2. No, exit';
  assert.equal(detectInputWait(pane), 'Do you trust the files in this folder?');
});

test('press-enter waits are detected', () => {
  assert.equal(detectInputWait('done downloading\nPress Enter to continue'), 'Press Enter to continue');
});

test('ordinary output never matches (no false NEEDS YOU)', () => {
  assert.equal(detectInputWait('Compiling...\n1. Yes we refactored the parser\nDone.'), null);
  assert.equal(detectInputWait('The answer to "should we?" is documented in README'), null);
  assert.equal(detectInputWait('$ git status\nnothing to commit'), null);
  assert.equal(detectInputWait(''), null);
});

test('a question scrolled far above the tail does not match', () => {
  const scrolledPast = ['Do you want to allow this command?', '  1. Yes']
    .concat(Array.from({ length: 30 }, (_, i) => `log line ${i}`))
    .join('\n');
  assert.equal(detectInputWait(scrolledPast), null);
});
