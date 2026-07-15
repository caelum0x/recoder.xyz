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
import type { GovernanceKernelPort } from '../../../governance/ports/kernel.port.js';
import type { KernelStatus } from '../../../governance/types.js';
import type { NapiLoaderPort } from '../../ports/napi-loader.port.js';
import type {
  InProcToolHandler,
  McpHostPort,
  McpServerRegistration,
  McpToolCallInput,
} from '../../ports/mcp-host.port.js';
import {
  buildOpenfangMcpTools,
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
