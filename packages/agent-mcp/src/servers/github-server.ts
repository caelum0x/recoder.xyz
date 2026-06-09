import type { McpServerRegistration } from '../registry';

export const githubMcpServer: McpServerRegistration = {
  serverId: 'recoder.github',
  kind: 'github',
  displayName: 'Recoder GitHub',
  transport: 'http',
  enabled: true,
  toolNames: ['github.search', 'github.pr.create', 'github.pr.comment'],
};
