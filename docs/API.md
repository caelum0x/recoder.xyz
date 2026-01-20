# Recoder.xyz API Documentation

**Version**: 1.0.0
**Base URL (docker-backend)**: `https://docker.recoder.xyz` (or `http://localhost:3100` for local)
**Base URL (recoder-web)**: `https://web.recoder.xyz` (or `http://localhost:5173` for local)

## Authentication

All API endpoints require authentication via Better Auth session tokens.

### Headers
```
Authorization: Bearer <session_token>
Content-Type: application/json
```

The session token is obtained from the `recoder.session_token` cookie after user login.

### Configuration
- `REQUIRE_AUTH=true` - Strict mode (production): All endpoints require valid token
- `REQUIRE_AUTH=false` - Migration mode: Allows requests from allowed origins without auth

---

## Docker Backend API Endpoints

### Health & Status

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "containers": 5
}
```

#### GET /api/pool/stats
Get container pool statistics.

**Response:**
```json
{
  "enabled": true,
  "available": 8,
  "inUse": 2,
  "totalCreated": 150,
  "avgRecycleCount": 4.2,
  "avgAgeMinutes": 45,
  "config": {
    "minSize": 10,
    "maxSize": 25
  }
}
```

---

### Container Management

#### POST /api/container
Create or get a container for a project.

**Request:**
```json
{
  "projectId": "proj-abc123"
}
```

**Response:**
```json
{
  "containerId": "abc123def456",
  "reused": false,
  "fromPool": true,
  "port": 10000,
  "ptyPort": 10003
}
```

**Errors:**
- `429` - Container limit reached (max 5 per user)
- `404` - Container not found

#### DELETE /api/container/:projectId
Stop and remove a container.

**Response:**
```json
{
  "success": true
}
```

#### POST /api/keep-alive/:projectId
Reset idle timeout for a container.

**Response:**
```json
{
  "success": true,
  "timeRemaining": 1800000
}
```

---

### File Operations

#### POST /api/file/:projectId
Write a file to the container.

**Request:**
```json
{
  "path": "src/App.tsx",
  "content": "import React from 'react';\n..."
}
```

**Response:**
```json
{
  "success": true
}
```

#### GET /api/file/:projectId?path=src/App.tsx
Read a file from the container.

**Response:**
```json
{
  "content": "import React from 'react';\n..."
}
```

#### DELETE /api/file/:projectId
Delete a file or folder.

**Request:**
```json
{
  "path": "src/old-file.tsx"
}
```

#### PUT /api/file/:projectId/rename
Rename or move a file.

**Request:**
```json
{
  "oldPath": "src/OldName.tsx",
  "newPath": "src/NewName.tsx"
}
```

#### POST /api/folder/:projectId
Create a folder.

**Request:**
```json
{
  "path": "src/components"
}
```

#### GET /api/files/:projectId?path=/workspace
List files in a directory.

**Response:**
```json
{
  "files": [
    "/workspace/src",
    "/workspace/package.json",
    "/workspace/src/App.tsx"
  ]
}
```

#### POST /api/files/:projectId/batch
Write multiple files at once.

**Request:**
```json
{
  "files": [
    { "path": "src/App.tsx", "content": "..." },
    { "path": "src/index.tsx", "content": "..." }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "count": 2
}
```

#### POST /api/mount/:projectId
Mount files into the container.

**Request:**
```json
{
  "files": [
    { "path": "file.txt", "content": "content" }
  ]
}
```

---

### Command Execution

#### POST /api/exec/:projectId
Execute a command in the container.

**Request:**
```json
{
  "command": "npm install",
  "cwd": "/workspace",
  "background": false
}
```

**Response:**
```json
{
  "output": "added 100 packages..."
}
```

**Background mode response:**
```json
{
  "output": "Started in background",
  "background": true,
  "ready": true,
  "port": 10001
}
```

**Blocked Commands:**
The following patterns are blocked for security:
- `docker` commands
- `nsenter`, `chroot`, `mount`, `umount`
- Piped scripts: `curl ... | sh`, `wget ... | sh`
- Root deletion: `rm -rf /`
- Device access: `> /dev/...`

---

### Dev Server Management

#### POST /api/dev-server/start
Start a development server.

**Request:**
```json
{
  "projectId": "proj-abc123",
  "framework": "vite"
}
```

**Response:**
```json
{
  "status": "running",
  "port": 10001,
  "url": "http://localhost:10001"
}
```

#### POST /api/dev-server/stop
Stop the development server.

**Request:**
```json
{
  "projectId": "proj-abc123"
}
```

#### POST /api/dev-server/restart
Restart the development server.

#### GET /api/dev-server/status/:projectId
Get dev server status.

**Response:**
```json
{
  "status": { "status": "running", "pid": 12345 },
  "isRunning": true,
  "backgroundDev": true
}
```

#### GET /api/logs/:projectId?tail=100
Get development server logs.

**Response:**
```json
{
  "logs": "VITE v5.0.0  ready in 500 ms\n  ➜  Local:   http://localhost:5173/\n..."
}
```

#### GET /api/errors/:projectId
Get parsed build errors.

**Response:**
```json
{
  "errors": [
    {
      "file": "src/App.tsx",
      "line": 10,
      "message": "Cannot find module 'react'"
    }
  ],
  "hasBlockingErrors": true,
  "devServerStatus": "crashed",
  "errorCount": 1
}
```

---

### Snapshot Management (Version Control)

#### POST /api/snapshot/:projectId
Create a snapshot.

**Request:**
```json
{
  "message": "Added user authentication",
  "author": "user"
}
```

**Response:**
```json
{
  "id": "abc123",
  "message": "Added user authentication",
  "timestamp": 1705612800000
}
```

#### GET /api/snapshots/:projectId?limit=50
List all snapshots.

**Response:**
```json
{
  "snapshots": [
    { "id": "abc123", "message": "...", "timestamp": 1705612800000 },
    { "id": "def456", "message": "...", "timestamp": 1705612700000 }
  ]
}
```

#### GET /api/snapshot/:projectId/current
Get current snapshot (HEAD).

#### POST /api/snapshot/:projectId/restore
Restore to a specific snapshot.

**Request:**
```json
{
  "snapshotId": "abc123"
}
```

#### GET /api/snapshot/:projectId/diff?from=abc123&to=HEAD
Get diff between snapshots.

#### GET /api/snapshot/:projectId/file-diff?path=src/App.tsx&from=abc123&to=HEAD
Get file diff between snapshots.

#### GET /api/snapshot/:projectId/file?path=src/App.tsx&snapshotId=abc123
Get file content at a specific snapshot.

#### GET /api/snapshot/:projectId/status
Check for unsaved changes.

**Response:**
```json
{
  "hasChanges": true,
  "current": { "id": "abc123", "message": "..." }
}
```

#### POST /api/snapshot/:projectId/auto-save
Enable/disable auto-save.

**Request:**
```json
{
  "enabled": true,
  "intervalMs": 300000
}
```

#### POST /api/snapshot/:projectId/compress
Compress snapshots (git gc).

#### POST /api/snapshot/:projectId/prune
Prune old snapshots.

**Request:**
```json
{
  "keepCount": 50
}
```

#### GET /api/snapshot/:projectId/stats
Get snapshot statistics.

---

### Auto-Restore

#### POST /api/auto-restore/:projectId
Trigger auto-restore.

**Request:**
```json
{
  "force": false,
  "snapshotId": "abc123"
}
```

#### POST /api/auto-restore/config
Configure auto-restore.

**Request:**
```json
{
  "enabled": true,
  "maxRetries": 3,
  "cooldownMs": 30000
}
```

---

### Search & Replace

#### POST /api/search/:projectId
Search in files using ripgrep.

**Request:**
```json
{
  "query": "useState",
  "options": {
    "caseSensitive": false,
    "regex": false,
    "includePattern": "*.tsx"
  }
}
```

**Response:**
```json
{
  "results": [
    { "file": "src/App.tsx", "line": 5, "content": "const [count, setCount] = useState(0)" }
  ],
  "total": 1
}
```

#### POST /api/replace/:projectId
Replace in files.

**Request:**
```json
{
  "searchQuery": "oldFunction",
  "replaceText": "newFunction",
  "files": ["src/utils.ts"]
}
```

---

### Package Manager

#### GET /api/packages/:projectId?manager=npm
Get installed packages.

**Supported managers:** `npm`, `bun`, `pip`, `cargo`, `go`, `composer`, `gem`

**Response:**
```json
{
  "packages": [
    { "name": "react", "version": "18.2.0", "dev": false },
    { "name": "typescript", "version": "5.0.0", "dev": true }
  ],
  "manager": "npm"
}
```

#### POST /api/packages/:projectId/search
Search package registry.

**Request:**
```json
{
  "query": "lodash",
  "manager": "npm"
}
```

#### POST /api/packages/:projectId/install
Install a package.

**Request:**
```json
{
  "packageName": "lodash",
  "manager": "npm",
  "isDev": false
}
```

#### POST /api/packages/:projectId/uninstall
Uninstall a package.

**Request:**
```json
{
  "packageName": "lodash",
  "manager": "npm"
}
```

#### POST /api/packages/:projectId/update
Update a package.

---

### Secrets/Environment Variables

#### GET /api/secrets/:projectId?environment=development
Get secrets for an environment.

**Environments:** `development`, `production`, `test`, `local`

**Response:**
```json
{
  "secrets": [
    { "key": "API_KEY", "value": "***masked***" }
  ],
  "environment": "development"
}
```

#### POST /api/secrets/:projectId
Set a secret.

**Request:**
```json
{
  "key": "API_KEY",
  "value": "sk-abc123",
  "environment": "development"
}
```

#### DELETE /api/secrets/:projectId/:key?environment=development
Delete a secret.

---

### Git Operations

#### GET /api/git/:projectId/status
Get git status.

**Response:**
```json
{
  "branch": "main",
  "ahead": 0,
  "behind": 0,
  "staged": ["src/App.tsx"],
  "modified": ["src/utils.ts"],
  "untracked": ["new-file.ts"]
}
```

#### GET /api/git/:projectId/branches
Get all branches.

**Response:**
```json
{
  "branches": [
    { "name": "main", "current": true },
    { "name": "feature/auth", "current": false }
  ]
}
```

#### POST /api/git/:projectId/branch
Create a branch.

**Request:**
```json
{
  "name": "feature/new-feature",
  "checkout": true
}
```

#### POST /api/git/:projectId/checkout
Checkout a branch.

**Request:**
```json
{
  "branch": "feature/auth"
}
```

#### DELETE /api/git/:projectId/branch/:name?force=false
Delete a branch.

#### GET /api/git/:projectId/log?limit=50&branch=main
Get commit history.

**Response:**
```json
{
  "commits": [
    {
      "hash": "abc123",
      "message": "Add user auth",
      "author": "dev@example.com",
      "date": "2025-01-18T12:00:00Z"
    }
  ]
}
```

#### GET /api/git/:projectId/diff/:file?staged=false
Get file diff.

#### POST /api/git/:projectId/stage
Stage files.

**Request:**
```json
{
  "files": ["src/App.tsx", "src/utils.ts"]
}
```

#### POST /api/git/:projectId/unstage
Unstage files.

#### POST /api/git/:projectId/commit
Create a commit.

**Request:**
```json
{
  "message": "Add user authentication"
}
```

**Response:**
```json
{
  "success": true,
  "hash": "abc123def"
}
```

#### POST /api/git/:projectId/discard
Discard changes.

**Request:**
```json
{
  "files": ["src/App.tsx"]
}
```

#### POST /api/git/:projectId/init
Initialize a git repository.

---

### MCP Server Management

#### GET /api/mcp/catalog
Get available MCP servers.

**Response:**
```json
{
  "servers": [
    {
      "id": "filesystem",
      "name": "Filesystem MCP",
      "description": "File operations",
      "preinstalled": true,
      "requiresApiKey": false
    },
    {
      "id": "github",
      "name": "GitHub MCP",
      "preinstalled": false,
      "requiresApiKey": true,
      "requiredEnvVars": ["GITHUB_PERSONAL_ACCESS_TOKEN"]
    }
  ]
}
```

#### POST /api/mcp/:projectId/start
Start an MCP server.

**Request:**
```json
{
  "serverId": "filesystem",
  "config": {
    "env": {}
  }
}
```

**Response:**
```json
{
  "success": true,
  "tools": ["read_file", "write_file", "list_directory"]
}
```

#### POST /api/mcp/:projectId/stop
Stop an MCP server.

**Request:**
```json
{
  "serverId": "filesystem"
}
```

#### POST /api/mcp/:projectId/stop-all
Stop all MCP servers for a project.

#### GET /api/mcp/:projectId/servers
Get running MCP servers.

**Response:**
```json
{
  "servers": [
    { "id": "filesystem", "name": "Filesystem MCP", "status": "running" }
  ]
}
```

#### GET /api/mcp/:projectId/tools
Get all tools from running MCP servers.

**Response:**
```json
{
  "tools": [
    { "name": "read_file", "description": "Read a file", "server": "filesystem" }
  ]
}
```

#### POST /api/mcp/:projectId/call
Call a tool on an MCP server.

**Request:**
```json
{
  "serverId": "filesystem",
  "toolName": "read_file",
  "args": { "path": "/workspace/package.json" }
}
```

---

### Tunnel Deployment

#### POST /api/tunnel/start
Start a public tunnel (cloudflared).

**Request:**
```json
{
  "projectId": "proj-abc123",
  "localPort": 5173,
  "useCloudflared": true
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://random-name.trycloudflare.com",
  "type": "cloudflared",
  "expiresAt": 1705616400000
}
```

#### POST /api/tunnel/stop
Stop a tunnel.

**Request:**
```json
{
  "projectId": "proj-abc123"
}
```

#### GET /api/tunnel/status/:projectId
Get tunnel status.

---

### URL Cloning

#### POST /api/clone-url/:projectId
Clone a website by URL.

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "success": true,
  "title": "Example Domain",
  "files": {
    "index.html": "<!DOCTYPE html>...",
    "package.json": "{...}"
  },
  "assetCount": 15
}
```

---

### Browser Automation

#### POST /api/browser/:projectId
Run browser automation actions.

**Actions:**
- `launch` - Open URL in headless browser
- `click` - Click element by selector
- `type` - Type text into input
- `screenshot` - Take screenshot (returns base64)
- `extract` - Extract text from elements
- `execute` - Run JavaScript
- `scroll_up` / `scroll_down` - Scroll page
- `close` - Close browser

**Request (launch):**
```json
{
  "action": "launch",
  "url": "https://example.com"
}
```

**Request (screenshot):**
```json
{
  "action": "screenshot"
}
```

**Response:**
```json
{
  "success": true,
  "screenshot": "base64encodedimage..."
}
```

---

### Code Index (Semantic Search)

#### POST /api/code-index/:projectId/index
Index the workspace for semantic search.

**Request:**
```json
{
  "openaiApiKey": "sk-..."
}
```

#### POST /api/code-index/:projectId/search
Semantic code search.

**Request:**
```json
{
  "query": "user authentication handler",
  "openaiApiKey": "sk-...",
  "maxResults": 10
}
```

**Response:**
```json
{
  "results": [
    {
      "file": "src/auth/handler.ts",
      "functionName": "handleUserAuth",
      "content": "export function handleUserAuth...",
      "score": 0.92
    }
  ]
}
```

#### GET /api/code-index/:projectId/status
Get index statistics.

#### DELETE /api/code-index/:projectId
Clear the index.

---

## WebSocket Endpoints

### Terminal WebSocket
`ws://docker.recoder.xyz/terminal/:projectId?terminalId=term-123`

**Messages (Client to Server):**
- Raw terminal input (bytes)
- RPC messages (JSON):
  ```json
  { "method": "terminal.resize", "params": { "cols": 80, "rows": 24 } }
  { "method": "terminal.clear", "params": {} }
  { "method": "terminal.kill", "params": {} }
  { "method": "resetTimer", "params": {} }
  ```

**Messages (Server to Client):**
- Raw terminal output (bytes)

### File Watch WebSocket
`ws://docker.recoder.xyz/watch/:projectId`

**Messages (Server to Client):**
```json
{
  "type": "file-changes",
  "changes": [
    { "type": "modify", "path": "src/App.tsx" },
    { "type": "create", "path": "src/new-file.ts" },
    { "type": "delete", "path": "src/old-file.ts" }
  ]
}
```

### File Sync WebSocket
`ws://docker.recoder.xyz/sync/:projectId`

**Messages (Client to Server):**
```json
{ "action": "write", "path": "/workspace/file.txt", "content": "..." }
{ "action": "read", "path": "/workspace/file.txt" }
{ "action": "delete", "path": "/workspace/file.txt" }
{ "action": "list", "path": "/workspace" }
```

**Messages (Server to Client):**
```json
{ "action": "written", "path": "/workspace/file.txt" }
{ "action": "content", "path": "/workspace/file.txt", "content": "..." }
{ "action": "deleted", "path": "/workspace/file.txt" }
{ "action": "files", "files": [...] }
{ "action": "error", "error": "..." }
```

---

## Recoder-Web API Endpoints

### Chat API

#### POST /api/chat
Send a message to the AI chat.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Create a React component" }
  ],
  "provider": "openrouter",
  "model": "anthropic/claude-3.5-sonnet",
  "maxTokens": 8000,
  "mode": "code",
  "recoderContext": "...",
  "projectContext": "..."
}
```

**Response:** Streaming text response with recoderAction XML tags

**Modes:** `architect`, `code`, `ask`, `debug`, `orchestrator`

### Enterprise Tools API

#### POST /api/enterprise-tools
Execute enterprise tools.

**Available Tools:**
- `readFileEnhanced` - Read file with line range
- `searchReplace` - Search and replace in file
- `discoverFiles` - Find relevant files
- `autoCommit` - Auto-commit changes
- `webSearch` - Web search (DuckDuckGo/Tavily)
- `webFetch` - Fetch URL content
- `memory` - Store/retrieve data
- `glob` - Glob pattern search
- `ripGrep` - Pattern search with ripgrep
- `editFile` - Apply line edits
- `readManyFiles` - Read multiple files
- `checkLoops` - Loop detection
- `executeShell` - Execute shell command
- `multiApplyDiff` - Atomic multi-file diff
- `browserAutomation` - Browser automation
- `codeSearch` - Semantic code search

**Request:**
```json
{
  "tool": "webSearch",
  "params": {
    "query": "react hooks tutorial"
  }
}
```

### Other Endpoints

- `GET /api/health` - Health check
- `GET /api/status` - System status
- `GET /api/projects` - List user projects
- `GET /api/projects/:projectId` - Get project details
- `GET /api/starters` - List starter templates
- `GET /api/templates` - List project templates
- `POST /api/clone-url` - Clone URL (proxies to docker-backend)
- `POST /api/deploy` - Deploy project
- `GET/POST /api/mcp.marketplace` - MCP marketplace
- `POST /api/mcp.marketplace.install` - Install MCP server
- `POST /api/spawn-task` - Spawn AI subtask
- `GET /api/commands` - List slash commands

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message here",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Common Error Codes:**
- `401` - Authentication required
- `403` - Access denied (not project owner)
- `404` - Resource not found
- `429` - Rate limited
- `500` - Internal server error
- `503` - Container not running (retry)

---

## Rate Limits

- General API: 100 requests/minute
- Container creation: 10 requests/minute
- Chat API: 30 requests/minute (configurable)

---

## Security Notes

1. All sensitive operations are audit logged
2. Paths are sanitized to prevent traversal attacks
3. Commands are validated against blocklist
4. Container isolation with capability dropping
5. Per-user container limits (default: 5)
6. CORS restricted to allowed origins only
