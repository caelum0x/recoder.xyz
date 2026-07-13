import type { McpServerRegistration } from '../registry';

export const beadsMcpServer: McpServerRegistration = {
  serverId: 'recoder.beads',
  kind: 'beads',
  displayName: 'Recoder Beads',
  transport: 'http',
  enabled: true,
  toolNames: [
    'beads.ready',
    'beads.show',
    'beads.create',
    'beads.update',
    'beads.close',
    'beads.sync',
    // memory layer: candidates (ephemeral wisps) -> policy-gated promote -> durable
    'beads.claim',
    'beads.note',
    'beads.remember',
    'beads.recall',
    'beads.memory_promote',
  ],
};
