# Recoder Docker Backend WebSocket Protocols

## Overview

The Recoder Docker Backend provides several WebSocket endpoints for real-time communication:

1. **Terminal** (`/terminal/:projectId`) - Interactive shell access
2. **File Sync** (`/sync/:projectId`) - Real-time file synchronization
3. **File Watch** (`/watch/:projectId`) - File change notifications
4. **CLI Sync** (`/cli-sync/:projectId`) - CLI-Web bidirectional sync
5. **Collaboration** (`/collab`) - Real-time collaborative editing (Yjs)

**Base URL:** `wss://docker.recoder.xyz` (or `ws://localhost:3100` for local development)

---

## Terminal WebSocket

Interactive terminal sessions using Docker exec.

### Connection

```
ws://localhost:3100/terminal/:projectId?terminalId=term-123
```

**Query Parameters:**
- `projectId` (required) - Project identifier
- `terminalId` (optional) - Unique terminal session ID (default: `term-{timestamp}`)

### Protocol

The terminal WebSocket supports two types of messages:

#### 1. Raw Terminal Data

Binary or text data sent directly to the container's shell:

```
Client -> Server: Raw terminal input (keystrokes)
Server -> Client: Raw terminal output (ANSI escape sequences)
```

#### 2. JSON-RPC Messages

Structured commands using a simple JSON-RPC protocol:

**Request Format:**
```json
{
  "id": 1,
  "method": "terminal.resize",
  "params": { "cols": 80, "rows": 24 }
}
```

**Response Format:**
```json
{
  "id": 1,
  "result": { "success": true }
}
```

**Error Response:**
```json
{
  "id": 1,
  "error": "Error message"
}
```

### Available RPC Methods

#### `terminal.resize`

Resize the terminal dimensions.

**Parameters:**
```json
{
  "cols": 80,
  "rows": 24
}
```

**Response:**
```json
{
  "success": true
}
```

#### `terminal.clear`

Clear the terminal screen (sends ANSI clear code `\x1bc`).

**Parameters:** None

**Response:**
```json
{
  "success": true
}
```

#### `terminal.kill`

Send SIGINT (Ctrl+C) to interrupt running process.

**Parameters:** None

**Response:**
```json
{
  "success": true
}
```

#### `terminal.saveHistory`

Save a command to bash history.

**Parameters:**
```json
{
  "command": "npm install"
}
```

**Response:**
```json
{
  "success": true
}
```

#### `terminal.getHistory`

Retrieve bash command history.

**Parameters:** None

**Response:**
```json
{
  "history": ["ls", "cd src", "npm install"]
}
```

#### `resetTimer`

Reset the container's idle timeout timer.

**Parameters:** None

**Response:**
```json
{
  "success": true
}
```

### Events (Server to Client)

#### `command-complete`

Notification when a command finishes execution.

```json
{
  "type": "command-complete",
  "timestamp": 1705312200000
}
```

### Session Management

- Sessions persist for 5 seconds after WebSocket close (grace period for reconnection)
- Session state (including shell history) is stored in Redis when available
- Multiple terminals can connect to the same container with different `terminalId` values

### Example Usage (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:3100/terminal/project-123?terminalId=term-1');

// Handle raw terminal output
ws.onmessage = (event) => {
  if (event.data instanceof Blob) {
    // Binary terminal data
    const reader = new FileReader();
    reader.onload = () => terminal.write(reader.result);
    reader.readAsText(event.data);
  } else {
    // Try parsing as JSON-RPC response
    try {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined) {
        // RPC response
        handleRpcResponse(msg);
      } else if (msg.type === 'command-complete') {
        // Command finished
        onCommandComplete();
      }
    } catch {
      // Raw text data
      terminal.write(event.data);
    }
  }
};

// Send terminal input
ws.send('ls -la\r');

// Send RPC command
ws.send(JSON.stringify({
  id: 1,
  method: 'terminal.resize',
  params: { cols: 120, rows: 40 }
}));
```

---

## File Sync WebSocket

Real-time file synchronization for basic file operations.

### Connection

```
ws://localhost:3100/sync/:projectId
```

### Protocol

JSON messages for file operations.

### Client to Server Messages

#### `write` - Write File

```json
{
  "action": "write",
  "path": "/workspace/src/index.ts",
  "content": "console.log('hello');"
}
```

**Response:**
```json
{
  "action": "written",
  "path": "/workspace/src/index.ts"
}
```

#### `read` - Read File

```json
{
  "action": "read",
  "path": "/workspace/src/index.ts"
}
```

**Response:**
```json
{
  "action": "content",
  "path": "/workspace/src/index.ts",
  "content": "console.log('hello');"
}
```

#### `delete` - Delete File

```json
{
  "action": "delete",
  "path": "/workspace/src/old-file.ts"
}
```

**Response:**
```json
{
  "action": "deleted",
  "path": "/workspace/src/old-file.ts"
}
```

#### `list` - List Files

```json
{
  "action": "list",
  "path": "/workspace"
}
```

**Response:**
```json
{
  "action": "files",
  "files": [
    "/workspace/package.json",
    "/workspace/src/index.ts"
  ]
}
```

### Error Response

```json
{
  "action": "error",
  "error": "Error message"
}
```

---

## File Watch WebSocket

File change notifications from container.

### Connection

```
ws://localhost:3100/watch/:projectId
```

### Protocol

The server pushes file change events to connected clients.

### Server to Client Events

#### `file-changes`

Notification when files change in the container.

```json
{
  "type": "file-changes",
  "changes": [
    {
      "type": "modified",
      "path": "src/index.ts",
      "timestamp": 1705312200000
    },
    {
      "type": "created",
      "path": "src/new-file.ts",
      "timestamp": 1705312201000
    },
    {
      "type": "deleted",
      "path": "src/old-file.ts",
      "timestamp": 1705312202000
    }
  ]
}
```

**Change Types:**
- `created` - New file created
- `modified` - File content changed
- `deleted` - File deleted
- `renamed` - File renamed/moved

### Notes

- File watcher starts when first client connects
- File watcher stops when all clients disconnect
- Excludes `node_modules`, `.git`, and common build directories

---

## CLI Sync WebSocket

Bidirectional synchronization between CLI tools and web editor.

### Connection

```
ws://localhost:3100/cli-sync/:projectId?clientId=cli-uuid
```

**Query Parameters:**
- `projectId` (required) - Project identifier
- `clientId` (optional) - Unique client identifier (auto-generated if not provided)

### Protocol

### Initial Connection

Server sends connection confirmation:

```json
{
  "type": "connected",
  "clientId": "cli-uuid-123",
  "projectId": "project-uuid",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Client to Server Messages

#### `file-change` - Report File Change

```json
{
  "type": "file-change",
  "id": 123,
  "path": "src/index.ts",
  "content": "console.log('hello');"
}
```

**Acknowledgment:**
```json
{
  "type": "ack",
  "id": 123
}
```

#### `ping` - Keep Alive

```json
{
  "type": "ping"
}
```

**Response:**
```json
{
  "type": "pong",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### `get-status` - Get Sync Status

```json
{
  "type": "get-status"
}
```

**Response:**
```json
{
  "type": "status",
  "isLinked": true,
  "lastSync": "2024-01-15T10:30:00.000Z"
}
```

### Server to Client Events

#### `file-change` - Remote File Change

Broadcast when another client changes a file:

```json
{
  "type": "file-change",
  "path": "src/index.ts",
  "content": "console.log('hello');",
  "source": "cli",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### `sync-event` - Sync State Change

```json
{
  "type": "sync-event",
  "projectId": "project-uuid",
  "event": "file-modified",
  "path": "src/index.ts"
}
```

#### `error`

```json
{
  "type": "error",
  "error": "Error message"
}
```

---

## Collaboration WebSocket (Yjs)

Real-time collaborative editing using Yjs CRDT protocol.

### Connection

```
ws://localhost:3100/collab?projectId=project-uuid&file=src/index.ts&token=auth-token
```

**Query Parameters:**
- `projectId` (required) - Project identifier
- `file` (required) - File path being edited
- `token` (optional) - Authentication token (can also use `Authorization` header)

### Protocol

The collaboration WebSocket uses the Yjs binary protocol with three message types:

| Message Type | Value | Description |
|--------------|-------|-------------|
| `MESSAGE_SYNC` | 0 | Document synchronization |
| `MESSAGE_AWARENESS` | 1 | User presence and cursor state |
| `MESSAGE_AUTH` | 2 | Authentication (reserved) |

### Message Format

All messages are binary (Uint8Array) encoded using lib0 encoding:

```
[messageType: VarUint][payload: Uint8Array]
```

### Sync Protocol (MESSAGE_SYNC = 0)

Uses y-protocols/sync for document synchronization:

1. **Sync Step 1** - Client sends state vector
2. **Sync Step 2** - Server sends missing updates
3. **Updates** - Incremental changes are broadcast

### Awareness Protocol (MESSAGE_AWARENESS = 1)

Uses y-protocols/awareness for user presence:

**Awareness State:**
```json
{
  "user": {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "color": "#FF6B6B",
    "avatar": "https://gravatar.com/..."
  },
  "cursor": {
    "line": 10,
    "column": 5
  },
  "selection": {
    "start": { "line": 10, "column": 5 },
    "end": { "line": 10, "column": 15 }
  }
}
```

### Rate Limiting

- Max 20 sync messages per second per client
- Max 100 pending messages in queue
- Exceeding limits closes connection with code `4008`

### Document Lifecycle

1. Documents are created on first connection
2. State is loaded from persistence (if available)
3. Updates are auto-saved on change
4. Documents are cleaned up after 30 minutes of inactivity

### Example Usage (JavaScript with y-websocket)

```javascript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const doc = new Y.Doc();
const provider = new WebsocketProvider(
  'ws://localhost:3100/collab',
  'project-uuid:src/index.ts',
  doc,
  {
    params: {
      projectId: 'project-uuid',
      file: 'src/index.ts',
      token: 'auth-token'
    }
  }
);

// Access text content
const text = doc.getText('content');

// Listen for changes
text.observe(event => {
  console.log('Content changed:', text.toString());
});

// Get awareness (other users' cursors)
provider.awareness.on('change', () => {
  const states = provider.awareness.getStates();
  console.log('Users:', Array.from(states.values()));
});

// Set local awareness state
provider.awareness.setLocalStateField('cursor', { line: 10, column: 5 });
```

### Authentication

1. Token is verified against the main app API
2. Project access is checked (owner or collaborator)
3. In migration mode (`REQUIRE_AUTH=false`), anonymous users are allowed with warnings

### Persistence

- Documents are persisted using Git-based snapshots
- Auto-save on every update
- State is restored when document is reopened

---

## Connection Error Codes

| Code | Description |
|------|-------------|
| `1000` | Normal closure |
| `1008` | Container not found |
| `4001` | Unauthorized |
| `4003` | Forbidden (no project access) |
| `4008` | Rate limit exceeded |

---

## Security Considerations

1. **Authentication** - All WebSocket connections should include authentication tokens
2. **Project Ownership** - Verified before allowing connections
3. **Rate Limiting** - Prevents abuse and DoS attacks
4. **Input Sanitization** - File paths are sanitized to prevent path traversal
5. **Audit Logging** - Security-relevant events are logged

---

## Client Libraries

### Terminal (xterm.js)

```javascript
import { Terminal } from 'xterm';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { FitAddon } from 'xterm-addon-fit';

const terminal = new Terminal();
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.loadAddon(new WebLinksAddon());

terminal.open(document.getElementById('terminal'));
fitAddon.fit();

const ws = new WebSocket(`ws://localhost:3100/terminal/${projectId}`);

terminal.onData(data => ws.send(data));
ws.onmessage = event => terminal.write(event.data);

// Handle resize
window.addEventListener('resize', () => {
  fitAddon.fit();
  ws.send(JSON.stringify({
    id: Date.now(),
    method: 'terminal.resize',
    params: { cols: terminal.cols, rows: terminal.rows }
  }));
});
```

### Collaboration (Monaco Editor + Yjs)

```javascript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import * as monaco from 'monaco-editor';

const doc = new Y.Doc();
const provider = new WebsocketProvider(
  'ws://localhost:3100/collab',
  `${projectId}:${filePath}`,
  doc,
  { params: { projectId, file: filePath, token } }
);

const editor = monaco.editor.create(container, {
  value: '',
  language: 'typescript'
});

const type = doc.getText('content');
const binding = new MonacoBinding(
  type,
  editor.getModel(),
  new Set([editor]),
  provider.awareness
);
```

---

## Debugging Tips

1. **Browser DevTools** - Use Network tab to inspect WebSocket frames
2. **wscat** - Command-line WebSocket client: `wscat -c ws://localhost:3100/terminal/project-id`
3. **Server Logs** - Check container logs for connection and error messages
4. **Yjs Debug** - Enable debug logging: `localStorage.debug = 'y-*'`
