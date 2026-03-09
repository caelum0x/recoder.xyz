# Streaming Responses

Agent runs produce output over time. The streaming API delivers events via **Server-Sent Events (SSE)** so your application can display tokens as they arrive.

## Stream URL

```
GET /api/agent-run/{agent_run_id}/stream
```

The SDK wraps this into a high-level iterator.

## Python — Streaming

```python
run = client.agents.start(
    agent_id="agent_abc123",
    prompt="Write a project status report",
)

for event in client.agents.stream(agent_run_id=run.agent_run_id):
    if event.type == "assistant_chunk":
        print(event.content, end="", flush=True)
    elif event.type == "tool_call":
        print(f"\n[Tool] {event.tool_name}({event.arguments})")
    elif event.type == "status":
        print(f"\n[Status] {event.status}")
    elif event.type == "error":
        print(f"\n[Error] {event.message}")
    elif event.type == "done":
        print("\n--- stream complete ---")
        break

print()
```

### Event Types (Python)

| `event.type`       | Fields                                    |
| ------------------ | ----------------------------------------- |
| `assistant_chunk`  | `content` (string)                        |
| `tool_call`        | `tool_name`, `arguments`                  |
| `tool_output`      | `tool_name`, `output`                     |
| `thinking`         | `content`                                 |
| `status`           | `status` (`running`, `completed`, `error`)|
| `estimate`         | `estimated_seconds`, `cost_estimate`      |
| `error`            | `message`, `code`                         |
| `done`             | _(terminal — close the stream)_           |

## TypeScript — Streaming

```typescript
const run = await sdk.agents.start({
  agentId: "agent_abc123",
  prompt: "Write a project status report",
});

const stream = sdk.agents.stream({ agentRunId: run.agent_run_id });

for await (const event of stream) {
  switch (event.type) {
    case "assistant_chunk":
      process.stdout.write(event.content);
      break;
    case "tool_call":
      console.log(`\n[Tool] ${event.toolName}(${JSON.stringify(event.arguments)})`);
      break;
    case "status":
      console.log(`\n[Status] ${event.status}`);
      break;
    case "error":
      console.error(`\n[Error] ${event.message}`);
      break;
    case "done":
      console.log("\n--- stream complete ---");
      break;
  }
}
```

## Browser — EventSource

For web applications you can use the native `EventSource` API directly:

```typescript
import { getSessionAccessToken } from "@/lib/auth/session-token";

const token = await getSessionAccessToken();
const url = `${API_URL}/agent-run/${agentRunId}/stream?token=${token}`;

const source = new EventSource(url);

source.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "assistant_chunk") {
    appendToUI(data.content);
  }

  if (data.type === "done" || data.type === "error") {
    source.close();
  }
};

source.onerror = () => {
  console.error("Stream connection lost");
  source.close();
};
```

## Reconnection

The SDK handles reconnection automatically:

1. On disconnect, it waits with exponential backoff (1 s, 2 s, 4 s, ...).
2. It sends the `last_id` query parameter so the server resumes from where the client left off.
3. After the maximum retry count (default 5) it raises a `StreamDisconnectedError`.

Override defaults:

```python
for event in client.agents.stream(
    agent_run_id=run.agent_run_id,
    max_retries=10,
    initial_backoff_ms=500,
):
    ...
```

```typescript
const stream = sdk.agents.stream({
  agentRunId: run.agent_run_id,
  maxRetries: 10,
  initialBackoffMs: 500,
});
```

## Error Handling in Streams

Errors can appear in two places:

1. **Event-level** — the server sends a `{ "type": "error", "message": "..." }` event.
2. **Connection-level** — the EventSource fires `onerror` (network issue, auth expiry, etc.).

```python
from recoder.errors import StreamDisconnectedError

try:
    for event in client.agents.stream(agent_run_id=run.agent_run_id):
        if event.type == "error":
            print(f"Server error: {event.message}")
            break
except StreamDisconnectedError:
    print("Lost connection after max retries")
```

```typescript
import { StreamDisconnectedError } from "@recoder/sdk";

try {
  for await (const event of stream) {
    if (event.type === "error") {
      console.error("Server error:", event.message);
      break;
    }
  }
} catch (err) {
  if (err instanceof StreamDisconnectedError) {
    console.error("Lost connection after max retries");
  }
}
```

## Heartbeat

The server sends a heartbeat comment (`: heartbeat`) every 30 seconds while the run is active. The SDK uses this to detect stale connections and trigger reconnection if no data arrives within the timeout window (default 60 s).

## Next Steps

- [Agents](./agents.md) — create and configure agents
- [Workflows](./workflows.md) — stream workflow execution output
- [Getting Started](./getting-started.md) — installation and first call
