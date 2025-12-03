/**
 * MCP API Endpoint
 * Handles MCP tool execution requests
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { mcpRegistry } from '~/lib/.server/mcp/registry';
import { mcpClient } from '~/lib/.server/mcp/client';
import { filesystemMCPServer } from '~/lib/.server/mcp/servers/filesystem';
import { createGitHubMCPServer } from '~/lib/.server/mcp/servers/github';
import { createDatabaseMCPServer } from '~/lib/.server/mcp/servers/database';
import { apiMCPServer } from '~/lib/.server/mcp/servers/api';
import type { MCPToolCall } from '~/lib/.server/mcp/types';

// Initialize MCP servers
let initialized = false;

function initializeMCPServers() {
  if (initialized) return;

  console.log('🔧 Initializing MCP servers...');

  // Register filesystem server
  mcpRegistry.register(filesystemMCPServer.getServer());

  // Register GitHub server
  const githubServer = createGitHubMCPServer(process.env.GITHUB_TOKEN);
  mcpRegistry.register(githubServer.getServer());

  // Register database server
  const databaseServer = createDatabaseMCPServer(process.env.DATABASE_URL);
  mcpRegistry.register(databaseServer.getServer());

  // Register API server
  mcpRegistry.register(apiMCPServer.getServer());

  initialized = true;
  console.log(`✅ Initialized ${mcpRegistry.getStats().enabledServers} MCP servers`);
}

/**
 * GET /api/mcp - List available tools and servers
 */
export async function loader({ request }: LoaderFunctionArgs) {
  initializeMCPServers();

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    switch (action) {
      case 'list-tools':
        const tools = await mcpClient.listTools();
        return json({
          success: true,
          data: tools,
        });

      case 'list-servers':
        const servers = await mcpClient.listServers();
        return json({
          success: true,
          data: servers.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            enabled: s.enabled,
            status: s.status,
            toolCount: s.tools.length,
          })),
        });

      case 'server-stats':
        const stats = mcpRegistry.getStats();
        return json({
          success: true,
          data: stats,
        });

      default:
        return json({
          success: true,
          data: {
            message: 'MCP API is running',
            availableActions: ['list-tools', 'list-servers', 'server-stats'],
          },
        });
    }
  } catch (error: any) {
    console.error('MCP API error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mcp - Execute a tool
 */
export async function action({ request }: ActionFunctionArgs) {
  initializeMCPServers();

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { toolName, parameters, context } = body;

    if (!toolName) {
      return json(
        {
          success: false,
          error: 'toolName is required',
        },
        { status: 400 }
      );
    }

    // Create tool call
    const toolCall: MCPToolCall = {
      id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      toolName,
      serverId: '', // Will be determined by client
      parameters: parameters || {},
      context: context || {},
      timestamp: new Date(),
    };

    console.log(`🔧 Executing tool: ${toolName}`);

    // Execute tool
    const result = await mcpClient.executeTool(toolCall);

    return json({
      success: result.success,
      data: result.result,
      error: result.error,
      executionTime: result.executionTime,
    });
  } catch (error: any) {
    console.error('Tool execution error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      },
      { status: 500 }
    );
  }
}
