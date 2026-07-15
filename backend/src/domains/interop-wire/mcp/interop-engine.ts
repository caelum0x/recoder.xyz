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
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
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
interface AgentInput extends OwnedInput {
  readonly agentId?: string;
}
interface TaskInput extends OwnedInput {
  readonly taskId?: string;
}

export function buildInteropMcpTools(deps: InteropEngineDeps): readonly McpToolRegistration[] {
  const owner = (raw: unknown): string => {
    const input = (raw ?? {}) as OwnedInput;
    return typeof input.userId === 'string' && input.userId.length > 0 ? input.userId : deps.ownerId;
  };

  return [
    {
      name: 'interop_list_agents',
      description: 'List registered A2A agents / runtime endpoints for an owner (read-only).',
      handler: async (raw: unknown) => {
        const agents = await deps.registry.list(owner(raw));
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
      description: 'Fetch one A2A task projection + its message log (owner-scoped; null when absent).',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as TaskInput;
        if (!input.taskId) return { error: 'taskId is required' };
        const task = await deps.tasks.get(input.taskId, owner(raw));
        if (!task) return { task: null };
        return { task, messages: await deps.tasks.messages(input.taskId) };
      },
    },
    {
      name: 'interop_task_context',
      description: 'The compact context bundle for a task (recent messages + live scratchpad notes).',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as TaskInput;
        if (!input.taskId) return { error: 'taskId is required' };
        return { bundle: await deps.contextBridge.build({ taskId: input.taskId, userId: owner(raw) }) };
      },
    },
    {
      name: 'interop_methods',
      description: 'The A2A JSON-RPC methods this instance currently advertises.',
      handler: () => ({ methods: deps.jsonRpc.methods() }),
    },
  ];
}
