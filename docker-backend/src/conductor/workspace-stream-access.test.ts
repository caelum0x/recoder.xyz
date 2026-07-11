/**
 * Live-terminal WebSocket stream is ownership-checked (recoder-591c): the
 * stream replays another user's agent output, so a non-owner attach is closed
 * with policy code 1008 and never attaches; the owner attaches normally.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { handleWorkspaceStreamUpgrade } from './conductor.routes';
import { agentOsContainer } from '../agent-os/service-container';
import type { Workspace } from '@recoder/agent-os';

const OWNED: Workspace = {
  workspaceId: 'ws_stream_owner_a',
  spaceId: 's',
  projectId: 'p',
  taskId: 't',
  runtimeId: 'claude_code',
  substrate: 'tmux_worktree',
  branch: 'recoder/ws_stream_owner_a',
  baseRef: 'HEAD',
  state: 'running',
  createdBy: 'user-a',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as Workspace;

function fakeSocket() {
  const calls = { closed: null as null | { code?: number; reason?: string }, onEvents: [] as string[] };
  return {
    calls,
    close: (code?: number, reason?: string) => { calls.closed = { code, reason }; },
    on: (event: string) => { calls.onEvents.push(event); },
  };
}

function streamReq(workspaceId: string, userId?: string): Request {
  return { params: { workspaceId }, userId, headers: {}, query: {} } as unknown as Request;
}

beforeEach(() => {
  vi.stubEnv('STRICT_AUTH', 'true');
  vi.stubEnv('REQUIRE_AUTH', 'true');
  vi.stubEnv('RECODER_SOLO_MODE', '');
  agentOsContainer.repository.upsertWorkspace(OWNED);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('handleWorkspaceStreamUpgrade ownership', () => {
  it('closes a cross-user attach with policy code 1008 (no stream attached)', async () => {
    const sock = fakeSocket();
    await handleWorkspaceStreamUpgrade(sock, streamReq(OWNED.workspaceId, 'user-b'));
    expect(sock.calls.closed?.code).toBe(1008);
    expect(sock.calls.onEvents).not.toContain('close'); // never attached
  });

  it('closes on unknown workspace', async () => {
    const sock = fakeSocket();
    await handleWorkspaceStreamUpgrade(sock, streamReq('ws_nope', 'user-a'));
    expect(sock.calls.closed?.code).toBe(1008);
  });

  it('attaches for the owner (registers a close handler, not closed)', async () => {
    const sock = fakeSocket();
    await handleWorkspaceStreamUpgrade(sock, streamReq(OWNED.workspaceId, 'user-a'));
    expect(sock.calls.closed).toBeNull();
    expect(sock.calls.onEvents).toContain('close');
  });
});
