import * as mcpService from '../services/mcp.service';

export async function getMCPTools(userId: string) {
  const servers = await mcpService.getUserServers(userId);
  const allTools = [];

  for (const server of servers) {
    try {
      const tools = await mcpService.listTools(userId, server.serverId);
      allTools.push(...tools.map((tool: any) => ({
        ...tool,
        serverId: server.serverId,
      })));
    } catch (error) {
      console.error(`Failed to load tools from ${server.name}:`, error);
    }
  }

  return allTools;
}

export async function executeMCPTool(
  userId: string,
  serverId: string,
  toolName: string,
  args: any
) {
  return mcpService.callTool(userId, serverId, toolName, args);
}

export function formatMCPToolsForAI(tools: any[]) {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: `${tool.serverId}_${tool.name}`,
      description: tool.description || tool.name,
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
  }));
}
