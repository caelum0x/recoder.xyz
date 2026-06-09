import type { McpServerRegistration } from '../registry';

export const repoMcpServer: McpServerRegistration = {
  serverId: 'recoder.repo',
  kind: 'repo',
  displayName: 'Recoder Repository',
  transport: 'http',
  enabled: true,
  toolNames: ['repo.read', 'repo.search', 'repo.diff'],
};
