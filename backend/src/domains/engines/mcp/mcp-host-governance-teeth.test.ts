/**
 * The per-tool governance TEETH at the interop executor chokepoint (C2, the
 * headline). When a `toolEnforcer` (bound from `governance.toolExecGate()`) is
 * injected into {@link InteropHostBundle}, EVERY authorized recoder-MCP tool call
 * runs the fine-grained kernel enforcement INSIDE `createInteropExecutor.call` —
 * after interop `authorize → risk`, BEFORE the in-proc handler / external
 * `transport.call`. A `denied` verdict fails closed (throws `GovernanceDeniedError`,
 * caught by interop → non-`completed` wire outcome); the inner handler is NEVER
 * touched. Absent enforcer ⇒ truthful pass-through.
 *
 * These exercise REAL catalog tools (`recoder.notify` / `recoder.beads`); the same
 * executor gates the high-side-effect `sandbox_exec` / `workspace_merge` tools in
 * production (they too reach the executor once authorized). The enforcer here is a
 * FAKE port — the Merkle seal of the authoritative deny row is `gate.enforceTool`'s
 * job (covered by the governance-gate tests); this suite asserts the WIRING: the
 * teeth run at the chokepoint, block before dispatch, derive identity from the
 * edge-bound caller, and emit the interop `'failed'` wire-audit row (the dual-audit
 * wire side).
 *
 * COVERAGE BOUNDARY (truthful): these teeth gate the recoder-MCP tool stream only,
 * NOT a launched agent's own in-worktree bash/file/secret ops (which never cross
 * this executor). A strict improvement over the previously-ungated MCP surface.
 */
import { describe, it, expect } from 'vitest';
import {
  McpToolRouter,
  notifyMcpServer,
  beadsMcpServer,
} from '@recoder/agent-mcp';
import { InteropHostBundle } from './mcp-host.js';
import type {
  McpServerRegistration,
  McpToolCallInput,
} from '../ports/mcp-host.port.js';
import type { EdgeBoundToolCallInput } from '../ports/mcp-host.port.js';
import type { McpAuditSinkPort, McpToolAuditEvent } from '@recoder/interop';
import type {
  ToolExecEnforcementPort,
  ToolExecEnforceInput,
} from '../../governance/ports/tool-exec-gate.port.js';

/** A recorded enforcement invocation (what the executor handed the teeth). */
interface EnforceCapture {
  readonly toolName: string;
  readonly rawArgs: unknown;
  readonly principalUserId: string;
  readonly principalKind: string;
  readonly taskId?: string;
}

/** A FAKE `ToolExecEnforcementPort`: configurable verdict + captured inputs. */
function fakeEnforcer(opts: {
  readonly mode: 'allow' | 'deny' | 'throw';
  readonly captured: EnforceCapture[];
  readonly reason?: string;
}): ToolExecEnforcementPort {
  return {
    async enforce(input: ToolExecEnforceInput) {
      opts.captured.push({
        toolName: input.toolName,
        rawArgs: input.rawArgs,
        principalUserId: input.principal.userId,
        principalKind: input.principal.kind,
        ...(input.ctx?.taskId ? { taskId: input.ctx.taskId } : {}),
      });
      if (opts.mode === 'throw') throw new Error('kernel exploded (infra fault)');
      if (opts.mode === 'deny') {
        return {
          outcome: 'denied' as const,
          reason: opts.reason ?? 'forbidden path /etc/shadow',
          degraded: false,
          engine: 'napi',
        };
      }
      return { outcome: 'allowed' as const, reason: 'ok', degraded: false, engine: 'napi' };
    },
  };
}

/** A recording audit sink (the interop wire-audit ledger). */
function recordingSink(events: McpToolAuditEvent[]): McpAuditSinkPort {
  return { record: (event) => void events.push(event) };
}

/** Build a call input; `caller` is the EDGE-BOUND authenticated identity. */
function gatedCall(
  server: McpServerRegistration,
  toolName: string,
  args: Record<string, unknown>,
  caller?: { userId: string; orgId?: string; scopes?: readonly string[] },
): McpToolCallInput {
  const input: EdgeBoundToolCallInput = {
    server,
    toolName,
    actor: { agentId: 'agent_untrusted_body', permissions: { toolRules: [] } },
    args,
    ...(caller ? { caller } : {}),
  } as unknown as EdgeBoundToolCallInput;
  return input as McpToolCallInput;
}

/** Bind a spy handler for the two REAL catalog tools this suite exercises. */
function spyBinder(spy: string[]): (router: McpToolRouter) => void {
  return (router) => {
    router.register(notifyMcpServer, 'notify.send', async () => {
      spy.push('notify.send');
      return { content: { sent: true } };
    });
    router.register(beadsMcpServer, 'beads.create', async () => {
      spy.push('beads.create');
      return { content: { id: 'bd-1' } };
    });
  };
}

describe('engines MCP host — per-tool governance teeth at the executor chokepoint', () => {
  it('BLOCKS a denied tool before dispatch + emits the interop "failed" wire-audit row (dual-audit)', async () => {
    const spy: string[] = [];
    const captured: EnforceCapture[] = [];
    const audit: McpToolAuditEvent[] = [];
    const host = new InteropHostBundle({
      engineBinders: [spyBinder(spy)],
      onWiringWarning: () => undefined,
      toolEnforcer: fakeEnforcer({ mode: 'deny', captured, reason: 'forbidden path /etc/shadow' }),
      auditSink: recordingSink(audit),
    });

    const outcome = await host.call(
      gatedCall(beadsMcpServer, 'beads.create', { title: 'x' }, { userId: 'user_caller' }),
    );

    // Fail-closed: the inner handler was NEVER invoked.
    expect(spy).toHaveLength(0);
    // The teeth ran at the chokepoint, under the denied tool's governed name.
    expect(captured).toHaveLength(1);
    expect(captured[0]?.toolName).toBe('recoder.beads.beads.create');
    // Downstream keys on `status !== 'completed'` (documented: a deny surfaces as
    // the interop `'failed'` wire outcome, not a literal `'denied'` status).
    expect(outcome.status).not.toBe('completed');
    if (outcome.status !== 'completed') {
      expect(outcome.reason).toContain('/etc/shadow');
    }
    // The interop wire-audit row (the SECOND of the dual-audit; the FIRST is the
    // Merkle seal inside `gate.enforceTool`, out of scope for a fake enforcer).
    const failedRow = audit.find((e) => e.call.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow?.call.toolName).toBe('beads.create');
    expect(failedRow?.error).toContain('/etc/shadow');
  });

  it('ALLOWS a benign tool: the enforcer passes, the handler runs once, the call completes', async () => {
    const spy: string[] = [];
    const captured: EnforceCapture[] = [];
    const host = new InteropHostBundle({
      engineBinders: [spyBinder(spy)],
      onWiringWarning: () => undefined,
      toolEnforcer: fakeEnforcer({ mode: 'allow', captured }),
    });

    const outcome = await host.call(
      gatedCall(notifyMcpServer, 'notify.send', { message: 'hi' }, { userId: 'user_caller' }),
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]?.toolName).toBe('recoder.notify.notify.send');
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.result.content).toEqual({ sent: true });
    }
    expect(spy).toEqual(['notify.send']);
  });

  it('PASS-THROUGH: with no enforcer injected, the handler runs and nothing is gated (no fake-allow)', async () => {
    const spy: string[] = [];
    const host = new InteropHostBundle({
      engineBinders: [spyBinder(spy)],
      onWiringWarning: () => undefined,
      // toolEnforcer intentionally absent.
    });

    const outcome = await host.call(
      gatedCall(notifyMcpServer, 'notify.send', { message: 'hi' }),
    );

    expect(outcome.status).toBe('completed');
    expect(spy).toEqual(['notify.send']);
  });

  it('FAIL-CLOSED on enforcer fault: a throwing enforcer denies (handler untouched, non-completed)', async () => {
    const spy: string[] = [];
    const captured: EnforceCapture[] = [];
    const host = new InteropHostBundle({
      engineBinders: [spyBinder(spy)],
      onWiringWarning: () => undefined,
      toolEnforcer: fakeEnforcer({ mode: 'throw', captured }),
    });

    const outcome = await host.call(
      gatedCall(beadsMcpServer, 'beads.create', { title: 'x' }, { userId: 'user_caller' }),
    );

    // The teeth were consulted; the fault propagated BEFORE dispatch.
    expect(captured).toHaveLength(1);
    expect(spy).toHaveLength(0);
    expect(outcome.status).not.toBe('completed');
  });

  it('IDENTITY: enforcement runs under the edge-bound caller, never the caller-controlled actor.agentId', async () => {
    const captured: EnforceCapture[] = [];
    const host = new InteropHostBundle({
      engineBinders: [spyBinder([])],
      onWiringWarning: () => undefined,
      toolEnforcer: fakeEnforcer({ mode: 'allow', captured }),
    });

    // A spoof attempt: the request body claims a victim `agentId`, but the edge
    // binds the AUTHENTICATED caller. Enforcement must run under the caller.
    await host.call(
      gatedCall(notifyMcpServer, 'notify.send', {}, { userId: 'authenticated_caller' }),
    );

    expect(captured[0]?.principalUserId).toBe('authenticated_caller');
    expect(captured[0]?.principalUserId).not.toBe('agent_untrusted_body');
    expect(captured[0]?.principalKind).toBe('apikey');
  });

  it('ANONYMOUS fallback: with no edge-bound caller, enforcement runs under a synthetic anonymous principal', async () => {
    const captured: EnforceCapture[] = [];
    const host = new InteropHostBundle({
      engineBinders: [spyBinder([])],
      onWiringWarning: () => undefined,
      toolEnforcer: fakeEnforcer({ mode: 'allow', captured }),
    });

    await host.call(gatedCall(notifyMcpServer, 'notify.send', {}));

    expect(captured[0]?.principalUserId).toBe('anonymous');
    expect(captured[0]?.principalKind).toBe('anonymous');
  });
});
