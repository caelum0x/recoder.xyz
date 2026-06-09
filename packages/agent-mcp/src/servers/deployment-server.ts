import type { McpServerRegistration } from '../registry';

export const deploymentMcpServer: McpServerRegistration = {
  serverId: 'recoder.deploy',
  kind: 'deploy',
  displayName: 'Recoder Deployment',
  transport: 'http',
  enabled: true,
  toolNames: ['deploy.preview', 'deploy.status', 'deploy.rollback'],
};
