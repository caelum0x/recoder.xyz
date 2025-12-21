# Recoder Web IDE - API Documentation

Base URL: `https://ide.recoder.xyz` (or local dev server)

## Routes API

### Chat & AI

#### POST /api/chat
Stream AI responses.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Create a React component" }
  ],
  "model": "claude-3-5-sonnet-latest",
  "apiKeys": {
    "anthropic": "sk-ant-..."
  }
}
```

**Response:** Server-Sent Events stream with actions

#### POST /api/enhancer
Enhance user prompts.

**Request:**
```json
{
  "message": "make a button",
  "model": "claude-3-5-sonnet-latest"
}
```

---

### Projects

#### GET /api/projects
List saved projects from IndexedDB.

#### POST /api/projects
Save project.

**Request:**
```json
{
  "id": "project-123",
  "name": "My App",
  "files": { "/src/index.ts": "..." },
  "chatHistory": [...]
}
```

#### GET /api/projects/:id
Load specific project.

#### DELETE /api/projects/:id
Delete project.

---

### GitHub Integration

#### POST /api/github/clone
Clone repository.

**Request:**
```json
{
  "url": "https://github.com/user/repo",
  "branch": "main"
}
```

**Response:**
```json
{
  "files": {
    "/package.json": "...",
    "/src/index.ts": "..."
  }
}
```

#### POST /api/github/push
Push changes to repository.

**Request:**
```json
{
  "repo": "user/repo",
  "branch": "main",
  "files": {...},
  "message": "Update from Recoder"
}
```

---

### Templates/Starters

#### GET /api/starters
List available starter templates.

**Response:**
```json
{
  "starters": [
    {
      "name": "nextjs",
      "title": "Next.js",
      "description": "React framework",
      "tags": ["react", "fullstack"]
    }
  ]
}
```

#### GET /api/starters/:name
Get starter template files.

---

### MCP (Model Context Protocol)

#### GET /api/mcp/servers
List available MCP servers.

#### POST /api/mcp/connect
Connect to MCP server.

**Request:**
```json
{
  "serverId": "filesystem",
  "config": {
    "allowedPaths": ["/workspace"]
  }
}
```

#### GET /api/mcp/tools
List tools from connected servers.

#### POST /api/mcp/execute
Execute MCP tool.

**Request:**
```json
{
  "serverId": "filesystem",
  "tool": "read_file",
  "args": { "path": "/src/app.tsx" }
}
```

---

### Download/Export

#### POST /api/download
Download project as ZIP.

**Request:**
```json
{
  "files": {
    "/package.json": "...",
    "/src/index.ts": "..."
  },
  "projectName": "my-app"
}
```

**Response:** Binary ZIP file

---

### Health

#### GET /api/health
Health check.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

## WebContainer API

The IDE uses WebContainer for in-browser Node.js execution.

### File System
```typescript
// Write file
webcontainer.fs.writeFile('/src/app.tsx', content);

// Read file
const content = await webcontainer.fs.readFile('/src/app.tsx', 'utf-8');

// Create directory
await webcontainer.fs.mkdir('/src/components', { recursive: true });
```

### Process Execution
```typescript
// Run command
const process = await webcontainer.spawn('npm', ['install']);

// Stream output
process.output.pipeTo(new WritableStream({
  write(data) { console.log(data); }
}));

// Wait for exit
const exitCode = await process.exit;
```

### Dev Server
```typescript
// Start dev server
const serverProcess = await webcontainer.spawn('npm', ['run', 'dev']);

// Listen for server ready
webcontainer.on('server-ready', (port, url) => {
  // Load preview iframe
  previewIframe.src = url;
});
```

---

## Error Handling

All API errors return:
```json
{
  "error": "Error message",
  "details": "Additional context"
}
```

Status codes:
- `400` - Invalid request
- `401` - Authentication required
- `403` - Access denied
- `404` - Not found
- `500` - Server error
