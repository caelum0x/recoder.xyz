/**
 * `recoder_needs_you` MCP tool — proves the GOVERNED, owner-scoped binding: identity is
 * the HOST caller (never `args.userId`); a non-privileged caller reads only its OWN queue
 * (naming another userId is a 403); an admin/internal caller reads another subject; the
 * queue-unwired path surfaces `SERVICE_UNAVAILABLE`; and the snapshot flows straight back.
 */
import { describe, it, expect } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import { AppError, ErrorCode, createError } from '../../../shared/errors.js';
import type {
  NeedsYouScope,
  NeedsYouSnapshot,
} from '../attention/needs-you-queue.service.js';
import {
  buildConductorNeedsYouTools,
  type NeedsYouSurface,
} from './conductor-needs-you-tool.js';

const OWNER: McpToolCaller = {
  userId: 'user-1',
  orgId: 'org-1',
  scopes: ['read', 'write'],
};

function snapshotFor(scope: NeedsYouScope): NeedsYouSnapshot {
  return {
    scope,
    entries: [
      {
        workspaceId: 'ws_block',
        agentKind: 'claude',
        state: 'awaiting_approval',
        rank: 11,
        nativeStatus: 'blocked',
        needsYou: true,
        seen: false,
      },
    ],
    count: 1,
    total: 1,
    degraded: false,
  };
}

/** A fake surface that records the (scope, principal) it was called with. */
class FakeSurface implements NeedsYouSurface {
  readonly calls: Array<{ scope: NeedsYouScope; principal: Principal }> = [];
  constructor(private readonly wired = true) {}
  async needsYouSnapshot(
    scope: NeedsYouScope,
    principal: Principal
  ): Promise<NeedsYouSnapshot> {
    this.calls.push({ scope, principal });
    if (!this.wired) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: the live Needs-You queue is not configured on this deployment'
      );
    }
    return snapshotFor(scope);
  }
}

function tool(surface: NeedsYouSurface) {
  const [reg] = buildConductorNeedsYouTools(surface);
  expect(reg.name).toBe('recoder_needs_you');
  return reg;
}

describe('recoder_needs_you tool', () => {
  it('reads the caller-owned queue, binding the scope to the HOST caller', async () => {
    const surface = new FakeSurface();
    const reg = tool(surface);
    const out = (await reg.handler({}, OWNER)) as NeedsYouSnapshot;

    expect(out.count).toBe(1);
    expect(surface.calls).toHaveLength(1);
    // The scope owner + gate principal are the HOST caller, not any free-form arg.
    expect(surface.calls[0].scope.owner).toBe('user-1');
    expect(surface.calls[0].principal.userId).toBe('user-1');
    expect(surface.calls[0].principal.scopes).toContain('read');
  });

  it('passes an optional taskGroup narrow through', async () => {
    const surface = new FakeSurface();
    const reg = tool(surface);
    await reg.handler({ taskGroup: 'fan-round1' }, OWNER);
    expect(surface.calls[0].scope).toEqual({
      owner: 'user-1',
      taskGroup: 'fan-round1',
    });
  });

  it('refuses (403) when a non-privileged caller names a different userId', async () => {
    const surface = new FakeSurface();
    const reg = tool(surface);
    await expect(
      reg.handler({ userId: 'user-2' }, OWNER)
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    expect(surface.calls).toHaveLength(0);
  });

  it('lets an admin caller read another subject', async () => {
    const surface = new FakeSurface();
    const reg = tool(surface);
    const admin: McpToolCaller = { userId: 'root', scopes: ['admin'] };
    await reg.handler({ userId: 'user-9' }, admin);
    expect(surface.calls[0].scope.owner).toBe('user-9');
    expect(surface.calls[0].principal.userId).toBe('root');
  });

  it('refuses without an authenticated caller identity (surface never invoked)', async () => {
    const surface = new FakeSurface();
    const reg = tool(surface);
    await expect(reg.handler({}, undefined)).rejects.toBeInstanceOf(AppError);
    expect(surface.calls).toHaveLength(0);
  });

  it('propagates SERVICE_UNAVAILABLE when the queue is not wired (never a faked empty queue)', async () => {
    const surface = new FakeSurface(false);
    const reg = tool(surface);
    await expect(reg.handler({}, OWNER)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
  });
});
