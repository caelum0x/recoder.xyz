import type { McpServerRegistration } from '../registry';

export const runsMcpServer: McpServerRegistration = {
  serverId: 'recoder.runs',
  kind: 'runs',
  displayName: 'Recoder Runs',
  transport: 'http',
  enabled: true,
  toolNames: ['runs.list', 'runs.get', 'runs.transition', 'runs.append_log', 'runs.attach_evidence'],
};
