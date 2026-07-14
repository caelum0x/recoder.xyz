/**
 * GET /governance/audit on the REAL conductor router — exposes the Merkle
 * audit trail (entries + chain verification) that governance seals for every
 * delivery decision. Same router-stack harness as work-signals.routes.test.ts.
 *
 * Proves:
 *  - the route returns { verified: {ok, tipHash, entries}, entries: [...] }
 *    with REAL sealed entries after delivery decisions are made;
 *  - entries are newest-first and capped by ?limit=;
 *  - the chain verification is genuine (ok:true with a tip hash), never a
 *    fabricated green.
 */
import type { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createConductorRouter } from './conductor.routes';
import { decideDelivery, __resetGovernanceForTest } from './governance-gate';
import type { Workspace } from '@recoder/agent-os';

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_audit_route',
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_audit_route',
    baseRef: 'HEAD',
    state: 'awaiting_review',
    createdBy: 'u',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Workspace;
}

function makeRes(): { res: any; state: { statusCode: number; jsonData: any } } {
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
  return { res, state };
}

async function getAudit(router: Router, query: Record<string, unknown> = {}) {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === '/governance/audit' && l.route?.methods?.get,
  );
  if (!layer) throw new Error('No route for GET /governance/audit');
  const { res, state } = makeRes();
  for (const h of layer.route.stack.map((l: any) => l.handle)) {
    await h({ method: 'GET', query, params: {}, headers: {}, body: {} }, res, () => {});
  }
  return state;
}

describe('GET /governance/audit (Merkle audit trail)', () => {
  it('returns sealed entries newest-first with genuine chain verification', async () => {
    __resetGovernanceForTest();
    const router = createConductorRouter();

    const before = await getAudit(router);
    expect(before.jsonData.success).toBe(true);
    const baseline = before.jsonData.data.verified.entries;

    await decideDelivery(workspace({ workspaceId: 'ws_audit_r1' }), 'pr', false);
    await decideDelivery(workspace({ workspaceId: 'ws_audit_r2' }), 'merge', false);

    const after = await getAudit(router);
    const data = after.jsonData.data;
    expect(data.verified.ok).toBe(true);
    expect(data.verified.tipHash).toBeTruthy();
    expect(data.verified.entries).toBe(baseline + 2);
    // Newest first: seq strictly decreasing.
    const seqs = data.entries.map((e: any) => e.seq);
    expect([...seqs].sort((a: number, b: number) => b - a)).toEqual(seqs);
    // Each sealed entry carries the hash-chain fields.
    for (const e of data.entries.slice(0, 2)) {
      expect(typeof e.hash).toBe('string');
      expect(typeof e.prevHash).toBe('string');
      expect(typeof e.action).toBe('string');
      expect(typeof e.outcome).toBe('string');
    }
  });

  it('caps the returned entries via ?limit= (verification still covers the full chain)', async () => {
    __resetGovernanceForTest();
    const router = createConductorRouter();
    await decideDelivery(workspace({ workspaceId: 'ws_audit_l1' }), 'pr', false);
    await decideDelivery(workspace({ workspaceId: 'ws_audit_l2' }), 'pr', false);
    await decideDelivery(workspace({ workspaceId: 'ws_audit_l3' }), 'merge', false);

    const state = await getAudit(router, { limit: '2' });
    const data = state.jsonData.data;
    expect(data.entries.length).toBe(2);
    expect(data.verified.entries).toBeGreaterThanOrEqual(3);
  });
});
