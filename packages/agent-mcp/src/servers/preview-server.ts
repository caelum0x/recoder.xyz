import type { McpServerRegistration } from '../registry';

export const previewMcpServer: McpServerRegistration = {
  serverId: 'recoder.preview',
  kind: 'preview',
  displayName: 'Recoder Preview',
  transport: 'http',
  enabled: true,
  toolNames: ['preview.issue_url', 'preview.health', 'preview.browser_check', 'preview.attach_evidence'],
};
