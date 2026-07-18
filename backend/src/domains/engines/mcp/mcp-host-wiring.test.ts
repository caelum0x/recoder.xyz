/**
 * Regression: the interop MCP host must not advertise engine servers whose tools
 * permanently fail on call, and its wiring guard must not be FOOLED into thinking
 * an unbound server is wired.
 *
 * Before the fix:
 *  - `recoder.tasks` / `recoder.runs` / `recoder.artifacts` / `recoder.approvals`
 *    / `recoder.memory` were seeded into the gated catalog (`enabled: true`) with
 *    their write+read tools, yet the composer supplies NO binder for them, so a
 *    call returned `{ status: 'failed', reason: 'No MCP handler registered …' }`.
 *  - `bindInProcEngines` registered a delegating in-proc handler for EVERY
 *    `ENGINE_SERVERS` tool regardless of a real binder, so `assertWiringComplete`
 *    saw a handler for every tool and never fired — the gap only surfaced on call.
 *
 * After the fix these dead duplicates are gone from the catalog, and an
 * `ENGINE_SERVERS` server with no supplied binder gets NO fake handler, so the
 * wiring guard flags it LOUDLY at boot (via `onWiringWarning`).
 */
import { describe, it, expect } from 'vitest';
import {
  McpToolRouter,
  notifyMcpServer,
  coordinationMcpServer,
} from '@recoder/agent-mcp';
import { InteropHostBundle } from './mcp-host.js';
import { IN_PROC_SERVERS } from './engine-registry.js';
import { ENGINE_SERVERS } from './inproc-router.js';
import type { McpServerRegistration, McpToolCallInput } from '../ports/mcp-host.port.js';

const DEAD_DUPLICATES = [
  'recoder.tasks',
  'recoder.runs',
  'recoder.artifacts',
  'recoder.approvals',
  'recoder.memory',
] as const;

/** A minimal permissive actor (mirrors the domain-tools bridge host tests). */
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

describe('engines MCP catalog — dead-duplicate servers de-advertised', () => {
  it('IN_PROC_SERVERS + ENGINE_SERVERS no longer list tasks/runs/artifacts/approvals/memory', () => {
    const advertised = new Set(IN_PROC_SERVERS.map((server) => server.serverId));
    const engine = new Set(ENGINE_SERVERS.map((server) => server.serverId));
    for (const id of DEAD_DUPLICATES) {
      expect(advertised.has(id)).toBe(false);
      expect(engine.has(id)).toBe(false);
    }
  });

  it('a real host does not expose the dead servers in its gated registry', () => {
    const host = new InteropHostBundle({});
    for (const id of DEAD_DUPLICATES) {
      expect(host.getServer(id)).toBeNull();
    }
  });
});

describe('engines MCP host — bindInProcEngines binds only real handlers', () => {
  // A single custom binder that registers ONE ENGINE_SERVERS server's tool.
  const notifyBinder = (router: McpToolRouter): void => {
    router.register(notifyMcpServer, 'notify.send', async () => ({ content: { sent: true } }));
  };

  it('flags an advertised-but-unbound engine server loudly (guard is not fooled)', () => {
    const warnings: string[] = [];
    // Only `notify` is bound; every other ENGINE_SERVERS server is left unbound.
    new InteropHostBundle({
      engineBinders: [notifyBinder],
      onWiringWarning: (err) => warnings.push(err instanceof Error ? err.message : String(err)),
    });
    expect(warnings).toHaveLength(1);
    // The unbound server IS named (previously the fake handler hid it).
    expect(warnings[0]).toContain('recoder.coordination:coordination.acquire_lock');
    // The bound server is NOT flagged.
    expect(warnings[0]).not.toContain('recoder.notify:notify.send');
  });

  it('a bound engine tool executes; an unbound one fails truthfully (no fake handler)', async () => {
    const host = new InteropHostBundle({
      engineBinders: [notifyBinder],
      onWiringWarning: () => undefined,
    });

    // Bound server → real in-proc handler → completes through the gate.
    const bound = await host.call(gatedCall(notifyMcpServer, 'notify.send', { message: 'hi' }));
    expect(bound.status).toBe('completed');
    if (bound.status === 'completed') expect(bound.result.content).toEqual({ sent: true });

    // Unbound-but-advertised server → NO delegating handler was registered, so
    // the executor surfaces a truthful "no executor wired" failure (NOT a silent
    // fake handler that then throws "No MCP handler registered").
    const unbound = await host.call(
      gatedCall(coordinationMcpServer, 'coordination.acquire_lock', {}),
    );
    expect(unbound.status).toBe('failed');
    if (unbound.status === 'failed') {
      expect(unbound.reason).toContain('No in-proc executor wired');
    }
  });
});
