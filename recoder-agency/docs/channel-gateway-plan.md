# Channel Gateway Plan (OpenClaw Fork Strategy)

## Vision
Turn Recoder Agency into an AI-native agency by adding a **Channel Gateway** service that receives client messages (WhatsApp/Slack/Telegram/Discord), resolves identity + project context, and routes messages into Agency workflows.

OpenClaw is the reference implementation for channel connectors and conversation routing. We **extract patterns**, not port the whole app.

## Scope
Build a dedicated service under `apps/channel-gateway` that:
- Receives provider webhooks/messages.
- Verifies signatures / tokens.
- Normalizes events into a single internal format.
- Dispatches to Agency (create brief, update project, request revision, approve deliverable).

## Phases

### Phase 0 — Scaffolding (this PR)
- Create `apps/channel-gateway` skeleton.
- Add health endpoint and webhook router.
- Define connector interfaces and registry.
- Document env + basic usage.

### Phase 1 — Slack Connector (1–2 weeks)
- Add Slack signature verification.
- Parse message events and map to `NormalizedMessage`.
- Add Slack app setup doc + required env vars.
- Create a single “echo” handler to prove round-trip.

### Phase 2 — WhatsApp Connector (2–3 weeks)
- Implement verification + webhook parsing.
- Handle media attachments.
- Map incoming message to `NormalizedMessage`.

### Phase 3 — Agency Dispatch (2–4 weeks)
- Resolve client identity (channel user → client record).
- Map to team/project/brief context.
- Invoke Agency actions (create brief, request update, approve).
- Add outgoing message actions to reply in-channel.

## Core Data Model (internal)
```ts
type NormalizedMessage = {
  provider: "slack" | "whatsapp" | "telegram" | "discord";
  channelId: string;
  threadId?: string;
  senderId: string;
  senderDisplayName?: string;
  text: string;
  attachments?: Array<{ type: "image" | "file" | "link"; url: string }>;
  receivedAt: string;
};
```

## Integration Points (Recoder Agency)
- **Identity linking**: store channel IDs on client records.
- **Action routing**: map message intents to existing Agency actions:
  - Create brief
  - Request revision
  - Approve deliverable
  - Status updates

## Security
- Verify all incoming signatures (provider-specific).
- Rate limit webhook endpoints.
- Store provider secrets only in env.
- Log minimal PII (redact content in logs).

## Deployment
- Run as a standalone Node service alongside the Agency app.
- Expose a public URL for provider webhooks.
- Add healthcheck to deployment stack.

## Open Questions
- Which connector to ship first: Slack or WhatsApp?
- Do we treat this as a shared multi-tenant gateway or per-team bot?
- How to handle multi-agent routing (one client → many projects)?
