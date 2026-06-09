# Self-Hosting

Self-hosted Recoder Agent OS should keep the same product boundary:

- Recoder owns state and policy.
- OSS infrastructure provides databases, queues, observability, sandboxes, and network isolation.
- External runtimes remain adapters.

Recommended baseline:

- Postgres for canonical state.
- Postgres outbox for phase-one event durability.
- Object storage for artifacts.
- OpenTelemetry collector for traces/logs/metrics.
- Playwright-capable worker for browser verification.
- Optional NATS JetStream for replayable event transport.
- Optional OpenZiti or equivalent private network for connector isolation.

Secrets must be supplied through deployment secret stores, not instruction files or repository defaults.
