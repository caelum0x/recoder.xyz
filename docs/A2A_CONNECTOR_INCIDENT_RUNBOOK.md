# A2A Connector Incident Runbook

## Scope
Use this runbook when A2A connector health degrades:
- connector restart storms
- repeated circuit-open transitions
- low connector success rate
- high approval turnaround
- degraded SSE/task stream behavior

## Signals
Primary alerts:
- `A2AConnectorSuccessRateLow`
- `A2AConnectorRetryRateHigh`
- `A2ACircuitOpenSpike`
- `A2AApprovalTurnaroundHigh`

Primary metrics endpoints:
- `GET /api/a2a/metrics`
- `GET /api/a2a/metrics/prometheus`
- `GET /api/a2a/connectors/health`

## Triage (first 10 minutes)
1. Confirm service health:
```bash
curl -fsS https://docker.recoder.xyz/health
curl -fsS https://docker.recoder.xyz/api/a2a/connectors/health | jq .
curl -fsS https://docker.recoder.xyz/api/a2a/metrics | jq .
```
2. Inspect Prometheus samples:
```bash
curl -fsS https://docker.recoder.xyz/api/metrics/prometheus | rg "recoder_a2a_"
```
3. Confirm route-level behavior:
```bash
BACKEND_URL=https://docker.recoder.xyz bash scripts/a2a-production-smoke.sh
```

## Investigation paths
### Restart storm or circuit-open
1. Check connector monitor output:
```bash
docker logs recoder-docker-backend --tail 300 | rg "connector|circuit|restart"
```
2. Verify process health endpoint:
```bash
curl -fsS https://docker.recoder.xyz/api/a2a/connectors/health | jq '.data'
```
3. If one connector is isolated, attempt controlled reset:
```bash
curl -fsS -X POST https://docker.recoder.xyz/api/a2a/connectors/codex/restart | jq .
curl -fsS -X POST https://docker.recoder.xyz/api/a2a/connectors/codex/circuit/reset | jq .
```

### Low success rate / high latency
1. Inspect execution metrics and failure ratios:
```bash
curl -fsS https://docker.recoder.xyz/api/a2a/metrics | jq '.data.connectors'
```
2. Correlate with upstream backend health:
```bash
curl -fsS https://docker.recoder.xyz/api/metrics | jq '.requests,.errors'
```

### High approval turnaround
1. Check approval queue behavior:
```bash
curl -fsS https://docker.recoder.xyz/api/a2a/metrics | jq '.data.approvals'
```
2. Inspect policy approval routes:
```bash
docker logs recoder-docker-backend --tail 300 | rg "approval|policy"
```

### Stream degradation
1. Verify SSE stream behavior:
```bash
curl -sS -N --max-time 5 https://docker.recoder.xyz/api/a2a/events/stream | head -n 40
```
2. Re-run production smoke route checks:
```bash
BACKEND_URL=https://docker.recoder.xyz bash scripts/a2a-production-smoke.sh
```

## Mitigation
1. If connector instability is isolated:
   - restart connector route first (`/connectors/{id}/restart`)
   - reset circuit only after confirming crash source is addressed
2. If broad A2A degradation:
   - rollback most recent docker-backend deploy
   - keep A2A worker status snapshots for evidence
3. If approvals lag:
   - reduce policy pressure by pausing non-critical privileged actions
   - prioritize approval processing in ops/on-call rotation

## Exit criteria
1. A2A smoke (`scripts/a2a-production-smoke.sh`) passes.
2. `recoder_a2a_connector_success_rate` recovers above threshold.
3. `recoder_a2a_connector_circuit_open_total` growth stabilizes.
4. Approval turnaround p95 returns to expected range.

## Evidence to attach
1. `/api/a2a/metrics` snapshot
2. `/api/metrics/prometheus` filtered `recoder_a2a_` lines
3. connector health JSON snapshot
4. relevant docker-backend log excerpts
