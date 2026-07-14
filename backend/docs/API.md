# Recoder Docker Backend API Documentation

## Overview

The Recoder Docker Backend provides a comprehensive API for managing containerized development environments. It handles container lifecycle, file operations, terminal access, Git operations, LSP services, real-time collaboration, and more.

**Base URL:** `https://docker.recoder.xyz` (or `http://localhost:3100` for local development)

## Authentication

All API endpoints require authentication using Better Auth session tokens.

### Request Headers

```
Authorization: Bearer <session_token>
```

The session token is obtained from the Better Auth cookie (`recoder.session_token`) after user login.

### Migration Mode

When `REQUIRE_AUTH=false` (development mode), requests from allowed origins may proceed without authentication (with warnings logged).

### Allowed Origins

- `https://recoder.xyz`
- `https://www.recoder.xyz`
- `https://web.recoder.xyz`
- `http://localhost:3000`
- `http://localhost:5173`

---

## Rate Limiting

| Endpoint Type | Limit |
|--------------|-------|
| General API (`/api/*`) | 100 requests/minute |
| Container Creation | 10 requests/minute |

---

## Health & Status

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "containers": 5
}
```

### Container Pool Stats

```
GET /api/pool/stats
```

**Response:**
```json
{
  "enabled": true,
  "available": 3,
  "total": 5,
  "inUse": 2
}
```

---

## Container Management

### Create/Get Container

Creates a new container for a project or returns an existing one.

```
POST /api/container
```

**Request Body:**
```json
{
  "projectId": "project-uuid-here"
}
```

**Response:**
```json
{
  "containerId": "abc123...",
  "reused": false,
  "fromPool": true,
  "port": 10000,
  "ptyPort": 10003
}
```

**Notes:**
- Maximum 5 containers per user (configurable via `MAX_CONTAINERS_PER_USER`)
- Containers are pre-warmed from a pool for fast startup
- User's Claude Code OAuth token and AI provider keys are automatically injected

**Error Responses:**
- `429` - Container limit reached
- `400` - Missing projectId

### Delete Container

```
DELETE /api/container/:projectId
```

**Response:**
```json
{
  "success": true
}
```

### Keep Alive

Resets the container's idle timer.

```
POST /api/keep-alive/:projectId
```

**Response:**
```json
{
  "success": true,
  "timeRemaining": 1800000
}
```

---

## File Operations

### Write File

```
POST /api/file/:projectId
```

**Request Body:**
```json
{
  "path": "src/index.ts",
  "content": "console.log('Hello');"
}
```

**Response:**
```json
{
  "success": true
}
```

### Read File

```
GET /api/file/:projectId?path=src/index.ts
```

**Response:**
```json
{
  "content": "console.log('Hello');"
}
```

### Delete File

```
DELETE /api/file/:projectId
```

**Request Body:**
```json
{
  "path": "src/old-file.ts"
}
```

### Rename/Move File

```
PUT /api/file/:projectId/rename
```

**Request Body:**
```json
{
  "oldPath": "src/old-name.ts",
  "newPath": "src/new-name.ts"
}
```

### Batch Write Files

```
POST /api/files/:projectId/batch
```

**Request Body:**
```json
{
  "files": [
    { "path": "src/a.ts", "content": "..." },
    { "path": "src/b.ts", "content": "..." }
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

### List Files

```
GET /api/files/:projectId?path=/workspace
```

**Response:**
```json
{
  "files": [
    "/workspace/package.json",
    "/workspace/src/index.ts"
  ]
}
```

### Create Folder

```
POST /api/folder/:projectId
```

**Request Body:**
```json
{
  "path": "src/components"
}
```

### Mount Files

```
POST /api/mount/:projectId
```

**Request Body:**
```json
{
  "files": [
    { "path": "src/a.ts", "content": "..." }
  ]
}
```

---

## Command Execution

### Execute Command

```
POST /api/exec/:projectId
```

**Request Body:**
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
  "output": "added 150 packages..."
}
```

**For background commands (dev servers):**
```json
{
  "command": "npm run dev",
  "background": true
}
```

**Response:**
```json
{
  "output": "Started in background",
  "background": true,
  "ready": true,
  "port": 10001
}
```

**Blocked Commands:**
Commands matching dangerous patterns (docker, nsenter, chroot, etc.) are blocked for security.

---

## Dev Server Management

### Start Dev Server

```
POST /api/dev-server/start
```

**Request Body:**
```json
{
  "projectId": "project-uuid",
  "framework": "vite"
}
```

**Response:**
```json
{
  "success": true,
  "port": 10001,
  "url": "http://localhost:10001"
}
```

### Stop Dev Server

```
POST /api/dev-server/stop
```

**Request Body:**
```json
{
  "projectId": "project-uuid"
}
```

### Restart Dev Server

```
POST /api/dev-server/restart
```

**Request Body:**
```json
{
  "projectId": "project-uuid"
}
```

### Get Dev Server Status

```
GET /api/dev-server/status/:projectId
```

**Response:**
```json
{
  "status": { "status": "running" },
  "isRunning": true,
  "backgroundDev": true
}
```

### Get Dev Server Logs

```
GET /api/logs/:projectId?tail=100
```

**Response:**
```json
{
  "logs": "vite v5.0.0 dev server running at..."
}
```

### Get Parsed Errors

```
GET /api/errors/:projectId?tail=200&autoRestore=true
```

**Response:**
```json
{
  "errors": [
    {
      "file": "src/App.tsx",
      "line": 10,
      "column": 5,
      "message": "Type error...",
      "severity": "error"
    }
  ],
  "hasBlockingErrors": true,
  "devServerStatus": "crashed",
  "errorCount": 1
}
```

---

## Snapshot Management (Version Control)

### Create Snapshot

```
POST /api/snapshot/:projectId
```

**Request Body:**
```json
{
  "message": "Before major refactor",
  "author": "user"
}
```

**Response:**
```json
{
  "id": "abc123",
  "message": "Before major refactor",
  "author": "user",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### List Snapshots

```
GET /api/snapshots/:projectId?limit=50
```

**Response:**
```json
{
  "snapshots": [
    {
      "id": "abc123",
      "message": "Before major refactor",
      "author": "user",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Current Snapshot

```
GET /api/snapshot/:projectId/current
```

### Restore Snapshot

```
POST /api/snapshot/:projectId/restore
```

**Request Body:**
```json
{
  "snapshotId": "abc123"
}
```

### Get Snapshot Diff

```
GET /api/snapshot/:projectId/diff?from=abc123&to=HEAD
```

### Get File Diff

```
GET /api/snapshot/:projectId/file-diff?path=src/index.ts&from=abc123&to=HEAD
```

### Get File at Snapshot

```
GET /api/snapshot/:projectId/file?path=src/index.ts&snapshotId=abc123
```

### Check for Unsaved Changes

```
GET /api/snapshot/:projectId/status
```

**Response:**
```json
{
  "hasChanges": true,
  "current": { "id": "abc123", "message": "..." }
}
```

### Enable Auto-Save

```
POST /api/snapshot/:projectId/auto-save
```

**Request Body:**
```json
{
  "enabled": true,
  "intervalMs": 300000
}
```

### Compress Snapshots

```
POST /api/snapshot/:projectId/compress
```

### Prune Old Snapshots

```
POST /api/snapshot/:projectId/prune
```

**Request Body:**
```json
{
  "keepCount": 50
}
```

### Get Snapshot Stats

```
GET /api/snapshot/:projectId/stats
```

---

## Auto-Restore

### Trigger Auto-Restore

```
POST /api/auto-restore/:projectId
```

**Request Body:**
```json
{
  "force": false,
  "snapshotId": "abc123"
}
```

### Configure Auto-Restore

```
POST /api/auto-restore/config
```

**Request Body:**
```json
{
  "enabled": true,
  "maxRetries": 3,
  "cooldownMs": 60000
}
```

---

## Search & Replace

### Search in Files

```
POST /api/search/:projectId
```

**Request Body:**
```json
{
  "query": "function.*export",
  "options": {
    "regex": true,
    "caseSensitive": false,
    "wholeWord": false,
    "include": "*.ts",
    "exclude": "node_modules"
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "file": "src/utils.ts",
      "line": 10,
      "column": 0,
      "match": "export function helper",
      "context": "..."
    }
  ],
  "total": 5
}
```

### Replace in Files

```
POST /api/replace/:projectId
```

**Request Body:**
```json
{
  "searchQuery": "oldFunction",
  "replaceText": "newFunction",
  "files": ["src/a.ts", "src/b.ts"]
}
```

---

## Package Management

Supports: npm, bun, pip, cargo, go, composer, gem

### Get Installed Packages

```
GET /api/packages/:projectId?manager=npm
```

**Response:**
```json
{
  "packages": [
    { "name": "react", "version": "18.2.0", "isDev": false }
  ],
  "manager": "npm"
}
```

### Search Package Registry

```
POST /api/packages/:projectId/search
```

**Request Body:**
```json
{
  "query": "lodash",
  "manager": "npm"
}
```

### Install Package

```
POST /api/packages/:projectId/install
```

**Request Body:**
```json
{
  "packageName": "lodash",
  "manager": "npm",
  "isDev": false
}
```

### Uninstall Package

```
POST /api/packages/:projectId/uninstall
```

**Request Body:**
```json
{
  "packageName": "lodash",
  "manager": "npm"
}
```

### Update Package

```
POST /api/packages/:projectId/update
```

**Request Body:**
```json
{
  "packageName": "lodash",
  "manager": "npm"
}
```

---

## Secrets/Environment Variables

### Get Secrets

```
GET /api/secrets/:projectId?environment=development
```

**Response:**
```json
{
  "secrets": {
    "API_KEY": "***",
    "DATABASE_URL": "***"
  },
  "environment": "development"
}
```

### Set Secret

```
POST /api/secrets/:projectId
```

**Request Body:**
```json
{
  "key": "API_KEY",
  "value": "secret-value",
  "environment": "development"
}
```

### Delete Secret

```
DELETE /api/secrets/:projectId/:key?environment=development
```

---

## Git Operations

### Get Status

```
GET /api/git/:projectId/status
```

**Response:**
```json
{
  "isRepo": true,
  "branch": "main",
  "staged": ["src/a.ts"],
  "unstaged": ["src/b.ts"],
  "untracked": ["src/c.ts"],
  "ahead": 1,
  "behind": 0
}
```

### Get Branches

```
GET /api/git/:projectId/branches
```

**Response:**
```json
{
  "branches": [
    { "name": "main", "current": true },
    { "name": "feature/new", "current": false }
  ]
}
```

### Create Branch

```
POST /api/git/:projectId/branch
```

**Request Body:**
```json
{
  "name": "feature/new",
  "checkout": true
}
```

### Checkout Branch

```
POST /api/git/:projectId/checkout
```

**Request Body:**
```json
{
  "branch": "feature/new"
}
```

### Delete Branch

```
DELETE /api/git/:projectId/branch/:name?force=false
```

### Get Commit History

```
GET /api/git/:projectId/log?limit=50&branch=main
```

**Response:**
```json
{
  "commits": [
    {
      "hash": "abc123",
      "message": "Initial commit",
      "author": "user@example.com",
      "date": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get File Diff

```
GET /api/git/:projectId/diff/src/index.ts?staged=false
```

### Stage Files

```
POST /api/git/:projectId/stage
```

**Request Body:**
```json
{
  "files": ["src/a.ts", "src/b.ts"]
}
```

### Unstage Files

```
POST /api/git/:projectId/unstage
```

**Request Body:**
```json
{
  "files": ["src/a.ts"]
}
```

### Commit

```
POST /api/git/:projectId/commit
```

**Request Body:**
```json
{
  "message": "Add new feature"
}
```

**Response:**
```json
{
  "success": true,
  "hash": "abc123..."
}
```

### Discard Changes

```
POST /api/git/:projectId/discard
```

**Request Body:**
```json
{
  "files": ["src/a.ts"]
}
```

### Initialize Repository

```
POST /api/git/:projectId/init
```

---

## LSP (Language Server Protocol)

### Start LSP Servers

Auto-detects languages and starts appropriate servers.

```
POST /api/lsp/:projectId/start
```

**Response:**
```json
{
  "success": true,
  "servers": [
    { "languageId": "typescript", "status": "running" },
    { "languageId": "css", "status": "running" }
  ],
  "message": "Started 2 LSP server(s)"
}
```

### Stop LSP Servers

```
POST /api/lsp/:projectId/stop
```

### Get LSP Status

```
GET /api/lsp/:projectId/status
```

### Get Available LSP Configs

```
GET /api/lsp/configs
```

**Response:**
```json
{
  "success": true,
  "configs": [
    { "languageId": "typescript", "name": "TypeScript", "extensions": [".ts", ".tsx"] },
    { "languageId": "python", "name": "Python", "extensions": [".py"] }
  ]
}
```

### Send LSP Request

```
POST /api/lsp/:projectId/request
```

**Request Body:**
```json
{
  "filePath": "src/index.ts",
  "method": "textDocument/completion",
  "params": {
    "position": { "line": 10, "character": 5 }
  }
}
```

### Sync Document

```
POST /api/lsp/:projectId/sync
```

**Request Body:**
```json
{
  "filePath": "src/index.ts",
  "content": "...",
  "version": 1
}
```

### Get LSP Stats

```
GET /api/lsp/stats
```

---

## Collaboration

### Get Collaboration Stats

```
GET /api/collab/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalDocuments": 5,
    "totalConnections": 12,
    "documents": [
      { "key": "project1:src/index.ts", "connections": 3 }
    ]
  }
}
```

---

## CLI-Web Sync

### Link CLI to Project

```
POST /api/sync/:projectId/link
```

**Request Body:**
```json
{
  "clientId": "cli-client-uuid",
  "cliVersion": "1.0.0"
}
```

### Unlink CLI

```
DELETE /api/sync/:projectId/unlink
```

### Get Sync Status

```
GET /api/sync/:projectId/status
```

**Response:**
```json
{
  "success": true,
  "isLinked": true,
  "lastSync": "2024-01-15T10:30:00Z",
  "containerRunning": true,
  "fileCount": 50
}
```

### Push Files (CLI to Web)

```
POST /api/sync/:projectId/push
```

**Request Body:**
```json
{
  "files": {
    "src/index.ts": "...",
    "src/utils.ts": "..."
  },
  "clientId": "cli-client-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "applied": { "added": 2, "modified": 5, "deleted": 1 },
  "totalFiles": 8,
  "message": "Pushed 2 new, 5 modified, 1 deleted files"
}
```

### Pull Files (Web to CLI)

```
GET /api/sync/:projectId/pull
```

**Response:**
```json
{
  "success": true,
  "files": {
    "src/index.ts": "...",
    "src/utils.ts": "..."
  },
  "fileCount": 50
}
```

### Get Diff

```
POST /api/sync/:projectId/diff
```

**Request Body:**
```json
{
  "localFiles": {
    "src/index.ts": "..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "diff": {
    "added": ["src/new.ts"],
    "modified": ["src/index.ts"],
    "deleted": ["src/old.ts"],
    "unchanged": ["src/utils.ts"]
  },
  "stats": { "added": 1, "modified": 1, "deleted": 1 },
  "unifiedDiffs": { "src/index.ts": "..." }
}
```

---

## MCP (Model Context Protocol)

### Get MCP Catalog

```
GET /api/mcp/catalog
```

**Response:**
```json
{
  "servers": [
    {
      "id": "filesystem",
      "name": "Filesystem",
      "description": "File operations",
      "preinstalled": true,
      "requiresApiKey": false
    },
    {
      "id": "web-search",
      "name": "Web Search",
      "description": "Search the web",
      "preinstalled": false,
      "requiresApiKey": true,
      "requiredEnvVars": ["SERP_API_KEY"]
    }
  ]
}
```

### Start MCP Server

```
POST /api/mcp/:projectId/start
```

**Request Body:**
```json
{
  "serverId": "filesystem",
  "config": {
    "env": { "CUSTOM_VAR": "value" }
  }
}
```

**Response:**
```json
{
  "success": true,
  "tools": [
    { "name": "read_file", "description": "..." },
    { "name": "write_file", "description": "..." }
  ]
}
```

### Stop MCP Server

```
POST /api/mcp/:projectId/stop
```

**Request Body:**
```json
{
  "serverId": "filesystem"
}
```

### Stop All MCP Servers

```
POST /api/mcp/:projectId/stop-all
```

### Get Running Servers

```
GET /api/mcp/:projectId/servers
```

### Get All Tools

```
GET /api/mcp/:projectId/tools
```

### Call Tool

```
POST /api/mcp/:projectId/call
```

**Request Body:**
```json
{
  "serverId": "filesystem",
  "toolName": "read_file",
  "args": { "path": "/workspace/package.json" }
}
```

---

## Tunnel (Public URL)

### Start Tunnel

```
POST /api/tunnel/start
```

**Request Body:**
```json
{
  "projectId": "project-uuid",
  "localPort": 5173,
  "useCloudflared": true
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://random-name.trycloudflare.com",
  "expiresAt": 1705312200000,
  "type": "cloudflared",
  "message": "Your project is now publicly accessible via Cloudflare tunnel"
}
```

### Stop Tunnel

```
POST /api/tunnel/stop
```

**Request Body:**
```json
{
  "projectId": "project-uuid"
}
```

### Get Tunnel Status

```
GET /api/tunnel/status/:projectId
```

---

## URL Cloning

### Clone Website

```
POST /api/clone-url/:projectId
```

**Request Body:**
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
  "url": "https://example.com",
  "files": ["index.html", "styles.css"],
  "fileCount": 2,
  "assetCount": 5
}
```

---

## Browser Automation

### Browser Actions

```
POST /api/browser/:projectId
```

**Request Body (launch):**
```json
{
  "action": "launch",
  "url": "https://example.com"
}
```

**Available actions:**
- `launch` - Launch browser with URL
- `click` - Click element by selector
- `type` - Type text into element
- `screenshot` - Take screenshot
- `extract` - Extract text from element
- `execute` - Execute JavaScript
- `scroll_up` / `scroll_down` - Scroll page
- `navigate` - Navigate to URL
- `close` - Close browser
- `status` - Get session status

---

## Code Index (Semantic Search)

### Index Workspace

```
POST /api/code-index/:projectId/index
```

**Request Body:**
```json
{
  "openaiApiKey": "sk-..."
}
```

**Response:**
```json
{
  "success": true,
  "filesIndexed": 50,
  "blocksIndexed": 200
}
```

### Search Code

```
POST /api/code-index/:projectId/search
```

**Request Body:**
```json
{
  "query": "user authentication logic",
  "openaiApiKey": "sk-...",
  "maxResults": 10,
  "directoryPrefix": "src/"
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "file": "src/auth.ts",
      "score": 0.95,
      "content": "...",
      "startLine": 10,
      "endLine": 50
    }
  ]
}
```

### Get Index Status

```
GET /api/code-index/:projectId/status
```

### Clear Index

```
DELETE /api/code-index/:projectId
```

---

## Error Responses

All endpoints may return the following error responses:

| Status Code | Description |
|-------------|-------------|
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Missing or invalid authentication |
| `403` | Forbidden - Access denied (not project owner) |
| `404` | Not Found - Container or resource not found |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |
| `503` | Service Unavailable - Container not running |

**Standard Error Response:**
```json
{
  "error": "Error message describing the issue"
}
```

**Container Error Response:**
```json
{
  "error": "Container not running",
  "canRetry": true
}
```

---

## Container Lifecycle

- **Idle Timeout:** 30 minutes of inactivity
- **Memory Limit:** 2GB per container
- **CPU Quota:** 100% of 1 CPU
- **Max Containers per User:** 5 (default)
- **Container Pool:** Pre-warmed containers for instant startup

---

## Security Features

1. **Input Sanitization:** All file paths and commands are sanitized
2. **Command Blocking:** Dangerous commands (docker, chroot, etc.) are blocked
3. **Rate Limiting:** API and container creation rate limits
4. **CORS:** Strict origin allowlist
5. **Audit Logging:** All security-relevant actions are logged
6. **Project Ownership:** Verified for all project-scoped operations
