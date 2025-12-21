# MCP Servers for Recoder.xyz

Model Context Protocol (MCP) servers that provide AI with access to external tools and data sources.

## What is MCP?

MCP is an open standard protocol introduced by Anthropic that standardizes how AI models access external tools, systems, and data sources. It provides a universal interface for:

- Reading and writing files
- Executing functions
- Accessing databases
- Making API calls
- Interacting with external services

## Architecture

MCP servers in recoder-web run as **built-in TypeScript modules** (not external processes). They:

1. Define available tools with schemas
2. Execute tool calls when AI requests them
3. Return results to the AI in real-time

## Available Servers

### 1. GitHub Server (`/mcp/servers/github.ts`)
Provides GitHub operations through MCP protocol.

**Tools:**
- `github_create_repo` - Create repositories
- `github_list_repos` - List user repositories
- `github_get_repo` - Get repository details
- `github_create_issue` - Create issues
- `github_create_pr` - Create pull requests
- `github_list_branches` - List branches
- `github_get_file_content` - Read files from repos
- `github_search_repos` - Search GitHub

**Configuration:**
Requires GitHub OAuth token from user's connected account.

### 2. Filesystem Server (`/mcp/servers/filesystem.ts`)
Provides file operations in WebContainer.

**Tools:**
- `fs_read_file` - Read file contents
- `fs_write_file` - Write/update files
- `fs_list_files` - List directory contents
- `fs_search_files` - Search files by content (grep)
- `fs_delete_file` - Delete files
- `fs_move_file` - Move/rename files

**Configuration:**
Operates within WebContainer sandbox, no external access.

### 3. Database Server (`/mcp/servers/database.ts`)
Provides database operations.

**Tools:**
- `db_query` - Execute SQL queries
- `db_insert` - Insert records
- `db_update` - Update records
- `db_delete` - Delete records
- `db_list_tables` - List database tables
- `db_describe_table` - Get table schema

**Configuration:**
Uses Cloudflare D1 database from environment.

### 4. API Server (`/mcp/servers/api.ts`)
Provides HTTP request capabilities.

**Tools:**
- `api_request` - Make HTTP requests
- `api_fetch` - Fetch data from URLs
- `api_post` - POST data to APIs
- `api_get` - GET data from APIs

**Configuration:**
Sandboxed to allowed domains only.

## Usage

MCP servers are automatically loaded and made available to AI through the system prompt. When AI needs to use a tool:

```typescript
// AI decides to use a tool
AI: "I'll create a GitHub repository"

// MCP client executes the tool
const result = await mcpClient.executeTool('github_create_repo', {
  name: 'my-project',
  description: 'My awesome project',
  private: false
});

// Result returned to AI
AI: "I've created the repository at https://github.com/user/my-project"
```

## Adding New Servers

1. Create server file in `/mcp/servers/`
2. Implement server class with `getServer()` and `executeTool()` methods
3. Define tools with JSON schemas
4. Register server in `/mcp/registry.ts`
5. Add to database `mcp_servers` table

## Security

- All servers run in sandboxed environment
- Network access restricted to allowed domains
- File operations limited to WebContainer
- Database access uses prepared statements
- Rate limiting applied per server
- User approval required for destructive operations

## References

- [MCP Official Docs](https://modelcontextprotocol.io/docs)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Anthropic MCP Guide](https://www.anthropic.com/news/model-context-protocol)
