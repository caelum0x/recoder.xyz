export async function loadMCPTools(db: any) {
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
You have access to these external tools via Model Context Protocol:

${toolsList}

You can use these tools to:
- GitHub: Clone repos, create PRs, read files
- Filesystem: Read/write files, search directories
- Web Search: Search the web for information
- Browser: Automate browser tasks, take screenshots

When you need to use these tools, mention them in your response.
`;
  } catch (error) {
    console.error('Failed to load MCP tools:', error);
    return '';
  }
}
