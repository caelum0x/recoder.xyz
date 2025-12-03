# MCP Structure in Recoder-Web

## ✅ Reorganized: MCP at Root Level

MCP (Model Context Protocol) servers are now properly located at the **root level** of recoder-web, not buried in the app folder.

## Directory Structure

```
recoder-web/
├── mcp/                          # ← MCP servers at root (NEW)
│   ├── README.md                 # Documentation
│   ├── package.json              # Module definition
│   ├── index.ts                  # Main entry point
│   ├── client.ts                 # MCP client
│   ├── registry.ts               # Server registry
│   ├── types.ts                  # TypeScript types
│   └── servers/                  # MCP server implementations
│       ├── github.ts             # GitHub operations
│       ├── filesystem.ts         # File operations
│       ├── database.ts           # Database queries
│       └── api.ts                # HTTP requests
│
├── app/                          # Remix app
│   └── lib/
│       └── .server/
│           └── mcp/
│               └── tools-loader.ts  # Imports from /mcp/
│
└── [other directories...]
```

## Why Root Level?

1. **Logical Separation** - MCP servers are infrastructure, not app code
2. **Reusability** - Can be imported by any part of the app
3. **Clarity** - Clear that MCP is a core feature, not a nested module
4. **Standard Practice** - Similar to `/functions/`, `/e2e/`, `/collaboration/`

## What's in /mcp/

### Core Files

- **`index.ts`** - Main entry point, exports all MCP functionality
- **`client.ts`** - MCP client for executing tool calls
- **`registry.ts`** - Registry of all available MCP servers
- **`types.ts`** - TypeScript type definitions
- **`package.json`** - Module metadata

### Servers

Each server is a TypeScript class that:
1. Defines available tools with JSON schemas
2. Implements tool execution logic
3. Returns results to AI

**Available Servers:**

1. **GitHub** (`servers/github.ts`)
   - Create repos, PRs, issues
   - Read files, search code
   - List branches, commits

2. **Filesystem** (`servers/filesystem.ts`)
   - Read/write files in WebContainer
   - List directories
   - Search file contents

3. **Database** (`servers/database.ts`)
   - Execute SQL queries
   - CRUD operations
   - Schema inspection

4. **API** (`servers/api.ts`)
   - HTTP requests
   - Fetch external data
   - POST/GET operations

## How It Works

### 1. Initialization

```typescript
// In app startup
import { initializeMCPServers } from '~/../../mcp';

const mcpRegistry = await initializeMCPServers(env);
```

### 2. Loading Tools for AI

```typescript
// In chat API route
import { getMCPToolsPrompt } from '~/../../mcp';

const mcpToolsPrompt = await getMCPToolsPrompt(env);
const systemPrompt = basePrompt + mcpToolsPrompt;
```

### 3. Executing Tools

```typescript
// When AI calls a tool
import { MCPClient } from '~/../../mcp';

const client = new MCPClient();
const result = await client.executeTool('github_create_repo', {
  name: 'my-project',
  description: 'My awesome project'
});
```

## Benefits

✅ **Clear Architecture** - MCP is a first-class module  
✅ **Easy to Find** - Located at `/mcp/` not `/app/lib/.server/mcp/`  
✅ **Reusable** - Can be imported anywhere  
✅ **Maintainable** - Separate from app logic  
✅ **Scalable** - Easy to add new servers  

## Migration

Old location: `/app/lib/.server/mcp/`  
New location: `/mcp/`

All imports updated to use new location:
```typescript
// Old
import { MCPClient } from '~/lib/.server/mcp/client';

// New
import { MCPClient } from '~/../../mcp';
```

## Adding New Servers

1. Create server file in `/mcp/servers/my-server.ts`
2. Implement server class with required methods
3. Export from `/mcp/index.ts`
4. Register in initialization
5. Add to database `mcp_servers` table

## Documentation

See `/mcp/README.md` for detailed documentation on:
- Available servers and tools
- Usage examples
- Security considerations
- Adding new servers

---

**MCP is now properly organized at the root level!** 🎉
