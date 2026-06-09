# Observability

Agent OS traces should connect user intent to final delivery.

Correlate these IDs wherever possible:

- space ID
- task ID
- run ID
- agent ID
- runtime ID
- instruction bundle ID
- approval ID
- artifact ID
- preview/deployment ID

Preferred signals:

- CloudEvents for domain events
- OpenTelemetry spans for cross-service execution
- structured logs for runtime output
- outbox records for durable event delivery
- artifact records for verification and handoff evidence

Use `mapRunEventToCloudEvent` for runtime streams and the `domain-event-mapper` helpers for `TaskSpec`, `TaskRun`, `Artifact`, `RuntimeEvidence`, `Approval`, `MemoryCandidate`, and accepted `MemoryItem` lifecycle events. These mappers give the Postgres outbox and future NATS publisher one event envelope instead of surface-local audit shapes.

`DomainEventOutboxBridge` is the package-level append boundary for domain lifecycle events. Services pass domain objects to the bridge, the bridge maps them to CloudEvents, and the configured outbox store persists `OutboxRecord`s. Keep this Postgres-outbox-first path as the default; NATS or customer webhooks should publish from outbox records rather than bypassing audit storage.

Both Agent OS HTTP surfaces expose `GET /api/agent-os/outbox` as the phase-one visibility path. The standalone agent gateway keeps an in-memory outbox beside its local state, and `docker-backend` uses the in-memory repository boundary that mirrors the future Postgres `event_outbox` table. Task, run, artifact, runtime evidence, approval, memory, and run-event mutations append CloudEvent-backed `OutboxRecord`s.

`POST /internal/agent-os/outbox/drain` is the internal phase-one drain for `docker-backend`. It requires the internal service key, marks pending in-memory records as `published` by default, and can mark them `failed` when called with `status: "failed"` or `fail: true`. A real publisher should replace this with Postgres/NATS delivery while preserving the same `OutboxRecord` state transitions.

The goal is auditability: Recoder should explain what happened, which agent did it, what instructions were used, what policy allowed it, and what evidence proved it.
