import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

export async function action({ request, params, context }: ActionFunctionArgs) {
  const { cloudflare } = context;
  const db = cloudflare.env.DB;
  const { serverId } = params;

  if (request.method === 'DELETE') {
    try {
      await db
        .prepare('DELETE FROM mcp_servers WHERE server_id = ?')
        .bind(serverId)
        .run();

      return json({ success: true });
    } catch (error) {
      return json({ error: 'Failed to delete server' }, { status: 500 });
    }
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
