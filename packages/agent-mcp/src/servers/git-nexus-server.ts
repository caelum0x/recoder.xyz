import type { McpServerRegistration } from '../registry';

export const gitNexusMcpServer: McpServerRegistration = {
  serverId: 'recoder.git_nexus',
  kind: 'git_nexus',
  displayName: 'Recoder Git Nexus',
  transport: 'http',
  enabled: true,
  toolNames: [
    'git_nexus.search_code',
    'git_nexus.get_package_map',
    'git_nexus.get_owners',
    'git_nexus.get_related_tests',
    'git_nexus.impact_report',
    'git_nexus.context_pack',
  ],
};
