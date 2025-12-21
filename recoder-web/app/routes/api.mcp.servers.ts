import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';

const DEFAULT_SERVERS = [
  { id: 'github', name: 'GitHub', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
  { id: 'filesystem', name: 'Filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'] },
  { id: 'brave-search', name: 'Web Search', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
  { id: 'playwright', name: 'Browser', command: 'npx', args: ['-y', '@modelcontextprotocol/server-playwright'] },
];

export async function loader({ context }: LoaderFunctionArgs) {
  // Support both Cloudflare and Node.js environments
  const env = (context as any)?.cloudflare?.env || process.env;
  const db = (env as any).DB;

  try {
    // If DB is not available (Node.js env), return defaults only
    if (!db) {
      return json({ servers: [], defaults: DEFAULT_SERVERS });
    }

    const servers = await db
      .prepare('SELECT * FROM mcp_servers WHERE enabled = 1')
      .all();

    return json({
      servers: servers.results || [],
      defaults: DEFAULT_SERVERS,
    });
  } catch (error: any) {
    return json({ servers: [], defaults: DEFAULT_SERVERS });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { cloudflare } = context;
  const db = cloudflare.env.DB;

  if (request.method === 'POST') {
    const body = await request.json();

    try {
      // Support both formats: {id, name, command, args} and {serverId, config: {command, args}}
      const serverId = body.serverId || body.id;
      const name = body.name || serverId;
      const command = body.config?.command || body.command;
      const args = body.config?.args || body.args || [];
      const env = body.config?.env || body.env || {};

      if (!serverId || !command) {
        return json({ error: 'Missing required fields: serverId and command' }, { status: 400 });
      }

      const id = crypto.randomUUID();

      await db
        .prepare(
          'INSERT INTO mcp_servers (id, server_id, name, command, args, env, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          id,
          serverId,
          name,
          command,
          JSON.stringify(args),
          JSON.stringify(env),
          1
        )
        .run();

      return json({
        success: true,
        server: {
          id,
          serverId,
          name,
          command,
          args,
          env,
          enabled: true
        }
      });
    } catch (error: any) {
      console.error('Failed to add MCP server:', error);
      return json({ error: 'Failed to add server', details: error.message }, { status: 500 });
    }
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
