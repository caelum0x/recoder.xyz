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

## Agent OS Persistence

`docker-backend` selects the Agent OS repository at startup:

- Default: in-memory state for disposable local development.
- `AGENT_OS_STATE_FILE=/path/to/agent-os-state.json`: JSON-file durability for local or single-node smoke environments.
- `AGENT_OS_REPOSITORY=postgres` plus `AGENT_OS_DATABASE_URL` or `DATABASE_URL`: Postgres-backed Agent OS state using `docker-backend/src/agent-os/migrations/0001-agent-os-schema.sql`.
- `AGENT_OS_DATABASE_URL` or `DATABASE_URL` without `AGENT_OS_REPOSITORY` also selects Postgres.

Apply the Agent OS migration before enabling the Postgres repository. Startup fails if `AGENT_OS_REPOSITORY=postgres` is set without a database URL.

For GitHub webhook ingestion, set `AGENT_OS_GITHUB_WEBHOOK_SECRET` or `GITHUB_WEBHOOK_SECRET` through the deployment secret store. Delivery-link updates from webhook events depend on that secret for signature verification; do not commit fallback secrets or per-environment webhook values.

Useful checks:

```bash
cd docker-backend
pnpm run agent-os:persistence-smoke
AGENT_OS_DATABASE_URL=postgres://... pnpm run agent-os:persistence-smoke
```

The health response includes the selected repository driver at `data.repository`.
