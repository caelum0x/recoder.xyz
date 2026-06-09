import type { McpServerRegistration } from '../registry';

export const approvalsMcpServer: McpServerRegistration = {
  serverId: 'recoder.approvals',
  kind: 'approvals',
  displayName: 'Recoder Approvals',
  transport: 'http',
  enabled: true,
  toolNames: ['approvals.list', 'approvals.request', 'approvals.decide', 'approvals.status'],
};
