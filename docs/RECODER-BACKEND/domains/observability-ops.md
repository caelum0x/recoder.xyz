# Domain 14 — Observability & Ops

> Folder prefix: `backend/src/domains/observability/` (+ Python sidecar `backend/engines/py/ops-recorder`)
> Boundary: **Truthful operational visibility.** Structured logging, metrics, tracing, the audit/XDR sink, the aggregated health surface, and the ops-recorder work-signals pipeline (`stuck` / `blocked` / `needs-you` signals → board).

## 1. Overview

Observability is the domain that tells the truth about the running system. It owns
**no product state** — it owns *signals about* state. It composes four engines behind a single
`ObservabilityModule` interface:

1. **Logging** — pino structured logs, per-domain child loggers, request/run correlation IDs. Reuses `@recoder/logger` as the low-level sink; this domain adds correlation + redaction + a ring buffer for the ops surface.
2. **Metrics** — a Prometheus registry (default + custom collectors), the `/metrics` scrape edge, SLO recording rules, RED/USE counters and histograms that every other domain increments through a thin injected `MetricsPort`.
3. **Tracing** — an OpenTelemetry `NodeSDK` bootstrap, W3C trace-context propagation across HTTP/WS/MCP edges, span helpers, and OTLP export that degrades to a no-op exporter when no collector is configured.
4. **Health aggregation** — pulls every domain's `health()` report through the `HealthRegistry` (from `bootstrap`), fuses per-engine `up|down`, and serves the canonical `/health`, `/health/full`, and `/api/agent-os/health` contracts. Never fakes green.

Plus two operational sinks:

- **Audit/XDR surfacing** — a read-only projection of the governance Merkle audit chain and the security/error event stream, exposed as an XDR-style query edge (it does not *own* the audit chain — governance does — it *surfaces* it, and re-verifies Merkle proofs before display).
- **Ops-recorder work-signals** — supervises the Python `ops-recorder` sidecar (`work-signals/`) that detects `stuck` / `blocked` / `needs-you` conditions from run telemetry + connector events, normalizes them to `RunEvent`s, and routes them to the board (herd) so a human sees "this agent needs you" instead of a silent hang.

### Design law adherence
- **Config only via `AppConfig` slice** — `ObservabilityConfig` (OTLP endpoint, metrics auth, sample rate, redaction keys, ops-recorder URL) is a typed slice; the domain never reads `process.env`.
- **Every WRITE through the governance gate** — the only writes here are *alert acknowledgements* and *signal dispositions*; both call `GovernanceGate.decide()` + `record_audit`.
- **Every edge through the interop chain** — `authorize→risk→policy→audit`, except the unauthenticated liveness `/health` (shallow, no secrets) and the `INTERNAL_SERVICE_KEY`-gated `/internal/*` scrape.
- **Truthful degrade** — no collector → tracing no-ops (`degraded:true`); ops-recorder venv/torch absent → signals engine reports `down`, never fabricates signals; metrics registry always up (in-process).

## 2. File tree (~22 files)

```
backend/src/domains/observability/
  index.ts                                   # factory + public ObservabilityModule interface
  observability-module.ts                    # composer: fuses logging/metrics/tracing/health/audit/signals
  config.ts                                  # ObservabilityConfig zod slice + defaults
  types.ts                                   # shared domain types (HealthFull, AlertRule, WorkSignal, XdrQuery…)
  health.ts                                  # module self-health (its own engines up|down)
  ports/
    metrics.port.ts                          # MetricsPort consumed by ALL domains (counter/gauge/histogram)
    tracer.port.ts                           # TracerPort (startSpan/withSpan/inject/extract)
    health-source.port.ts                    # HealthSource — what a domain implements to be aggregated
    signals.port.ts                          # WorkSignalsPort (engine boundary to ops-recorder sidecar)
    observability.repository.ts              # AlertRepository + SignalDispositionRepository PORT interfaces
  adapters/
    pino-logger.adapter.ts                   # correlation + redaction over @recoder/logger; ring buffer
    prometheus-registry.adapter.ts           # prom-client registry, default+custom collectors, SLO rules
    otel-tracer.adapter.ts                   # OTel NodeSDK bootstrap + OTLP/no-op exporter (degrade-safe)
    ops-recorder.adapter.ts                  # supervised loopback client for work-signals sidecar
    audit-xdr.adapter.ts                     # read+verify projection over governance Merkle chain
  services/
    health-aggregator.service.ts             # fuses HealthRegistry → /health/full contract + SLO rollup
    correlation.service.ts                   # request/run correlation-id lifecycle (AsyncLocalStorage)
    alerting.service.ts                       # rule eval → notify (herd/notify engine), dedupe, ack
    work-signals.service.ts                  # normalize sidecar signals → RunEvent → board
  routes/observability.routes.ts             # /health, /health/full, /metrics, /api/agent-os/observability/*
  middleware/telemetry.middleware.ts         # express+ws: correlation id, trace ctx, RED metrics, access log
  mcp/observability-engine.ts                # MCP tools: obs.health / obs.metrics_query / obs.audit_search / obs.signals
  __tests__/
    health-aggregator.test.ts
    correlation.test.ts
    telemetry-middleware.test.ts
    work-signals.service.test.ts
    audit-xdr.adapter.test.ts

backend/migrations/
  0014-observability-ops.sql                 # alert_rules, alert_events, work_signal_dispositions, slo_targets

backend/engines/py/ops-recorder/            # EXISTING sidecar — USED IN PLACE, not rewritten
  work-signals/ (main.py, api/, detectors/, normalizers/, storage/, handoff/, integrations/)
```

## 3. Per-file responsibility table

| # | Path | Lang | Kind | Responsibility | Key exports |
|---|------|------|------|----------------|-------------|
| 1 | `index.ts` | ts | service | Pure factory: `createObservabilityModule(deps)`; re-exports the one public interface. | `createObservabilityModule`, `ObservabilityModule` |
| 2 | `observability-module.ts` | ts | service | Composer. Wires pino/prom/otel/ops-recorder/audit adapters + services behind `ObservabilityModule`; exposes `metrics`/`tracer`/`health` ports to DI; aggregates engine health. | `ObservabilityModuleImpl` |
| 3 | `config.ts` | ts | config | Zod slice: OTLP endpoint, `metricsAuthToken`, `sampleRatio`, `redactKeys[]`, `opsRecorderUrl`, `alertingEnabled`. Fail-safe defaults (no localhost in prod). | `ObservabilityConfig`, `observabilityConfigSchema` |
| 4 | `types.ts` | ts | type | Domain types: `HealthFull`, `EngineHealth`, `SloTarget`, `AlertRule`, `AlertEvent`, `WorkSignal`, `SignalDisposition`, `XdrQuery`, `XdrRecord`. | (types) |
| 5 | `health.ts` | ts | service | The module's OWN health (its four engines: logging always up; metrics up; tracing up/degraded; signals up/down). | `observabilityHealth(engines)` |
| 6 | `ports/metrics.port.ts` | ts | port | Interface every domain injects to record metrics — decoupled from prom-client. `counter/gauge/histogram/timer`. | `MetricsPort`, `MetricHandle` |
| 7 | `ports/tracer.port.ts` | ts | port | Tracing boundary: `startSpan`, `withSpan`, `inject`, `extract`, `currentTraceId`. Decoupled from OTel API. | `TracerPort`, `Span` |
| 8 | `ports/health-source.port.ts` | ts | port | Contract a domain implements to be aggregated: `key`, `health(): HealthReport`. Mirrors `shared/ModuleBase`. | `HealthSource`, `HealthReport` |
| 9 | `ports/signals.port.ts` | ts | port | Engine boundary to ops-recorder: `fetchSignals`, `stream`, `availability`. | `WorkSignalsPort`, `RawWorkSignal` |
| 10 | `ports/observability.repository.ts` | ts | repository | PORT interfaces persistence implements: `AlertRepository` (rules+events), `SignalDispositionRepository`, `SloRepository`. `WHERE user_id`/space-scoped. | `AlertRepository`, `SignalDispositionRepository`, `SloRepository` |
| 11 | `adapters/pino-logger.adapter.ts` | ts | adapter | Wraps `@recoder/logger` (pino). Adds correlation-id + run-id fields from `correlation.service`, key redaction, and a bounded ring buffer feeding the ops log surface. | `createCorrelatedLogger`, `LogRingBuffer` |
| 12 | `adapters/prometheus-registry.adapter.ts` | ts | adapter/client | `prom-client` Registry; default Node collectors + custom RED/USE collectors; SLO recording gauges; `MetricsPort` impl; renders scrape text. | `PrometheusMetrics implements MetricsPort`, `renderMetrics` |
| 13 | `adapters/otel-tracer.adapter.ts` | ts | adapter/client | OTel `NodeSDK` bootstrap, W3C propagator, OTLP-HTTP exporter → **no-op exporter when `otlpEndpoint` absent** (degraded). `TracerPort` impl. | `OtelTracer implements TracerPort`, `startTracing`, `shutdownTracing` |
| 14 | `adapters/ops-recorder.adapter.ts` | ts | adapter/client | Supervised loopback client for the Python `work-signals` sidecar (HTTP). Auth-preflight before use; `availability()` returns `down` when sidecar/venv absent. `WorkSignalsPort` impl. | `OpsRecorderClient implements WorkSignalsPort` |
| 15 | `adapters/audit-xdr.adapter.ts` | ts | adapter | Read+verify projection over the governance Merkle audit chain (via `@recoder/governance` `verify_audit`) + security/error events. Re-verifies proofs before returning; never mutates. | `AuditXdrProjection`, `queryXdr`, `verifyAndProject` |
| 16 | `services/health-aggregator.service.ts` | ts | service | Pulls all `HealthSource.health()` from the `HealthRegistry`, fuses into `/health` (shallow) + `/health/full` (per-engine up/down + SLO rollup + degraded flags). Timeouts → `unknown`, never hang. | `HealthAggregator`, `buildHealthFull` |
| 17 | `services/correlation.service.ts` | ts | service | `AsyncLocalStorage` correlation context: derive/propagate `correlationId` + `runId` + `traceId` across a request/run; used by logger + tracer + metrics labels. | `CorrelationContext`, `runWithCorrelation`, `currentCorrelation` |
| 18 | `services/alerting.service.ts` | ts | service | Evaluate `AlertRule`s against metrics/health/SLO; dedupe + debounce; fire via `notify` engine / herd board; persist `AlertEvent`; ack path routes through governance gate. | `AlertingService`, `evaluateRules`, `acknowledgeAlert` |
| 19 | `services/work-signals.service.ts` | ts | service | Pull raw signals from `WorkSignalsPort`, normalize to `RunEvent` (`@recoder/agent-events`), emit to the RunEvent bus + board; persist dispositions; disposition write → governance gate. | `WorkSignalsService`, `normalizeSignal`, `disposition` |
| 20 | `routes/observability.routes.ts` | ts | route | Edges: `GET /health` (liveness, open), `GET /health/full` (interop-gated deep), `GET /metrics` (`INTERNAL_SERVICE_KEY`), `GET /api/agent-os/observability/{slo,alerts,signals,audit}`, `POST …/alerts/:id/ack`, `POST …/signals/:id/disposition`. | `observabilityRoutes(module)` |
| 21 | `middleware/telemetry.middleware.ts` | ts | middleware | Express + express-ws: assign correlation id, extract/inject W3C trace ctx, open request span, record RED metrics (rate/errors/duration), structured access log. | `telemetryMiddleware`, `wsTelemetry` |
| 22 | `mcp/observability-engine.ts` | ts | client | MCP tools an agent can call (behind interop): `obs.health`, `obs.metrics_query`, `obs.audit_search`, `obs.signals`. Registered via wiring checklist. | `registerObservabilityMcpTools` |
| 23 | `migrations/0014-observability-ops.sql` | sql | migration | Tables: `alert_rules`, `alert_events`, `work_signal_dispositions`, `slo_targets`. Space/user-scoped, parameterized. | (DDL) |
| T1 | `__tests__/health-aggregator.test.ts` | ts | test | Fusion correctness: one `down` engine → `degraded:true`; timeout → `unknown`; SLO rollup math. | — |
| T2 | `__tests__/correlation.test.ts` | ts | test | Correlation propagates across async boundaries; nested runs isolate. | — |
| T3 | `__tests__/telemetry-middleware.test.ts` | ts | test | Injects trace ctx, records RED metric on 200 + 500, redacts secrets in access log. | — |
| T4 | `__tests__/work-signals.service.test.ts` | ts | test | Raw signal → RunEvent normalization; sidecar `down` → no fabricated signals + `degraded`. | — |
| T5 | `__tests__/audit-xdr.adapter.test.ts` | ts | test | Merkle re-verify: valid chain returns records; tampered proof → error, not silent pass. | — |

## 4. DB schema — `backend/migrations/0014-observability-ops.sql`

Observability owns minimal durable state (it's a signals domain). Access is app-layer scoped
(`WHERE space_id = :space_id`), no RLS. All DDL parameterized/idempotent (`IF NOT EXISTS`).

```sql
-- SLO targets per service/route (drives /health/full rollup + alert rules)
CREATE TABLE IF NOT EXISTS slo_targets (
  id            TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL,
  name          TEXT NOT NULL,               -- e.g. "api-latency-p99", "run-success-rate"
  target        DOUBLE PRECISION NOT NULL,   -- objective (e.g. 0.999)
  window_secs   INTEGER NOT NULL DEFAULT 3600,
  metric_query  TEXT NOT NULL,               -- prometheus expr backing this SLO
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alert rules evaluated by alerting.service
CREATE TABLE IF NOT EXISTS alert_rules (
  id            TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  expr          TEXT NOT NULL,               -- condition over metric/health/slo
  for_secs      INTEGER NOT NULL DEFAULT 0,  -- debounce window
  notify_route  TEXT NOT NULL,               -- herd board / notify engine target
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fired alert instances (audit trail; ack state)
CREATE TABLE IF NOT EXISTS alert_events (
  id            TEXT PRIMARY KEY,
  rule_id       TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  space_id      TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('firing','acked','resolved')),
  value         DOUBLE PRECISION,
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_at      TIMESTAMPTZ,
  acked_by      TEXT,                         -- user_id (governance-gated write)
  resolved_at   TIMESTAMPTZ,
  audit_ref     TEXT                          -- governance audit record id for the ack
);
CREATE INDEX IF NOT EXISTS idx_alert_events_space_status ON alert_events(space_id, status);

-- Disposition of ops-recorder work signals (stuck/blocked/needs-you → human decision)
CREATE TABLE IF NOT EXISTS work_signal_dispositions (
  id            TEXT PRIMARY KEY,
  signal_id     TEXT NOT NULL,               -- id from ops-recorder sidecar
  space_id      TEXT NOT NULL,
  run_id        TEXT,                         -- correlated run (RunEvent link)
  kind          TEXT NOT NULL CHECK (kind IN ('stuck','blocked','needs-you')),
  disposition   TEXT NOT NULL CHECK (disposition IN ('open','acknowledged','resolved','dismissed')),
  decided_by    TEXT,                         -- user_id (governance-gated write)
  decided_at    TIMESTAMPTZ,
  audit_ref     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wsd_space_kind ON work_signal_dispositions(space_id, kind, disposition);
```

## 5. HTTP/WS edges (mounted by the `edge` domain route table)

| Method | Path | Gate | Purpose |
|--------|------|------|---------|
| GET | `/health` | open (shallow, no secrets) | Liveness — process up + fast checks only. Load balancer probe. |
| GET | `/health/full` | interop `authorize→risk→policy→audit` | Deep per-engine `up\|down` across all 14 domains + SLO rollup + `degraded` flags. The `/health/full` contract. |
| GET | `/metrics` | `INTERNAL_SERVICE_KEY` | Prometheus scrape (RED/USE + SLO recording rules). |
| GET | `/api/agent-os/health` | interop | Agent-OS canonical health alias (same fused report). |
| GET | `/api/agent-os/observability/slo` | interop | SLO targets + current attainment. |
| GET | `/api/agent-os/observability/alerts` | interop | List alert rules + firing/acked events (space-scoped). |
| POST | `/api/agent-os/observability/alerts/:id/ack` | interop + governance gate | Acknowledge alert (write → `decide` + `record_audit`). |
| GET | `/api/agent-os/observability/signals` | interop | List work-signals + dispositions. |
| POST | `/api/agent-os/observability/signals/:id/disposition` | interop + governance gate | Set disposition (write → gate). |
| GET | `/api/agent-os/observability/audit` | interop | XDR query over Merkle audit chain (re-verified before return). |
| WS | `/sync` (telemetry frames) | via telemetry middleware | Live health/signal frames to cockpit ops surface. |

## 6. Ports exposed & consumed

**Exposed to other domains (the seams they wire to):**
- `MetricsPort` — every domain injects it to increment counters/histograms (RED/USE) without depending on prom-client.
- `TracerPort` — every edge/composer opens spans; decoupled from OTel API.
- `HealthSource` — every domain implements it so the aggregator can fuse its `up|down`.
- `CorrelationContext` — logger/tracer/metrics label source; the `bootstrap` health aggregate reads it.

**Consumed from other domains / packages:**
- `HealthRegistry` (from `bootstrap`) — the registry of all domain `HealthSource`s.
- `GovernanceGate.decide()` + `record_audit`/`verify_audit` (`@recoder/governance`) — gates alert-ack/disposition writes; backs the XDR projection.
- `InteropChain` (`@recoder/interop`) — every non-liveness edge + MCP call.
- `RunEvent` bus + outbox (`@recoder/agent-events`) — work-signals normalize to `RunEvent`.
- `Repository`/`QueryExecutor` (persistence) — concrete impl of the three repo ports.
- `notify` engine / herd board (`@recoder/herd`) — alert + signal delivery.
- `Session` (`@recoder/auth`) — actor identity on every gated edge.
- `AppConfig` slice (`bootstrap/config`) — `ObservabilityConfig`.
- `@recoder/agent-observability` (existing pkg: `health.ts`, `trace.ts`, `evidence.ts`) — reused for `ComponentHealth`, `summarizeHealth`, trace + evidence shapes.
- `@recoder/logger` — pino sink under the correlated-logger adapter.

## 7. Reuse vs new

**REUSE (do not rebuild):**
- `@recoder/agent-observability` — `ComponentHealth`, `summarizeHealth`, `trace.ts`, `evidence.ts`. The domain's health fusion builds on `summarizeHealth`.
- `@recoder/logger` — pino base; the adapter only adds correlation + redaction + ring buffer.
- `backend/src/agent-os/mcp/logs-engine.ts` — existing RunEvent log MCP executor; the observability MCP engine composes it (does NOT duplicate log read/search/append).
- `backend/src/conductor/conductor-health.ts` — existing truthful conductor health; folded in as one `HealthSource` behind the aggregator (moved behind the composer, not rewritten).
- `backend/src/a2a/connector-health-monitor.service.ts` + `connector-health.routes.ts` — connector health becomes a `HealthSource`.
- `backend/src/routes/integrations-health.routes.ts` — merged into the aggregator's per-engine report.
- `backend/engines/py/ops-recorder/work-signals/` — the whole Python detector/normalizer/handoff pipeline USED IN PLACE via the loopback adapter. Zero rewrite; TS only supervises + normalizes to RunEvent.
- `@recoder/governance` `verify_audit` + Merkle verifier — backs the XDR projection; no new crypto.
- `@recoder/agent-events` RunEvent/outbox — signal transport.

**WRITE NEW (thin glue, ~22 TS files + 1 migration):**
- The `ObservabilityModule` composer + factory (DI).
- `MetricsPort` / `TracerPort` / `HealthSource` / `WorkSignalsPort` port interfaces (new seams other domains consume).
- prom-client registry adapter + OTel NodeSDK adapter (bootstrap glue; degrade-safe exporters).
- correlation `AsyncLocalStorage` service + telemetry middleware.
- health-aggregator (`/health/full` fusion + SLO rollup) — new, since it spans all 14 domains.
- alerting service + work-signals normalization service.
- ops-recorder loopback adapter + audit-XDR projection adapter.
- routes + MCP engine + migration.

**Do NOT restore (owner-cut):** any `backend/src/database` (stale SQLAlchemy dir), `sandbox`, dangling `fleet`/`enterprise` health imports from `server.ts` — health for those is only emitted if the owning domain registers a `HealthSource`.

## 8. Degrade-safe behavior (truthful health matrix)

| Condition | Behavior |
|-----------|----------|
| No OTLP collector configured | Tracing uses no-op exporter; tracer engine `up` but `degraded:true` (spans created, not exported). |
| ops-recorder venv/torch/sidecar absent | `WorkSignalsPort.availability()` = `down`; signals engine `down`; NO fabricated signals; `/health/full` marks it. |
| Metrics registry | Always in-process `up` (no external dep). |
| A domain `health()` times out | Aggregator returns `unknown` for it after timeout; overall `degraded:true`; never hangs. |
| Governance gate unavailable for XDR verify | XDR query returns `SERVICE_UNAVAILABLE` (never returns unverified audit rows as if verified). |
| `metricsAuthToken` missing in prod | `/metrics` returns 503 `SERVICE_UNAVAILABLE` (fails safe, no open scrape). |

## 9. Verification

- `pnpm check-types`, `pnpm format`
- Domain unit tests (vitest, co-located + `__tests__/`): `pnpm test -- observability`
- Contract/eval: `pnpm test:contracts:agent-os` (health contract), `pnpm test:evals:agent-os`
- Python sidecar unchanged: `pytest` in `backend/engines/py/ops-recorder/work-signals/tests`
- Manual truthfulness check: kill ops-recorder sidecar → assert `/health/full` shows signals engine `down` (not green).

## 10. Implementation order

1. **Ports + config + types** (`ports/*`, `config.ts`, `types.ts`, `health.ts`) — the seams other 13 domains compile against. Ship first so parallel designers can inject `MetricsPort`/`TracerPort`/`HealthSource`.
2. **Correlation + logging adapter** (`correlation.service.ts`, `pino-logger.adapter.ts`) — foundational for every other signal.
3. **Metrics + tracing adapters** (`prometheus-registry.adapter.ts`, `otel-tracer.adapter.ts`) + `telemetry.middleware.ts`.
4. **Health aggregator** (`health-aggregator.service.ts`) + `/health`, `/health/full` routes — the headline contract.
5. **Migration `0014`** + repositories wiring (persistence provides impl).
6. **Ops-recorder adapter + work-signals service** (`ops-recorder.adapter.ts`, `work-signals.service.ts`) — loopback to existing Python sidecar; normalize to RunEvent.
7. **Alerting service** + alert/signal edges (governance-gated writes).
8. **Audit-XDR adapter** + audit edge (Merkle re-verify).
9. **MCP engine** (`observability-engine.ts`) — register via wiring checklist (`IN_PROC_SERVERS` + `ENGINE_SERVERS` + `registerObservabilityMcpTools` in `buildInProcEngineRouter`).
10. **Composer + factory** (`observability-module.ts`, `index.ts`) — fuse all; register in `bootstrap/container.ts`.
11. **Tests** T1–T5 throughout (TDD: aggregator + correlation first).
