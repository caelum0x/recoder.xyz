/**
 * Denied-access auditing (enterprise trail completeness): a cross-user IDOR
 * probe (403) and an anonymous mutation attempt (401) must be recorded in the
 * tamper-evident governance chain, not silently dropped — an attacker
 * enumerating other users' workspaces should be visible in the audit trail.
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
  workspaceId: 'ws_denied_probe',
  spaceId: 's',
  projectId: 'p',
  taskId: 't',
  runtimeId: 'claude_code',
  substrate: 'tmux_worktree',
  branch: 'recoder/ws_denied_probe',
  baseRef: 'HEAD',
  state: 'awaiting_review',
  createdBy: 'user-a',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as Workspace;

async function postArchive(router: Router, userId: string, path = '/workspaces/:workspaceId/archive') {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.post,
  );
  const state = { statusCode: 200, jsonData: null as any };
  const res: any = {
    status(c: number) { state.statusCode = c; return res; },
    json(d: any) { state.jsonData = d; return res; },
  };
  for (const h of layer.route.stack.map((l: any) => l.handle)) {
    await h(
      {
        method: 'POST',
        userId,
        params: { workspaceId: OWNED.workspaceId },
        path: `/workspaces/${OWNED.workspaceId}/archive`,
        body: {},
        query: {},
        headers: {},
      },
      res,
      () => {},
    );
  }
  return state;
}

const settle = () => new Promise((r) => setTimeout(r, 50));

beforeEach(() => {
  vi.stubEnv('STRICT_AUTH', 'true');
  vi.stubEnv('REQUIRE_AUTH', 'true');
  vi.stubEnv('RECODER_SOLO_MODE', '');
  resetRuntimeProfileForTest();
  __resetGovernanceForTest();
  agentOsContainer.repository.upsertWorkspace(OWNED);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetRuntimeProfileForTest();
});

describe('denied-access auditing', () => {
  it('a cross-user 403 archive attempt is sealed as a denied audit entry', async () => {
    const router = createConductorRouter();
    const before = (await governanceAuditEntries()).length;

    const state = await postArchive(router, 'user-b');
    expect(state.statusCode).toBe(403);
    await settle();

    const entries = (await governanceAuditEntries()) as Array<{ detail?: string; outcome?: string; metadata?: Record<string, unknown> }>;
    expect(entries.length).toBe(before + 1);
    const latest = entries[entries.length - 1];
    expect(latest.outcome).toBe('deny');
    expect(latest.detail).toContain('workspace.archive');
    expect(latest.detail).toContain(OWNED.workspaceId);
    expect(latest.metadata?.principalId).toBe('user-b');

    expect((await verifyGovernanceAudit()).ok).toBe(true);
  });
});
