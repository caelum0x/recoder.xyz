import type { McpServerRegistration } from '../registry';

export const logsMcpServer: McpServerRegistration = {
  serverId: 'recoder.logs',
  kind: 'logs',
  displayName: 'Recoder Logs',
  transport: 'http',
  enabled: true,
  toolNames: ['logs.append', 'logs.stream', 'logs.search', 'logs.attach'],
};
