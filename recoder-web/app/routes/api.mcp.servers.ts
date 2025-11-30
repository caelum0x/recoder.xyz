import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';

const DEFAULT_SERVERS = [
  { id: 'github', name: 'GitHub', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
  { id: 'filesystem', name: 'Filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'] },
  { id: 'brave-search', name: 'Web Search', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
  { id: 'playwright', name: 'Browser', command: 'npx', args: ['-y', '@modelcontextprotocol/server-playwright'] },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const { cloudflare } = context;
  const db = cloudflare.env.DB;

  try {
    const servers = await db
      .prepare('SELECT * FROM mcp_servers WHERE enabled = 1')
      .all();

    return json({
      servers: servers.results || [],
      defaults: DEFAULT_SERVERS,
    });
  } catch (error) {
    return json({ servers: [], defaults: DEFAULT_SERVERS });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { cloudflare } = context;
  const db = cloudflare.env.DB;

  if (request.method === 'POST') {
    const config = await request.json();

    try {
      await db
        .prepare(
          'INSERT INTO mcp_servers (id, server_id, name, command, args, env, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          crypto.randomUUID(),
          config.id,
          config.name,
          config.command,
          JSON.stringify(config.args || []),
          JSON.stringify(config.env || {}),
          1
        )
        .run();

      return json({ success: true });
    } catch (error) {
      return json({ error: 'Failed to add server' }, { status: 500 });
    }
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
