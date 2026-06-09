import type { McpServerRegistration } from '../registry';

export const billingMcpServer: McpServerRegistration = {
  serverId: 'recoder.billing',
  kind: 'billing',
  displayName: 'Recoder Billing',
  transport: 'http',
  enabled: true,
  toolNames: ['billing.plan.read', 'billing.usage.read'],
};
