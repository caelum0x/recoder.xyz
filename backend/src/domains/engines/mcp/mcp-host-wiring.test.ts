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
 *  - `recoder.billing` / `recoder.retrieval` / `recoder.coordination` /
 *    `recoder.preview` / `recoder.oss` / `recoder.deploy` were ALSO advertised with
 *    no in-proc engine binder — permanently uncallable (either "No in-proc executor
 *    wired" or masked by the high-risk gate as a misleading `needs_approval`). The
 *    real, callable capability (where any exists) lives under a DOMAIN serverId
 *    (`billing`, `memory`, `governance`, `cloud`) via `registerDomainTools`.
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
  workflowMcpServer,
} from '@recoder/agent-mcp';
import { InteropHostBundle } from './mcp-host.js';
import { IN_PROC_SERVERS } from './engine-registry.js';
import { ENGINE_SERVERS } from './inproc-router.js';
import type { McpServerRegistration, McpToolCallInput } from '../ports/mcp-host.port.js';

/** Duplicate/dead `recoder.*` servers whose real capability lives elsewhere (or nowhere). */
const DEAD_DUPLICATES = [
  'recoder.tasks',
  'recoder.runs',
  'recoder.artifacts',
  'recoder.approvals',
  'recoder.memory',
  // De-advertised: real capability lives under a DOMAIN serverId, or nowhere yet.
  'recoder.billing',
  'recoder.retrieval',
  'recoder.coordination',
  'recoder.preview',
  'recoder.oss',
  'recoder.deploy',
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
  it('IN_PROC_SERVERS + ENGINE_SERVERS no longer list the dead/duplicate recoder.* servers', () => {
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

  it('every advertised in-proc server is a bindable ENGINE server (no orphan advertisement)', () => {
    // Post-fix invariant: everything in the advertised catalog is backed by an
    // engine binder path — there is no advertised server whose only "capability"
    // is a dead `recoder.*` duplicate of a domain tool. This is the "every
    // remaining advertised server is callable (when its binder is supplied)"
    // contract: an advertised server MUST be in ENGINE_SERVERS so a binder can
    // register a real handler for it.
    const engineIds = new Set(ENGINE_SERVERS.map((server) => server.serverId));
    for (const server of IN_PROC_SERVERS) {
      expect(engineIds.has(server.serverId)).toBe(true);
    }
    // And symmetrically: every engine server is advertised (so its bound tools are
    // reachable through the gated registry).
    const advertisedIds = new Set(IN_PROC_SERVERS.map((server) => server.serverId));
    for (const server of ENGINE_SERVERS) {
      expect(advertisedIds.has(server.serverId)).toBe(true);
    }
  });
});

describe('engines MCP host — every remaining advertised server is callable when bound', () => {
  /** Stub-register a real handler for every advertised ENGINE_SERVERS tool. */
  const bindAllEngineTools = (router: McpToolRouter): void => {
    for (const server of ENGINE_SERVERS) {
      for (const toolName of server.toolNames) {
        router.register(server, toolName, async () => ({ content: { ok: true } }));
      }
    }
  };

  it('when a binder covers every advertised server, the wiring guard is satisfied (no warnings)', () => {
    const warnings: string[] = [];
    const host = new InteropHostBundle({
      engineBinders: [bindAllEngineTools],
      onWiringWarning: (err) => warnings.push(err instanceof Error ? err.message : String(err)),
    });
    // No advertised server is a dead duplicate: binding every ENGINE_SERVERS tool
    // makes the wiring-checklist guard pass with zero gaps.
    expect(warnings).toHaveLength(0);
    // Each advertised server resolves in the gated registry (nothing is orphaned).
    for (const server of IN_PROC_SERVERS) {
      expect(host.getServer(server.serverId)).not.toBeNull();
    }
  });

  it('a call to every advertised server reaches its executor (never "No in-proc executor wired")', async () => {
    const host = new InteropHostBundle({
      engineBinders: [bindAllEngineTools],
      onWiringWarning: () => undefined,
    });
    for (const server of ENGINE_SERVERS) {
      const [toolName] = server.toolNames;
      const outcome = await host.call(gatedCall(server, toolName, {}));
      // The high-risk gate may short-circuit to `needs_approval`, and a handler may
      // reject on missing args — but no advertised server may reach the executor's
      // "No in-proc executor wired" branch, which is the dead-advertisement smell.
      if (outcome.status === 'failed') {
        expect(outcome.reason).not.toContain('No in-proc executor wired');
      }
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
    // An unbound advertised server IS named (previously the fake handler hid it).
    expect(warnings[0]).toContain('recoder.workflow:workflow.verify');
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
    const unbound = await host.call(gatedCall(workflowMcpServer, 'workflow.verify', {}));
    expect(unbound.status).toBe('failed');
    if (unbound.status === 'failed') {
      expect(unbound.reason).toContain('No in-proc executor wired');
    }
  });
});
