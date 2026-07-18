/**
 * Conductor READ MCP tools — cross-tenant subject-binding proof.
 *
 * A conductor `Workspace` is tenant-owned (`createdBy` + `tenant.orgId`). The MCP
 * host gate admits the read but does NOT scope WHICH tenant's rows return. These
 * tests prove the engine BINDS every read to the host-authorized `McpToolCaller`
 * (2nd handler arg): a non-privileged caller sees ONLY its own workspaces/findings,
 * a victim's id is never returned nor reachable by naming it (403), an absent
 * caller is refused (401), and `admin`/`internal` reads across tenants. The
 * pure-infra `conductor_substrates` tool carries no subject and stays open.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { ReconcileFindingView } from '../types.js';
import type { ConductorModule } from '../index.js';
import { buildConductorMcpTools } from './conductor-engine.js';

/** The edge-bound authorized caller the host threads as the 2nd handler arg. */
function caller(userId: string, scopes: readonly string[] = ['read'], orgId?: string): McpToolCaller {
  return { userId, scopes, ...(orgId ? { orgId } : {}) };
}

function workspace(id: string, createdBy: string, orgId?: string): Workspace {
  return {
    workspaceId: id,
    spaceId: 'space-1',
    projectId: `proj-${id}`,
    taskId: `task-${id}`,
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: `branch-${id}`,
    baseRef: 'main',
    state: 'running',
    createdBy,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(orgId ? { tenant: { tenantId: orgId, orgId } } : {}),
  };
}

function finding(id: string, workspaceId?: string): ReconcileFindingView {
  return {
    findingId: id,
    ...(workspaceId ? { workspaceId } : {}),
    kind: 'orphan_session',
    detail: {},
    observedAt: '2026-01-01T00:00:00.000Z',
    resolved: false,
  };
}

/** A read module seeded with two tenants' workspaces + findings. */
function makeModule(): ConductorModule {
  const alice = workspace('ws-alice', 'alice');
  const bob = workspace('ws-bob', 'bob');
  const findings: ReconcileFindingView[] = [
    finding('f-alice', 'ws-alice'),
    finding('f-bob', 'ws-bob'),
    finding('f-orphan'), // no workspaceId — operator-level orphan
  ];
  return {
    async listWorkspaces() {
      return [alice, bob];
    },
    async getWorkspace(id: string) {
      return [alice, bob].find((w) => w.workspaceId === id) ?? null;
    },
    substrates() {
      return [];
    },
    async listReconcileFindings(workspaceId?: string) {
      return workspaceId ? findings.filter((f) => f.workspaceId === workspaceId) : findings;
    },
  } as unknown as ConductorModule;
}

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found;
}

describe('conductor read MCP tools — cross-tenant binding', () => {
  const tools = buildConductorMcpTools(makeModule());

  it('conductor_list_workspaces returns ONLY the caller-owned workspace (victim never leaks)', async () => {
    const res = (await tool(tools, 'conductor_list_workspaces').handler({}, caller('alice'))) as {
      count: number;
      workspaces: { workspaceId: string }[];
    };
    expect(res.count).toBe(1);
    expect(res.workspaces.map((w) => w.workspaceId)).toEqual(['ws-alice']);
    // Bob's workspace id never reaches the caller.
    expect(JSON.stringify(res)).not.toContain('ws-bob');
  });

  it('conductor_list_workspaces refuses an absent caller (AUTH_REQUIRED)', async () => {
    await expect(tool(tools, 'conductor_list_workspaces').handler({}, undefined)).rejects.toThrow(
      /AUTH_REQUIRED|authorized caller/i,
    );
  });

  it('conductor_get_workspace refuses reading a workspace owned by another tenant (403)', async () => {
    await expect(
      tool(tools, 'conductor_get_workspace').handler({ workspaceId: 'ws-bob' }, caller('alice')),
    ).rejects.toThrow(/AUTHZ_PROJECT_ACCESS_DENIED|only read workspaces it owns/i);
  });

  it('conductor_get_workspace returns the caller-owned workspace', async () => {
    const res = (await tool(tools, 'conductor_get_workspace').handler(
      { workspaceId: 'ws-alice' },
      caller('alice'),
    )) as { workspace: Workspace | null };
    expect(res.workspace?.workspaceId).toBe('ws-alice');
  });

  it('conductor_reconcile_findings returns ONLY findings for owned workspaces (orphans + victim hidden)', async () => {
    const res = (await tool(tools, 'conductor_reconcile_findings').handler({}, caller('alice'))) as {
      count: number;
      findings: ReconcileFindingView[];
    };
    expect(res.findings.map((f) => f.findingId)).toEqual(['f-alice']);
    expect(JSON.stringify(res)).not.toContain('f-bob');
    expect(JSON.stringify(res)).not.toContain('f-orphan');
  });

  it('conductor_reconcile_findings refuses a foreign workspaceId selector (403)', async () => {
    await expect(
      tool(tools, 'conductor_reconcile_findings').handler({ workspaceId: 'ws-bob' }, caller('alice')),
    ).rejects.toThrow(/AUTHZ_PROJECT_ACCESS_DENIED|findings for workspaces it owns/i);
  });

  it('admin caller reads across tenants (all workspaces + all findings incl. orphans)', async () => {
    const list = (await tool(tools, 'conductor_list_workspaces').handler(
      {},
      caller('ops', ['admin']),
    )) as { count: number };
    expect(list.count).toBe(2);
    const findings = (await tool(tools, 'conductor_reconcile_findings').handler(
      {},
      caller('ops', ['internal']),
    )) as { findings: ReconcileFindingView[] };
    expect(findings.findings.map((f) => f.findingId)).toEqual(['f-alice', 'f-bob', 'f-orphan']);
  });

  it('conductor_substrates stays open (pure infra, no caller needed)', async () => {
    const res = (await tool(tools, 'conductor_substrates').handler({}, undefined)) as {
      substrates: unknown[];
    };
    expect(Array.isArray(res.substrates)).toBe(true);
  });
});
