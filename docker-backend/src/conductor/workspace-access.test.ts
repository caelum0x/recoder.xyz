/**
 * workspace-access — ownership enforcement rules (2026-07-11 audit fix).
 *
 * The pure decision + stamping/scoping helpers, plus the route-level gate on
 * the REAL conductor router: user B mutating user A's workspace is 403 under
 * strict auth, while solo mode (single-user desktop) stays frictionless.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import {
  canAccessWorkspace,
  stampOwner,
  scopeBatchFilter,
} from './workspace-access';
import { createConductorRouter } from './conductor.routes';
import { agentOsContainer } from '../agent-os/service-container';
import type { Workspace } from '@recoder/agent-os';

function req(userId?: string): Request {
  return { userId, body: {}, params: {}, query: {}, headers: {} } as unknown as Request;
}

function strictEnv() {
  vi.stubEnv('STRICT_AUTH', 'true');
  vi.stubEnv('REQUIRE_AUTH', 'true');
  vi.stubEnv('RECODER_SOLO_MODE', '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('canAccessWorkspace (pure decision)', () => {
  it('strict mode: only the owner (or internal service) may mutate', () => {
    strictEnv();
    const ws = { createdBy: 'user-a' };
    expect(canAccessWorkspace('user-a', ws)).toBe(true);
    expect(canAccessWorkspace('user-b', ws)).toBe(false);
    expect(canAccessWorkspace('internal:worker', ws)).toBe(true);
    // Fail closed: strict auth with no identity attached.
    expect(canAccessWorkspace(undefined, ws)).toBe(false);
  });

  it('solo mode allows the single human regardless of createdBy', () => {
    strictEnv();
    vi.stubEnv('RECODER_SOLO_MODE', '1');
    expect(canAccessWorkspace('anyone', { createdBy: 'cockpit' })).toBe(true);
  });

  it('non-strict (migration/dev) mode allows — identities are placeholders', () => {
    vi.stubEnv('STRICT_AUTH', 'false');
    vi.stubEnv('RECODER_SOLO_MODE', '');
    expect(canAccessWorkspace('anonymous', { createdBy: 'someone-else' })).toBe(true);
  });
});

describe('stampOwner (ownership becomes real at create)', () => {
  it('strict mode: the verified caller overrides client-supplied createdBy', () => {
    strictEnv();
    expect(stampOwner(req('user-a'), 'squatted-name')).toBe('user-a');
  });

  it('internal services and non-strict mode keep the declared createdBy', () => {
    strictEnv();
    expect(stampOwner(req('internal:worker'), 'workflow-owner')).toBe('workflow-owner');
    vi.unstubAllEnvs();
    vi.stubEnv('STRICT_AUTH', 'false');
    expect(stampOwner(req('anonymous'), 'local-user')).toBe('local-user');
  });
});

describe("scopeBatchFilter (batch ops act only on the caller's workspaces)", () => {
  it('strict mode: the caller identity overrides any body-supplied filter', () => {
    strictEnv();
    expect(scopeBatchFilter(req('user-a'), { createdBy: 'user-b' })).toEqual({
      createdBy: 'user-a',
    });
    expect(scopeBatchFilter(req('user-a'), {})).toEqual({ createdBy: 'user-a' });
  });

  it('solo mode keeps the caller-supplied filter (single-user machine)', () => {
    strictEnv();
    vi.stubEnv('RECODER_SOLO_MODE', '1');
    expect(scopeBatchFilter(req('u'), {})).toEqual({});
  });
});

describe('route gate on the real conductor router', () => {
  const OWNED: Workspace = {
    workspaceId: 'ws_owned_by_a',
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_owned_by_a',
    baseRef: 'HEAD',
    state: 'awaiting_review',
    createdBy: 'user-a',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Workspace;

  beforeEach(() => {
    strictEnv();
    agentOsContainer.repository.upsertWorkspace(OWNED);
  });

  async function post(path: string, userId: string, body: Record<string, unknown> = {}) {
    const router = createConductorRouter();
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === path && l.route?.methods?.post,
    );
    if (!layer) throw new Error(`No route for POST ${path}`);
    const state = { statusCode: 200, jsonData: null as any };
    const res: any = {
      status(code: number) {
        state.statusCode = code;
        return res;
      },
      json(data: any) {
        state.jsonData = data;
        return res;
      },
    };
    for (const h of layer.route.stack.map((l: any) => l.handle)) {
      await h(
        {
          method: 'POST',
          userId,
          params: { workspaceId: OWNED.workspaceId },
          body,
          query: {},
          headers: {},
        },
        res,
        () => {},
      );
    }
    return state;
  }

  it("archive: user B gets 403 on user A's workspace; user A passes the gate", async () => {
    const denied = await post('/workspaces/:workspaceId/archive', 'user-b');
    expect(denied.statusCode).toBe(403);
    expect(denied.jsonData.error).toMatch(/another user/);

    const allowed = await post('/workspaces/:workspaceId/archive', 'user-a');
    expect(allowed.statusCode).not.toBe(403);
  });

  it("steer: user B cannot inject keystrokes into user A's agent", async () => {
    const denied = await post('/workspaces/:workspaceId/steer', 'user-b', { keys: 'echo hi\n' });
    expect(denied.statusCode).toBe(403);
  });

  it("merge: user B cannot deliver user A's workspace", async () => {
    const denied = await post('/workspaces/:workspaceId/merge', 'user-b', {});
    expect(denied.statusCode).toBe(403);
  });

  it("message: user B cannot continue user A's workspace", async () => {
    const denied = await post('/workspaces/:workspaceId/message', 'user-b', { text: 'hi' });
    expect(denied.statusCode).toBe(403);
  });

  it("pr: user B cannot open a PR for user A's workspace", async () => {
    const denied = await post('/workspaces/:workspaceId/pr', 'user-b', {});
    expect(denied.statusCode).toBe(403);
  });
});
