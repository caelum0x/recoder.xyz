/**
 * Conductor mutations seal a tenant-scoped AuditEnvelope into the governance
 * Merkle chain (recoder-wh74) — proven on the REAL router: an archive mutation
 * adds a governance audit entry whose detail carries the action + target +
 * principal, and the chain still verifies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'express';

import { createConductorRouter } from './conductor.routes';
import {
  governanceAuditEntries,
  verifyGovernanceAudit,
  __resetGovernanceForTest,
} from './governance-gate';
import { resetRuntimeProfileForTest } from '../runtime-profile';
import { agentOsContainer } from '../agent-os/service-container';
import type { Workspace } from '@recoder/agent-os';

const OWNED: Workspace = {
  workspaceId: 'ws_audit_mut',
  spaceId: 's',
  projectId: 'p',
  taskId: 't',
  runtimeId: 'claude_code',
  substrate: 'tmux_worktree',
  branch: 'recoder/ws_audit_mut',
  baseRef: 'HEAD',
  state: 'merged',
  createdBy: 'user-a',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as Workspace;

async function postArchive(router: Router, userId: string) {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === '/workspaces/:workspaceId/archive' && l.route?.methods?.post,
  );
  const state = { statusCode: 200, jsonData: null as any };
  const res: any = {
    status(c: number) { state.statusCode = c; return res; },
    json(d: any) { state.jsonData = d; return res; },
  };
  for (const h of layer.route.stack.map((l: any) => l.handle)) {
    await h(
      { method: 'POST', userId, params: { workspaceId: OWNED.workspaceId }, body: {}, query: {}, headers: {} },
      res,
      () => {},
    );
  }
  return state;
}

// Give the fire-and-forget audit seal a tick to complete.
const settle = () => new Promise((r) => setTimeout(r, 50));

beforeEach(() => {
  vi.stubEnv('RECODER_SOLO_MODE', '1'); // embedded → LOCAL_TENANT, ownership open
  resetRuntimeProfileForTest();
  __resetGovernanceForTest();
  agentOsContainer.repository.upsertWorkspace(OWNED);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetRuntimeProfileForTest();
});

describe('conductor mutation → sealed audit envelope', () => {
  it('archive appends a verifiable governance audit entry for the action', async () => {
    const router = createConductorRouter();
    const before = (await governanceAuditEntries()).length;

    const state = await postArchive(router, 'op');
    expect(state.statusCode).not.toBe(403);
    await settle();

    const entries = (await governanceAuditEntries()) as Array<{
      detail?: string;
      metadata?: Record<string, unknown>;
    }>;
    expect(entries.length).toBe(before + 1);
    const latest = entries[entries.length - 1];
    expect(latest.detail).toContain('workspace.archive');
    expect(latest.detail).toContain(OWNED.workspaceId);
    expect(latest.metadata?.conductorAction).toBe('workspace.archive');
    expect(latest.metadata?.tenantId).toBe('local');

    const verified = await verifyGovernanceAudit();
    expect(verified.ok).toBe(true);
  });
});
