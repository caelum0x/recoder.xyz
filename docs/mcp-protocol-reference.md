# MCP Protocol Reference for Recoder A2A

## How MCP Works

MCP uses **JSON-RPC 2.0 over stdio**:
- Client spawns MCP server as subprocess
- Server reads JSON-RPC from stdin, writes responses to stdout
- Messages are newline-delimited (one JSON object per line, no embedded newlines)
- Server MAY write logs to stderr

## Connection Lifecycle

```
Client → Server: Launch subprocess
Client → Server: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
Server → Client: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{...}}}
Client → Server: {"jsonrpc":"2.0","method":"notifications/initialized"}
Client → Server: {"jsonrpc":"2.0","id":2,"method":"tools/list"}
Server → Client: {"jsonrpc":"2.0","id":2,"result":{"tools":[...]}}
Client → Server: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tool_name","arguments":{...}}}
Server → Client: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"result"}]}}
```

## Tool Definition Schema

```json
{
  "name": "tool_name",
  "description": "What the tool does",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param1": {"type": "string", "description": "..."},
      "param2": {"type": "number"}
    },
    "required": ["param1"]
  }
}
```

## Tool Result Format

```json
{
  "content": [
    {"type": "text", "text": "result text"}
  ],
  "isError": false
}
```

## Claude Code MCP Config

**File:** `.mcp.json` (project root) or `~/.claude.json`

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "value"
      }
    }
  }
}
```

**CLI commands:**
- `claude mcp add --transport stdio name -- command args` — Add server
- `claude mcp list` — List servers
- `claude mcp reset-project-choices` — Reset approvals

## Recoder A2A MCP Server

**File:** `mcp/recoder-a2a-server.js`

**Tools provided:**
1. `recoder_list_agents` — List agents on A2A platform
2. `recoder_list_tasks` — List A2A tasks
3. `recoder_send_task` — Send task to another agent
4. `recoder_create_thread` — Create thread + Daytona sandbox + start agent
5. `recoder_sandbox_exec` — Execute command in Daytona sandbox

**Env vars:**
- `RECODER_API_URL` — Backend API (default: https://api.recoder.xyz)
- `RECODER_SESSION_TOKEN` — Better Auth session token for bridge/API auth
- `RECODER_API_TOKEN` — Optional API-key pair for Python API compatibility
- `RECODER_DOCKER_URL` — Docker backend (default: https://docker.recoder.xyz)
- `DAYTONA_API_KEY` — Daytona sandbox key
- `RECODER_A2A_URL` — A2A WebSocket bridge (default: wss://docker.recoder.xyz/agent-bridge)

**Tested:** Initialize handshake ✓, tools/list ✓, recoder_list_agents ✓, recoder_create_thread ✓ (thread created + agent running)
