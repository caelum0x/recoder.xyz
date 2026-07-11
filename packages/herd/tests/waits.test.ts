/**
 * Blocked-on-input triage — a RUNNING workspace whose run log shows an
 * unanswered needs_input (no newer output after the prompt) is NEEDS YOU,
 * shown with the prompt itself. Answered prompts (newer log output) clear.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from '@recoder/agent-os';
import { waitingPrompt } from '../src/waits.js';
import { herdStatus } from '../src/classify.js';
import { renderFrame, stripAnsi, attachTargets } from '../src/render.js';

function ev(type: string, message: string, createdAt: string) {
  return { eventId: `e_${createdAt}`, type, taskId: 't', runId: 'r', message, createdAt } as never;
}

test('waitingPrompt: unanswered needs_input (newest event) → the prompt', () => {
  const events = [
    ev('started', 'Run started', '2026-07-11T00:00:00.000Z'),
    ev('log', 'working...', '2026-07-11T00:00:03.000Z'),
    ev('needs_input', 'Overwrite existing file? (y/n)', '2026-07-11T00:00:06.000Z'),
  ];
  assert.equal(waitingPrompt(events), 'Overwrite existing file? (y/n)');
});

test('waitingPrompt: newer log output after the prompt → answered, no wait', () => {
  const events = [
    ev('needs_input', 'Continue? [y/N]', '2026-07-11T00:00:06.000Z'),
    ev('log', 'continuing...', '2026-07-11T00:00:09.000Z'),
  ];
  assert.equal(waitingPrompt(events), null);
});

test('waitingPrompt: no needs_input → null', () => {
  assert.equal(waitingPrompt([ev('log', 'x', '2026-07-11T00:00:00.000Z')]), null);
});

test('herdStatus: a working state that is waiting on input is needs_you', () => {
  assert.equal(herdStatus('running', { waiting: true }), 'needs_you');
  assert.equal(herdStatus('running'), 'working');
  // Review/terminal states are unaffected by the waiting flag.
  assert.equal(herdStatus('merged', { waiting: true }), 'done');
});

function ws(overrides: Partial<Workspace>): Workspace {
  return {
    workspaceId: 'ws_1',
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_1',
    baseRef: 'HEAD',
    state: 'running',
    createdBy: 'u',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...overrides,
  } as Workspace;
}

test('renderFrame: a waiting workspace renders under NEEDS YOU with its prompt', () => {
  const workspaces = [ws({ workspaceId: 'ws_w', metadata: { prompt: 'refactor auth' } })];
  const waits = { ws_w: 'Do you want to allow this command?' };
  const frame = stripAnsi(renderFrame({ workspaces, backend: 'http://x', waits }));
  assert.match(frame, /NEEDS YOU/);
  assert.match(frame, /needs input/);
  assert.match(frame, /Do you want to allow this command\?/);
  assert.match(frame, /1 needs you/);
  // attach ordering agrees with the frame.
  assert.equal(attachTargets(workspaces, waits)[0]?.workspaceId, 'ws_w');
});
