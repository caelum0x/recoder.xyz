# Kubernetes

Kubernetes manifests for Agent OS should mount the same boundaries as `infra/docker-compose.agent-os.yml`:

- agent gateway
- agent worker
- Postgres/pgvector or managed database bindings
- observability collector
- sandbox/browser verification workers
