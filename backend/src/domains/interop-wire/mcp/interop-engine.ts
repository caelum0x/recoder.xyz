/**
 * interop-wire MCP tools — the READ-ONLY introspection surface registered as the
 * `interop_wire` server into the interop-gated MCP host. Every call passes the
 * `authorize→risk→policy→audit` chain at the host boundary, so these handlers stay
 * thin, read-only, and truthful over the composite services.
 *
 * Per the in-proc engine-wiring checklist: the engine must be added to
 * `IN_PROC_SERVERS` (interop-host) + `ENGINE_SERVERS` (inproc-engines) and this
 * builder called in `buildInProcEngineRouter`, else the tools 404 (see the wiring
 * report). Write-bearing operations stay on the governed HTTP edges.
 *
 * TENANT SCOPING (SECURITY): the A2A agent registry, task projections, and task
 * context bundles are all OWNER-scoped tenant data. The subject (`userId`) is a
 * tenant-owned selector, so it is derived from the host-authorized
 * {@link McpToolCaller} — NEVER trusted from free-form `args` alone. The edge binds
 * the authenticated principal as the caller for the CALL; the `args.userId`
 * subject-selector these tools read is NOT edge-bound, so trusting it would let any
 * authenticated caller list another tenant's agents or read another tenant's A2A
 * task + message log / context bundle (cross-tenant task/inbox disclosure).
 * Therefore, for `interop_list_agents`, `interop_get_task`, and
 * `interop_task_context`:
 *   - A NON-privileged caller may only resolve its OWN `userId`; a foreign
 *     `args.userId` is rejected (403 `AUTHZ_PROJECT_ACCESS_DENIED`). No args ⇒ the
 *     caller's own id. Only an `admin`/`internal` caller may name an arbitrary id.
 *   - Absent a bound caller ⇒ the TRUSTED in-proc/direct path (the edge always
 *     binds a caller): resolve against the service identity (`deps.ownerId`), or an
 *     explicit `args.userId` when a trusted internal caller supplies one.
 * `interop_agent_liveness` (a derived up/degraded/down verdict keyed by agentId,
 * not a tenant subject) and `interop_methods` (global JSON-RPC advertisement)
 * expose no owner-scoped subject and stay unbound.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { AgentRegistryService } from '../registry/agent-registry.js';
import type { HeartbeatSloService } from '../registry/heartbeat-slo.js';
import type { TaskLifecycleService } from '../dispatch/task-lifecycle.js';
import type { ContextBridgeService } from '../bridge/context-bridge.js';
import type { A2AJsonRpcServer } from '../wire/a2a-jsonrpc-server.js';

export interface InteropEngineDeps {
  readonly registry: AgentRegistryService;
  readonly heartbeat: HeartbeatSloService;
  readonly tasks: TaskLifecycleService;
  readonly contextBridge: ContextBridgeService;
  readonly jsonRpc: A2AJsonRpcServer;
  /** The owner scope these read tools resolve against (service identity). */
  readonly ownerId: string;
}

interface OwnedInput {
  readonly userId?: string;
}
interface AgentInput {
  readonly agentId?: string;
}
interface TaskInput extends OwnedInput {
  readonly taskId?: string;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Does the caller carry an elevated scope that may name an arbitrary subject? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

export function buildInteropMcpTools(deps: InteropEngineDeps): readonly McpToolRegistration[] {
  /**
   * Resolve the OWNER subject these read tools scope against, binding it to the
   * host-authorized caller. A bound, non-privileged caller may only read its OWN
   * subject; a foreign `args.userId` is a cross-tenant spoof and is refused. An
   * absent/empty caller is the trusted in-proc path → the service identity (or an
   * explicit internal-supplied `args.userId`).
   */
  const resolveSubject = (raw: unknown, caller: McpToolCaller | undefined, tool: string): string => {
    const requested = str((raw as OwnedInput | undefined)?.userId);
    const callerId = caller ? str(caller.userId) : undefined;
    if (!callerId) {
      // Trusted internal/direct path (the edge always binds a caller).
      return requested ?? deps.ownerId;
    }
    if (requested && requested !== callerId && !isPrivileged(caller!)) {
      throw createError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        `${tool}: caller may only read its own tenant subject`,
      );
    }
    return requested ?? callerId;
  };

  return [
    {
      name: 'interop_list_agents',
      description: 'List registered A2A agents / runtime endpoints for the calling owner (read-only, owner-scoped).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const agents = await deps.registry.list(resolveSubject(raw, caller, 'interop_list_agents'));
        return {
          count: agents.length,
          agents: agents.map((a) => ({ id: a.id, kind: a.kind, runtimeId: a.runtimeId, status: a.status, capabilities: a.card.capabilities })),
        };
      },
    },
    {
      name: 'interop_agent_liveness',
      description: 'The derived heartbeat-SLO liveness verdict for one agent (up/degraded/down/unknown).',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as AgentInput;
        if (!input.agentId) return { error: 'agentId is required' };
        return { verdict: await deps.heartbeat.liveness(input.agentId) };
      },
    },
    {
      name: 'interop_get_task',
      description: 'Fetch one A2A task projection + its message log (owner-scoped; null when absent / not owned).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as TaskInput;
        if (!input.taskId) return { error: 'taskId is required' };
        const userId = resolveSubject(raw, caller, 'interop_get_task');
        const task = await deps.tasks.get(input.taskId, userId);
        if (!task) return { task: null };
        return { task, messages: await deps.tasks.messages(input.taskId) };
      },
    },
    {
      name: 'interop_task_context',
      description: 'The compact context bundle for an owned task (recent messages + live scratchpad notes).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as TaskInput;
        if (!input.taskId) return { error: 'taskId is required' };
        const userId = resolveSubject(raw, caller, 'interop_task_context');
        return { bundle: await deps.contextBridge.build({ taskId: input.taskId, userId }) };
      },
    },
    {
      name: 'interop_methods',
      description: 'The A2A JSON-RPC methods this instance currently advertises.',
      handler: () => ({ methods: deps.jsonRpc.methods() }),
    },
  ];
}
