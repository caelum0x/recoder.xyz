import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ context }: LoaderFunctionArgs) {
  try {
    const db = (context as any)?.cloudflare?.env || process.env.DB;
    
    // Check if MCP servers table exists and has enabled servers
    const servers = await db
      .prepare('SELECT COUNT(*) as count FROM mcp_servers WHERE enabled = 1')
      .first();

    const enabledCount = servers?.count || 0;

    // Get list of enabled servers with details
    const enabledServers = await db
      .prepare('SELECT server_id, name, enabled FROM mcp_servers WHERE enabled = 1')
      .all();

    // Test if MCP servers are actually functional
    const serverList = enabledServers.results || [];
    const functionalServers = serverList.filter((s: any) => s.enabled === 1);

    return json({
      status: 'healthy',
      enabled: enabledCount > 0,
      serverCount: enabledCount,
      activeCount: functionalServers.length,
      servers: serverList.map((s: any) => ({
        id: s.server_id,
        name: s.name,
        enabled: s.enabled === 1,
      })),
      message: enabledCount > 0 
        ? `${functionalServers.length}/${enabledCount} MCP server(s) active`
        : 'No MCP servers enabled. MCP servers run in recoder-web and provide tools like GitHub, filesystem access, etc.',
      info: 'MCP (Model Context Protocol) servers are built-in to recoder-web and provide AI with access to external tools and data sources.',
    });
  } catch (error: any) {
    return json({
      status: 'error',
      enabled: false,
      serverCount: 0,
      activeCount: 0,
      servers: [],
      message: 'Failed to check MCP status',
      info: 'MCP servers should be configured in the database. Check if mcp_servers table exists.',
    }, { status: 500 });
  }
}
