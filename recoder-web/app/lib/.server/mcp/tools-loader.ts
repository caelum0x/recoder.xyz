/**
 * MCP Tools Loader
 * Loads MCP tools and formats them for AI system prompt
 */

export async function loadMCPTools(db: any) {
  try {
    // Check database for enabled MCP servers
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
You have access to these external tools via Model Context Protocol:

${toolsList}

These tools run in recoder-web and provide access to:
- GitHub operations (repos, PRs, issues, files)
- Filesystem operations (read, write, search)
- Database queries
- API requests

When you need to use these tools, mention them in your response.
`;
  } catch (error) {
    console.error('Failed to load MCP tools:', error);
    return '';
  }
}
