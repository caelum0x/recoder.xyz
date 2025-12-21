/**
 * MCP Tools Loader
 * Loads MCP tools and formats them for AI system prompt
 */

export async function loadMCPTools(db: any) {
  // Skip if no database available (not running on Cloudflare)
  if (!db || typeof db.prepare !== 'function') {
    return '';
  }

  try {
    const servers = await db
      .prepare('SELECT * FROM mcp_servers WHERE enabled = 1')
      .all();

    if (!servers.results || servers.results.length === 0) {
      return '';
    }

    const toolsList = servers.results
      .map((s: any) => `- ${s.name} (${s.server_id})`)
      .join('\n');

    return `

🔧 MCP TOOLS AVAILABLE:
${toolsList}
`;
  } catch (error) {
    console.error('MCP tools error:', error);
    return '';
  }
}
