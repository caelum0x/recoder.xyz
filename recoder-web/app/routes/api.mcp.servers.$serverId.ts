import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';

// GET - Get server details
export async function loader({ params, context }: LoaderFunctionArgs) {
  const { cloudflare } = context;
  const db = cloudflare?.env?.DB;
  const { serverId } = params;

  if (!db) {
    return json({ error: 'Database not available' }, { status: 500 });
  }

  try {
    const server = await db
      .prepare('SELECT * FROM mcp_servers WHERE server_id = ?')
      .bind(serverId)
      .first();

    if (!server) {
      return json({ error: 'Server not found' }, { status: 404 });
    }

    return json({
      server: {
        id: server.id,
        serverId: server.server_id,
        name: server.name,
        command: server.command,
        args: JSON.parse(server.args as string),
        env: JSON.parse(server.env as string),
        enabled: server.enabled === 1,
        createdAt: server.created_at,
      }
    });
  } catch (error: any) {
    return json({ error: 'Failed to get server' }, { status: 500 });
  }
}

// POST/PATCH/DELETE
export async function action({ request, params, context }: ActionFunctionArgs) {
  const { cloudflare } = context;
  const db = cloudflare?.env?.DB;
  const { serverId } = params;

  if (!db) {
    return json({ error: 'Database not available' }, { status: 500 });
  }

  if (request.method === 'DELETE') {
    try {
      await db
        .prepare('DELETE FROM mcp_servers WHERE server_id = ?')
        .bind(serverId)
        .run();

      return json({ success: true });
    } catch (error: any) {
      return json({ error: 'Failed to delete server' }, { status: 500 });
    }
  }

  if (request.method === 'PATCH') {
    try {
      const body = await request.json() as {
        enabled?: boolean;
        name?: string;
        command?: string;
        args?: any;
        env?: any;
      };
      const updates: string[] = [];
      const bindings: any[] = [];

      if (body.enabled !== undefined) {
        updates.push('enabled = ?');
        bindings.push(body.enabled ? 1 : 0);
      }

      if (body.name) {
        updates.push('name = ?');
        bindings.push(body.name);
      }

      if (body.command) {
        updates.push('command = ?');
        bindings.push(body.command);
      }

      if (body.args) {
        updates.push('args = ?');
        bindings.push(JSON.stringify(body.args));
      }

      if (body.env) {
        updates.push('env = ?');
        bindings.push(JSON.stringify(body.env));
      }

      if (updates.length === 0) {
        return json({ error: 'No fields to update' }, { status: 400 });
      }

      bindings.push(serverId);

      await db
        .prepare(`UPDATE mcp_servers SET ${updates.join(', ')} WHERE server_id = ?`)
        .bind(...bindings)
        .run();

      // Get updated server
      const server = await db
        .prepare('SELECT * FROM mcp_servers WHERE server_id = ?')
        .bind(serverId)
        .first();

      if (!server) {
        return json({ error: 'Server not found after update' }, { status: 404 });
      }

      return json({
        success: true,
        server: {
          id: server.id,
          serverId: server.server_id,
          name: server.name,
          command: server.command,
          args: JSON.parse(server.args as string),
          env: JSON.parse(server.env as string),
          enabled: server.enabled === 1,
        }
      });
    } catch (error: any) {
      return json({ error: 'Failed to update server' }, { status: 500 });
    }
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
