import type { McpServerRegistration } from '../registry';

export const tasksMcpServer: McpServerRegistration = {
  serverId: 'recoder.tasks',
  kind: 'tasks',
  displayName: 'Recoder Tasks',
  transport: 'http',
  enabled: true,
  toolNames: ['tasks.list', 'tasks.get', 'tasks.create', 'tasks.update', 'tasks.claim'],
};
