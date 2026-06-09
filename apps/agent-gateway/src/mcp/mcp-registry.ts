import {
  browserMcpServer,
  deploymentMcpServer,
  githubMcpServer,
  McpRegistry,
  memoryMcpServer,
  repoMcpServer,
} from '@recoder/agent-mcp';

export function createDefaultMcpRegistry(): McpRegistry {
  const registry = new McpRegistry();
  registry.register(githubMcpServer);
  registry.register(repoMcpServer);
  registry.register(browserMcpServer);
  registry.register(memoryMcpServer);
  registry.register(deploymentMcpServer);
  return registry;
}
