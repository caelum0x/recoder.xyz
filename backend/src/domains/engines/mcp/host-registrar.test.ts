/**
 * `registerModuleToolsOnHost` bridge tests:
 *  - a domain's flat `mcp()` tools register a server (toolNames allowlist) + a
 *    delegating in-proc handler per tool,
 *  - a gated `host.call()` routes into the domain handler with `input.args` and
 *    returns the normalized `{ content }` envelope,
 *  - an absent host is a truthful no-op + warn (never a fabricated registration).
 */
import { describe, it, expect, vi } from 'vitest';
import { registerModuleToolsOnHost } from './host-registrar.js';
import type { Logger } from '../../../shared/logger.js';
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type {
  McpHostPort,
  InProcToolHandler,
  McpServerRegistration,
  McpToolCallInput,
  HostCallOutcome,
} from '../ports/mcp-host.port.js';

/** A minimal fake host that records registrations + simulates the gated execute. */
class FakeHost implements McpHostPort {
  readonly servers = new Map<string, McpServerRegistration>();
  readonly handlers = new Map<string, InProcToolHandler>();

  registerServer(server: McpServerRegistration): void {
    this.servers.set(server.serverId, server);
  }
  registerInProcTool(serverId: string, toolName: string, handler: InProcToolHandler): void {
    this.handlers.set(`${serverId}:${toolName}`, handler);
  }
  registerExternalServer(): void {
    /* unused in the bridge */
  }
  listServers(): McpServerRegistration[] {
    return [...this.servers.values()];
  }
  getServer(serverId: string): McpServerRegistration | null {
    return this.servers.get(serverId) ?? null;
  }
  authorize(): unknown {
    return { allowed: true };
  }
  /** Simulate authorize→risk (allow) → execute the bound handler → audit. */
  async call(input: McpToolCallInput): Promise<HostCallOutcome> {
    const server = this.servers.get(input.server.serverId);
    if (!server || !server.toolNames.includes(input.toolName)) {
      throw new Error(`unauthorized: ${input.server.serverId}:${input.toolName}`);
    }
    const handler = this.handlers.get(`${input.server.serverId}:${input.toolName}`);
    if (!handler) throw new Error(`no in-proc handler: ${input.toolName}`);
    return (await handler(input)) as unknown as HostCallOutcome;
  }
}

function fakeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function callInput(
  server: McpServerRegistration,
  toolName: string,
  args: Record<string, unknown>,
): McpToolCallInput {
  return { server, toolName, args } as unknown as McpToolCallInput;
}

describe('registerModuleToolsOnHost', () => {
  const alphaCalls: unknown[] = [];
  const tools: readonly McpToolRegistration[] = [
    {
      name: 'alpha_read',
      description: 'read alpha',
      handler: (args: unknown) => {
        alphaCalls.push(args);
        return { ok: 'alpha', echo: args };
      },
    },
    {
      name: 'beta_write',
      description: 'write beta',
      handler: async () => ({ ok: 'beta' }),
    },
  ];

  it('registers a server + a delegating handler per tool, and a gated call routes to the domain handler', async () => {
    alphaCalls.length = 0;
    const host = new FakeHost();

    const result = registerModuleToolsOnHost(host, 'demo', tools, fakeLogger());

    expect(result.skipped).toBe(false);
    expect(result.serverId).toBe('demo');
    expect(result.registered).toEqual(['alpha_read', 'beta_write']);

    const server = host.getServer('demo');
    expect(server).not.toBeNull();
    expect(server?.enabled).toBe(true);
    expect(server?.toolNames).toEqual(['alpha_read', 'beta_write']);
    expect(host.handlers.has('demo:alpha_read')).toBe(true);
    expect(host.handlers.has('demo:beta_write')).toBe(true);

    // A gated call routes through the delegating handler into the domain handler
    // with the validated `input.args`, normalized into `{ content }`.
    const out = await host.call(callInput(server as McpServerRegistration, 'alpha_read', { x: 1 }));
    expect((out as { content: unknown }).content).toEqual({ ok: 'alpha', echo: { x: 1 } });
    expect(alphaCalls).toEqual([{ x: 1 }]);

    const outBeta = await host.call(callInput(server as McpServerRegistration, 'beta_write', {}));
    expect((outBeta as { content: unknown }).content).toEqual({ ok: 'beta' });
  });

  it('degrades safely to a truthful no-op + warn when the host is absent', () => {
    const logger = fakeLogger();
    const result = registerModuleToolsOnHost(null, 'demo', tools, logger);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('host absent');
    expect(result.registered).toEqual([]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('skips truthfully on an empty tool list', () => {
    const host = new FakeHost();
    const result = registerModuleToolsOnHost(host, 'demo', [], fakeLogger());

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no tools');
    expect(host.listServers()).toHaveLength(0);
  });
});
