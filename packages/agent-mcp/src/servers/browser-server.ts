import type { McpServerRegistration } from '../registry';

export const browserMcpServer: McpServerRegistration = {
  serverId: 'recoder.browser',
  kind: 'browser',
  displayName: 'Recoder Browser',
  transport: 'http',
  enabled: true,
  toolNames: ['browser.open', 'browser.snapshot', 'browser.verify'],
};
