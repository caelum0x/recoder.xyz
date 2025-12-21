/**
 * MCP Servers API - Manage MCP server connections
 * GET /api/mcp/servers - List all servers
 * POST /api/mcp/servers - Add new server
 * DELETE /api/mcp/servers/:id - Remove server
 * POST /api/mcp/servers/:id/connect - Connect to server
 * POST /api/mcp/servers/:id/disconnect - Disconnect from server
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { createMCPServerManager } from '~/lib/.server/mcp/server-manager';

export async function loader({ context }: LoaderFunctionArgs) {
  try {
    const manager = createMCPServerManager(context.cloudflare.env);
    const servers = await manager.listServers();

    return json({
      success: true,
      servers,
    });
  } catch (error) {
    console.error('Failed to list MCP servers:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list servers',
      },
      { status: 500 }
    );
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  const method = request.method;

  try {
    const manager = createMCPServerManager(context.cloudflare.env);

    switch (method) {
      case 'POST': {
        // Add new server
        const body = await request.json();
        const server = await manager.addServer(body);

        return json({
          success: true,
          server,
        });
      }

      case 'DELETE': {
        // Delete server (from URL params)
        const url = new URL(request.url);
        const serverId = url.searchParams.get('id');

        if (!serverId) {
          return json({ success: false, error: 'Server ID required' }, { status: 400 });
        }

        await manager.removeServer(serverId);

        return json({
          success: true,
          message: 'Server removed',
        });
      }

      default:
        return json({ success: false, error: 'Method not allowed' }, { status: 405 });
    }
  } catch (error) {
    console.error('MCP server action error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Server action failed',
      },
      { status: 500 }
    );
  }
}
