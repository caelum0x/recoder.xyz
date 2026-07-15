/**
 * `agent-os-engine` — the read-only MCP introspection surface for the control
 * plane (domain doc §6, NEW). Exposes the state-of-record to the interop-gated
 * MCP host so agents can inspect (never mutate) tasks / runs / the summary.
 * Mutations stay on the governed HTTP + run-event seams; these tools are pure
 * reads, mirroring the governance engine's introspection-only posture.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';

export function buildAgentOsMcpTools(repository: AgentOsRepositoryPort): readonly McpToolRegistration[] {
  return [
    {
      name: 'agent_os_summary',
      description: 'Read the full agent-os state-of-record snapshot (read-only).',
      handler: async () => repository.snapshot(),
    },
    {
      name: 'agent_os_list_tasks',
      description: 'List all control-plane task specs (read-only).',
      handler: async () => repository.listTasks(),
    },
    {
      name: 'agent_os_list_runs',
      description: 'List all task runs with their current state (read-only).',
      handler: async () => repository.listRuns(),
    },
  ];
}
