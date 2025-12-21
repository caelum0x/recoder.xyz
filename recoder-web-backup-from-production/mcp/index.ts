/**
 * MCP (Model Context Protocol) Entry Point
 * 
 * This module exports all MCP servers and utilities for recoder-web.
 * MCP servers provide AI with access to external tools and data sources.
 */

export { MCPClient } from './client';
export { mcpRegistry } from './registry';
export { createGitHubMCPServer } from './servers/github';

export type {
  MCPServer,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPError,
} from './types';

/**
 * Initialize all MCP servers
 */
export async function initializeMCPServers(env: any) {
  const { mcpRegistry } = await import('./registry');
  const { createGitHubMCPServer } = await import('./servers/github');

  // Initialize GitHub server
  const githubToken = env.GITHUB_TOKEN || '';
  const githubServer = createGitHubMCPServer(githubToken);
  mcpRegistry.register(githubServer.getServer());

  console.log('✅ MCP servers initialized');
  
  return mcpRegistry;
}

/**
 * Get MCP tools for AI system prompt
 */
export async function getMCPToolsPrompt(env: any): Promise<string> {
  const { mcpRegistry } = await import('./registry');

  const enabledServers = mcpRegistry.getEnabled();

  if (enabledServers.length === 0) {
    return '';
  }

  const toolsList = enabledServers
    .map((s: any) => `- ${s.name}: ${s.description}`)
    .join('\n');

  return `

🔧 MCP TOOLS AVAILABLE:
You have access to these external tools via Model Context Protocol:

${toolsList}

These tools run in recoder-web and allow you to:
- Interact with GitHub (repos, PRs, issues)
- Access filesystem in WebContainer
- Query databases
- Make API requests

When you need to use these tools, call them with the appropriate parameters.
`;
}
