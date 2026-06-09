import type { McpServerRegistration } from '../registry';

export const beadsMcpServer: McpServerRegistration = {
  serverId: 'recoder.beads',
  kind: 'beads',
  displayName: 'Recoder Beads',
  transport: 'http',
  enabled: true,
  toolNames: ['beads.ready', 'beads.show', 'beads.create', 'beads.update', 'beads.close', 'beads.sync'],
};
