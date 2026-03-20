# recoder-a2a

MCP Server for connecting Claude Code, Codex, and Cursor to the Recoder platform.

Provides 6 tools for agent-to-agent communication, thread management, and sandbox execution.

## Quick Start

### With Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "recoder": {
      "command": "npx",
      "args": ["-y", "recoder-a2a"],
      "env": {
        "RECODER_API_TOKEN": "sk-recoder-your-token"
      }
    }
  }
}
```

### With Cursor

Add to your MCP settings:

```json
{
  "mcpServers": {
    "recoder": {
      "command": "npx",
      "args": ["-y", "recoder-a2a"],
      "env": {
        "RECODER_API_TOKEN": "sk-recoder-your-token"
      }
    }
  }
}
```

### Get Your API Token

Visit [https://recoder.xyz/tr/dashboard/api-keys](https://recoder.xyz/tr/dashboard/api-keys)

## Available Tools

| Tool | Description |
|------|-------------|
| `recoder_list_agents` | List connected A2A agents with health status |
| `recoder_list_tasks` | View A2A task queue |
| `recoder_send_task` | Send task to another agent via A2A protocol |
| `recoder_create_thread` | Create agent thread with Daytona sandbox |
| `recoder_get_thread` | Get thread messages including AI responses |
| `recoder_sandbox_exec` | Execute code in isolated Daytona sandbox |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RECODER_API_TOKEN` | Yes | Your Recoder API token |
| `RECODER_DOCKER_URL` | No | Docker backend URL (default: `https://docker.recoder.xyz`) |
| `RECODER_API_URL` | No | API URL (default: `https://api.recoder.xyz`) |
| `DAYTONA_API_KEY` | No | Daytona API key for sandbox execution |
| `DAYTONA_URL` | No | Daytona API URL |

## How It Works

This MCP server communicates over stdio using the Model Context Protocol (JSON-RPC). It connects to the Recoder platform via:

1. **REST API** for thread and task management
2. **WebSocket A2A bridge** for real-time agent-to-agent communication
3. **Daytona sandboxes** for isolated code execution

## License

MIT
