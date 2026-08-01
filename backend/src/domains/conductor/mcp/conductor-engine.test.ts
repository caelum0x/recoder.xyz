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
import type { Principal } from '../../identity/types.js';
import type { ReconcileFindingView } from '../types.js';
import type { CompareView, SiblingCompareEntry } from '../services/compare.service.js';
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

/**
 * W8-D1 — agent-callable sibling awareness. `conductor_siblings` /
 * `conductor_compare_group` give an agent read access to its OWN parallel-run
 * group (who else is on the task group, what each sibling changed, which files
 * are CONTESTED). These tests prove the engine (1) refuses an absent caller,
 * (2) anchors ownership on the named workspace with the no-oracle 403, (3) hands
 * the module a MINTED minimal principal mirroring the caller so the module's own
 * `compareAccessFilter`/`canAccessWorkspace` narrowing scopes the group exactly
 * as HTTP does (privileged callers pass NO principal ⇒ full-group internal read),
 * and (4) projects the compact agent payload — never the operator grid/attach
 * internals (`grid`, `sessionName`, `worktreePath`).
 */
describe('conductor sibling-awareness MCP tools (conductor_siblings / conductor_compare_group)', () => {
  /** A full compare-view sibling row INCLUDING internal fields the projection must drop. */
  function sibling(id: string, files: readonly string[]): SiblingCompareEntry {
    return {
      workspaceId: id,
      agent: 'claude_code',
      runtimeId: 'claude_code',
      branch: `branch-${id}`,
      state: 'running',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      diffStat: { files: files.length, additions: 5, deletions: 1 },
      changedFiles: files,
      sessionName: `sess-${id}`, // internal attach seam — must NOT reach the agent
      worktreePath: `/wt/${id}`, // internal attach seam — must NOT reach the agent
    };
  }

  interface CapturedCall {
    readonly method: 'workspaceSiblings' | 'compareTaskGroup';
    readonly arg: string;
    readonly principal: Principal | undefined;
  }

  /** The grouped view the fake module serves (two siblings contesting `shared.ts`). */
  const groupView: CompareView = {
    taskGroup: 'tg-1',
    count: 2,
    siblings: [sibling('ws-alice', ['a.ts', 'shared.ts']), sibling('ws-alice-2', ['b.ts', 'shared.ts'])],
    contested: [{ path: 'shared.ts', workspaceIds: ['ws-alice', 'ws-alice-2'] }],
  };

  /** A compare module capturing (arg, principal) per call; `siblingsResult` overrides the view. */
  function makeCompareModule(overrides?: { readonly siblingsResult: CompareView | null }): {
    module: ConductorModule;
    calls: CapturedCall[];
  } {
    const calls: CapturedCall[] = [];
    const alice = workspace('ws-alice', 'alice');
    const bob = workspace('ws-bob', 'bob');
    const module = {
      async getWorkspace(id: string) {
        return [alice, bob].find((w) => w.workspaceId === id) ?? null;
      },
      async workspaceSiblings(id: string, principal?: Principal) {
        calls.push({ method: 'workspaceSiblings', arg: id, principal });
        return overrides ? overrides.siblingsResult : groupView;
      },
      async compareTaskGroup(taskGroup: string, principal?: Principal) {
        calls.push({ method: 'compareTaskGroup', arg: taskGroup, principal });
        return groupView;
      },
    } as unknown as ConductorModule;
    return { module, calls };
  }

  it('both tools refuse an absent caller (AUTH_REQUIRED)', async () => {
    const { module } = makeCompareModule();
    const tools = buildConductorMcpTools(module);
    await expect(
      tool(tools, 'conductor_siblings').handler({ workspaceId: 'ws-alice' }, undefined),
    ).rejects.toThrow(/AUTH_REQUIRED|authorized caller/i);
    await expect(
      tool(tools, 'conductor_compare_group').handler({ taskGroup: 'tg-1' }, undefined),
    ).rejects.toThrow(/AUTH_REQUIRED|authorized caller/i);
  });

  it('conductor_siblings: owner gets the projected payload and the module sees a MINTED principal mirroring the caller', async () => {
    const { module, calls } = makeCompareModule();
    const tools = buildConductorMcpTools(module);
    const res = (await tool(tools, 'conductor_siblings').handler(
      { workspaceId: 'ws-alice' },
      caller('alice', ['read'], 'org-1'),
    )) as {
      taskGroup: string | null;
      count: number;
      siblings: Record<string, unknown>[];
      contested: unknown[];
    };
    // Projected payload only — no grid/sessionName/worktreePath internals.
    expect(Object.keys(res).sort()).toEqual(['contested', 'count', 'siblings', 'taskGroup']);
    expect(res.taskGroup).toBe('tg-1');
    expect(res.count).toBe(2);
    expect(res.siblings.map((s) => s.workspaceId)).toEqual(['ws-alice', 'ws-alice-2']);
    expect(res.siblings[0].diffStat).toEqual({ files: 2, additions: 5, deletions: 1 });
    expect(res.siblings[0].changedFiles).toEqual(['a.ts', 'shared.ts']);
    expect(res.contested).toEqual([{ path: 'shared.ts', workspaceIds: ['ws-alice', 'ws-alice-2'] }]);
    expect(JSON.stringify(res)).not.toContain('sessionName');
    expect(JSON.stringify(res)).not.toContain('worktreePath');
    // The module was invoked WITH a minted minimal principal mirroring the caller.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('workspaceSiblings');
    expect(calls[0].arg).toBe('ws-alice');
    expect(calls[0].principal).toMatchObject({
      userId: 'alice',
      orgId: 'org-1',
      scopes: ['read'],
      kind: 'apikey',
      isAnonymous: false,
    });
  });

  it('conductor_siblings: an anchor owned by another tenant is refused (403) and the module is never asked', async () => {
    const { module, calls } = makeCompareModule();
    const tools = buildConductorMcpTools(module);
    await expect(
      tool(tools, 'conductor_siblings').handler({ workspaceId: 'ws-bob' }, caller('alice')),
    ).rejects.toThrow(/AUTHZ_PROJECT_ACCESS_DENIED|workspaces it owns/i);
    expect(calls).toHaveLength(0);
  });

  it('conductor_siblings: an unknown workspaceId is a truthful miss (no throw, module never asked)', async () => {
    const { module, calls } = makeCompareModule();
    const tools = buildConductorMcpTools(module);
    const res = (await tool(tools, 'conductor_siblings').handler(
      { workspaceId: 'ws-nope' },
      caller('alice'),
    )) as { workspace: null };
    expect(res.workspace).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('conductor_siblings: an admin caller passes NO principal (full-group internal read)', async () => {
    const { module, calls } = makeCompareModule();
    const tools = buildConductorMcpTools(module);
    await tool(tools, 'conductor_siblings').handler({ workspaceId: 'ws-bob' }, caller('ops', ['admin']));
    expect(calls).toHaveLength(1);
    expect(calls[0].principal).toBeUndefined();
  });

  it('conductor_siblings: module returning null degrades to the same truthful miss (never a throw)', async () => {
    const { module } = makeCompareModule({ siblingsResult: null });
    const tools = buildConductorMcpTools(module);
    const res = (await tool(tools, 'conductor_siblings').handler(
      { workspaceId: 'ws-alice' },
      caller('alice'),
    )) as { workspace: null };
    expect(res.workspace).toBeNull();
  });

  it('conductor_compare_group: happy path projects {taskGroup,count,siblings,contested} and mints the caller principal', async () => {
    const { module, calls } = makeCompareModule();
    const tools = buildConductorMcpTools(module);
    const res = (await tool(tools, 'conductor_compare_group').handler(
      { taskGroup: 'tg-1' },
      caller('alice', ['read'], 'org-1'),
    )) as { taskGroup: string | null; count: number; siblings: Record<string, unknown>[] };
    expect(Object.keys(res).sort()).toEqual(['contested', 'count', 'siblings', 'taskGroup']);
    expect(res.count).toBe(2);
    expect(Object.keys(res.siblings[0]).sort()).toEqual([
      'agent',
      'branch',
      'changedFiles',
      'diffStat',
      'state',
      'workspaceId',
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('compareTaskGroup');
    expect(calls[0].arg).toBe('tg-1');
    expect(calls[0].principal).toMatchObject({ userId: 'alice', orgId: 'org-1' });
    // Internal (`internal` scope) callers read the full group with NO principal.
    await tool(tools, 'conductor_compare_group').handler({ taskGroup: 'tg-1' }, caller('ops', ['internal']));
    expect(calls[1].principal).toBeUndefined();
  });
});
