# Recoder A2A (Agent-to-Agent) Guide

## What is A2A?

A2A is Recoder's inter-agent communication protocol. It lets AI tools -- Claude Code, OpenAI Codex, Recoder Agents, and custom integrations -- send tasks to each other through a shared control plane.

With A2A you can:

- Have Claude Code delegate a frontend task to a Recoder web agent
- Let Codex send a code review request to another agent
- Orchestrate multi-agent workflows where different tools handle different parts of a project
- Run commands in isolated Daytona sandboxes from any connected AI tool
- Create and monitor agent threads on agents.recoder.xyz from the CLI

The system is built on a Redis-backed task store with WebSocket real-time delivery and REST fallback. All task state transitions follow a canonical lifecycle, and the `@recoder/a2a-sdk` provides typed helpers so connector code stays consistent across platforms.

---

## Architecture

```
+--------------------+       +---------------------+       +-------------------+
|   Claude Code      |       |    OpenAI Codex      |       |  Custom Client    |
|   (MCP Server)     |       |   (Codex Adapter)    |       | (@recoder/a2a-sdk)|
+--------+-----------+       +---------+-----------+       +--------+----------+
         |                             |                            |
         |  stdio (JSON-RPC)           |  stdio (JSON-RPC)          |  HTTP/WS
         v                             v                            v
+--------+-----------------------------+----------------------------+----------+
|                                                                              |
|                  docker-backend (Express :3100)                               |
|                                                                              |
|  /agent-bridge (WebSocket)    Real-time bidirectional task delivery           |
|  /api/a2a/tasks (REST)        Task CRUD, lifecycle transitions               |
|  /api/a2a/agents (REST)       Agent registry + health                        |
|  /api/a2a/approvals (REST)    Human-in-the-loop approval workflows           |
|  /api/a2a/connectors/*        Platform-specific connector routes             |
|  /api/a2a/channels (REST)     Collaboration channels                         |
|  /api/a2a/orchestration       Multi-agent workflow orchestration             |
|                                                                              |
|  Redis-backed task store      Persistence + pub/sub for task events           |
|  Intent worker                Routes intents (plan/execute/handoff/tool_call)|
|                                                                              |
+-------+------------------+-------------------+------------------------------+
        |                  |                   |
        v                  v                   v
+-------+------+   +------+-------+   +-------+--------+
| Python       |   | recoder-web  |   | openclaw       |
| Backend      |   | (Remix)      |   | gateway        |
| (:8000)      |   | (:5173)      |   | (:18789)       |
| Agent exec   |   | Plan/Execute |   | WhatsApp/Voice |
+--------------+   +--------------+   +----------------+
```

**Key services:**

| Service | Port | Role |
|---------|------|------|
| docker-backend | 3100 | A2A control plane, intent router, task lifecycle |
| Python backend | 8000 | Agent execution, thread management |
| recoder-web | 5173 | Handles plan/execute/handoff intents |
| openclaw-gateway | 18789 | WhatsApp and voice channel bridge |

**Task lifecycle states:**

```
submitted --> working --> completed
                |
                +--> input-required --> working (resumed)
                |
                +--> failed
                |
                +--> cancelled
```

Every state transition generates an audit event with trace context for observability.

---

## Quick Start: Claude Code MCP Server

The fastest way to use A2A is through Claude Code's MCP integration. The MCP server at `mcp/recoder-a2a-server.js` gives Claude Code six tools for interacting with Recoder agents.

### 1. Install dependencies

```bash
cd mcp/
npm install
```

The only runtime dependency is `ws` (WebSocket client for the A2A bridge).

### 2. Configure environment variables

Set these in your shell or in a `.env`:

```bash
export RECODER_SESSION_TOKEN="your_session_token"   # Required: Better Auth session token
export RECODER_DOCKER_URL="https://docker.recoder.xyz"
export RECODER_API_URL="https://api.recoder.xyz"
export DAYTONA_API_KEY="dyt_..."                     # Optional: enables sandbox execution
```

To get your `RECODER_SESSION_TOKEN`, sign in to recoder.xyz and copy the
`recoder.session_token` / Better Auth session token from browser cookies.

### 3. Add to Claude Code MCP config

Add this to your project's `.mcp.json` or `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "recoder": {
      "command": "node",
      "args": ["/path/to/recoder.xyz/mcp/recoder-a2a-server.js"],
      "env": {
        "RECODER_DOCKER_URL": "https://docker.recoder.xyz",
        "RECODER_API_URL": "https://api.recoder.xyz",
        "RECODER_SESSION_TOKEN": "YOUR_SESSION_TOKEN_HERE",
        "DAYTONA_API_KEY": "YOUR_DAYTONA_KEY_HERE"
      }
    }
  }
}
```

### 4. Available tools

Once configured, Claude Code gets these tools:

| Tool | Description |
|------|-------------|
| `recoder_list_agents` | List all registered agents with health status |
| `recoder_list_tasks` | View recent tasks in the A2A queue |
| `recoder_send_task` | Send a task to another agent (supports intents: `execute`, `plan`, `handoff`, `tool_call`) |
| `recoder_create_thread` | Create an AI agent thread on agents.recoder.xyz with a Daytona sandbox |
| `recoder_get_thread` | Fetch messages from an existing thread (including AI responses) |
| `recoder_sandbox_exec` | Run a shell command in an isolated Daytona sandbox (Python 3.11, Node.js 22, internet access) |

### 5. Usage examples in Claude Code

Once the MCP server is running, you can ask Claude Code things like:

- "List all available Recoder agents" -- calls `recoder_list_agents`
- "Send a task to recoder_web to build a landing page" -- calls `recoder_send_task` with `target_agent: "recoder_web"`
- "Create a thread to analyze this codebase" -- calls `recoder_create_thread`
- "Run `python3 -c 'print(2+2)'` in a sandbox" -- calls `recoder_sandbox_exec`
- "Check the messages in thread abc123" -- calls `recoder_get_thread`

### How the MCP server works

On startup, the server:
1. Opens a WebSocket connection to `wss://docker.recoder.xyz/agent-bridge` (auto-reconnects on disconnect)
2. Registers as agent `claude_code` with capabilities `['execute', 'plan', 'edit']`
3. Listens for MCP JSON-RPC messages on stdin, responds on stdout

When sending tasks, it tries the WebSocket bridge first for real-time delivery, then falls back to the REST API.

---

## Quick Start: OpenAI Codex Adapter

The Codex adapter at `mcp/recoder-codex-adapter.js` provides the same functionality with Codex's protocol format.

```bash
export RECODER_SESSION_TOKEN="your_session_token"
export DAYTONA_API_KEY="dyt_..."
node mcp/recoder-codex-adapter.js
```

The adapter exposes 5 tools: `recoder_list_agents`, `recoder_list_tasks`, `recoder_send_task`, `recoder_create_thread`, and `recoder_sandbox_run`.

---

## API Reference

All A2A endpoints live under `https://docker.recoder.xyz/api/a2a/`. Authentication is via `Authorization: Bearer <token>` header or session cookie.

### List Agents

```
GET /api/a2a/agents
```

Returns all registered agents with their platform, health status, and capabilities.

**Response:**

```json
{
  "agents": [
    {
      "agent_id": "claude_code",
      "platform": "claude_code",
      "enabled": true,
      "health": "healthy",
      "capabilities": ["execute", "plan", "edit"]
    },
    {
      "agent_id": "recoder_web",
      "platform": "recoder_web",
      "enabled": true,
      "health": "healthy"
    }
  ]
}
```

### List Tasks

```
GET /api/a2a/tasks
```

Returns recent tasks with their current state and assignments.

**Response:**

```json
{
  "data": {
    "tasks": [
      {
        "id": "task_abc123",
        "state": "completed",
        "requester": { "agent_id": "claude_code", "platform": "claude_code" },
        "assignee": { "agent_id": "recoder_web", "platform": "recoder_web" }
      }
    ]
  }
}
```

### Create Task (REST)

```
POST /api/a2a/tasks
Content-Type: application/json
Authorization: Bearer <token>
```

**Request body:**

```json
{
  "workspace_id": "ws_default",
  "thread_id": "thread_1710000000000",
  "requester": {
    "agent_id": "claude_code",
    "platform": "claude_code"
  },
  "assignee": {
    "agent_id": "recoder_web",
    "platform": "recoder_web"
  },
  "connector": {
    "type": "bridge",
    "protocol": "websocket",
    "connector_id": "mcp-bridge",
    "platform": "recoder"
  },
  "payload": {
    "intent": "execute",
    "task": "Build a React landing page with a hero section"
  }
}
```

**Response:**

```json
{
  "data": {
    "id": "task_abc123",
    "state": "submitted"
  }
}
```

### Create Thread

```
POST https://api.recoder.xyz/v1/threads
Authorization: Bearer <token>
Content-Type: application/json

{ "agent_id": "7e91f872-2407-42ac-bfcb-ea69a496e85c" }
```

Returns `{ "thread_id": "..." }`. Then start the agent:

```
POST https://api.recoder.xyz/v1/agent/start
Authorization: Bearer <token>
Content-Type: application/x-www-form-urlencoded

prompt=Build+a+REST+API&thread_id=<thread_id>&agent_id=<agent_id>
```

View the thread at `https://agents.recoder.xyz/thread/<thread_id>`.

### Get Thread Messages

```
GET https://api.recoder.xyz/v1/threads/<thread_id>/messages
Authorization: Bearer <token>
```

Returns an array of messages with `role` and `content` fields.

### WebSocket Bridge

```
WS wss://docker.recoder.xyz/agent-bridge
Headers:
  x-agent-id: claude_code
  x-capabilities: ["execute", "plan", "edit"]
```

The WebSocket bridge provides real-time bidirectional task delivery. Messages are JSON:

**Send an intent:**

```json
{
  "type": "intent",
  "intent": "execute",
  "target": "recoder_web",
  "task": "Build a landing page",
  "from": "claude_code"
}
```

### Intents

| Intent | Description | Typical Handler |
|--------|-------------|-----------------|
| `execute` | Run a task (write code, execute commands) | recoder-web, Python backend |
| `plan` | Generate a plan without executing | recoder-web |
| `handoff` | Transfer ownership of a task to another agent | recoder-web |
| `tool_call` | Invoke a specific tool on the target agent | docker-backend |

### Additional Endpoint Groups

| Path | Description |
|------|-------------|
| `/api/a2a/approvals` | Human-in-the-loop approval workflows |
| `/api/a2a/channels` | Collaboration channels between agents |
| `/api/a2a/connectors/claude` | Claude Code connector management |
| `/api/a2a/connectors/codex` | Codex connector management |
| `/api/a2a/connectors/cursor` | Cursor connector management |
| `/api/a2a/connectors/windsurf` | Windsurf connector management |
| `/api/a2a/connectors/replit` | Replit connector management |
| `/api/a2a/adapters/rest` | REST adapter for external services |
| `/api/a2a/adapters/git` | Git-based task exchange adapter |
| `/api/a2a/context` | Context bridge for shared state |
| `/api/a2a/orchestration` | Multi-agent workflow orchestration |
| `/api/a2a/patterns` | Reusable agent interaction patterns |

---

## SDK Usage (`@recoder/a2a-sdk`)

The `@recoder/a2a-sdk` package provides typed helpers for building A2A integrations. It sits between the canonical schemas in `@recoder/shared/a2a/schemas` and your adapter code. All canonical types and enums are re-exported from the SDK, so you only need one import source.

### Installation

The SDK is a workspace package. Add it to your `package.json`:

```json
{
  "dependencies": {
    "@recoder/a2a-sdk": "workspace:*"
  }
}
```

### Module Overview

| Module | Import Path | Purpose |
|--------|-------------|---------|
| State Mapping | `@recoder/a2a-sdk/state-mapping` | Bidirectional native <-> canonical state maps |
| Error Mapping | `@recoder/a2a-sdk/error-mapping` | Normalize connector errors to canonical `A2AError` |
| Envelope Builders | `@recoder/a2a-sdk/envelope-builders` | Factory functions for connector-specific `TaskEnvelope` objects |
| Audit Helpers | `@recoder/a2a-sdk/audit-helpers` | Typed emitters for common audit events |
| Validation | `@recoder/a2a-sdk/validation` | Structural validators for schemas |

You can also import everything from the barrel:

```ts
import {
  TaskStateEnum, A2AErrorCodeEnum, AuditEventTypeEnum,
  mapCodexState, mapClaudeError, buildCodexEnvelope,
  emitTaskSubmitted, validateTaskEnvelope,
} from '@recoder/a2a-sdk';
```

### State Mapping

Map between connector-native states and canonical task states. Use this at the boundary where connector events enter or leave the control plane.

```ts
import {
  mapCodexState,
  mapClaudeState,
  mapConnectorState,
  canonicalToCodexState,
  checkConnectorTransition,
  isConnectorTerminalState,
} from '@recoder/a2a-sdk/state-mapping';

// Codex "running" -> canonical "working"
const canonical = mapCodexState('running');
// => 'working'

// Claude "done" -> canonical "completed"
const claudeCanonical = mapClaudeState('done');
// => 'completed'

// Unknown states return undefined (non-strict) or throw (strict)
mapCodexState('unknown-state');       // => undefined
mapCodexStateStrict('unknown-state'); // throws Error

// Generic mapper (works with any supported platform)
const state = mapConnectorState('codex', 'queued');
// => 'submitted'

// Reverse: canonical back to native
const nativeState = canonicalToCodexState('working');
// => 'running'

// Guard: validate a state transition before applying it
const check = checkConnectorTransition('submitted', 'codex', 'running');
// => { valid: true, mappedState: 'working' }

const badCheck = checkConnectorTransition('completed', 'codex', 'running');
// => { valid: false, mappedState: 'working', error: 'Invalid transition: completed -> working ...' }

// Check if a connector state is terminal
isConnectorTerminalState('claude_code', 'done');   // => true
isConnectorTerminalState('claude_code', 'streaming'); // => false
```

**Codex state mapping table:**

| Codex Native | Canonical |
|-------------|-----------|
| `queued` | `submitted` |
| `running` | `working` |
| `waiting_for_input` | `input-required` |
| `completed` | `completed` |
| `failed` / `error` / `timeout` | `failed` |
| `cancelled` | `cancelled` |

**Claude Code state mapping table:**

| Claude Native | Canonical |
|--------------|-----------|
| `pending` | `submitted` |
| `streaming` / `processing` | `working` |
| `waiting_for_approval` / `waiting_for_input` | `input-required` |
| `done` / `completed` | `completed` |
| `error` / `failed` / `timeout` | `failed` |
| `aborted` / `cancelled` | `cancelled` |

### Error Mapping

Normalize connector-specific errors into canonical `A2AError` instances with structured codes, categories, and severity:

```ts
import {
  mapCodexError,
  mapClaudeError,
  mapHttpError,
  mapConnectorError,
  wrapUnknownError,
} from '@recoder/a2a-sdk/error-mapping';

// Map a Codex-specific error
const codexErr = mapCodexError({
  type: 'timeout',
  message: 'Codex request timed out after 30s',
  statusCode: 408,
});
// => { code: 'CONNECTOR_TIMEOUT', category: 'connector', message: '...', retryable: true, ... }

// Map a Claude-specific error
const claudeErr = mapClaudeError({
  type: 'rate_limit',
  message: 'Too many requests',
  statusCode: 429,
});
// => { code: 'RATE_LIMIT_EXCEEDED', ... }

// Map an HTTP status code directly
const httpErr = mapHttpError(503, 'Service Unavailable');
// => { code: 'CONNECTOR_UNAVAILABLE', ... }

// Generic mapper -- dispatches to the right platform mapper
const genericErr = mapConnectorError({
  platform: 'codex',
  type: 'auth_error',
  message: 'Invalid API key',
});
// => { code: 'AUTHENTICATION_FAILED', ... }

// Last-resort wrapper for unstructured exceptions
try {
  await riskyOperation();
} catch (err) {
  const a2aErr = wrapUnknownError(err, { platform: 'claude_code', traceId: 'abc123' });
  // => { code: 'INTERNAL_ERROR', details: { error_name, stack_preview, ... } }
}
```

**Key Codex error type mappings:**

| Codex Error Type | Canonical Error Code |
|-----------------|---------------------|
| `timeout` | `CONNECTOR_TIMEOUT` |
| `rate_limit` | `RATE_LIMIT_EXCEEDED` |
| `quota_exceeded` | `QUOTA_EXCEEDED` |
| `auth_error` | `AUTHENTICATION_FAILED` |
| `connection_error` | `NETWORK_ERROR` |
| `execution_error` | `TASK_EXECUTION_FAILED` |
| `cancelled` | `TASK_CANCELLED` |

**Key Claude error type mappings:**

| Claude Error Type | Canonical Error Code |
|------------------|---------------------|
| `overloaded` | `CONNECTOR_UNAVAILABLE` |
| `rate_limit` | `RATE_LIMIT_EXCEEDED` |
| `authentication_error` | `AUTHENTICATION_FAILED` |
| `permission_error` | `AUTHORIZATION_DENIED` |
| `tool_execution_error` | `TASK_EXECUTION_FAILED` |
| `context_length_exceeded` | `QUOTA_EXCEEDED` |

### Envelope Builders

Build `TaskEnvelope` objects pre-configured for specific connectors. These reduce boilerplate by pre-filling the `connector`, `requester`, and `assignee` fields:

```ts
import {
  buildCodexEnvelope,
  buildClaudeEnvelope,
  completeEnvelope,
  failEnvelope,
  startEnvelope,
  cancelEnvelope,
  a2aErrorToTaskErrorInfo,
} from '@recoder/a2a-sdk/envelope-builders';

// Create a Codex task envelope
const envelope = buildCodexEnvelope({
  id: 'task_01',
  workspace_id: 'ws_abc',
  thread_id: 'thr_def',
  trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
  requester: { agent_id: 'agent-pm', platform: 'recoder_pm' },
  payload: { kind: 'text', text: 'Implement the auth flow' },
}, {
  model: 'codex-mini',           // stored in connector metadata
  connector_id: 'codex-v1',      // default
});
// Defaults: connector.platform='codex', connector.protocol='jsonrpc'

// Create a Claude Code task envelope
const claudeEnv = buildClaudeEnvelope({
  id: 'task_02',
  workspace_id: 'ws_abc',
  thread_id: 'thr_ghi',
  trace_id: '5cf92f3577b34da6a3ce929d0e0e4737',
  requester: { agent_id: 'agent-pm', platform: 'recoder_pm' },
  payload: { kind: 'text', text: 'Review this PR' },
}, {
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
});

// Lifecycle transitions on envelopes
const working = startEnvelope(envelope);              // submitted -> working
const done = completeEnvelope(working, {              // working -> completed
  status: 'success',
  output: [{ kind: 'text', text: 'Auth flow implemented.' }],
});

// Fail with a structured error
const failed = failEnvelope(working, a2aErrorToTaskErrorInfo(codexErr));

// Cancel
const cancelled = cancelEnvelope(working, { reason: 'User requested' });
```

### Audit Helpers

Emit typed audit events for task lifecycle and connector operations. All helpers return an `AuditEvent` object; you are responsible for persisting it.

```ts
import {
  emitTaskSubmitted,
  emitTaskStarted,
  emitTaskCompleted,
  emitTaskFailed,
  emitTaskCancelled,
  emitConnectorAttached,
  emitConnectorHealth,
  emitConnectorError,
  emitPolicyChecked,
  emitPolicyApproved,
  emitPolicyDenied,
  emitAuditForTransition,
} from '@recoder/a2a-sdk/audit-helpers';

// Task lifecycle events
const submitted = emitTaskSubmitted({
  id: 'evt_01',
  task_id: 'task_01',
  workspace_id: 'ws_abc',
  trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
  actor_agent_id: 'agent-pm',
  actor_platform: 'recoder_pm',
});
await auditLogService.persist(submitted);

const completed = emitTaskCompleted({
  id: 'evt_02',
  task_id: 'task_01',
  workspace_id: 'ws_abc',
  trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
  actor_agent_id: 'codex-agent',
  actor_platform: 'codex',
  duration_ms: 4500,
});

// Auto-emit the correct event type based on a state transition
const event = emitAuditForTransition(
  {
    id: 'evt_03',
    task_id: 'task_01',
    workspace_id: 'ws_abc',
    trace_id: '...',
    actor_agent_id: 'codex-agent',
    actor_platform: 'codex',
  },
  'completed', // the new canonical state
);
// Automatically creates a TaskCompleted audit event

// Connector events
const health = emitConnectorHealth({
  id: 'evt_04',
  connector_id: 'claude-code-v1',
  connector_platform: 'claude_code',
  workspace_id: 'ws_abc',
  trace_id: '...',
  healthy: true,
  latency_ms: 42,
});

// Policy audit events
const policyEvt = emitPolicyChecked({
  id: 'evt_05',
  task_id: 'task_01',
  workspace_id: 'ws_abc',
  trace_id: '...',
  agent_id: 'codex-agent',
  action: 'file:write',
  rule: 'auto',
  approved: true,
  reason: 'Sandbox-scoped write allowed',
});
```

### Validation

Validate raw JSON payloads against canonical schemas at API boundaries:

```ts
import {
  validateTaskEnvelope,
  isValidTaskEnvelope,
  assertTaskEnvelope,
  validateAuditEvent,
  validateA2AError,
} from '@recoder/a2a-sdk/validation';

// Validate and get detailed issues
const result = validateTaskEnvelope(rawPayload);
if (!result.valid) {
  console.error('Invalid envelope:', result.issues);
  // Each issue: { path: 'requester.agent_id', message: 'must be a non-empty string' }
  return res.status(422).json({ errors: result.issues });
}

// Type guard (returns boolean, narrows type)
if (isValidTaskEnvelope(rawPayload)) {
  // rawPayload is now typed as TaskEnvelope
  processTask(rawPayload);
}

// Assert (throws with summary on failure)
assertTaskEnvelope(rawPayload);

// Strict version checking
validateTaskEnvelope(rawPayload, { strictVersion: true });

// Validate other schema types
validateAuditEvent(rawEvent);
validateA2AError(rawError);
```

**What gets validated on a TaskEnvelope:**
- Required string fields: `id`, `workspace_id`, `thread_id`, `trace_id`, `envelope_version`
- State must be one of: `submitted`, `working`, `input-required`, `completed`, `failed`, `cancelled`
- `requester` and `assignee` must have `agent_id` and valid `platform`
- `connector` must have valid `platform`, `protocol`, and `connector_id`
- `payload` items must have valid `kind` (`text`, `json`, `command`, `artifact`) with matching content fields
- Timestamps (`created_at`, `updated_at`) must be valid ISO-8601
- Optional `error` block is validated if present (code, category, message, severity, retryable)

**Valid platforms:** `codex`, `claude_code`, `recoder_web`, `recoder_pm`, `recoder_agency`, `recoder_backend`, `recoder_desktop`, `custom`

**Valid protocols:** `a2a`, `mcp`, `jsonrpc`, `rest`, `file_git`

---

## Using the A2ABridge Class

For programmatic use outside of MCP, the `A2ABridge` class in `packages/recoder-cli-router/src/integrations/a2a-bridge.ts` provides a high-level client:

```ts
import { A2ABridge } from './integrations/a2a-bridge';

const bridge = new A2ABridge({
  apiUrl: 'https://api.recoder.xyz',
  apiToken: process.env.RECODER_SESSION_TOKEN,
  dockerUrl: 'https://docker.recoder.xyz',
});

// List agents
const agents = await bridge.listAgents();

// Send a task to a specific agent
const task = await bridge.sendTask({
  targetAgent: 'recoder_web',
  task: 'Build a landing page with a contact form',
  capability: 'execute',
});

// Create a thread (provisions a Daytona sandbox)
const thread = await bridge.createThread({
  prompt: 'Analyze this repository and suggest improvements',
});
console.log(thread.viewUrl);
// => https://agents.recoder.xyz/thread/<thread_id>

// Smart delegation -- auto-picks target agent and capability from task text
const result = await bridge.delegateTask(
  'Create sprint tickets for the auth refactor'
);
// Routes to recoder_pm because the task mentions "sprint" and "tickets"
```

**Auto-routing logic in `delegateTask`:**

| Keywords in task | Target Agent | Capability |
|-----------------|-------------|------------|
| project manage, sprint, ticket, issue | `recoder_pm` | `plan` |
| agency, client, deliverable, brief | `recoder_agency` | `plan` |
| web, frontend, react, deploy | `recoder_web` | `execute` |
| agent, workflow, automate, pipeline | `recoder_agents` | `execute` |
| plan, design, architect, review | (any) | `plan` |
| edit, update, fix, refactor | (any) | `edit` |
| (default) | `claude_code` | `execute` |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RECODER_SESSION_TOKEN` | Yes | -- | Better Auth session token for bridge/API auth |
| `RECODER_API_TOKEN` | No | -- | Optional API-key pair for Python API compatibility |
| `RECODER_DOCKER_URL` | No | `https://docker.recoder.xyz` | Docker backend URL (A2A control plane) |
| `RECODER_API_URL` | No | `https://api.recoder.xyz` | Python backend API URL |
| `RECODER_A2A_URL` | No | Derived from `RECODER_DOCKER_URL` | WebSocket bridge URL (auto-derived as `wss://docker.recoder.xyz/agent-bridge`) |
| `DAYTONA_API_KEY` | No | -- | Enables sandbox execution via Daytona |
| `RECODER_DAYTONA_URL` | No | `http://localhost:3900/api` | Daytona API endpoint |
| `RECODER_AGENT_ID` | No | `claude_code` | Agent identity for the WebSocket bridge |

---

## Supported Platforms

| Platform | Connector ID | Protocol | Integration Type |
|----------|-------------|----------|-----------------|
| Claude Code | `claude-code-v1` | JSON-RPC (MCP) | MCP server + WebSocket bridge |
| OpenAI Codex | `codex-v1` | JSON-RPC | MCP adapter + REST |
| Cursor | via `/api/a2a/connectors/cursor` | REST | Connector route |
| Windsurf | via `/api/a2a/connectors/windsurf` | REST | Connector route |
| Replit | via `/api/a2a/connectors/replit` | REST | Connector route |
| REST adapter | via `/api/a2a/adapters/rest` | HTTP | Generic adapter |
| Git adapter | via `/api/a2a/adapters/git` | file/git | File-based adapter |
| OpenClaw | via `/api/a2a/openclaw` | REST | WhatsApp/voice gateway |

---

## Sandbox Execution

The `recoder_sandbox_exec` tool runs commands in isolated Daytona sandboxes. Each sandbox is a container with:
- Python 3.11
- Node.js 22
- Internet access
- Auto-stop after inactivity (default: 10 minutes for auto-created sandboxes)

**Via MCP (Claude Code):**

Ask Claude Code to run a command -- it will auto-create a sandbox, execute, and clean up:

```
> Use recoder_sandbox_exec to run "python3 -c 'import sys; print(sys.version)'"
```

**Reusing a sandbox:** Pass `sandbox_id` to reuse an existing sandbox instead of creating a new one.

**Via REST (requires `DAYTONA_API_KEY`):**

```bash
# Create sandbox
curl -X POST http://localhost:3900/api/sandbox \
  -H "Authorization: Bearer $DAYTONA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"image": "daytonaio/sandbox:0.5.0-slim", "public": true, "auto_stop_interval": 10}'

# Execute command
curl -X POST http://localhost:3900/sandbox/<sandbox_id>/toolbox/process/exec \
  -H "Authorization: Bearer $DAYTONA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": "npm test"}'
```

---

## Troubleshooting

**MCP server not connecting:**
- Check that `node mcp/recoder-a2a-server.js` runs without errors
- Verify `ws` is installed: `cd mcp && npm install`
- Look for `[recoder-a2a]` messages on stderr -- the server logs its configuration on startup

**Authentication failures:**
- Verify `RECODER_SESSION_TOKEN` is set and valid
- Tokens expire; generate a fresh one from recoder.xyz Settings > API Keys
- The MCP server logs `[recoder-a2a] API auth configured` on startup if the token is set

**Sandbox execution not working:**
- Requires `DAYTONA_API_KEY` to be set (the MCP server logs `[recoder-a2a] Daytona sandbox enabled` if configured)
- The Daytona instance must be reachable from your network
- First call is slower (~5 seconds) due to sandbox provisioning

**WebSocket bridge disconnects:**
- The MCP server auto-reconnects every 5 seconds on disconnect
- Check that `docker.recoder.xyz` is accessible
- Behind a corporate proxy, WebSocket upgrades may be blocked
- The bridge connection is non-blocking; MCP tools work via REST fallback even without it

**Task stuck in `submitted` state:**
- The target agent may not be online or healthy
- Check agent health: `GET /api/a2a/agents`
- Tasks without an active consumer will remain in `submitted` until picked up

**Validation errors when creating tasks:**
- Use `validateTaskEnvelope()` from the SDK to debug payload issues before sending
- Common issues: missing `workspace_id`, invalid `platform` value, payload missing `kind` field
