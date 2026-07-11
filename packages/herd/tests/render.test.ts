/**
 * Herd frame rendering — pure string output (testable without a TTY).
 *
 * The frame is truthful: it shows exactly the workspaces the conductor
 * reports, grouped needs_you → working → failed → done, labeled by GOAL
 * (metadata.prompt) with the branch as fallback, and never fabricates rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from '@recoder/agent-os';
import { renderFrame, stripAnsi } from '../src/render.js';

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

test('empty herd renders a truthful empty state, not fake rows', () => {
  const frame = stripAnsi(renderFrame({ workspaces: [], backend: 'http://127.0.0.1:3001' }));
  assert.match(frame, /no agents running/i);
  assert.match(frame, /127\.0\.0\.1:3001/);
});

test('groups by status with needs_you first and labels rows by goal', () => {
  const frame = stripAnsi(
    renderFrame({
      backend: 'http://127.0.0.1:3001',
      workspaces: [
        ws({ workspaceId: 'ws_a', state: 'running', metadata: { prompt: 'refactor auth' } }),
        ws({
          workspaceId: 'ws_b',
          state: 'awaiting_review',
          metadata: { prompt: 'add HELLO.txt' },
        }),
        ws({ workspaceId: 'ws_c', state: 'merged', branch: 'recoder/ws_c' }),
      ],
    }),
  );
  const needsYou = frame.indexOf('NEEDS YOU');
  const working = frame.indexOf('WORKING');
  const done = frame.indexOf('DONE');
  assert.ok(needsYou !== -1 && working !== -1 && done !== -1, frame);
  assert.ok(needsYou < working && working < done, 'needs_you renders first');
  assert.match(frame, /add HELLO\.txt/);
  assert.match(frame, /refactor auth/);
  // No prompt recorded → branch is the truthful fallback label.
  assert.match(frame, /recoder\/ws_c/);
});

test('rows are numbered for attach keys and the header counts truthfully', () => {
  const frame = stripAnsi(
    renderFrame({
      backend: 'http://127.0.0.1:3001',
      workspaces: [
        ws({ workspaceId: 'ws_a', state: 'running' }),
        ws({ workspaceId: 'ws_b', state: 'awaiting_review' }),
        ws({ workspaceId: 'ws_x', state: 'failed' }),
      ],
    }),
  );
  assert.match(frame, /1 needs you/);
  assert.match(frame, /1 working/);
  assert.match(frame, /1 failed/);
  assert.match(frame, /\[1\]/);
  assert.match(frame, /\[2\]/);
  assert.match(frame, /\[3\]/);
});

test('attachTargets orders rows exactly as rendered (key N attaches row N)', async () => {
  const { attachTargets } = await import('../src/render.js');
  const targets = attachTargets([
    ws({ workspaceId: 'ws_a', state: 'running', sessionName: 'recoder-a' }),
    ws({ workspaceId: 'ws_b', state: 'awaiting_review', sessionName: 'recoder-b' }),
  ]);
  // needs_you first — the review workspace is row [1].
  assert.equal(targets[0]?.workspaceId, 'ws_b');
  assert.equal(targets[1]?.workspaceId, 'ws_a');
});
