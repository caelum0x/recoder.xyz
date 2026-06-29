# recoder-a2a

MCP Server for connecting Claude Code, Codex, and Cursor to the Recoder platform.

This is the publishable Recoder MCP server (the "Recoder for Agents" interop surface).
It exposes the documented core Agents-in tools — **list / run / inbox / sandbox-exec /
respond** — plus extended data, search, scratchpad, canvas, and ACI tooling for
agent-to-agent communication, thread management, and sandbox execution.

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

### Core Agents-in surface (list / run / inbox / sandbox-exec / respond)

| Tool | Description |
|------|-------------|
| `recoder_list_agents` | List connected A2A agents with health status |
| `recoder_list_tasks` | View A2A task queue |
| `recoder_send_task` | Send (run) a task to another agent via A2A protocol |
| `recoder_create_thread` | Create (run) an agent thread with a Daytona sandbox |
| `recoder_get_thread` | Get thread messages including AI responses |
| `recoder_sandbox_exec` | Execute code in an isolated Daytona sandbox |
| `recoder_inbox` | Check inbound tasks assigned to this agent |
| `recoder_task_respond` | Respond to / complete an inbound task |

### Extended tools

The server also exposes memory (`recoder_remember` / `recoder_recall` /
`recoder_forget`), search (`recoder_search_code`, `recoder_search`), local
inference (`recoder_local_llm`), scratchpad, canvas, DuckDB data
(`recoder_query_data` / `recoder_load_csv` / `recoder_load_json`), task
streaming (`recoder_stream_task` / `recoder_interrupt_task`), workflow
(`recoder_workflow_run`), ACI file/git tools (`recoder_aci_edit`,
`recoder_aci_create_file`, `recoder_aci_test_fix`, `recoder_aci_git`), and
conductor coding-workspace tools (`recoder_workspace_create`,
`recoder_workspace_diff`, `recoder_workspace_merge` — git worktree provision,
reviewable diff, and approval-gated merge).

Run `tools/list` against the server for the authoritative, complete schema set.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RECODER_API_TOKEN` | Yes | Bearer token for Docker/A2A routes, or a Recoder API key in `pk_xxx:sk_xxx` format for `api.recoder.xyz` |
| `RECODER_SESSION_TOKEN` | No | Better Auth session token. Use this when `RECODER_API_TOKEN` is a `pk_xxx:sk_xxx` API key but A2A/WebSocket routes still need Bearer auth |
| `RECODER_DOCKER_URL` | No | Docker backend URL (default: `https://docker.recoder.xyz`) |
| `RECODER_API_URL` | No | API URL (default: `https://api.recoder.xyz`) |
| `RECODER_CONDUCTOR_URL` | No | Conductor base URL for workspace tools (default: `${RECODER_DOCKER_URL}/api/conductor`) |
| `DAYTONA_API_KEY` | No | Daytona API key for sandbox execution |
| `RECODER_DAYTONA_URL` | No | Daytona API URL |

## How It Works

This MCP server communicates over stdio using the Model Context Protocol (JSON-RPC). It connects to the Recoder platform via:

1. **REST API** for thread and task management
2. **WebSocket A2A bridge** for real-time agent-to-agent communication
3. **Daytona sandboxes** for isolated code execution

## License

MIT
