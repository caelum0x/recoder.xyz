# Service Level Objectives (SLOs) — Recoder Platform

**Owner:** Platform Engineering
**Last updated:** 2026-02-24
**Review cadence:** Weekly (Mondays)
**Alerting rules:** `monitoring/alert-rules.yml`
**Prometheus config:** `monitoring/prometheus.yml`

---

## Service Inventory

| # | Service | Job Name | Port | Health Path |
|---|---------|----------|------|-------------|
| 1 | Recoder App (Next.js) | `recoder-app` | 3000 | `/api/health` |
| 2 | Recoder Agents | `recoder-frontend` (compat service label) | 3001 | `/api/health` |
| 3 | Recoder Backend (Python) | `recoder-backend` | 8000 | `/v1/health` |
| 4 | Recoder PM | `recoder-pm` | 3004 | `/api/health` |
| 5 | Recoder Studio | `recoder-studio` | 3005 | `/api/health` |
| 6 | Recoder Agency | `recoder-agency` | 3007 | `/api/health` |
| 7 | Docker Backend | `docker-backend` | 3100 | `/health` |
| 8 | Recoder Web (Vite) | `recoder-web` | 5173 | `/` |
| 9 | OpenClaw Gateway | `openclaw-gateway` | 18789 | `/health` |
| 10 | Infrastructure (host) | `node` | 9100 | n/a |

---

## SLO Definitions

### 1. Availability

| Service | SLI | SLO Target | Error Budget (30 days) |
|---------|-----|------------|------------------------|
| All web surfaces (app, agents, web, studio, PM, agency) | Availability: `(2xx + 3xx) / total requests` | 99.9% | 43.2 min downtime |
| Docker Backend | Availability: `up == 1` | 99.9% | 43.2 min downtime |
| OpenClaw Gateway | Availability: `up == 1` | 99.5% | 216 min downtime |

### 2. Latency

| Service | SLI | SLO Target | Measurement |
|---------|-----|------------|-------------|
| API endpoints (all services) | p95 response time | < 500ms | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` |
| Auth endpoints (login, signup, 2FA, CLI) | p99 response time | < 2s | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{...}[5m]))` |
| Health endpoints | p95 response time | < 200ms | Same histogram, filtered by handler |
| OpenClaw AI proxy | p95 response time | < 10s | Higher budget due to LLM inference time |

### 3. Correctness / Success Rate

| Service | SLI | SLO Target | Error Budget (30 days) |
|---------|-----|------------|------------------------|
| All web surfaces | Error rate: `5xx / total` | < 1% | n/a (rate-based) |
| CLI auth (device flow) | Success rate | 99.5% | 216 min of errors |
| Payment webhooks (Paddle/Dodo) | Processing success | 99.99% | 4.3 min of errors |
| 2FA verification | Success rate (valid codes) | 99.0% | 432 min of errors |

### 4. Infrastructure

| Resource | SLI | Threshold | Severity |
|----------|-----|-----------|----------|
| Memory | `used / total` | > 90% for 5m | Warning |
| Memory | `used / total` | > 95% for 2m | Critical |
| Disk | `used / size` (root) | > 85% for 5m | Critical |
| Disk | Linear prediction | Full in < 24h | Warning |
| CPU | `100 - idle%` | > 85% for 10m | Warning |
| CPU | `100 - idle%` | > 95% for 5m | Critical |
| File descriptors | `open / max` | > 80% for 5m | Warning |

### 5. Database

| Resource | SLI | Threshold | Severity |
|----------|-----|-----------|----------|
| PostgreSQL connections | `pg_stat_activity_count` | > 80 (of ~100 max) | Critical |
| PostgreSQL connections | `pg_stat_activity_count` | > 50 | Warning |
| Redis memory | `used / max` | > 85% | Warning |
| Redis memory | `used / max` | > 95% | Critical |
| Redis availability | `redis_up` | == 0 for 1m | Critical |

---

## Error Budget Calculation

An **error budget** is the maximum amount of unreliability allowed within the SLO window (30 days).

```
Error Budget = (1 - SLO Target) * Window Duration

Examples:
  99.9%  availability over 30 days:
    (1 - 0.999) * 30 * 24 * 60 = 43.2 minutes of downtime

  99.99% webhook success over 30 days:
    (1 - 0.9999) * 30 * 24 * 60 = 4.32 minutes of errors

  99.5%  CLI device flow over 30 days:
    (1 - 0.995) * 30 * 24 * 60 = 216 minutes of errors
```

### Burn Rate

The **burn rate** measures how fast the error budget is being consumed:

```
Burn Rate = Observed Error Rate / Allowed Error Rate

Example (99.9% SLO):
  Allowed error rate = 0.1%
  If observed error rate = 1.44%, burn rate = 14.4x
  At 14.4x, the entire 30-day budget is consumed in ~2 hours.
```

Alert thresholds in `alert-rules.yml` use multi-window burn rate alerts:
- **Fast burn (14.4x):** Pages on-call immediately. Budget exhausts in ~2 hours.
- **Slow burn (1.0x):** Creates a ticket. Budget will exhaust within the month.

---

## Incident Severity Levels

| Level | Name | Criteria | Response Time | Examples |
|-------|------|----------|---------------|---------|
| **P0** | Critical Outage | Multiple services down, data loss, or payment processing failure | 15 min (page) | Host unreachable, database corruption, webhook failures for 10+ min |
| **P1** | Major Degradation | Single critical service down or SLO fast-burn alert firing | 30 min (page) | `recoder-app` down, error rate > 5%, auth completely broken |
| **P2** | Minor Degradation | Performance degradation or non-critical service issues | 4 hours (ticket) | High latency, disk warnings, slow burn rate alerts |
| **P3** | Low Impact | Cosmetic issues, single user reports, monitoring noise | Next business day | Flapping alerts, non-critical 4xx rate elevation |

---

## Escalation Policy

### Who Gets Paged

| Severity | Route | Channel |
|----------|-------|---------|
| Critical (P0/P1) | On-call engineer | Webhook + Email, repeat every 30 min |
| Warning (P2/P3) | Engineering team | Webhook + Email, repeat every 4 hours |

### Escalation Timeline

```
T+0m   Alert fires
       -> Notification sent to on-call via webhook and email

T+15m  (P0/P1) If not acknowledged:
       -> Escalate to engineering lead

T+30m  (P0/P1) If not resolved:
       -> Second notification, repeat cycle

T+4h   (P2/P3) If not acknowledged:
       -> Re-notify engineering team
```

### When to Wake Someone Up

Page the on-call engineer (regardless of time) for:
- Any P0 event
- `ServiceDown` on `recoder-app`, `recoder-backend`, or `docker-backend` lasting > 2 min
- `PaymentWebhookFailures` lasting > 10 min
- `MultipleServicesDown` (2+ services)
- `SLOBudgetFastBurn` on any service
- `CriticalMemoryUsage` or `CriticalCPUUsage` (host may become unresponsive)

Do NOT page for:
- Warning-level alerts during off-hours
- `ServiceFlapping` (wait for `ServiceDown` to confirm)
- `High4xxRate` (client-side issue, not service failure)

---

## Review Cadence

### Weekly Review (Every Monday)

1. **Error budget status** for each service:
   - How much budget was consumed this week?
   - Is any service on track to exhaust its monthly budget?

2. **Alert quality:**
   - False positive rate (target: < 5% of all alerts)
   - Alerts that fired but required no action (candidates for tuning)
   - Missing alerts (incidents that were NOT caught by alerting)

3. **SLO compliance:**
   - Did any service breach its SLO in the past 7 days?
   - If yes, write a brief postmortem (template below)

4. **Action items** from previous week

### Monthly Review (First Monday)

All of the above, plus:
- Recalculate error budgets for the new month
- Review and adjust SLO targets based on actual performance
- Update thresholds if traffic patterns have changed
- Archive postmortems

### Quarterly Review

- Evaluate whether SLO targets are appropriate
- Benchmark against industry standards
- Decide if any SLOs should be tightened or relaxed
- Infrastructure capacity planning based on trends

---

## Postmortem Template

```markdown
## Incident: [Title]
**Date:** YYYY-MM-DD
**Duration:** X minutes
**Severity:** P0/P1/P2/P3
**Services affected:** [list]

### Summary
[1-2 sentences describing what happened]

### Timeline
- HH:MM — Alert fired
- HH:MM — On-call acknowledged
- HH:MM — Root cause identified
- HH:MM — Mitigation applied
- HH:MM — Service restored

### Root Cause
[What caused the incident]

### Error Budget Impact
- Budget consumed by this incident: X minutes
- Remaining monthly budget: Y minutes (Z%)

### Action Items
- [ ] [What will prevent recurrence]
- [ ] [What will improve detection]
```

---

## Dashboards

SLO metrics are visualized in Grafana at `monitor.recoder.xyz`:

- **Platform Overview:** All 10 services up/down status, request rate, error rate
- **SLO Budget:** Remaining error budget per service, burn rate trends
- **Infrastructure:** CPU, memory, disk for the Hetzner host
- **Database:** PostgreSQL connections, Redis memory, query latency

Grafana datasource configuration: `monitoring/grafana-datasources.yml`
Dashboard provisioning: `monitoring/grafana-dashboards.yml`
