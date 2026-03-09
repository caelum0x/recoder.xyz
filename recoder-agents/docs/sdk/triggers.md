# Triggers

Triggers start agent runs or workflow executions automatically. Recoder supports three trigger types: **scheduled**, **event-based**, and **webhook**.

## Scheduled Triggers

Run an agent or workflow on a cron schedule.

**Python:**

```python
trigger = client.triggers.create_schedule(
    agent_id="agent_abc123",
    name="Daily Report",
    cron="0 9 * * 1-5",          # 09:00 UTC, Mon-Fri
    prompt="Generate the daily sales summary",
    timezone="America/New_York",  # optional, defaults to UTC
)
print(f"Trigger {trigger.id} — next run: {trigger.next_run_at}")
```

**TypeScript:**

```typescript
const trigger = await sdk.triggers.createSchedule({
  agentId: "agent_abc123",
  name: "Daily Report",
  cron: "0 9 * * 1-5",
  prompt: "Generate the daily sales summary",
  timezone: "America/New_York",
});
console.log(`Trigger ${trigger.id} — next run: ${trigger.next_run_at}`);
```

### Common Cron Patterns

| Pattern        | Meaning                      |
| -------------- | ---------------------------- |
| `0 * * * *`    | Every hour, on the hour      |
| `0 9 * * 1-5`  | 09:00 UTC, weekdays          |
| `*/15 * * * *` | Every 15 minutes             |
| `0 0 1 * *`    | Midnight on the 1st of month |
| `0 12 * * 0`   | Noon every Sunday            |

## Event-Based Triggers

React to platform events such as a new thread, a completed agent run, or a file upload.

**Python:**

```python
trigger = client.triggers.create_event(
    agent_id="agent_abc123",
    name="Auto-review on PR",
    event_type="github.pull_request.opened",
    filter={"repo": "org/my-repo"},
    prompt_template="Review this PR: {{event.url}}",
)
```

**TypeScript:**

```typescript
const trigger = await sdk.triggers.createEvent({
  agentId: "agent_abc123",
  name: "Auto-review on PR",
  eventType: "github.pull_request.opened",
  filter: { repo: "org/my-repo" },
  promptTemplate: "Review this PR: {{event.url}}",
});
```

### Supported Event Types

| Event                          | Fired when                          |
| ------------------------------ | ----------------------------------- |
| `agent.run.completed`          | An agent run finishes successfully  |
| `agent.run.failed`             | An agent run errors out             |
| `thread.created`               | A new thread is started             |
| `workflow.execution.completed`  | A workflow execution completes      |
| `github.pull_request.opened`   | A PR is opened (GitHub integration) |
| `github.push`                  | A push to a tracked branch          |

## Webhook Triggers

Expose a unique URL that external systems can POST to, firing an agent run.

**Python:**

```python
trigger = client.triggers.create_webhook(
    agent_id="agent_abc123",
    name="Stripe Webhook Handler",
    secret="whsec_...",  # optional — validates X-Signature header
)
print(f"Webhook URL: {trigger.webhook_url}")
```

**TypeScript:**

```typescript
const trigger = await sdk.triggers.createWebhook({
  agentId: "agent_abc123",
  name: "Stripe Webhook Handler",
  secret: "whsec_...",
});
console.log("Webhook URL:", trigger.webhook_url);
```

The incoming JSON body is available in the agent's prompt context as `{{trigger.payload}}`.

## Listing Triggers

**Python:**

```python
triggers = client.triggers.list(agent_id="agent_abc123")
for t in triggers:
    print(f"{t.id}  {t.trigger_type}  {t.name}  enabled={t.enabled}")
```

**TypeScript:**

```typescript
const triggers = await sdk.triggers.list({ agentId: "agent_abc123" });
triggers.forEach((t) =>
  console.log(t.id, t.trigger_type, t.name, `enabled=${t.enabled}`),
);
```

## Enabling / Disabling a Trigger

**Python:**

```python
client.triggers.update(trigger_id="trig_001", enabled=False)
```

**TypeScript:**

```typescript
await sdk.triggers.update({ triggerId: "trig_001", enabled: false });
```

## Deleting a Trigger

**Python:**

```python
client.triggers.delete(trigger_id="trig_001")
```

**TypeScript:**

```typescript
await sdk.triggers.delete({ triggerId: "trig_001" });
```

## Next Steps

- [Streaming](./streaming.md) — consume real-time output from triggered runs
- [Workflows](./workflows.md) — build multi-step pipelines to trigger
