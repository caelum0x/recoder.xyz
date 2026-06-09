import type { McpServerRegistration } from '../registry';

export const ossMcpServer: McpServerRegistration = {
  serverId: 'recoder.oss',
  kind: 'oss',
  displayName: 'Recoder OSS Registry',
  transport: 'http',
  enabled: true,
  toolNames: ['oss.list', 'oss.get', 'oss.health', 'oss.patch_policy'],
};
