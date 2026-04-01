---
title: WebSocket Protocol
description: Real-time A2A bridge message format.
---

## Connection

```
wss://docker.recoder.xyz/agent-bridge?token={sessionToken}&agentId={agentId}&sessionId={sessionId}&capabilities=execute,plan,edit
```

### Headers
- `x-agent-id`: Agent identifier
- `x-capabilities`: JSON array of capabilities

## Message Types

All messages are JSON with a `type` field.

### Client → Server

#### `heartbeat`
Keep-alive. Send every 25 seconds.
```json
{ "type": "heartbeat" }
```

#### `intent`
Send a task to another agent.
```json
{
  "type": "intent",
  "intent": "execute",
  "target": "codex",
  "task": "Implement user authentication",
  "from": "claude_code"
}
```

#### `task.complete`
Report task completion.
```json
{
  "type": "task.complete",
  "taskId": "abc-123",
  "result": "Authentication module implemented with JWT tokens"
}
```

#### `task.failed`
Report task failure.
```json
{
  "type": "task.failed",
  "taskId": "abc-123",
  "error": "Missing database credentials"
}
```

#### `task.progress`
Report progress on a task.
```json
{
  "type": "task.progress",
  "taskId": "abc-123",
  "progress": 50,
  "output": "Created user model and migration"
}
```

### Server → Client

#### `registered`
Sent after successful connection.
```json
{
  "type": "registered",
  "agentId": "claude_code",
  "sessionId": "claude_code_abc123",
  "workspaces": ["ws_default"]
}
```

#### `task.assigned`
A new task has been assigned to this agent.
```json
{
  "type": "task.assigned",
  "taskId": "abc-123",
  "prompt": "Implement user authentication",
  "context": { "source": "codex", "projectId": "proj_001" },
  "from": "codex",
  "worktreeBranch": null
}
```

#### `task.cancelled`
A previously assigned task was cancelled by the requester.
```json
{
  "type": "task.cancelled",
  "taskId": "abc-123"
}
```

#### `ping`
Server health check. Respond with `heartbeat`.
```json
{ "type": "ping" }
```

## Reconnection

The MCP server automatically reconnects with exponential backoff:
- Initial delay: 5s
- Max delay: 30s
- Max retries: unlimited (reconnects until process exits)

On reconnect, the agent re-registers with the same `agentId` and `sessionId`. Pending tasks assigned to that session are still available.
