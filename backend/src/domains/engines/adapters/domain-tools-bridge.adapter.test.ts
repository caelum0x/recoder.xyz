/**
 * Domain-tools bridge contract, over the REAL `InteropHostBundle` (the actual
 * interop `authorize → risk → execute → audit` gate — no fake host):
 *  - a bridged domain tool appears in the host's gated catalog (`listServers`)
 *    and its IN-PROCESS handler is invoked through `host.call()` with the
 *    validated `input.args`,
 *  - a serverId collision is logged + skipped truthfully (first wins — the
 *    existing registration keeps serving calls),
 *  - a duplicate tool name within one source is skipped (first wins) and
 *    reported in `collisions`,
 *  - an empty batch / empty tool list / absent host are truthful no-ops.
 */
import { describe, it, expect, vi } from 'vitest';
import { registerDomainToolsOnHost } from './domain-tools-bridge.adapter.js';
import { InteropHostBundle } from '../mcp/mcp-host.js';
import type { Logger } from '../../../shared/logger.js';
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { McpServerRegistration, McpToolCallInput } from '../ports/mcp-host.port.js';

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;
}

/** A minimal permissive actor (mirrors the upstream agent-mcp host tests). */
function gatedCall(
  server: McpServerRegistration,
  toolName: string,
  args: Record<string, unknown>,
): McpToolCallInput {
  return {
    server,
    toolName,
    actor: { agentId: 'agent_test', permissions: { toolRules: [] } },
    args,
  } as unknown as McpToolCallInput;
}

/** A bare host bundle: gated registry + real call chain, no engine binders. */
function realHost(): InteropHostBundle {
  return new InteropHostBundle({});
}

describe('registerDomainToolsOnHost (real interop host)', () => {
  it('registers a domain tool into the catalog and its handler is callable through host.call()', async () => {
    const host = realHost();
    const received: unknown[] = [];
    const tools: readonly McpToolRegistration[] = [
      {
        name: 'demo.echo',
        description: 'echo back the args',
        handler: (args: unknown) => {
          received.push(args);
          return { echoed: args };
        },
      },
    ];

    const [record] = registerDomainToolsOnHost(host, [{ serverId: 'demo', tools }], fakeLogger());
    expect(record?.skipped).toBe(false);
    expect(record?.registered).toEqual(['demo.echo']);
    expect(record?.collisions).toEqual([]);

    // Listable through the SAME gated catalog the engine tools live in.
    const listed = host.listServers().find((server) => server.serverId === 'demo');
    expect(listed).toBeDefined();
    expect(listed?.toolNames).toEqual(['demo.echo']);
    expect(listed?.metadata?.external).toBe(false);

    // Callable through the REAL gate: authorize → risk → execute → audit.
    const outcome = await host.call(gatedCall(listed as McpServerRegistration, 'demo.echo', { x: 1 }));
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.result.content).toEqual({ echoed: { x: 1 } });
      expect(outcome.result.metadata).toMatchObject({ serverId: 'demo', toolName: 'demo.echo' });
    }
    expect(received).toEqual([{ x: 1 }]);
  });

  it('a call to a tool OUTSIDE the registered allowlist is denied by the gate (never executed)', async () => {
    const host = realHost();
    const handler = vi.fn();
    registerDomainToolsOnHost(
      host,
      [{ serverId: 'demo', tools: [{ name: 'demo.echo', handler }] }],
      fakeLogger(),
    );
    const server = host.getServer('demo') as McpServerRegistration;
    const outcome = await host.call(gatedCall(server, 'demo.unregistered', {}));
    expect(outcome.status).toBe('denied');
    expect(handler).not.toHaveBeenCalled();
  });

  it('a serverId collision logs + skips truthfully (first registration keeps serving)', async () => {
    const host = realHost();
    const logger = fakeLogger();
    const first: McpToolRegistration = { name: 'demo.echo', handler: () => ({ from: 'first' }) };
    const second: McpToolRegistration = { name: 'demo.echo', handler: () => ({ from: 'second' }) };

    const records = registerDomainToolsOnHost(
      host,
      [
        { serverId: 'demo', tools: [first] },
        { serverId: 'demo', tools: [second] },
      ],
      logger,
    );

    expect(records[0]?.skipped).toBe(false);
    expect(records[1]?.skipped).toBe(true);
    expect(records[1]?.reason).toContain('serverId collision');
    expect(records[1]?.registered).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();

    // The FIRST registration still serves the gated call — never clobbered.
    const server = host.getServer('demo') as McpServerRegistration;
    const outcome = await host.call(gatedCall(server, 'demo.echo', {}));
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') expect(outcome.result.content).toEqual({ from: 'first' });
  });

  it('skips a serverId already seeded in the gated catalog (e.g. an engines catalog id)', () => {
    const host = realHost();
    const seeded = host.listServers()[0];
    expect(seeded).toBeDefined();
    const [record] = registerDomainToolsOnHost(
      host,
      [{ serverId: seeded!.serverId, tools: [{ name: 'demo.echo', handler: () => null }] }],
      fakeLogger(),
    );
    expect(record?.skipped).toBe(true);
    expect(record?.reason).toContain('serverId collision');
    // The seeded catalog registration is untouched.
    expect(host.getServer(seeded!.serverId)?.toolNames).toEqual(seeded!.toolNames);
  });

  it('a duplicate tool name within one source is skipped (first wins) and reported', async () => {
    const host = realHost();
    const logger = fakeLogger();
    const [record] = registerDomainToolsOnHost(
      host,
      [
        {
          serverId: 'demo',
          tools: [
            { name: 'demo.echo', handler: () => ({ from: 'first' }) },
            { name: 'demo.lookup', handler: () => ({ found: true }) },
            { name: 'demo.echo', handler: () => ({ from: 'duplicate' }) },
          ],
        },
      ],
      logger,
    );

    expect(record?.skipped).toBe(false);
    expect(record?.registered).toEqual(['demo.echo', 'demo.lookup']);
    expect(record?.collisions).toEqual(['demo.echo']);
    expect(logger.warn).toHaveBeenCalled();

    const server = host.getServer('demo') as McpServerRegistration;
    expect(server.toolNames).toEqual(['demo.echo', 'demo.lookup']);
    const outcome = await host.call(gatedCall(server, 'demo.echo', {}));
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') expect(outcome.result.content).toEqual({ from: 'first' });
  });

  it('an empty batch is a no-op and an empty tool list is a truthful skip', () => {
    const host = realHost();
    expect(registerDomainToolsOnHost(host, [], fakeLogger())).toEqual([]);

    const before = host.listServers().length;
    const [record] = registerDomainToolsOnHost(host, [{ serverId: 'demo', tools: [] }], fakeLogger());
    expect(record?.skipped).toBe(true);
    expect(record?.reason).toBe('no tools');
    expect(record?.collisions).toEqual([]);
    expect(host.listServers()).toHaveLength(before);
  });

  it('degrades safely to a truthful no-op + warn when the host is absent', () => {
    const logger = fakeLogger();
    const [record] = registerDomainToolsOnHost(
      null,
      [{ serverId: 'demo', tools: [{ name: 'demo.echo', handler: () => null }] }],
      logger,
    );
    expect(record?.skipped).toBe(true);
    expect(record?.reason).toBe('host absent');
    expect(logger.warn).toHaveBeenCalled();
  });
});
