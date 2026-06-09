export const GIT_NEXUS_MCP_TOOLS = [
  'recoder.git_nexus.search_code',
  'recoder.git_nexus.get_package_map',
  'recoder.git_nexus.get_owners',
  'recoder.git_nexus.get_related_tests',
  'recoder.git_nexus.impact_report',
  'recoder.git_nexus.context_pack',
] as const;

export type GitNexusMcpTool = typeof GIT_NEXUS_MCP_TOOLS[number];

export function createGitNexusMcpServerDescriptor() {
  return {
    serverId: 'recoder.git_nexus',
    displayName: 'Recoder Git Nexus',
    tools: [...GIT_NEXUS_MCP_TOOLS],
    ownsCanonicalState: false,
  };
}
