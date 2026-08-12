/**
 * The `recoder_remote_attach` / `recoder_remote_snapshot` / `recoder_remote_steer`
 * MCP tools — prove the GOVERNED, owner-scoped binding: identity is the HOST caller
 * (never `args.userId`); an absent caller ⇒ `AUTH_REQUIRED` (surface never invoked);
 * the caller-derived principal + args flow straight to the service; and the
 * seams-unwired path surfaces `SERVICE_UNAVAILABLE`. The deep session/ownership/
 * capability/policy invariants are proven in `remote-attach.service.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import { AppError, ErrorCode, createError } from '../../../shared/errors.js';
import type { StatusBoardSnapshot } from '../attention/status-board.service.js';
import { STATUS_BOARD_COLUMNS } from '../attention/status-board.service.js';
import type {
  RemoteAttachCapability,
  RemoteAttachScope,
  RemoteAttachSession,
  RemoteSteerResult,
} from '../remote-attach/remote-attach.types.js';
import {
  buildConductorRemoteAttachTools,
  type RemoteAttachSurface,
} from './conductor-remote-attach-tool.js';

const OWNER: McpToolCaller = {
  userId: 'user-1',
  orgId: 'org-1',
  scopes: ['read', 'write'],
};

function emptyBoard(): StatusBoardSnapshot {
  const columns = {} as StatusBoardSnapshot['columns'];
  const totals = {} as StatusBoardSnapshot['totals'];
  for (const state of STATUS_BOARD_COLUMNS) {
    columns[state] = [];
    totals[state] = 0;
  }
  return { scope: {}, columns, totals, total: 0, degraded: false };
}

/** A fake surface recording every call; togglable to simulate the unwired seam. */
class FakeSurface implements RemoteAttachSurface {
  readonly attaches: Array<{
    principal: Principal;
    scope: RemoteAttachScope;
    capabilities: readonly RemoteAttachCapability[];
  }> = [];
  readonly snapshots: Array<{ sessionId: string; principal: Principal }> = [];
  readonly steers: Array<{
    sessionId: string;
    principal: Principal;
    workspaceId: string;
    input: string;
  }> = [];

  constructor(private readonly wired = true) {}

  private wall(): never {
    throw createError(
      ErrorCode.SERVICE_UNAVAILABLE,
      'conductor: governed remote attach is not configured on this deployment'
    );
  }

  async remoteAttach(input: {
    principal: Principal;
    scope: RemoteAttachScope;
    capabilities: readonly RemoteAttachCapability[];
  }): Promise<RemoteAttachSession> {
    this.attaches.push(input);
    if (!this.wired) this.wall();
    return {
      sessionId: 'sess-1',
      principalId: input.principal.userId,
      scope: input.scope,
      capabilities: input.capabilities,
      issuedAt: '1970-01-01T00:00:00.000Z',
      expiresAt: '1970-01-01T00:10:00.000Z',
    };
  }

  async remoteSnapshot(input: {
    sessionId: string;
    principal: Principal;
  }): Promise<StatusBoardSnapshot> {
    this.snapshots.push(input);
    if (!this.wired) this.wall();
    return emptyBoard();
  }

  async remoteSteer(input: {
    sessionId: string;
    principal: Principal;
    workspaceId: string;
    input: string;
  }): Promise<RemoteSteerResult> {
    this.steers.push(input);
    if (!this.wired) this.wall();
    return { status: 'delivered', workspaceId: input.workspaceId, auditId: 'audit-1' };
  }
}

function tools(surface: RemoteAttachSurface) {
  const regs = buildConductorRemoteAttachTools(surface);
  expect(regs.map(r => r.name)).toEqual([
    'recoder_remote_attach',
    'recoder_remote_snapshot',
    'recoder_remote_steer',
  ]);
  const byName = new Map(regs.map(r => [r.name, r]));
  return {
    attach: byName.get('recoder_remote_attach')!,
    snapshot: byName.get('recoder_remote_snapshot')!,
    steer: byName.get('recoder_remote_steer')!,
  };
}

describe('recoder_remote_attach tool', () => {
  it('mints from the HOST caller identity, forwarding scope + capabilities', async () => {
    const surface = new FakeSurface();
    const { attach } = tools(surface);
    const out = (await attach.handler(
      { workspaceIds: ['ws-1', 'ws-2'], capabilities: ['monitor', 'steer'] },
      OWNER
    )) as RemoteAttachSession;

    expect(out.sessionId).toBe('sess-1');
    expect(surface.attaches).toHaveLength(1);
    expect(surface.attaches[0].principal.userId).toBe('user-1');
    expect(surface.attaches[0].scope.workspaceIds).toEqual(['ws-1', 'ws-2']);
    expect(surface.attaches[0].capabilities).toEqual(['monitor', 'steer']);
  });

  it('defaults capabilities to monitor-only and drops unknown ones', async () => {
    const surface = new FakeSurface();
    const { attach } = tools(surface);
    await attach.handler({ workspaceIds: ['ws-1'], capabilities: ['steer', 'root'] }, OWNER);
    // 'root' dropped; stable order keeps monitor before steer regardless of input order.
    expect(surface.attaches[0].capabilities).toEqual(['steer']);

    await attach.handler({ workspaceIds: ['ws-1'] }, OWNER);
    expect(surface.attaches[1].capabilities).toEqual(['monitor']);
  });

  it('refuses without an authenticated caller (surface never invoked)', async () => {
    const surface = new FakeSurface();
    const { attach } = tools(surface);
    await expect(attach.handler({ workspaceIds: ['ws-1'] }, undefined)).rejects.toBeInstanceOf(
      AppError
    );
    expect(surface.attaches).toHaveLength(0);
  });

  it('propagates SERVICE_UNAVAILABLE when the seams are unwired', async () => {
    const surface = new FakeSurface(false);
    const { attach } = tools(surface);
    await expect(
      attach.handler({ workspaceIds: ['ws-1'] }, OWNER)
    ).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
  });
});

describe('recoder_remote_snapshot tool', () => {
  it('forwards the sessionId + HOST principal', async () => {
    const surface = new FakeSurface();
    const { snapshot } = tools(surface);
    await snapshot.handler({ sessionId: 'sess-1' }, OWNER);
    expect(surface.snapshots[0]).toMatchObject({ sessionId: 'sess-1' });
    expect(surface.snapshots[0].principal.userId).toBe('user-1');
  });

  it('requires a sessionId (surface never invoked)', async () => {
    const surface = new FakeSurface();
    const { snapshot } = tools(surface);
    await expect(snapshot.handler({}, OWNER)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    expect(surface.snapshots).toHaveLength(0);
  });

  it('refuses without an authenticated caller', async () => {
    const surface = new FakeSurface();
    const { snapshot } = tools(surface);
    await expect(snapshot.handler({ sessionId: 'sess-1' }, undefined)).rejects.toBeInstanceOf(
      AppError
    );
    expect(surface.snapshots).toHaveLength(0);
  });
});

describe('recoder_remote_steer tool', () => {
  it('forwards sessionId, workspaceId, input + HOST principal', async () => {
    const surface = new FakeSurface();
    const { steer } = tools(surface);
    const out = (await steer.handler(
      { sessionId: 'sess-1', workspaceId: 'ws-1', input: 'run tests' },
      OWNER
    )) as RemoteSteerResult;
    expect(out.status).toBe('delivered');
    expect(surface.steers[0]).toMatchObject({
      sessionId: 'sess-1',
      workspaceId: 'ws-1',
      input: 'run tests',
    });
    expect(surface.steers[0].principal.userId).toBe('user-1');
  });

  it('requires sessionId, workspaceId and a non-empty input (surface never invoked)', async () => {
    const surface = new FakeSurface();
    const { steer } = tools(surface);
    await expect(
      steer.handler({ workspaceId: 'ws-1', input: 'x' }, OWNER)
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      steer.handler({ sessionId: 'sess-1', input: 'x' }, OWNER)
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      steer.handler({ sessionId: 'sess-1', workspaceId: 'ws-1', input: '   ' }, OWNER)
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    expect(surface.steers).toHaveLength(0);
  });

  it('refuses without an authenticated caller', async () => {
    const surface = new FakeSurface();
    const { steer } = tools(surface);
    await expect(
      steer.handler({ sessionId: 'sess-1', workspaceId: 'ws-1', input: 'x' }, undefined)
    ).rejects.toBeInstanceOf(AppError);
    expect(surface.steers).toHaveLength(0);
  });
});
