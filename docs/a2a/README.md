# Recoder A2A -- Agent-to-Agent Protocol

Connect Claude Code, Codex, Cursor, and other AI tools to the Recoder platform.

## What is A2A?

Recoder A2A lets your local AI tools (Claude Code, Codex, Cursor) communicate with Recoder's cloud services. Through a single MCP server, your AI assistant can:

- **Create threads** -- start AI agent conversations on the Recoder platform
- **Run agents** -- send tasks to any registered agent (backend, PM, agency, web)
- **Execute code** -- run commands in isolated Daytona sandboxes with Python 3.11, Node.js 22, and internet access
- **Orchestrate workflows** -- coordinate multi-agent tasks via the A2A bridge

The system uses two communication channels:
1. **MCP (Model Context Protocol)** -- your AI tool talks to the Recoder MCP server over stdio
2. **A2A WebSocket bridge** -- real-time agent-to-agent messaging for task coordination

## Quickstart (30 seconds)

### Option 1: Add to your `.mcp.json` (recommended)

Add this to your project's `.mcp.json` (or `~/.mcp.json` for global access):

```json
{
  "mcpServers": {
    "recoder": {
      "command": "node",
      "args": ["/path/to/recoder-a2a-server.js"],
      "env": {
        "RECODER_DOCKER_URL": "https://docker.recoder.xyz",
        "RECODER_API_URL": "https://api.recoder.xyz",
        "RECODER_API_TOKEN": "YOUR_API_TOKEN_HERE"
      }
    }
  }
}
```

### Option 2: npm install + CLI setup

```bash
npm install -g recoder-code
recoder-code login
recoder-code setup-mcp
```

### Option 3: With Daytona sandbox support

To enable code execution in isolated sandboxes, add the Daytona environment variables:

```json
{
  "mcpServers": {
    "recoder": {
      "command": "node",
      "args": ["/path/to/recoder-a2a-server.js"],
      "env": {
        "RECODER_DOCKER_URL": "https://docker.recoder.xyz",
        "RECODER_API_URL": "https://api.recoder.xyz",
        "RECODER_API_TOKEN": "YOUR_API_TOKEN_HERE",
        "RECODER_DAYTONA_URL": "http://YOUR_DAYTONA_HOST:3900/api",
        "DAYTONA_API_KEY": "YOUR_DAYTONA_API_KEY"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `recoder_list_agents` | List all registered A2A agents with their platform, status, and health |
| `recoder_send_task` | Send a task to another agent via A2A (WebSocket real-time or REST fallback) |
| `recoder_create_thread` | Create an AI agent thread with optional Daytona sandbox |
| `recoder_get_thread` | Get thread messages including AI responses |
| `recoder_sandbox_exec` | Execute a shell command in an isolated Daytona sandbox |
| `recoder_list_tasks` | List recent A2A tasks with state and assignment info |

## Architecture

```
You (developer)
  |
  v
Claude Code / Codex / Cursor
  |  (stdio, JSON-RPC)
  v
recoder-a2a-server.js  (MCP Server)
  |        |
  |        +-- REST API --> docker.recoder.xyz/api/a2a/*
  |        +-- REST API --> api.recoder.xyz/v1/*
  |        +-- REST API --> Daytona sandbox API
  |
  +-- WebSocket --> wss://docker.recoder.xyz/agent-bridge
                          |
                    A2A Gateway (Redis-backed)
                    |     |     |     |     |
                  codex  web  agency   pm  backend
                         (registered agents)
```

**Data flow for a typical task:**

1. You ask Claude Code to "send a task to the backend agent"
2. Claude Code calls the `recoder_send_task` MCP tool
3. The MCP server sends the task via WebSocket (or REST fallback) to the A2A gateway
4. The gateway routes the task to the target agent
5. The target agent processes the task and reports results back through the bridge

## Getting Your API Token

1. Go to [https://recoder.xyz/tr/dashboard/api-keys](https://recoder.xyz/tr/dashboard/api-keys)
2. Click **"Create API Key"**
3. Copy the `sk-recoder-*` token
4. Use it as `RECODER_API_TOKEN` in your `.mcp.json`

Alternatively, run `recoder-code login` to authenticate interactively.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RECODER_API_TOKEN` | Yes | -- | Your Recoder API token (`sk-recoder-*`) |
| `RECODER_DOCKER_URL` | No | `https://docker.recoder.xyz` | Docker backend URL |
| `RECODER_API_URL` | No | `https://api.recoder.xyz` | Recoder API URL |
| `RECODER_DAYTONA_URL` | No | `http://localhost:3900/api` | Daytona sandbox API URL |
| `DAYTONA_API_KEY` | No | -- | Daytona API key (required for sandbox execution) |
| `RECODER_AGENT_ID` | No | `claude_code` | Your agent identity in the A2A network |

## Registered Agent Platforms

The A2A network supports these agent platforms:

| Agent ID | Platform | Description |
|----------|----------|-------------|
| `codex` | OpenAI Codex | Code generation and execution |
| `claude_code` | Claude Code | Anthropic's Claude in CLI mode |
| `recoder_web` | Recoder Web | Web IDE agent (recoder.xyz) |
| `recoder_agency` | Recoder Agency | Agency workflow agent |
| `recoder_pm` | Recoder PM | Project management agent |
| `recoder_backend` | Recoder Backend | Backend services agent |
| `recoder_desktop` | Recoder Desktop | Desktop app agent |

## Task States

Tasks follow a strict state machine:

```
submitted --> working --> completed
    |            |
    |            +--> input_required --> working
    |            |
    |            +--> failed
    |            |
    |            +--> cancelled
    |
    +--> cancelled
    +--> failed
```

Terminal states (no further transitions): `completed`, `failed`, `cancelled`.

## Next Steps

- [API Reference](./api-reference.md) -- full endpoint and tool documentation
- [Examples](./examples.md) -- real usage examples and conversation patterns
