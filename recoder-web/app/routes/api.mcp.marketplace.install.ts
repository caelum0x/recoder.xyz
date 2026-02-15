/**
 * MCP Marketplace Install API
 * POST /api/mcp/marketplace/install - Install a server from marketplace
 */

import { type ActionFunctionArgs, json } from '@remix-run/node';
import { getServerById } from '~/lib/.server/mcp/marketplace-catalog';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPMarketplaceInstall');

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as { serverId?: string; env?: Record<string, string> };
    const { serverId, env: userEnv } = body;

    if (!serverId) {
      return json({ error: 'Missing serverId' }, { status: 400 });
    }

    // Get server from catalog
    const server = getServerById(serverId);
    if (!server) {
      return json({ error: 'Server not found in marketplace' }, { status: 404 });
    }

    // Build install configuration
    const { installCommand } = server;

    // Parse command based on type
    let command: string;
    let args: string[];

    switch (installCommand.type) {
      case 'npx':
        command = 'npx';
        // Split the command string into args
        args = installCommand.command.split(' ').filter(Boolean);
        if (installCommand.args) {
          args.push(...installCommand.args);
        }
        break;
      case 'npm':
        command = 'npm';
        args = ['exec', ...installCommand.command.split(' ')];
        if (installCommand.args) {
          args.push(...installCommand.args);
        }
        break;
      case 'uvx':
        command = 'uvx';
        args = [installCommand.command];
        if (installCommand.args) {
          args.push(...installCommand.args);
        }
        break;
      case 'docker':
        command = 'docker';
        args = ['run', installCommand.command];
        if (installCommand.args) {
          args.push(...installCommand.args);
        }
        break;
      default:
        command = installCommand.command;
        args = installCommand.args || [];
    }

    // Merge default env with user-provided env
    const finalEnv = {
      ...(installCommand.env || {}),
      ...(userEnv || {}),
    };

    // Remove empty env values
    for (const key of Object.keys(finalEnv)) {
      if (!finalEnv[key]) {
        delete finalEnv[key];
      }
    }

    // Try to save to database if available
    // Support both Cloudflare and Node.js environments
    const cloudflare = (context as any)?.cloudflare;
    const db = cloudflare?.env?.DB;

    if (db) {
      try {
        const id = crypto.randomUUID();

        await db
          .prepare(
            'INSERT INTO mcp_servers (id, server_id, name, command, args, env, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            id,
            serverId,
            server.name,
            command,
            JSON.stringify(args),
            JSON.stringify(finalEnv),
            1
          )
          .run();

        return json({
          success: true,
          server: {
            id,
            serverId,
            name: server.name,
            description: server.description,
            command,
            args,
            env: finalEnv,
            enabled: true,
            toolCount: server.toolCount,
            verified: server.verified,
          },
        });
      } catch (dbError: any) {
        // Check if it's a duplicate
        if (dbError.message?.includes('UNIQUE constraint')) {
          return json({ error: 'Server already installed' }, { status: 409 });
        }
        logger.error('[Marketplace Install] DB error:', dbError);
        // Fall through to return success without DB
      }
    }

    // Return success even without DB (server config can be stored locally)
    return json({
      success: true,
      server: {
        id: serverId,
        serverId,
        name: server.name,
        description: server.description,
        command,
        args,
        env: finalEnv,
        enabled: true,
        toolCount: server.toolCount,
        verified: server.verified,
      },
      note: 'Server configured. Database not available - config may need to be saved locally.',
    });
  } catch (error: any) {
    logger.error('[Marketplace Install] Error:', error);
    return json(
      { error: 'Failed to install server' },
      { status: 500 }
    );
  }
}
