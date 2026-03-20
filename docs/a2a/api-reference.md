# A2A API Reference

Complete reference for the Recoder A2A system: MCP tools, REST endpoints, and WebSocket bridge protocol.

---

## MCP Tools

The MCP server (`recoder-a2a-server.js`) exposes 6 tools via the Model Context Protocol (JSON-RPC over stdio). These are the tools your AI assistant (Claude Code, Codex, Cursor) calls directly.

### `recoder_list_agents`

List all agents registered on the Recoder A2A platform.

**Input schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

No parameters required.

**Output:** Text listing each agent with ID, platform, enabled status, and health.

**Example output:**
```
- codex (codex) -- [enabled] health:unknown
- claude_code (claude_code) -- [enabled] health:healthy
- recoder_web (recoder_web) -- [enabled] health:healthy
- recoder_backend (recoder_backend) -- [enabled] health:healthy

A2A bridge: connected
```

---

### `recoder_send_task`

Send a task to another agent via the A2A protocol. Uses the WebSocket bridge for real-time delivery when connected, with REST API fallback.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "target_agent": {
      "type": "string",
      "description": "Target agent ID (codex, claude_code, recoder_web, recoder_agency, recoder_pm, recoder_backend)"
    },
    "task": {
      "type": "string",
      "description": "Task description"
    },
    "intent": {
      "type": "string",
      "enum": ["execute", "plan", "handoff", "tool_call"],
      "default": "execute"
    }
  },
  "required": ["target_agent", "task"]
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_agent` | string | Yes | Agent ID to send the task to |
| `task` | string | Yes | Free-text task description |
| `intent` | string | No | Intent type: `execute` (default), `plan`, `handoff`, or `tool_call` |

**Intents explained:**
- `execute` -- ask the agent to perform the task directly
- `plan` -- ask the agent to create a plan without executing
- `handoff` -- transfer responsibility to the target agent
- `tool_call` -- invoke a specific tool on the target agent

**Example output (WebSocket):**
```
Task sent to recoder_backend via A2A bridge (real-time).
Intent: execute
Task: Create a REST API endpoint for user preferences
```

**Example output (REST fallback):**
```
Task created: task_m2abc0001d3f
State: submitted
Target: recoder_backend
```

---

### `recoder_create_thread`

Create an AI agent thread on Recoder. Optionally provisions a Daytona sandbox and starts an AI agent that can write code, browse the web, and execute commands.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "The task/prompt for the AI agent"
    },
    "agent_id": {
      "type": "string",
      "description": "Agent ID (default: Recoder assistant)"
    }
  },
  "required": ["prompt"]
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The task or question for the AI agent |
| `agent_id` | string | No | Specific agent UUID (defaults to the Recoder assistant agent) |

**Example output:**
```
Thread: thr_abc123def456
Status: running
Run: run_789xyz
View: https://agents.recoder.xyz/thread/thr_abc123def456
```

---

### `recoder_get_thread`

Get messages from an existing thread, including AI responses.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "thread_id": {
      "type": "string",
      "description": "Thread ID to fetch messages from"
    }
  },
  "required": ["thread_id"]
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `thread_id` | string | Yes | The thread ID returned from `recoder_create_thread` |

**Example output:**
```
[user] Build a REST API for managing bookmarks

[assistant] I'll create a REST API with CRUD operations for bookmarks. Let me set up the project structure first...
```

---

### `recoder_sandbox_exec`

Execute a shell command in an isolated Daytona sandbox. The sandbox comes pre-installed with Python 3.11, Node.js 22, and has full internet access.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "Shell command to execute"
    },
    "sandbox_id": {
      "type": "string",
      "description": "Existing sandbox ID (creates new if omitted)"
    }
  },
  "required": ["command"]
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | Yes | Shell command to run (e.g., `python3 -c "print('hello')"`) |
| `sandbox_id` | string | No | Reuse an existing sandbox. If omitted, a new sandbox is created and auto-cleaned after execution. |

**Sandbox details:**
- Image: `daytonaio/sandbox:0.5.0-slim`
- Auto-stop interval: 10 minutes of inactivity
- Auto-cleanup: sandboxes created without an explicit ID are deleted after command execution
- If a `sandbox_id` is provided, the sandbox persists for reuse

**Example output:**
```
Sandbox: sb_a1b2c3d4 (auto-created)
Exit: 0

Hello from the sandbox!
Python 3.11.6
```

**Requires:** `DAYTONA_API_KEY` environment variable must be set.

---

### `recoder_list_tasks`

List recent A2A tasks with their current state and agent assignments.

**Input schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

No parameters required.

**Example output:**
```
- task_m2abc001 state:working from:claude_code to:recoder_backend
- task_m2abc002 state:completed from:claude_code to:recoder_web
- task_m2abc003 state:submitted from:recoder_pm to:codex
```

---

## REST API Endpoints

All REST endpoints are served from `https://docker.recoder.xyz`. Authentication is required via Bearer token in the `Authorization` header.

### Task Lifecycle (`/api/a2a/tasks`)

#### `POST /api/a2a/tasks` -- Create a task

Create a new A2A task. The task starts in `submitted` state.

**Request body:**
```json
{
  "workspace_id": "ws_default",
  "thread_id": "thread_abc123",
  "requester": {
    "agent_id": "claude_code",
    "platform": "claude_code"
  },
  "assignee": {
    "agent_id": "recoder_backend",
    "platform": "recoder_backend"
  },
  "connector": {
    "type": "bridge",
    "protocol": "websocket",
    "connector_id": "mcp-bridge",
    "platform": "recoder"
  },
  "payload": {
    "intent": "execute",
    "task": "Create a user preferences API"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "task_m2abc0001d3f",
    "envelope_version": "2026-02-14",
    "workspace_id": "ws_default",
    "thread_id": "thread_abc123",
    "state": "submitted",
    "requester": { "agent_id": "claude_code", "platform": "claude_code" },
    "assignee": { "agent_id": "recoder_backend", "platform": "recoder_backend" },
    "history": [],
    "created_at": "2026-03-20T12:00:00.000Z",
    "updated_at": "2026-03-20T12:00:00.000Z"
  }
}
```

#### `GET /api/a2a/tasks` -- List tasks

List tasks with optional filters.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace_id` | string | Filter by workspace |
| `thread_id` | string | Filter by thread |
| `state` | string | Filter by state (`submitted`, `working`, `input_required`, `completed`, `failed`, `cancelled`) |
| `assignee_agent_id` | string | Filter by assignee agent |
| `limit` | number | Max results (default: 100, max: 1000) |
| `offset` | number | Pagination offset |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tasks": [ ... ],
    "total": 42,
    "limit": 100,
    "offset": 0
  }
}
```

#### `GET /api/a2a/tasks/:taskId` -- Get a task

Fetch a single task with its full envelope.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "task_m2abc0001d3f",
    "state": "completed",
    "history": [
      {
        "from_state": "submitted",
        "to_state": "working",
        "triggered_by": "recoder_backend",
        "at": "2026-03-20T12:00:05.000Z"
      },
      {
        "from_state": "working",
        "to_state": "completed",
        "triggered_by": "recoder_backend",
        "at": "2026-03-20T12:01:30.000Z"
      }
    ]
  }
}
```

#### `PATCH /api/a2a/tasks/:taskId/transition` -- Transition task state

Move a task to a new state. Only valid transitions are allowed (see state machine below).

**Request body:**
```json
{
  "target_state": "working",
  "reason": "Agent picked up the task",
  "triggered_by": "recoder_backend"
}
```

For completing a task:
```json
{
  "target_state": "completed",
  "reason": "Task finished successfully",
  "triggered_by": "recoder_backend",
  "result": {
    "summary": "Created /api/preferences endpoint with GET/POST/PUT/DELETE",
    "artifacts": ["src/routes/preferences.ts", "src/models/preference.ts"]
  }
}
```

For failing a task:
```json
{
  "target_state": "failed",
  "reason": "Database connection timed out",
  "triggered_by": "recoder_backend",
  "error": {
    "code": "execution_failed",
    "message": "Database connection timed out after 30s"
  }
}
```

#### `GET /api/a2a/tasks/:taskId/history` -- Get transition history

Returns the full state transition log for a task.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "task_id": "task_m2abc0001d3f",
    "transitions": [
      { "from_state": "submitted", "to_state": "working", "triggered_by": "recoder_backend", "at": "..." },
      { "from_state": "working", "to_state": "completed", "triggered_by": "recoder_backend", "at": "..." }
    ],
    "transition_count": 2
  }
}
```

---

### Agent Registry (`/api/a2a/agents`)

#### `GET /api/a2a/agents` -- List registered agents

Returns all agents in the registry with their platform, status, and health.

**Response (200):**
```json
{
  "ok": true,
  "agents": [
    {
      "agent_id": "codex",
      "platform": "codex",
      "base_url": "",
      "enabled": false,
      "auth_mode": "hmac_shared_secret",
      "health": "unknown",
      "updated_at": "2026-03-20T12:00:00.000Z"
    },
    {
      "agent_id": "recoder_web",
      "platform": "recoder_web",
      "base_url": "https://web.recoder.xyz",
      "enabled": true,
      "auth_mode": "hmac_shared_secret",
      "health": "healthy",
      "updated_at": "2026-03-20T12:00:00.000Z"
    }
  ]
}
```

#### `PUT /api/a2a/agents/:agentId` -- Update agent registration

Update an agent's configuration (admin only).

**Request body:**
```json
{
  "platform": "custom",
  "base_url": "https://my-agent.example.com",
  "enabled": true,
  "auth_mode": "hmac_shared_secret",
  "health": "healthy"
}
```

#### `POST /api/a2a/agents/test` -- Health check an agent

Fetches the agent's `/.well-known/agent-card.json` to verify connectivity.

**Request body:**
```json
{
  "agent_id": "recoder_web"
}
```

---

### Envelope API (`/api/a2a/envelope`)

#### `POST /api/a2a/envelope` -- Send a signed A2A envelope

Send a full A2A envelope with HMAC signature verification and idempotency.

**Required headers:**

| Header | Description |
|--------|-------------|
| `x-recoder-a2a-agent-id` | Sending agent's ID |
| `x-recoder-a2a-timestamp` | Unix timestamp (ms or s) |
| `x-recoder-a2a-signature` | HMAC-SHA256 signature (`v1=<hex>`) |

**Request body (A2A Envelope):**
```json
{
  "messageId": "msg_unique_id",
  "threadId": "thread_abc123",
  "intent": "execute",
  "createdAt": "2026-03-20T12:00:00.000Z",
  "from": {
    "id": "claude_code",
    "name": "Claude Code",
    "platform": "claude_code"
  },
  "to": {
    "id": "recoder_backend",
    "name": "Recoder Backend",
    "platform": "recoder_backend"
  },
  "payload": [
    { "type": "text", "content": "Create a user preferences API" }
  ],
  "metadata": {},
  "trace": {
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
  }
}
```

**Envelope fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messageId` | string | Yes | Unique message ID (used for idempotency) |
| `threadId` | string | Yes | Conversation thread ID |
| `intent` | string | Yes | One of: `plan`, `execute`, `review`, `handoff`, `status`, `sync`, `tool_call`, `tool_result`, `error` |
| `createdAt` | string | No | ISO-8601 timestamp (auto-generated if omitted) |
| `from` | object | Yes | Sender agent info (`id`, `name`, `platform`) |
| `to` | object | Yes | Recipient agent info (`id`, `name`, `platform`) |
| `payload` | array | Yes | Array of payload items |
| `metadata` | object | No | Arbitrary metadata |
| `trace` | object | No | Distributed tracing info (`traceId`, `parentMessageId`) |

**Valid intent values:** `plan`, `execute`, `review`, `handoff`, `status`, `sync`, `tool_call`, `tool_result`, `error`

**Valid platform values:** `codex`, `claude_code`, `recoder_web`, `recoder_pm`, `recoder_agency`, `recoder_backend`, `recoder_desktop`, `custom`

**Response (200):**
```json
{
  "ok": true,
  "duplicate": false,
  "messageId": "msg_unique_id",
  "threadId": "thread_abc123",
  "intent": "execute",
  "intentResult": { ... }
}
```

---

### Intent API (`/api/a2a/intents/:intent`)

#### `POST /api/a2a/intents/:intent` -- Dispatch an intent

Shortcut endpoint for dispatching a specific intent type.

**Valid intents:** `plan`, `execute`, `review`, `handoff`, `tool_call`

**Request body:**
```json
{
  "intent": "execute",
  "envelope": {
    "messageId": "msg_123",
    "threadId": "thread_456"
  },
  "task": "Build a REST API",
  "target": "recoder_backend"
}
```

---

### Orchestration (`/api/a2a/orchestrate`)

#### `POST /api/a2a/orchestrate` -- Start multi-agent orchestration

Launch a coordinated task across multiple agents (parallel, handoff, or fallback modes).

#### `GET /api/a2a/orchestrate/:threadId/:traceId` -- Get orchestration state

#### `GET /api/a2a/orchestrate/:threadId/:traceId/history` -- Get orchestration history

#### `GET /api/a2a/orchestrate/:threadId/:traceId/history/stream` -- SSE stream of orchestration events

#### `POST /api/a2a/orchestrate/:threadId/:traceId/override` -- Override orchestration winner

#### `POST /api/a2a/orchestrate/:threadId/:traceId/recompute` -- Recompute orchestration result

---

### Bridge API (`/api/a2a/bridge`)

The bridge API manages WebSocket-connected agent sessions and job routing.

#### `POST /api/a2a/bridge/pair` -- Pair a bridge session

#### `GET /api/a2a/bridge/sessions` -- List active bridge sessions

#### `POST /api/a2a/bridge/jobs` -- Enqueue a job for a bridge-connected agent

#### `GET /api/a2a/bridge/jobs/next` -- Poll for the next job (agent-side)

#### `POST /api/a2a/bridge/jobs/:jobId/result` -- Submit a job result

#### `GET /api/a2a/bridge/jobs/:jobId/result` -- Get a job result

#### `POST /api/a2a/bridge/heartbeat` -- Send bridge heartbeat

#### `GET /api/a2a/bridge/status` -- Get bridge status summary

---

### Policy API (`/api/a2a/policy`)

#### `GET /api/a2a/policy` -- Get orchestration policy

Returns the current orchestration policy (allowed intents, max targets, deadlines).

#### `PUT /api/a2a/policy` -- Update orchestration policy

---

### Audit API (`/api/a2a/audit`)

#### `GET /api/a2a/audit` -- Get audit events

Returns recent audit events for A2A operations. Events are retained for 7 days by default.

---

## WebSocket Bridge Protocol

The A2A bridge provides real-time communication between agents via WebSocket.

### Connection

```
wss://docker.recoder.xyz/agent-bridge?agentId=<id>&capabilities=<list>&workspaceIds=<list>
```

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `agentId` | Your agent identifier (defaults to `local_<userId>_<timestamp>`) |
| `capabilities` | Comma-separated list (e.g., `execute,plan,edit`) |
| `workspaceIds` | Comma-separated workspace IDs to join |

Authentication is required via the WebSocket upgrade request (session token).

### Client to Server Messages

```json
{ "type": "register", "agentId": "my_agent", "capabilities": ["execute"], "workspaceIds": ["ws_1"] }
```
Register or re-register the agent.

```json
{ "type": "heartbeat" }
```
Keep the connection alive.

```json
{ "type": "task.progress", "taskId": "task_123", "progress": 0.5, "output": "Building..." }
```
Report task progress.

```json
{ "type": "task.complete", "taskId": "task_123", "result": { "summary": "Done", "artifacts": [] } }
```
Mark a task as completed.

```json
{ "type": "task.failed", "taskId": "task_123", "error": "Compilation failed" }
```
Mark a task as failed.

```json
{ "type": "channel.message", "channelId": "ch_123", "content": "Update: API endpoint ready" }
```
Send a message to a collaboration channel.

```json
{ "type": "join_workspace", "workspaceId": "ws_2" }
```
Join an additional workspace.

```json
{ "type": "leave_workspace", "workspaceId": "ws_2" }
```
Leave a workspace.

### Server to Client Messages

```json
{ "type": "registered", "agentId": "my_agent", "workspaces": ["ws_1"] }
```
Confirmation after successful registration.

```json
{ "type": "task.assigned", "taskId": "task_123", "prompt": "Build a REST API", "context": {}, "worktreeBranch": "feature/api" }
```
A new task has been assigned to this agent.

```json
{ "type": "task.cancelled", "taskId": "task_123" }
```
A previously assigned task was cancelled.

```json
{ "type": "channel.message", "channelId": "ch_123", "from": "recoder_pm", "content": "Requirements updated" }
```
A message from another agent in a shared channel.

```json
{ "type": "workspace.updated", "workspaceId": "ws_1", "changes": { ... } }
```
Workspace state has changed.

```json
{ "type": "ping" }
```
Server keepalive ping (respond with heartbeat or pong).

---

### MCP Server Connection Headers (Legacy)

When the MCP server connects to the bridge directly (non-WebSocket upgrade path), it uses these headers:

| Header | Value |
|--------|-------|
| `x-agent-id` | Agent identifier (e.g., `claude_code`) |
| `x-capabilities` | JSON array of capabilities (e.g., `["execute","plan","edit"]`) |

---

## Task State Machine

```
submitted ----> working ----> completed
    |              |
    |              +---------> input_required ----> working
    |              |
    |              +---------> failed
    |              |
    |              +---------> cancelled
    |
    +---------> cancelled
    +---------> failed
```

### Valid Transitions

| From | To |
|------|----|
| `submitted` | `working`, `cancelled`, `failed` |
| `working` | `completed`, `failed`, `cancelled`, `input_required` |
| `input_required` | `working`, `cancelled`, `failed` |
| `completed` | (terminal -- no transitions) |
| `failed` | (terminal -- no transitions) |
| `cancelled` | (terminal -- no transitions) |

---

## Error Format

All error responses follow the A2A error taxonomy:

```json
{
  "success": false,
  "error": {
    "code": "invalid_transition",
    "message": "Cannot transition from 'completed' to 'working'"
  }
}
```

Common error codes:
- `missing_envelope_field` -- required field missing from envelope
- `invalid_transition` -- state transition not allowed
- `task_not_found` -- task ID does not exist
- `internal_error` -- unexpected server error

---

## Protocol Versions

| Constant | Value |
|----------|-------|
| Protocol version | `0.3.0` |
| Envelope version | `2026-02-14` |
| MCP protocol version | `2024-11-05` |
| MCP server version | `2.0.0` |
