/**
 * napi engine group composer contract:
 *  - `createNapiEngineClients` yields the three typed clients (memoized),
 *  - the MCP tools are thin passthroughs: a live engine returns its value, a
 *    `down` engine returns a truthful `{ error, code }` (never a throw),
 *  - `registerNapiEngineTools` seeds the servers into the host + binds an in-proc
 *    handler per tool, and reports exactly what it registered.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import type { McpToolCaller } from '../../../../shared/module-base.js';
import type { GovernanceKernelPort } from '../../../governance/ports/kernel.port.js';
import type { KernelStatus } from '../../../governance/types.js';
import type { EngineClientPort, EngineCall } from '../../ports/engine-client.port.js';
import type { NapiLoaderPort } from '../../ports/napi-loader.port.js';
import type {
  EdgeBoundToolCallInput,
  InProcToolHandler,
  McpHostPort,
  McpServerRegistration,
  McpToolCallInput,
} from '../../ports/mcp-host.port.js';
import { ok, up, type InvokeResult } from '../../types.js';
import type { NapiArgs } from './napi-util.js';
import {
  buildOpenfangMcpTools,
  buildGovernanceKernelMcpTools,
  createNapiEngineClients,
  napiEngineClientList,
  registerNapiEngineTools,
  type NapiEngineClients,
} from './napi-engines.js';

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;

/** A loader that never resolves a `.node` (both napi engines degrade to `down`). */
const absentLoader: NapiLoaderPort = { resolvePath: () => null, load: () => null, evict: () => {} };

function fakeKernel(status: KernelStatus): GovernanceKernelPort {
  return {
    decide: async () => ({ effect: 'allow', tier: 'low', reason: 'ok', degraded: false, engine: status.engine }),
    enforceTool: async () => ({ outcome: 'allowed', reason: 'ok', degraded: false, engine: status.engine }),
    route: async () => ({ routable: true, tier: 'low', reason: 'ok' }),
    auditTip: async () => 'a'.repeat(64),
    verifyAudit: async () => ({ ok: true, entries: 0 }),
    status: () => status,
  };
}

function clients(): NapiEngineClients {
  return createNapiEngineClients({
    loader: absentLoader,
    logger: log,
    kernel: fakeKernel({ engine: 'napi', status: 'up', degraded: false }),
  });
}

/** A host that captures server + in-proc handler registrations. */
class CaptureHost implements McpHostPort {
  readonly servers: McpServerRegistration[] = [];
  readonly handlers = new Map<string, InProcToolHandler>();
  registerServer(server: McpServerRegistration): void { this.servers.push(server); }
  registerInProcTool(serverId: string, toolName: string, handler: InProcToolHandler): void {
    this.handlers.set(`${serverId}:${toolName}`, handler);
  }
  registerExternalServer(): void {}
  listServers(): McpServerRegistration[] { return this.servers; }
  getServer(): McpServerRegistration | null { return null; }
  authorize(): unknown { return { allowed: true }; }
  call(): never { throw new Error('not used'); }
}

describe('napi engine group composer', () => {
  it('memoizes the three typed engine clients', () => {
    const c = clients();
    expect(c.openfang()).toBe(c.openfang());
    expect(c.tensorzero()).toBe(c.tensorzero());
    expect(c.governanceKernel()).toBe(c.governanceKernel());
    expect(napiEngineClientList(c).map((client) => client.id)).toEqual(['openfang', 'tensorzero', 'governance']);
  });

  it('MCP tools passthrough truthfully: down engine → {error, code}', async () => {
    const tools = buildOpenfangMcpTools(clients().openfang());
    const listAgents = tools.find((tool) => tool.name === 'openfang.list_agents');
    expect(listAgents).toBeDefined();
    const payload = await listAgents!.handler({});
    expect(payload).toMatchObject({ code: 'ENGINE_DOWN' });
  });

  it('the generic openfang.invoke tool requires an op', async () => {
    const tools = buildOpenfangMcpTools(clients().openfang());
    const generic = tools.find((tool) => tool.name === 'openfang.invoke');
    const payload = await generic!.handler({});
    expect(payload).toMatchObject({ error: expect.stringMatching(/op is required/) });
  });

  it('registerNapiEngineTools seeds 3 servers + binds every tool, and reports them', () => {
    const host = new CaptureHost();
    const result = registerNapiEngineTools(host, clients());

    expect(result.servers).toEqual(['openfang', 'tensorzero', 'governance-kernel']);
    expect(host.servers.map((server) => server.serverId)).toEqual(result.servers);
    // Every reported tool has a bound in-proc handler.
    for (const key of result.tools) expect(host.handlers.has(key)).toBe(true);
    expect(result.tools).toContain('governance-kernel:governance.status');
    // The agent-runtime introspection tools are advertised on the openfang server
    // AND bound in-proc (no rebuild — composed over the existing napi surface).
    const openfang = host.servers.find((s) => s.serverId === 'openfang')!;
    expect(openfang.toolNames).toEqual(
      expect.arrayContaining(['openfang.introspect_hands', 'openfang.agent_run_status']),
    );
    expect(result.tools).toContain('openfang:openfang.introspect_hands');
    expect(result.tools).toContain('openfang:openfang.agent_run_status');
  });

  it('a bound in-proc handler returns an McpToolResult wrapping the live engine value', async () => {
    const host = new CaptureHost();
    registerNapiEngineTools(host, clients());
    const handler = host.handlers.get('governance-kernel:governance.status');
    expect(handler).toBeDefined();
    const result = await handler!({ args: {} } as unknown as McpToolCallInput);
    expect(result.metadata).toMatchObject({ external: false });
    expect(result.content).toMatchObject({ engine: 'napi', status: 'up' });
  });
});

// ---------------------------------------------------------------------------
// SECURITY: openfang agentId subject binding (cross-tenant KV memory / run)
// ---------------------------------------------------------------------------

/** A spy openfang client that records the `agentId` that reaches the engine seam. */
function spyOpenfang(): {
  engine: EngineClientPort<NapiArgs, unknown>;
  calls: Array<{ op: string; input: NapiArgs }>;
} {
  const calls: Array<{ op: string; input: NapiArgs }> = [];
  const engine: EngineClientPort<NapiArgs, unknown> = {
    id: 'openfang',
    transport: 'napi',
    start: async () => {},
    stop: async () => {},
    invoke: async (call: EngineCall<NapiArgs>): Promise<InvokeResult<unknown>> => {
      calls.push({ op: call.op, input: call.input });
      return ok({ echoed: call.input });
    },
    health: async () => up('openfang', 'napi'),
  };
  return { engine, calls };
}

/** Clients with a spy openfang (real tensorzero/governance are unused by these tests). */
function spiedClients(spy: EngineClientPort<NapiArgs, unknown>): NapiEngineClients {
  const base = clients();
  return {
    ...base,
    openfang: () => spy as unknown as ReturnType<NapiEngineClients['openfang']>,
  };
}

describe('openfang agentId subject binding (SECURITY)', () => {
  const alice: McpToolCaller = { userId: 'alice', scopes: ['read', 'write'] };

  // Every openfang tool that names a per-agent subject via `args.agentId`.
  const subjectTools: Array<{ tool: string; args: NapiArgs }> = [
    { tool: 'openfang.memory_get', args: { agentId: 'victim', key: 'k' } },
    { tool: 'openfang.memory_set', args: { agentId: 'victim', key: 'k', value: 'v' } },
    { tool: 'openfang.memory_list', args: { agentId: 'victim' } },
    { tool: 'openfang.run_agent', args: { agentId: 'victim', message: 'hi' } },
    // Composed agent-runtime introspection tool — agentId is a tenant subject too.
    { tool: 'openfang.agent_run_status', args: { agentId: 'victim' } },
  ];

  for (const { tool, args } of subjectTools) {
    it(`${tool}: a non-privileged caller cannot target another tenant's agent — victim id never reaches the seam`, async () => {
      const spy = spyOpenfang();
      const reg = buildOpenfangMcpTools(spy.engine).find((t) => t.name === tool);
      expect(reg).toBeDefined();
      // The spoof is rejected before the passthrough (403 authz error).
      await expect(reg!.handler(args, alice)).rejects.toThrow(/own agent/);
      // The victim id NEVER reaches the engine seam.
      expect(spy.calls).toHaveLength(0);
    });
  }

  it('openfang.introspect_hands is a GLOBAL read — no agentId subject binding', async () => {
    const spy = spyOpenfang();
    const tool = buildOpenfangMcpTools(spy.engine).find((t) => t.name === 'openfang.introspect_hands');
    expect(tool).toBeDefined();
    // No caller identity required; args pass through untouched to the composite op.
    await tool!.handler({}, undefined);
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toMatchObject({ op: 'introspectHands' });
  });

  it('openfang.agent_run_status binds the caller subject (agentId defaults to caller)', async () => {
    const spy = spyOpenfang();
    const tool = buildOpenfangMcpTools(spy.engine).find((t) => t.name === 'openfang.agent_run_status');
    expect(tool).toBeDefined();
    await tool!.handler({}, alice);
    expect(spy.calls[0]).toMatchObject({ op: 'agentRunStatus', input: { agentId: 'alice' } });
  });

  it('the generic openfang.invoke passthrough cannot bypass the binding', async () => {
    const spy = spyOpenfang();
    const generic = buildOpenfangMcpTools(spy.engine).find((t) => t.name === 'openfang.invoke');
    expect(generic).toBeDefined();
    await expect(
      generic!.handler({ op: 'memorySet', agentId: 'victim', key: 'k', value: 'v' }, alice),
    ).rejects.toThrow(/own agent/);
    expect(spy.calls).toHaveLength(0);
  });

  it('refuses (AUTH_REQUIRED) when there is no authorized caller', async () => {
    const spy = spyOpenfang();
    const set = buildOpenfangMcpTools(spy.engine).find((t) => t.name === 'openfang.memory_set');
    await expect(set!.handler({ agentId: 'alice', key: 'k', value: 'v' }, undefined)).rejects.toThrow(
      /no authorized caller/,
    );
    expect(spy.calls).toHaveLength(0);
  });

  it('a caller may address its OWN subject (agentId === caller.userId)', async () => {
    const spy = spyOpenfang();
    const set = buildOpenfangMcpTools(spy.engine).find((t) => t.name === 'openfang.memory_set');
    await set!.handler({ agentId: 'alice', key: 'k', value: 'v' }, alice);
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toMatchObject({ op: 'memorySet', input: { agentId: 'alice' } });
  });

  it('an absent agentId defaults to the caller subject (org scope wins)', async () => {
    const spy = spyOpenfang();
    const list = buildOpenfangMcpTools(spy.engine).find((t) => t.name === 'openfang.memory_list');
    const orgCaller: McpToolCaller = { userId: 'alice', orgId: 'org_1', scopes: ['read'] };
    await list!.handler({}, orgCaller);
    expect(spy.calls[0]?.input).toMatchObject({ agentId: 'org_1' });
  });

  it('an org member may address its own org subject', async () => {
    const spy = spyOpenfang();
    const get = buildOpenfangMcpTools(spy.engine).find((t) => t.name === 'openfang.memory_get');
    const orgCaller: McpToolCaller = { userId: 'alice', orgId: 'org_1', scopes: ['read'] };
    await get!.handler({ agentId: 'org_1', key: 'k' }, orgCaller);
    expect(spy.calls[0]?.input).toMatchObject({ agentId: 'org_1', key: 'k' });
  });

  it('an admin/internal caller MAY name an arbitrary subject (service on behalf of a tenant)', async () => {
    const spy = spyOpenfang();
    const set = buildOpenfangMcpTools(spy.engine).find((t) => t.name === 'openfang.memory_set');
    const svc: McpToolCaller = { userId: 'svc', scopes: ['internal'] };
    await set!.handler({ agentId: 'tenant_agent', key: 'k', value: 'v' }, svc);
    expect(spy.calls[0]?.input).toMatchObject({ agentId: 'tenant_agent' });
  });

  it('the FULL in-proc path binds the EDGE-BOUND caller, not the spoofable actor.agentId', async () => {
    const spy = spyOpenfang();
    const host = new CaptureHost();
    registerNapiEngineTools(host, spiedClients(spy.engine));
    const handler = host.handlers.get('openfang:openfang.memory_set');
    expect(handler).toBeDefined();
    // Edge-bound caller is alice; the args name the victim + a spoofed actor.agentId.
    const input = {
      args: { agentId: 'victim', key: 'k', value: 'v' },
      actor: { agentId: 'victim' },
      caller: { userId: 'alice', scopes: ['write'] },
    } as unknown as EdgeBoundToolCallInput;
    const result = await handler!(input);
    // Truthful error surfaced (never throws across the seam); victim never reached invoke.
    expect(result.content).toMatchObject({ error: expect.stringMatching(/own agent/) });
    expect(spy.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SECURITY: governance actorId subject binding (cross-tenant policy-posture read)
// ---------------------------------------------------------------------------

/** A spy governance client that records the `actorId` that reaches the engine seam. */
function spyGovernance(): {
  engine: EngineClientPort<NapiArgs, unknown>;
  calls: Array<{ op: string; input: NapiArgs }>;
} {
  const calls: Array<{ op: string; input: NapiArgs }> = [];
  const engine: EngineClientPort<NapiArgs, unknown> = {
    id: 'governance',
    transport: 'napi',
    start: async () => {},
    stop: async () => {},
    invoke: async (call: EngineCall<NapiArgs>): Promise<InvokeResult<unknown>> => {
      calls.push({ op: call.op, input: call.input });
      return ok({ echoed: call.input });
    },
    health: async () => up('governance', 'napi'),
  };
  return { engine, calls };
}

describe('governance actorId subject binding (SECURITY)', () => {
  const alice: McpToolCaller = { userId: 'alice', scopes: ['read', 'write'] };

  // Every governance tool that names an actor subject via `args.actorId`.
  const subjectTools: Array<{ tool: string; args: NapiArgs }> = [
    { tool: 'governance.decide', args: { actorId: 'victim', action: 'tool.call', target: {} } },
    { tool: 'governance.explain_decision', args: { actorId: 'victim', action: 'tool.call', target: {} } },
  ];

  for (const { tool, args } of subjectTools) {
    it(`${tool}: a non-privileged caller cannot evaluate a decision for another actor — victim id never reaches the seam`, async () => {
      const spy = spyGovernance();
      const reg = buildGovernanceKernelMcpTools(spy.engine).find((t) => t.name === tool);
      expect(reg).toBeDefined();
      await expect(reg!.handler(args, alice)).rejects.toThrow(/own actor/);
      expect(spy.calls).toHaveLength(0);
    });
  }

  it('governance.explain_decision binds the caller subject (actorId defaults to caller)', async () => {
    const spy = spyGovernance();
    const tool = buildGovernanceKernelMcpTools(spy.engine).find((t) => t.name === 'governance.explain_decision');
    expect(tool).toBeDefined();
    await tool!.handler({ action: 'tool.call', target: {} }, alice);
    expect(spy.calls[0]).toMatchObject({ op: 'explain', input: { actorId: 'alice' } });
  });

  it('governance.status is a GLOBAL read — no actorId subject binding, no caller required', async () => {
    const spy = spyGovernance();
    const tool = buildGovernanceKernelMcpTools(spy.engine).find((t) => t.name === 'governance.status');
    expect(tool).toBeDefined();
    await tool!.handler({}, undefined);
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toMatchObject({ op: 'status' });
  });

  it('refuses (AUTH_REQUIRED) when a subject tool has no authorized caller', async () => {
    const spy = spyGovernance();
    const explain = buildGovernanceKernelMcpTools(spy.engine).find((t) => t.name === 'governance.explain_decision');
    await expect(explain!.handler({ actorId: 'alice', action: 'tool.call', target: {} }, undefined)).rejects.toThrow(
      /no authorized caller/,
    );
    expect(spy.calls).toHaveLength(0);
  });

  it('an admin/internal caller MAY evaluate a decision for an arbitrary actor', async () => {
    const spy = spyGovernance();
    const explain = buildGovernanceKernelMcpTools(spy.engine).find((t) => t.name === 'governance.explain_decision');
    const svc: McpToolCaller = { userId: 'svc', scopes: ['internal'] };
    await explain!.handler({ actorId: 'tenant_actor', action: 'tool.call', target: {} }, svc);
    expect(spy.calls[0]?.input).toMatchObject({ actorId: 'tenant_actor' });
  });
});
