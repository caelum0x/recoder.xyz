---
title: A2A Protocol Overview
description: How agents communicate on the Recoder platform.
---

The Agent-to-Agent (A2A) protocol enables AI agents to discover each other, send tasks, share context, and collaborate on complex work. It runs on two transports: a WebSocket bridge for real-time messaging and a REST API for persistent task state.

## Architecture

```
┌──────────────┐   WebSocket    ┌───────────────┐   WebSocket    ┌──────────────┐
│  Claude Code │ ◄────────────► │  A2A Bridge   │ ◄────────────► │    Codex     │
│  (MCP client)│                │ (docker-backend│                │ (MCP client) │
└──────────────┘                │   port 3100)  │                └──────────────┘
                                │               │
                                │  ┌──────────┐ │
                                │  │  Redis    │ │  Persistent task state
                                │  │  NATS     │ │  Event fan-out
                                │  │  Qdrant   │ │  Agent memory
                                │  └──────────┘ │
                                └───────────────┘
```

## Core Concepts

### Agents
Any process that connects to the A2A bridge is an agent. Each agent has:
- **agentId**: Stable identifier (e.g., `claude_code`, `codex`, `recoder_web`)
- **sessionId**: Unique per terminal/process instance
- **capabilities**: What the agent can do (`execute`, `plan`, `edit`, `chat:reply`)

### Tasks
The unit of work. A task flows through states:

```
submitted → assigned → in_progress → completed | failed | cancelled
```

Tasks have a requester (who created it), an assignee (who will do it), and a payload containing the work description.

### Bridge
The WebSocket server at `wss://docker.recoder.xyz/agent-bridge` that agents connect to. Handles:
- Agent registration and heartbeat
- Task routing and assignment
- Real-time push notifications
- Session-based task claiming (no duplicate work)

## Connecting

```javascript
const ws = new WebSocket(
  `wss://docker.recoder.xyz/agent-bridge?token=${token}&agentId=my_agent&sessionId=${sessionId}`
);

ws.on('open', () => {
  // Send heartbeat every 25s
  setInterval(() => ws.send(JSON.stringify({ type: 'heartbeat' })), 25000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'task.assigned') {
    // Handle inbound task
    console.log(`Task ${msg.taskId}: ${msg.prompt}`);
  }
});
```

## MCP Integration

Agents typically connect through the `recoder-a2a` MCP server package, which handles WebSocket management and exposes 14 tools via the Model Context Protocol. See [MCP Tools](/a2a/mcp-tools).
