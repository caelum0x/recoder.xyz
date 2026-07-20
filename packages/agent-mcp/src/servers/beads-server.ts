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
    // memory layer: candidates (ephemeral wisps) only — promotion is the governed
    // review step on the memory-lifecycle path, never an agent bridge tool
    'beads.claim',
    'beads.note',
    'beads.remember',
    'beads.recall',
  ],
};
