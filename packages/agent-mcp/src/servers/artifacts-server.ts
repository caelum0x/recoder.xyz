import type { McpServerRegistration } from '../registry';

export const artifactsMcpServer: McpServerRegistration = {
  serverId: 'recoder.artifacts',
  kind: 'artifacts',
  displayName: 'Recoder Artifacts',
  transport: 'http',
  enabled: true,
  toolNames: ['artifacts.list', 'artifacts.get', 'artifacts.create', 'artifacts.link'],
};
