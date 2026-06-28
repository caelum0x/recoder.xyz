# Subsystem: `network` — Envoy Zero-Trust L7 Control Plane

> **Status (verified 2026-06-29): BUILT on Envoy.** The shipped network subsystem is an **Envoy v3
> data plane** with a **Go xDS control plane** and an **XDR** access-log detection pipeline. The pure,
> IO-free core lives in **`packages/network`** (`@recoder/network`) and is **adopted** by the backend in
> **`docker-backend/src/network`**. The Go xDS control plane lives in **`go/recoder-xds`**. All claims
> below are checked against the repo; counts are re-runnable.
>
> | Piece | Real path | State (verified) |
> |---|---|---|
> | Envoy bootstrap (mTLS · fail-closed `ext_authz` · JSON access-log) | `packages/network/src/envoy-config.ts` | built |
> | Default-deny ext_authz decision | `packages/network/src/ext-authz.ts` | built |
> | XDR access-log → 4 detections → Merkle audit | `packages/network/src/xdr/` | built |
> | Pure-package tests | `packages/network/tests/` | **31/31 passing** (`vitest run`, 3 files) |
> | Backend IO adapter (`/api/network`, `/internal/network/authz`) | `docker-backend/src/network/` | built; **5 adapter tests** |
> | Go Envoy xDS control plane (ADS · LDS/CDS/RDS) | `go/recoder-xds/` | builds (`go build ./...` exit 0); **13 Go test funcs passing** |
> | Self-host Envoy bootstraps (static + dynamic/xDS) | `deploy/envoy/envoy.selfhost.yaml`, `deploy/envoy/envoy.xds.yaml` | present |
>
> Commits: `b6fb599a3` (Envoy + ext_authz→governance + XDR), `a4436f3fc` (Go xDS control plane),
> `6d1cf0611` (promote to `@recoder/network` behind ports + backend adoption). See BUILD-STATUS §14.
>
> **Honest gap (infra-gated):** A **live Envoy proxy run against real mTLS certs** is NOT done. The
> bootstrap and xDS snapshot are real and tested, but booting the proxy end-to-end requires ops + real
> certificate material + a reachable governance ext_authz endpoint. See [§9 Gaps / not-yet-live](#9-gaps--not-yet-live).
>
> **Deferred:** the **OpenZiti dark-overlay** design (`go/ziti`, `docker-backend/src/ziti-client.ts`,
> `/api/ziti/*`) is a **deferred future option**, not the current realization. It is documented as an
> appendix in [§10](#10-appendix-deferred-openziti-dark-overlay-design-not-built). Why Envoy was chosen
> as the deployable path: it is a production-proven L7 proxy with a stable xDS contract and a fail-closed
> external-authz hook that gates every request through Recoder governance — it ships on standard infra
> today with no dark-overlay rollout.
>
> Owner: Network subsystem lead architect.

## 1. Mission

The `network` subsystem is Recoder's **zero-trust L7 enforcement layer**. It puts an Envoy proxy in
front of Recoder service traffic and makes **every request** pass a **fail-closed external-authz
check** (`ext_authz`) wired to Recoder governance, so reachability is gated *below the model*. Envoy's
access logs are streamed into an **XDR** pipeline that turns request patterns into security detections
and seals each one into the governance **Merkle audit chain** (tamper-evident).

The package is **pure and dependency-free** at its core (config generation, the allow/deny decision,
the detection pipeline). All IO — the ext_authz HTTP handler, Express route mounting — and the concrete
governance-backed ports (policy engine, Merkle audit store) live in the **adopting service**
(`docker-backend`) as thin adapters.

### Non-goals
- Not a task-state owner (that is `agent-os`). The network emits events; it never owns task/approval/memory state.
- Not a model/runtime owner (that is `agent-runtimes`).
- Not the application-layer intent engine. Envoy/ext_authz enforces *reachability*; governance/policy decides *intent*. The network **asks** governance via a `PolicyAdvisorPort` and enforces the verdict at the proxy edge.

## 2. What gets fused (real OSS lineage)

| Source | What it is | How it fuses in |
|---|---|---|
| **Envoy** (data plane, v3 API) | Production L7 proxy with mTLS transport sockets, `ext_authz` HTTP filter, and JSON access logging | `packages/network/src/envoy-config.ts` generates a **real, deployable Envoy v3 bootstrap** (`generateEnvoyConfig` → `emitYaml`/`emitJson`) that can be written to disk and handed to `envoy -c`. The TLS `DownstreamTlsContext`/`UpstreamTlsContext` typed-config URNs are emitted directly. |
| **`github.com/envoyproxy/go-control-plane` v0.14.0** + `.../envoy` v1.36.0 | Go xDS server library (ADS, snapshot cache) | `go/recoder-xds` is a **real Go Envoy xDS control plane** (`go 1.24`). It builds a consistent snapshot and serves it over **ADS gRPC** so a running Envoy receives live **LDS/CDS/RDS** updates. Entry point `go/recoder-xds/cmd/recoder-xds/main.go`; snapshot builder `internal/snapshot/builder.go`; server `internal/server/server.go`. |
| `docker-backend/src/ziti-client.ts` + `/api/ziti/*` (legacy) | Thin OpenZiti Edge-Mgmt REST client | **Left in place as legacy** for the deferred dark-overlay option; **not** the current network realization (see §10). |

## 3. Architecture (as shipped)

```
            other subsystems (governance/policy, agent-os)
                              │  ports (PolicyAdvisorPort, AuditSinkPort)
   ┌──────────────────────────────────────────────────────────────────┐
   │  packages/network  (@recoder/network — PURE, IO-free)            │
   │                                                                  │
   │  envoy-config.ts ── generateEnvoyConfig → emitYaml/emitJson      │
   │  ext-authz.ts    ── decideNetworkAuthz (default-deny)            │
   │  xdr/parser.ts   ── parseAccessLog                               │
   │  xdr/detections.ts ─ detect (4 rules)                            │
   │  xdr/sink.ts     ── XdrSink → AuditSinkPort.record (Merkle seal) │
   │  ports.ts        ── PolicyAdvisorPort · AuditSinkPort (seams)    │
   └───────────────────────────────┬──────────────────────────────────┘
                                    │ adopted by (thin IO adapters)
   ┌───────────────────────────────▼──────────────────────────────────┐
   │  docker-backend/src/network/  (ADOPTION adapter)                 │
   │  network.routes.ts  → GET /api/network/{envoy-config,detections, │
   │                          health} ; POST /internal/network/authz  │
   │  governance-ports.ts → concrete PolicyAdvisorPort (governance)   │
   │  xdr-sink.ts        → wires XdrSink to the real Merkle audit     │
   └───────────────────────────────┬──────────────────────────────────┘
                  ext_authz (200=allow / 403=deny) │ JSON access-log
   ┌───────────────────────────────▼──────────────────────────────────┐
   │  Envoy proxy   ◄── ADS gRPC (LDS/CDS/RDS) ── go/recoder-xds       │
   │  (mTLS downstream/upstream · ext_authz filter · access logging)  │
   └──────────────────────────────────────────────────────────────────┘
```

## 4. Real file tree (verified)

### `packages/network/` — the pure subsystem (`@recoder/network`)
```
packages/network/
├── package.json              # @recoder/network · deps: @recoder/agent-os, @recoder/governance · vitest
├── tsconfig.json
├── tsup.config.ts            # dual ESM/CJS build
├── src/
│   ├── index.ts              # barrel: types, ports, envoy-config, ext-authz, xdr
│   ├── types.ts              # NetworkConfig, authz/XDR shapes
│   ├── ports.ts              # PolicyAdvisorPort, AuditSinkPort (DI seams into governance)
│   ├── envoy-config.ts       # generateEnvoyConfig / emitYaml / emitJson / defaultNetworkConfig
│   ├── ext-authz.ts          # decideNetworkAuthz (default-deny) + extractAuthzRequest
│   └── xdr/
│       ├── index.ts          # barrel
│       ├── parser.ts         # parseAccessLog (Envoy JSON access-log → SecurityEvent)
│       ├── detections.ts     # detect() → 4 detection rules
│       └── sink.ts           # XdrSink → AuditSinkPort.record (SHA-256/Merkle seal)
└── tests/
    ├── envoy-config.test.ts  # 9 tests
    ├── ext-authz.test.ts     # 10 tests
    ├── xdr.test.ts           # 12 tests
    └── governance-ports.ts   # test doubles for the ports
```
**Real counts:** `src/` = **9 functional files** (3 under `xdr/`). Tests = **31** (`vitest run`: 9 + 10 + 12,
3 files, all passing).

### `docker-backend/src/network/` — the backend adoption adapter
```
docker-backend/src/network/
├── index.ts                  # re-exports the pure @recoder/network surface + adapter wiring
├── network.routes.ts         # Express IO: createNetworkRouter (/api/network) + createNetworkInternalRouter (/internal/network)
├── governance-ports.ts       # governancePolicyAdvisor — concrete PolicyAdvisorPort over @recoder/governance
├── xdr-sink.ts               # getXdrSink — XdrSink bound to the real governance Merkle audit store
└── adapter.test.ts           # 5 tests — proves the backend adoption (not a re-test of the pure core)
```
Routes (from `network.routes.ts`):
- `GET  /api/network/envoy-config` — the generated, deployable Envoy bootstrap.
- `GET  /api/network/detections` — recent XDR detections.
- `GET  /api/network/health` — config valid + audit chain intact.
- `POST /internal/network/authz` — the **Envoy ext_authz contract**: HTTP **200 = allow, 403 = deny**, default-deny. Speaks the raw status contract (not the JSON envelope) because Envoy enforces on HTTP status.

### `go/recoder-xds/` — Go Envoy xDS control plane
```
go/recoder-xds/
├── go.mod                    # go 1.24 · go-control-plane v0.14.0 · .../envoy v1.36.0 · grpc v1.75.1
├── cmd/recoder-xds/
│   ├── main.go               # entry: load NetworkConfig, build snapshot, serve ADS gRPC (default :18000)
│   └── readiness.go
└── internal/
    ├── config/network_config.go        (+ _test.go — 6 test funcs)
    ├── server/server.go                (+ _test.go — 2 test funcs)
    └── snapshot/builder.go             (+ _test.go — 5 test funcs)
```
**Real counts:** **13 Go test functions** across 3 `_test.go` files; `go build ./...` exits 0; `go test ./...` passes (`internal/config`, `internal/server`, `internal/snapshot` all `ok`).

### `deploy/envoy/`
```
deploy/envoy/
├── envoy.selfhost.yaml       # self-host bootstrap (static)
└── envoy.xds.yaml            # DYNAMIC bootstrap: consumes LDS/CDS/RDS over ADS gRPC from recoder-xds,
                              # with a static recoder_http_fallback listener (:8080) if recoder-xds is down
```

## 5. Module responsibilities

### 5.1 `envoy-config.ts` — bootstrap generation
`generateEnvoyConfig(config: NetworkConfig)` returns an `EnvoyBootstrap` (plain object) that
`emitYaml`/`emitJson` serialize for `envoy -c`. It emits real mTLS transport sockets (downstream +
upstream `DownstreamTlsContext`/`UpstreamTlsContext` with `tls_certificates` from `config.tls.certPath`/
`keyPath`), the `ext_authz` HTTP filter, and a **JSON access-log format** (`ACCESS_LOG_JSON_FORMAT`)
shaped so the XDR parser can consume it. `defaultNetworkConfig(...)` derives config from env.

### 5.2 `ext-authz.ts` — the default-deny decision
`decideNetworkAuthz(...)` is **synchronous, pure, and hostile-by-default**: any unconfigured request,
any error, and any non-`allow` policy verdict yields **DENY (403)**. An unverified caller (no mTLS
principal) is only permitted onto explicitly-public path prefixes; everything else is denied. The actual
intent verdict is delegated to an injected `PolicyAdvisorPort` (the governance policy engine). The
decision carries a `decisionId` for the audit trail. `ALLOW = 200`, `DENY = 403` to match Envoy's
status-based enforcement.

### 5.3 `xdr/` — access-log → detections → Merkle audit
- `parser.ts`: `parseAccessLog` turns an Envoy JSON access-log line into a normalized security event.
- `detections.ts`: `detect()` applies **4 windowed, per-source-IP rules**:
  - `authz_denial_burst` — N+ ext_authz denials (403 / `UAEX` flag) from one IP.
  - `repeated_auth_failure` — N+ 401/403 responses from one IP (auth churn).
  - `denied_egress` — N+ "no route" / no-cluster denials from one IP.
  - `anomalous_rate` — N+ total requests from one IP within the window.
- `sink.ts`: `XdrSink` records each detection through an `AuditSinkPort`. In production that port is the
  **real `@recoder/governance` audit store**; every sealed detection advances the **Merkle tip**, so the
  detection feed is tamper-evident. The sink reports the audit tip after each batch.

### 5.4 `ports.ts` — the governance seams
The pure core depends only on two interfaces: `PolicyAdvisorPort` (ask governance whether a request is
allowed) and `AuditSinkPort` (seal a detection into the Merkle chain). This keeps `@recoder/network`
free of a hard dependency on governance internals — the concrete implementations are injected by the
adopting service (`docker-backend/src/network/governance-ports.ts`, `xdr-sink.ts`). This matches the
monorepo rule: do not couple core packages to specific runtimes/services.

### 5.5 `go/recoder-xds` — dynamic config delivery
Loads a `NetworkConfig` (JSON file, the docker-backend network endpoint, or env-derived defaults),
builds a consistent xDS snapshot, and serves it over **ADS gRPC** (default `:18000`, `XDS_LISTEN_ADDR`)
so a running Envoy receives live **LDS/CDS/RDS** updates. `deploy/envoy/envoy.xds.yaml` is the Envoy
bootstrap that consumes this control plane (with a static fallback listener if the control plane is down).

## 6. Public API (real exports)

From `packages/network/src/index.ts` (verified barrel):

```ts
// envoy-config.ts
export function generateEnvoyConfig(config: NetworkConfig): EnvoyBootstrap;
export function emitYaml(bootstrap: EnvoyBootstrap): string;
export function emitJson(bootstrap: EnvoyBootstrap): string;
export function defaultNetworkConfig(/* env-derived */): NetworkConfig;

// ext-authz.ts
export function decideNetworkAuthz(/* req + ctx + PolicyAdvisorPort */): NetworkAuthzDecision; // default-deny
export function extractAuthzRequest(/* Envoy ext_authz payload */): /* normalized request */;
export const DECISION_HEADER: string;

// xdr/
export function parseAccessLog(line: string): /* SecurityEvent */;
export function detect(/* events + window */): /* Detection[] (4 rule types) */;
export class XdrSink /* record(detection) → AuditSinkPort, returns Merkle tip */;

// ports.ts
export interface PolicyAdvisorPort { /* verdict for a request */ }
export interface AuditSinkPort { /* seal a detection (Merkle) */ }
```

## 7. Seams to other subsystems

| Seam | Port | Bound to | Direction |
|---|---|---|---|
| Intent authorization | `PolicyAdvisorPort` | `@recoder/governance` (via `docker-backend/src/network/governance-ports.ts`) | network → governance (ask) |
| Tamper-evident audit | `AuditSinkPort` | `@recoder/governance` Merkle audit store (via `xdr-sink.ts`) | network → governance |
| Principal/context | (request mTLS identity + headers) | resolved at the proxy edge | inbound |
| Dynamic config | ADS gRPC | `go/recoder-xds` → Envoy | network → Envoy |

`@recoder/network`'s declared deps are `@recoder/agent-os` and `@recoder/governance` (workspace).

## 8. Config & security

- **Default-deny everywhere**: unconfigured ⇒ deny; error ⇒ deny; non-`allow` verdict ⇒ deny; no mTLS principal on a non-public path ⇒ deny.
- **mTLS** transport sockets are emitted in the bootstrap (downstream + upstream), with cert/key paths sourced from config — **no certs are hardcoded** in the package.
- **Tamper-evident audit**: every XDR detection is sealed into the governance Merkle chain; `/api/network/health` reports whether the chain is intact.
- **No secrets in the package**: the pure core has no credentials; concrete governance wiring and any keys live in the adopting service.

## 9. Gaps / not-yet-live (honest)

These are **explicitly not done** and must not be claimed as complete:

1. **Live Envoy proxy run is NOT done (infra-gated).** The bootstrap (`generateEnvoyConfig`) and the
   `deploy/envoy/*.yaml` files are real and the xDS snapshot is real and tested — but **booting a real
   Envoy process against the generated config with real mTLS certificate material, and proving an
   end-to-end allow/deny through a running governance `ext_authz` endpoint, requires ops + credentials
   and has not been executed.** No live-proxy evidence exists in-repo.
2. **Real mTLS certificates are not provisioned.** The TLS config references cert/key *paths*; the
   actual certificate issuance/rotation pipeline is out of scope of the package and not wired live.
3. **The `go/recoder-xds` ↔ live Envoy ADS handshake is unit-tested, not field-verified.** `go build`/
   `go test` pass and the snapshot builder is tested, but a live Envoy actually consuming LDS/CDS/RDS
   from `recoder-xds` end-to-end has not been demonstrated with captured evidence.
4. **The OpenZiti dark-overlay is deferred (infra-gated), not built** — see §10.

Per AGENTS.md / production rules: these are environment/ops-gated steps. They are recorded as gaps with
no success implied.

## 10. Appendix: deferred OpenZiti dark-overlay design (NOT built)

An earlier design targeted an **OpenZiti** dark-overlay (no-inbound-port, default-deny mesh) for
cross-machine / cross-org agent reachability. **This is a deferred future option, not the shipped
subsystem.** What exists in-repo today for it:

- `go/ziti/` — vendored OpenZiti tree (present, owned, but not the active network realization).
- `docker-backend/src/ziti-client.ts` — a thin Edge-Mgmt REST client (legacy; `zitiHealth`, identity provisioning) still wired to `/api/ziti/*` routes in `server.ts` (5 references).

The full TypeScript control-plane SDK design (a `packages/network` modeled on the ziti controller —
identities, services, grants, policy compilation, federation, reconciler) described in earlier drafts of
this doc was **never implemented**; `packages/network` is instead the Envoy package documented above.
The ziti design is retained here only as the deferred dark-overlay option: Envoy is the deployable L7
choice that ships on standard infra now, while a no-inbound-port ziti mesh remains a future direction
gated on overlay rollout, PKI, and ops.

## 11. Verification

```bash
# Pure package (the network subsystem core) — 31/31 tests
pnpm -F @recoder/network test          # vitest run → 3 files, 31 tests
pnpm -F @recoder/network check-types

# Backend adoption adapter — 5 tests
#   docker-backend/src/network/adapter.test.ts

# Go xDS control plane — builds + 13 test funcs
go -C go/recoder-xds build ./...       # exit 0
go -C go/recoder-xds test ./...        # config/server/snapshot all ok
```

Acceptance: no false success. The package, adapter, and xDS control plane are tested and build clean. A
**live Envoy proxy boot with real mTLS** is an explicit infra-gated gap (§9) and must be reported as
environment evidence, not product success, until executed.
