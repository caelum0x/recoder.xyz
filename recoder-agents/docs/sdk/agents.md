# Agent Management

Agents are the core building block of the Recoder platform. Each agent has a model, system prompt, and a set of tools it can invoke.

## List Agents

**Python:**

```python
agents = client.agents.list()
for agent in agents:
    print(f"{agent.id}  {agent.name}  status={agent.status}")
```

**TypeScript:**

```typescript
const agents = await sdk.agents.list();
agents.forEach((a) => console.log(a.id, a.name, a.status));
```

## Create an Agent

**Python:**

```python
agent = client.agents.create(
    name="Code Reviewer",
    description="Reviews pull requests for style and correctness",
    model="claude-sonnet-4-20250514",
    system_prompt="You are a thorough code reviewer. Focus on correctness, clarity, and performance.",
    tools=["web_search", "file_read"],
)
print(f"Created agent {agent.id}")
```

**TypeScript:**

```typescript
const agent = await sdk.agents.create({
  name: "Code Reviewer",
  description: "Reviews pull requests for style and correctness",
  model: "claude-sonnet-4-20250514",
  systemPrompt:
    "You are a thorough code reviewer. Focus on correctness, clarity, and performance.",
  tools: ["web_search", "file_read"],
});
console.log("Created agent", agent.id);
```

## Update an Agent

**Python:**

```python
updated = client.agents.update(
    agent_id="agent_abc123",
    name="Senior Code Reviewer",
    model="claude-opus-4-20250514",
)
```

**TypeScript:**

```typescript
const updated = await sdk.agents.update({
  agentId: "agent_abc123",
  name: "Senior Code Reviewer",
  model: "claude-opus-4-20250514",
});
```

## Delete an Agent

**Python:**

```python
client.agents.delete(agent_id="agent_abc123")
```

**TypeScript:**

```typescript
await sdk.agents.delete({ agentId: "agent_abc123" });
```

## Agent Configuration

| Field           | Type       | Description                                    |
| --------------- | ---------- | ---------------------------------------------- |
| `name`          | `string`   | Display name                                   |
| `description`   | `string`   | What the agent does                            |
| `model`         | `string`   | Model identifier (e.g. `claude-sonnet-4-20250514`) |
| `system_prompt` | `string`   | Instructions given to the model                |
| `tools`         | `string[]` | Tools the agent may call                       |
| `status`        | `string`   | `active`, `paused`, or `archived`              |

## Starting an Agent Run

Runs execute an agent against a prompt inside a thread.

**Python:**

```python
run = client.agents.start(
    agent_id="agent_abc123",
    prompt="Review this diff and suggest improvements",
    thread_id="thread_xyz",       # optional — omit to create a new thread
    model_name="claude-sonnet-4-20250514",  # optional override
)
print(f"thread={run.thread_id}  run={run.agent_run_id}  status={run.status}")
```

**TypeScript:**

```typescript
const run = await sdk.agents.start({
  agentId: "agent_abc123",
  prompt: "Review this diff and suggest improvements",
  threadId: "thread_xyz",
  modelName: "claude-sonnet-4-20250514",
});
console.log(`thread=${run.thread_id}  run=${run.agent_run_id}  status=${run.status}`);
```

### Run Response

```json
{
  "thread_id": "thread_xyz",
  "agent_run_id": "run_001",
  "status": "running",
  "project_id": "proj_abc"
}
```

## Stopping a Run

**Python:**

```python
client.agents.stop(agent_run_id="run_001")
```

**TypeScript:**

```typescript
await sdk.agents.stop({ agentRunId: "run_001" });
```

## Listing Active Runs

**Python:**

```python
active = client.agents.active_runs()
for run in active:
    print(f"{run.id}  started={run.started_at}  thread={run.thread_id}")
```

**TypeScript:**

```typescript
const active = await sdk.agents.activeRuns();
active.forEach((r) => console.log(r.id, r.started_at, r.thread_id));
```

## Next Steps

- [Workflows](./workflows.md) — chain agents into multi-step pipelines
- [Streaming](./streaming.md) — consume agent output in real time
