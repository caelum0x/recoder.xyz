# Getting Started with the Recoder SDK

## Installation

**Python:**

```bash
pip install recoder-sdk
```

**TypeScript / JavaScript:**

```bash
npm install @recoder/sdk
# or
pnpm add @recoder/sdk
```

## Authentication

Every request requires an API key. Generate one from **Settings > API Keys** at [agents.recoder.xyz](https://agents.recoder.xyz).

Set the key as an environment variable:

```bash
export RECODER_API_KEY="rk_live_..."
```

Or pass it directly when initialising the client.

## Quick Start — Python

```python
from recoder import RecoderClient

client = RecoderClient(api_key="rk_live_...")

# List your agents
agents = client.agents.list()
for agent in agents:
    print(f"{agent.id}  {agent.name}")

# Start an agent run
run = client.agents.start(
    agent_id=agents[0].id,
    prompt="Summarise the latest sales report",
)
print(f"Run started: {run.agent_run_id}")
```

## Quick Start — TypeScript

```typescript
import { RecoderSDK } from "@recoder/sdk";

const sdk = new RecoderSDK({
  apiKey: "rk_live_...",
  platform: "web",
});

// List your agents
const agents = await sdk.agents.list();
agents.forEach((a) => console.log(a.id, a.name));

// Start an agent run
const run = await sdk.agents.start({
  agentId: agents[0].id,
  prompt: "Summarise the latest sales report",
});
console.log("Run started:", run.agent_run_id);
```

## Base URL

All API requests target the Recoder backend. The default base URL is:

```
https://api.recoder.xyz
```

Override it when self-hosting:

```typescript
const sdk = new RecoderSDK({
  apiKey: "rk_live_...",
  platform: "web",
  baseURL: "https://your-instance.example.com",
});
```

```python
client = RecoderClient(
    api_key="rk_live_...",
    base_url="https://your-instance.example.com",
)
```

## Error Handling

All SDK methods raise typed errors on failure.

**Python:**

```python
from recoder.errors import RecoderApiError, BillingError

try:
    run = client.agents.start(agent_id="bad-id", prompt="hello")
except BillingError as e:
    print(f"Billing issue: {e.message} (status {e.status})")
except RecoderApiError as e:
    print(f"API error: {e.message}")
```

**TypeScript:**

```typescript
import { BillingError, RecoderApiError } from "@recoder/sdk";

try {
  const run = await sdk.agents.start({ agentId: "bad-id", prompt: "hello" });
} catch (err) {
  if (err instanceof BillingError) {
    console.error("Billing issue:", err.message, err.status);
  } else if (err instanceof RecoderApiError) {
    console.error("API error:", err.message);
  }
}
```

## Rate Limits

| Tier   | Requests / min | Concurrent agent runs |
| ------ | -------------- | --------------------- |
| Free   | 60             | 1                     |
| Pro    | 300            | 5                     |
| Team   | 1 000          | 20                    |

When rate-limited the API returns HTTP 429. The SDK retries automatically with exponential backoff (up to 3 attempts).

## Next Steps

- [Agent Management](./agents.md) — create, configure, and run agents
- [Workflows](./workflows.md) — build multi-step workflows
- [Triggers](./triggers.md) — schedule and event-driven automation
- [Streaming](./streaming.md) — real-time response streaming
