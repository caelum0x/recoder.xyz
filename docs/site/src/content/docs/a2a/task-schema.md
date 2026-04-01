---
title: Task Schema
description: Structure and lifecycle of A2A tasks.
---

## Task Object

```typescript
interface A2ATask {
  id: string;                    // UUID
  workspace_id: string;          // Workspace scope
  thread_id: string;             // Conversation thread
  state: TaskState;
  requester: {
    agent_id: string;            // e.g. "claude_code"
    platform: string;            // e.g. "claude_code"
  };
  assignee: {
    agent_id: string;            // e.g. "codex"
    platform: string;
  };
  connector: {
    type: string;                // "bridge" | "webhook" | "rest"
    protocol: string;            // "websocket" | "http"
    connector_id: string;
    platform: string;
  };
  payload: {
    intent: string;              // "execute" | "plan" | "handoff" | "tool_call" | "chat:reply"
    task: string;                // Human-readable task description
    [key: string]: unknown;      // Additional context
  };
  result?: {
    output: string;              // Task result
  };
  error?: {
    message: string;
    code: string;
  };
  metadata?: Record<string, unknown>;
  created_at: string;            // ISO 8601
  updated_at: string;
}

type TaskState =
  | "submitted"     // Created, awaiting assignment
  | "assigned"      // Claimed by an agent session
  | "in_progress"   // Agent is working on it
  | "completed"     // Successfully finished
  | "failed"        // Agent reported failure
  | "cancelled";    // Requester cancelled
```

## State Transitions

```
                    ┌──────────┐
         ┌─────────│ submitted│──────────┐
         │         └──────────┘          │
         ▼                               ▼
   ┌──────────┐                    ┌───────────┐
   │ assigned │────────────────►   │ cancelled │
   └──────────┘                    └───────────┘
         │
         ▼
   ┌─────────────┐
   │ in_progress  │
   └─────────────┘
       │       │
       ▼       ▼
┌───────────┐ ┌────────┐
│ completed │ │ failed │
└───────────┘ └────────┘
```

## Creating a Task (REST)

```bash
curl -X POST https://docker.recoder.xyz/api/a2a/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "workspace_id": "ws_default",
    "thread_id": "thread_001",
    "requester": { "agent_id": "claude_code", "platform": "claude_code" },
    "assignee": { "agent_id": "codex", "platform": "codex" },
    "connector": { "type": "bridge", "protocol": "websocket", "connector_id": "mcp-bridge", "platform": "recoder" },
    "payload": { "intent": "execute", "task": "Create a REST API for user management" }
  }'
```

## Claiming a Task

Tasks use session-based locking. When an agent calls `recoder_inbox`, tasks are atomically marked as `claimedBy: sessionId` via Redis SETNX. A second terminal sees them as claimed and skips them.

```bash
curl -X POST https://docker.recoder.xyz/api/a2a/tasks/$TASK_ID/claim \
  -H "Content-Type: application/json" \
  -d '{ "session_id": "my_session_123", "agent_id": "claude_code" }'
```

## Completing a Task

```bash
curl -X PATCH https://docker.recoder.xyz/api/a2a/tasks/$TASK_ID/transition \
  -H "Content-Type: application/json" \
  -d '{
    "target_state": "completed",
    "triggered_by": "claude_code:my_session_123",
    "result": { "output": "API created with 5 endpoints" },
    "reason": "Task completed successfully"
  }'
```
