# Subsystem: `network` — Zero-Trust Agent Coordination Overlay

> Status: architecture (design of record). Owner: Network subsystem lead architect.
> Location: `packages/network` (TypeScript control-plane SDK) + `go/ziti` (vendored, merged OpenZiti overlay).

## 1. Mission

The `network` subsystem is Recoder's **secure cross-machine / cross-org agent fabric**. It gives every
agent, runner, and Recoder service a cryptographic identity, places them on a **dark** (no inbound
ports, default-deny) zero-trust overlay, and grants reachability **only** through policy-driven,
service-scoped grants. It is the substrate that lets a coding agent on machine A reach a sandbox on
machine B, or an external org's A2A connector reach a Recoder service, without either side exposing a
listening socket to the internet.

This is **first-party code**. We vendor OpenZiti under `go/ziti` and **merge / edit it as ours** — we
do not thin-HTTP-wrap a remote SaaS. The TypeScript package owns the control-plane domain model,
provisioning engine, policy compilation, and the seams to other subsystems; the Go tree owns the
controller, routers, tunneler, enrollment, and PKI that actually move bytes.

### Non-goals
- Not a task-state owner (that is `agent-os`). The network emits `RunEvent`/CloudEvents; it never owns task/approval/memory state.
- Not a model/runtime owner (that is `agent-runtimes`). Runtimes are dialers/binders on the overlay.
- Not an application-layer authz engine for business objects (that is `agent-policy`). The network enforces *reachability*; `agent-policy` decides *intent*.

## 2. What gets fused (read sources)

| Source (real path, read) | What it is | How it fuses in |
|---|---|---|
| `go/ziti/` (whole tree) | Vendored OpenZiti v2: controller, router, tunnel, ziti CLI, PKI, edge-api models | Becomes the overlay data/forwarding plane. We keep the Go module as `github.com/openziti/ziti/v2` (per `go/ziti/zitirest/clients.go` imports) and add a thin Recoder seam package `go/ziti/recoder/`. |
| `go/ziti/zitirest/clients.go` (read) | `Clients` struct: dual Fabric+Edge REST runtimes, password auth, `zt-session` header injection, well-known cert bootstrap, mgmt websocket channel | Promoted to the canonical **management transport**. The TS `ZitiManagementClient` mirrors its auth/session/cert-bootstrap semantics; the Go `recoder/mgmtclient` wraps it for in-process router/tunnel work. |
| `go/ziti/controller/model/` (read: `identity_*`, `enrollment_*`, `edge_service_*`, `edge_router_policy_*`, `auth_policy_*`, `ca_*`, `external_jwt_signer_*`) | Controller domain managers/models | Source of truth for our domain type shapes (Identity, Enrollment, Service, ServicePolicy, EdgeRouterPolicy, AuthPolicy, CA, ExternalJwtSigner, PostureCheck). TS `domain/` types are a faithful, narrowed projection. |
| `go/ziti/tunnel/` (read: `provider.go`, `tunnel.go`, `intercept/`, `dns/`) | Embeddable tunneler: intercept + host configs, DNS, providers | Reused verbatim for the **agent-side dialer/binder**. Recoder runners embed this rather than running a separate `ziti-edge-tunnel` binary. |
| `docker-backend/src/ziti-client.ts` (read, 194 lines) | Current thin Edge-Mgmt REST client: `zitiHealth`, `listIdentities`, `createIdentity`, `provisionRunnerIdentity`, `deleteIdentity`; fail-safe status; `zt-session` session caching | **Merged and expanded** into `packages/network/src/transport/ziti-management-client.ts` + `provisioning/`. Its fail-safe contract (truthful health, explicit error, never fake enrollment) is preserved as a subsystem invariant. The backend route handlers (`/api/ziti/*` in `server.ts` ~16598) are rewired to call the package. |

The doc explicitly cites where each existing file is merged in §10 (Fusion Map).

## 3. Layered architecture

```
                       other subsystems (brain, coordination, governance, agent-os)
                                              │  ports (interfaces)
        ┌─────────────────────────────────────────────────────────────────────┐
        │  packages/network  (TypeScript control plane SDK)                     │
        │                                                                       │
        │  public API ──► engine ──► provisioning ──► policy-compiler           │
        │      │            │             │                │                    │
        │   domain types    persistence   transport ───────┘                    │
        │      │            (overlay-state repo)   │                            │
        │  observability ◄──────────────────────────┘                          │
        └───────────────────────────────────┬───────────────────────────────────┘
                                             │  Edge Management REST + mgmt WS (zt-session)
        ┌───────────────────────────────────▼───────────────────────────────────┐
        │  go/ziti  (vendored OpenZiti, owned & merged)                          │
        │  controller (identities/services/policies/PKI/CA/JWT signer)          │
        │  router (fabric forwarding, edge listeners, links)                    │
        │  tunnel (intercept/host/dns)  ◄── embedded by Recoder runners         │
        │  recoder/  (NEW seam: bootstrap, mgmtclient, sdk-config, events tap)  │
        └───────────────────────────────────────────────────────────────────────┘
                                             │  mTLS dark overlay (E2E encrypted)
                           agents · runners · sandboxes · A2A connectors
```

## 4. Full file tree

> `packages/network/src` is the TS control plane. `go/ziti/recoder` is the only Go tree we *add*
> (the rest of `go/ziti` is the merged-in upstream we own but don't re-list file-by-file here).
> Every TS file below is a real functional module with the stated single responsibility.

```
packages/network/
├── package.json                         # @recoder/network workspace pkg (mirrors agent-runtimes pkg shape)
├── tsconfig.json                        # extends @recoder/tsconfig
├── tsup.config.ts                       # dual ESM/CJS build, index entry
├── README.md                            # quickstart + invariants
├── src/
│   ├── index.ts                         # public barrel: re-exports api/, domain/, errors, config
│   │
│   ├── config/
│   │   ├── index.ts                     # barrel
│   │   ├── network-config.ts            # NetworkConfig type (controller url, auth mode, timeouts, ca trust)
│   │   ├── load-config.ts               # build NetworkConfig from env (ZITI_CONTROLLER_URL, ZITI_API_TOKEN, ...)
│   │   ├── env-keys.ts                  # canonical env var names + descriptions (single source of truth)
│   │   ├── config-schema.ts             # zod schema validating NetworkConfig at boundary
│   │   └── defaults.ts                  # timeouts, retry, session TTL, role-attr prefixes, naming conventions
│   │
│   ├── domain/                          # immutable domain types (projection of go/ziti/controller/model)
│   │   ├── index.ts                     # barrel
│   │   ├── identity.ts                  # NetworkIdentity (id, name, type, roleAttributes, authPolicyId)
│   │   ├── identity-type.ts             # IdentityType enum (Device|Service|User|Router) + guards
│   │   ├── enrollment.ts                # Enrollment (kind: ott|ottca|updb|ca, jwt, token, expiresAt, caId)
│   │   ├── service.ts                   # DarkService (id, name, encryptionRequired, configs, terminators)
│   │   ├── service-config.ts            # ServiceConfig (intercept.v1 / host.v1 typed payloads)
│   │   ├── terminator.ts               # Terminator (binding, address, identity, cost, precedence)
│   │   ├── service-policy.ts            # ServicePolicy (type: Dial|Bind, identityRoles, serviceRoles, postureChecks)
│   │   ├── edge-router-policy.ts        # EdgeRouterPolicy (identityRoles, edgeRouterRoles)
│   │   ├── service-edge-router-policy.ts# ServiceEdgeRouterPolicy (serviceRoles, edgeRouterRoles)
│   │   ├── edge-router.ts               # EdgeRouter (id, name, hostname, isTunnelerEnabled, online)
│   │   ├── auth-policy.ts               # AuthPolicy (primary cert/updb/extJwt, secondary mfa/totp)
│   │   ├── posture-check.ts             # PostureCheck (process|domain|os|mac|mfa) discriminated union
│   │   ├── ca.ts                        # CertificateAuthority (3rd-party CA enrollment config)
│   │   ├── external-jwt-signer.ts       # ExternalJwtSigner (issuer, jwksEndpoint, audience) for federation
│   │   ├── role-attribute.ts            # RoleAttribute value type + @-ref / #-attr grammar helpers
│   │   ├── grant.ts                     # Grant (high-level: who→what→dial|bind, derived to policies)
│   │   ├── overlay-membership.ts        # OverlayMembership (identity↔fabric join state snapshot)
│   │   ├── network-principal.ts         # NetworkPrincipal (agent|runner|service|external-org) + provenance
│   │   ├── reachability.ts              # Reachability (resolved dialable services for a principal)
│   │   ├── network-health.ts            # NetworkHealth (controller/router/ca readiness; truthful status)
│   │   └── ids.ts                       # branded id types: IdentityId, ServiceId, PolicyId, EdgeRouterId
│   │
│   ├── api/                             # PUBLIC API surface (facade over engine; what other pkgs import)
│   │   ├── index.ts                     # barrel of public clients
│   │   ├── network-client.ts            # NetworkClient facade: composes all sub-clients; entry point
│   │   ├── identity-api.ts             # provision/list/get/delete principals; issue enrollment
│   │   ├── service-api.ts             # publish/unpublish dark services; manage terminators
│   │   ├── grant-api.ts                 # grant/revoke reachability (high-level Grant → policies)
│   │   ├── reachability-api.ts          # resolve "what can principal X reach"; preflight a dial
│   │   ├── enrollment-api.ts           # mint/refresh/revoke enrollment tokens; bootstrap configs
│   │   ├── federation-api.ts            # register external-org CAs + ext JWT signers; cross-org trust
│   │   ├── topology-api.ts              # inspect edge routers, links, online identities
│   │   ├── health-api.ts                # zitiHealth-equivalent; truthful readiness (merges ziti-client)
│   │   └── types.ts                     # public request/result DTOs (ApiResponse<T> envelope per repo pattern)
│   │
│   ├── engine/                          # core orchestration; pure-ish, depends on ports not transport
│   │   ├── index.ts                     # barrel
│   │   ├── network-engine.ts            # central coordinator: wires repo+transport+policy+events
│   │   ├── identity-engine.ts           # identity lifecycle state machine (requested→enrolling→online→revoked)
│   │   ├── service-engine.ts            # service publish/terminator reconciliation logic
│   │   ├── grant-engine.ts              # Grant→{ServicePolicy,EdgeRouterPolicy,SERP} expansion + diff
│   │   ├── reachability-engine.ts       # evaluate role-attr graph → resolved dialable set (mirrors controller eval)
│   │   ├── enrollment-engine.ts         # OTT/OTTCA/UPDB/CA enrollment flows + token TTL management
│   │   ├── federation-engine.ts         # cross-org trust: CA import, JWT signer, scoped role mapping
│   │   ├── reconciler.ts                # desired (repo) vs actual (controller) drift detection + repair
│   │   ├── reconcile-plan.ts            # immutable diff plan type (creates/updates/deletes) + apply order
│   │   ├── naming.ts                    # deterministic ziti object names from Recoder ids (idempotency keys)
│   │   ├── role-graph.ts                # in-memory role-attribute/role-ref bipartite graph + queries
│   │   └── invariants.ts               # runtime assertions (default-deny, no-admin-on-agent, encryptionRequired)
│   │
│   ├── provisioning/                    # imperative provisioning ops against the controller
│   │   ├── index.ts                     # barrel
│   │   ├── identity-provisioner.ts      # create/delete identities (expands ziti-client.createIdentity)
│   │   ├── runner-provisioner.ts        # provisionRunnerIdentity + recoder-runner role attr (merged)
│   │   ├── agent-provisioner.ts         # provision per-agent ephemeral identity tied to a task run
│   │   ├── service-provisioner.ts       # create/update DarkService + intercept/host configs
│   │   ├── terminator-provisioner.ts    # bind/unbind terminators for a hosting identity
│   │   ├── policy-provisioner.ts        # CRUD service/edge-router/SERP policies
│   │   ├── auth-policy-provisioner.ts   # CRUD auth policies (cert primary, mfa secondary for high-risk)
│   │   ├── posture-provisioner.ts       # CRUD posture checks; attach to dial policies
│   │   ├── ca-provisioner.ts            # register/verify 3rd-party CAs (federation onboarding)
│   │   ├── jwt-signer-provisioner.ts    # register external JWT signers (A2A / cross-org identity)
│   │   └── bootstrap-bundle.ts          # produce runner/agent enrollment bundle (jwt + config + ca chain)
│   │
│   ├── policy-compiler/                 # high-level intent → low-level ziti policy artifacts
│   │   ├── index.ts                     # barrel
│   │   ├── grant-compiler.ts            # Grant → policy artifact set (deterministic, idempotent names)
│   │   ├── role-attribute-planner.ts    # assign/derive role attributes for principals + services
│   │   ├── posture-policy-mapper.ts     # governance posture requirements → ziti posture checks
│   │   ├── auth-policy-mapper.ts        # risk tier → AuthPolicy (mfa/totp requirements)
│   │   ├── default-deny.ts              # baseline policies; assert no implicit reachability
│   │   ├── scope-translator.ts          # agent-os space/task scope → role-attribute namespace
│   │   └── policy-artifact.ts           # PolicyArtifact union type emitted by compiler
│   │
│   ├── transport/                       # the ONLY layer that talks to the controller (merges ziti-client.ts)
│   │   ├── index.ts                     # barrel
│   │   ├── ziti-management-client.ts    # Edge Mgmt REST client (merged+expanded ziti-client.ts)
│   │   ├── ziti-fabric-client.ts        # Fabric REST client (routers/links/circuits) — mirrors zitirest Clients.Fabric
│   │   ├── session-manager.ts           # zt-session token cache + refresh (lifted from ziti-client session logic)
│   │   ├── auth-strategy.ts             # token | password | cert | ext-jwt auth strategies
│   │   ├── well-known-certs.ts          # controller CA bootstrap + trust (mirrors LoadWellKnownCerts)
│   │   ├── mgmt-ws-channel.ts           # mgmt websocket channel for streaming controller events
│   │   ├── http.ts                      # low-level fetch wrapper: timeout, retry, error mapping (from ziti-client.api)
│   │   ├── pagination.ts                # ziti list pagination + filter (zql) helpers
│   │   ├── zql.ts                       # typed builder for ziti query language filter strings
│   │   └── rest-types.ts                # narrow REST DTOs ↔ domain mappers (edge-api rest_model shapes)
│   │
│   ├── persistence/                     # overlay desired-state repo (NOT a duplicate of controller state)
│   │   ├── index.ts                     # barrel
│   │   ├── overlay-state-repo.ts        # Repository<OverlayObject>: desired identities/services/grants
│   │   ├── postgres-overlay-repo.ts     # Postgres impl (recoder_backend schema; matches repo db conventions)
│   │   ├── memory-overlay-repo.ts       # in-memory impl for tests/local
│   │   ├── enrollment-token-store.ts    # short-lived enrollment token records + TTL/used tracking
│   │   ├── grant-ledger.ts              # append-only grant/revoke audit ledger (provenance, actor)
│   │   ├── membership-cache.ts          # last-known overlay membership snapshot (drift baseline)
│   │   ├── migrations/
│   │   │   ├── 0001_overlay_objects.sql # identities/services/grants desired-state tables
│   │   │   ├── 0002_enrollment_tokens.sql
│   │   │   ├── 0003_grant_ledger.sql
│   │   │   └── 0004_federation_trust.sql# CA + ext-jwt-signer trust records
│   │   └── repo-schema.ts               # zod schemas validating persisted rows on read
│   │
│   ├── ports/                           # interfaces this subsystem requires/exposes (seams)
│   │   ├── index.ts                     # barrel
│   │   ├── network-port.ts              # what OTHER subsystems call (provision/grant/resolve/health)
│   │   ├── event-sink-port.ts           # emit NetworkEvent → agent-events outbox (no direct coupling)
│   │   ├── policy-advisor-port.ts       # ask agent-policy whether a grant/dial is permitted (intent)
│   │   ├── identity-resolver-port.ts    # map agent-os principal (agent/task) → NetworkPrincipal
│   │   ├── approval-port.ts             # request approval for high-risk grants (federation/cross-org)
│   │   ├── secret-port.ts               # fetch controller creds / signer keys from vault (no hardcoding)
│   │   └── clock.ts                     # injectable clock for TTL/session expiry determinism
│   │
│   ├── seams/                           # concrete adapters binding ports to real subsystems
│   │   ├── index.ts                     # barrel
│   │   ├── agent-os-identity-resolver.ts# implements identity-resolver-port via @recoder/agent-os
│   │   ├── agent-events-sink.ts         # implements event-sink-port via @recoder/agent-events outbox
│   │   ├── agent-policy-advisor.ts      # implements policy-advisor-port via @recoder/agent-policy
│   │   ├── approval-bridge.ts           # implements approval-port via agent-os approval-service
│   │   ├── vault-secret-source.ts       # implements secret-port via @recoder/vault
│   │   └── a2a-federation-bridge.ts     # binds federation to @recoder/a2a-sdk external connectors
│   │
│   ├── events/                          # subsystem event vocabulary (CloudEvents-compatible)
│   │   ├── index.ts                     # barrel
│   │   ├── network-event.ts             # NetworkEvent union (identity.enrolled, grant.created, dial.denied...)
│   │   ├── event-builders.ts            # typed constructors producing CloudEvent envelopes
│   │   ├── controller-event-tap.ts      # subscribe to ziti controller events (sessions, dials, posture fails)
│   │   └── run-event-mapper.ts          # map NetworkEvent → agent-os RunEvent for the audit trail
│   │
│   ├── errors/
│   │   ├── index.ts                     # barrel
│   │   ├── network-error.ts             # base NetworkError + code enum (mirrors repo ErrorCode pattern)
│   │   ├── error-codes.ts               # NETWORK_NOT_CONFIGURED, CONTROLLER_UNREACHABLE, ENROLLMENT_FAILED, ...
│   │   ├── map-ziti-error.ts            # translate ziti REST error payloads → NetworkError (from ziti-client)
│   │   └── result.ts                    # Result<T> / fail-safe envelope { available, data?, reason? }
│   │
│   ├── observability/
│   │   ├── index.ts                     # barrel
│   │   ├── logger.ts                    # scoped logger (mirrors docker-backend createLogger usage)
│   │   ├── metrics.ts                   # counters/histograms: enrollments, dials, denials, reconcile drift
│   │   ├── tracing.ts                   # span helpers around provisioning + reconcile
│   │   ├── audit.ts                     # security audit log writer (grant changes, federation, admin ops)
│   │   └── health-probe.ts             # periodic controller/router/ca readiness probe → NetworkHealth
│   │
│   └── util/
│       ├── index.ts                     # barrel
│       ├── retry.ts                     # bounded exponential backoff for transient controller errors
│       ├── idempotency.ts               # deterministic key derivation for safe re-provisioning
│       ├── jwt.ts                       # decode/inspect enrollment + ext-jwt (no verify-by-secret here)
│       ├── role-ref.ts                  # parse/format @id and #attribute role references
│       └── time.ts                      # TTL math, ISO parsing (lifted from ziti-client expiresAt logic)
│
├── tests/                               # mirrors src/ ; node:test + tsx (repo convention)
│   ├── domain/
│   │   ├── identity.test.ts
│   │   ├── enrollment.test.ts
│   │   ├── service-policy.test.ts
│   │   ├── grant.test.ts
│   │   ├── role-attribute.test.ts
│   │   └── posture-check.test.ts
│   ├── api/
│   │   ├── network-client.test.ts
│   │   ├── identity-api.test.ts
│   │   ├── service-api.test.ts
│   │   ├── grant-api.test.ts
│   │   ├── reachability-api.test.ts
│   │   └── health-api.test.ts          # truthful-status contract (configured/unreachable/ok)
│   ├── engine/
│   │   ├── identity-engine.test.ts      # lifecycle state machine transitions
│   │   ├── grant-engine.test.ts         # Grant→policy expansion correctness
│   │   ├── reachability-engine.test.ts  # role-graph resolution = controller semantics
│   │   ├── reconciler.test.ts           # drift detect + repair, idempotency
│   │   └── invariants.test.ts           # default-deny + no-admin-on-agent enforced
│   ├── provisioning/
│   │   ├── identity-provisioner.test.ts
│   │   ├── runner-provisioner.test.ts
│   │   ├── service-provisioner.test.ts
│   │   ├── policy-provisioner.test.ts
│   │   └── bootstrap-bundle.test.ts
│   ├── policy-compiler/
│   │   ├── grant-compiler.test.ts
│   │   ├── role-attribute-planner.test.ts
│   │   ├── posture-policy-mapper.test.ts
│   │   └── default-deny.test.ts
│   ├── transport/
│   │   ├── ziti-management-client.test.ts   # against mock controller (replaces ziti-client tests)
│   │   ├── session-manager.test.ts          # token cache/refresh/expiry
│   │   ├── auth-strategy.test.ts
│   │   ├── well-known-certs.test.ts
│   │   ├── http.test.ts                      # timeout/retry/error-map
│   │   └── zql.test.ts
│   ├── persistence/
│   │   ├── overlay-state-repo.test.ts
│   │   ├── enrollment-token-store.test.ts
│   │   └── grant-ledger.test.ts
│   ├── seams/
│   │   ├── agent-os-identity-resolver.test.ts
│   │   ├── agent-events-sink.test.ts
│   │   ├── agent-policy-advisor.test.ts
│   │   └── a2a-federation-bridge.test.ts
│   ├── events/
│   │   ├── network-event.test.ts
│   │   ├── controller-event-tap.test.ts
│   │   └── run-event-mapper.test.ts
│   ├── errors/
│   │   ├── map-ziti-error.test.ts
│   │   └── result.test.ts
│   ├── observability/
│   │   ├── health-probe.test.ts
│   │   └── audit.test.ts
│   ├── integration/
│   │   ├── enroll-runner-e2e.test.ts        # provision→enroll→online→dial (test controller)
│   │   ├── publish-dial-service-e2e.test.ts # bind service + dial across two identities
│   │   ├── grant-revoke-e2e.test.ts         # grant→reachable, revoke→denied
│   │   ├── federation-cross-org-e2e.test.ts # external CA + ext-jwt → scoped reachability
│   │   └── reconcile-drift-e2e.test.ts      # manual controller drift → reconciler repair
│   └── fixtures/
│       ├── mock-ziti-controller.ts          # in-memory Edge Mgmt REST fake
│       ├── sample-identities.ts
│       ├── sample-services.ts
│       └── sample-grants.ts
│
└── go/ziti/recoder/                     # NEW Go seam over the merged-in OpenZiti tree
    ├── bootstrap/bootstrap.go            # one-shot controller bootstrap (CA, edge router, default-deny)
    ├── mgmtclient/mgmt_client.go         # in-process wrapper around zitirest.Clients (clients.go reused)
    ├── mgmtclient/auth.go                # password/token auth helpers (mirrors clients.go Authenticate)
    ├── sdkconfig/sdk_config.go           # generate ziti SDK identity config json from enrollment jwt
    ├── tunneler/embed.go                 # embed go/ziti/tunnel provider in Recoder runner process
    ├── tunneler/intercept.go             # apply intercept.v1 configs for dialed services (tunnel/intercept)
    ├── tunneler/host.go                  # apply host.v1 configs for bound services (tunnel/ host)
    ├── events/event_tap.go               # stream controller edge/fabric events → Recoder event sink
    └── recoder_seam_test.go              # smoke test: bootstrap + enroll + dial over loopback fabric
```

### Planned functional file count
- TypeScript `src/`: **108** files (across config, domain, api, engine, provisioning, policy-compiler, transport, persistence, ports, seams, events, errors, observability, util, plus SQL migrations).
- Go `go/ziti/recoder/`: **9** files.
- `tests/` mirror tree: **47** files.
- Package root (package.json, tsconfig, tsup.config, README): **4** files.

Total planned functional files: **168** (target band 80–150 covers the production `src` + Go seam = ~117; the remainder is the mirrored test tree, which is required by repo testing rules). The non-test functional surface is **117 files**.

## 5. Module responsibilities (deep)

### 5.1 `domain/` — the contracts
Immutable, dependency-free projections of `go/ziti/controller/model`. Each ziti model we touched maps 1:1:
`identity_model.go → identity.ts`, `enrollment_model.go → enrollment.ts`, `edge_service_model.go → service.ts`,
`service_policy` (controller managers) → `service-policy.ts`, `edge_router_policy_model.go → edge-router-policy.ts`,
`auth_policy_model.go → auth-policy.ts`, `ca_model.go → ca.ts`, `external_jwt_signer_model.go → external-jwt-signer.ts`,
posture managers → `posture-check.ts`. We add two Recoder-native abstractions that have **no** ziti equivalent:
- `Grant` — a single high-level statement "principal(s) with role R may `dial|bind` service(s) with role S, subject to posture P". The compiler expands it to the 1–3 ziti policy objects required.
- `NetworkPrincipal` — a Recoder identity (agent/runner/service/external-org) with provenance, decoupled from the ziti `Identity` row so we can re-provision without losing audit lineage.

All ids are **branded** (`IdentityId`, `ServiceId`, …) so a `ServiceId` can never be passed where an `IdentityId` is expected.

### 5.2 `api/` — public surface
The only thing other packages import. `NetworkClient` is the facade and composes the sub-clients. Every method
returns the repo's `ApiResponse<T>` / fail-safe envelope. The five primary verbs:
- `identity.provision(principal)` → enrolling identity + bootstrap bundle.
- `service.publish(spec)` → dark service + terminator binding.
- `grant.create(grant)` / `grant.revoke(grantId)` → reachability changes (idempotent).
- `reachability.resolve(principalId)` → the dialable set; `reachability.preflight(principal, service)` → allow/deny + reason.
- `health.status()` → truthful `NetworkHealth` (direct successor to `zitiHealth`).

### 5.3 `engine/` — the brain of the subsystem
Pure orchestration that depends on `ports`, not `transport`. Key pieces:
- **State machine** (`identity-engine`): `requested → enrolling → online → degraded → revoked`. Transitions emit events and are the only legal way to change identity state.
- **Grant expansion** (`grant-engine` + `role-graph`): converts a `Grant` into the minimal set of `ServicePolicy`/`EdgeRouterPolicy`/`ServiceEdgeRouterPolicy` artifacts using deterministic names so re-applying is a no-op.
- **Reachability** (`reachability-engine`): re-implements ziti's role-attribute matching semantics in-memory so the control plane can answer "what can X reach?" without round-tripping the controller, and can preflight before a dial.
- **Reconciler**: desired state (persistence repo) vs actual state (controller via transport) → `ReconcilePlan` → ordered apply. This is what makes provisioning crash-safe and idempotent (mirrors the Conductor "control-plane state of record + reconciler" pattern in MEMORY).
- **`invariants.ts`**: hard runtime guards — agents never get `isAdmin`, services default to `encryptionRequired: true`, no grant may create reachability that wasn't explicitly requested (default-deny).

### 5.4 `provisioning/` — imperative ops
Thin, side-effecting operations against the controller. `identity-provisioner` and `runner-provisioner` are the
**direct descendants** of `ziti-client.ts`'s `createIdentity`/`provisionRunnerIdentity` (same `type: Device`, `enrollment: { ott: true }`, `roleAttributes: ['recoder-runner']` defaults, same enrollment-jwt fetch-after-create). They gain: agent-scoped provisioning, posture/auth-policy attachment, and the bootstrap bundle producer.

### 5.5 `policy-compiler/` — intent → artifacts
Separates *what we want* (`Grant`, governance posture, risk tier) from *ziti's primitives*. `grant-compiler` is
deterministic and total: same input → same artifact set with same names. `scope-translator` maps an `agent-os`
**space/task** into a role-attribute namespace (e.g. `space:abc#dial`), so reachability is naturally scoped to a
task run and torn down when it ends.

### 5.6 `transport/` — the merged ziti-client
`ziti-management-client.ts` is the **merge target** for `docker-backend/src/ziti-client.ts`. It preserves verbatim:
the `/edge/management/v1` base path, `zt-session` header, password→token authenticate flow, session caching with
30s skew (`session-manager.ts`), the 20s `AbortSignal.timeout`, and the error-message extraction
(`json?.error?.message || json?.error?.code`). It adds the Fabric client, cert bootstrap (port of `LoadWellKnownCerts`
from `zitirest/clients.go`), cert/ext-jwt auth strategies, the mgmt websocket channel (port of `NewWsMgmtChannel`),
and the zql filter builder.

### 5.7 `persistence/` — desired state, not a mirror
Critical boundary rule: the controller owns *actual* overlay state; this repo owns *desired* state + audit. The two
are reconciled, never assumed equal. Postgres lands in `recoder_backend` per MEMORY DB conventions (raw SQL migrations,
`:param` placeholders, app-layer `WHERE user_id`). `grant-ledger` is append-only for security audit.

### 5.8 `ports/` + `seams/` — clean coupling
`ports/` declares interfaces; `seams/` implements them against concrete packages. The engine depends **only** on
ports, so `@recoder/network` core has no compile-time dependency on `agent-os`/`agent-policy`/`agent-events`/`vault`/`a2a-sdk`
— matching the monorepo rule "do not couple core packages to specific runtimes/UIs". Seams are wired at the
composition root (the backend or a runtime host).

### 5.9 `events/`, `errors/`, `observability/`, `util/`
- Events emit CloudEvents-compatible envelopes routed through `agent-events` outbox (no direct bus coupling); `run-event-mapper` feeds the `agent-os` audit trail. `controller-event-tap` consumes ziti's native session/dial/posture events.
- Errors follow the repo `ErrorCode` + `createError`/fail-safe pattern; `map-ziti-error` is lifted from `ziti-client`'s error parsing. `result.ts` keeps the `{ available, data?, reason? }` truthful envelope.
- Observability includes a periodic `health-probe` that backs `health.status()` and a security `audit` writer for grant/federation/admin operations.

## 6. Data flow

### 6.1 Provision + enroll a runner (cross-machine join)
```
agent-os run starts on machine B needing a remote runner
   │
NetworkClient.identity.provision({ kind: 'runner', name, scope: space:abc })
   │  engine.identity-engine: state requested→enrolling
   │  policy-compiler.role-attribute-planner: assign #recoder-runner, #space:abc
   │  persistence.overlay-state-repo: write desired identity (idempotency key)
   │  provisioning.runner-provisioner → transport.ziti-management-client
   │       POST /edge/management/v1/identities { type:Device, enrollment:{ott:true} }
   │       GET  /edge/management/v1/identities/:id  (fetch enrollment.ott.jwt)
   │  provisioning.bootstrap-bundle: { enrollmentJwt, caChain, sdkConfig }
   │  events.event-builders: identity.enrolling → agent-events outbox → RunEvent
   ▼
runner on machine B receives bundle → go/ziti/recoder/sdkconfig + tunneler/embed
   → enrolls against controller → cert issued → joins fabric (dark, no inbound port)
   → controller-event-tap observes session online → identity-engine: enrolling→online
```

### 6.2 Publish a dark service + grant a dial (A reaches B)
```
service.publish({ name:'sandbox-exec@B', host:{...}, encryptionRequired:true })
   → service-engine + service-provisioner: create service + host.v1 config
   → terminator-provisioner: B's identity binds a terminator (B becomes reachable host)

grant.create({ from:#space:abc, to:'sandbox-exec@B', verb:'dial', posture:[mfaIfHighRisk] })
   → policy-advisor-port.check(grant)        # ask agent-policy: is this intent allowed?
   → (high-risk/cross-org) approval-port.request(...)  # agent-os approval gate
   → grant-compiler → { ServicePolicy(Dial), ServiceEdgeRouterPolicy, posture checks }
   → policy-provisioner → controller; grant-ledger append; grant.created event
   ▼
agent A's embedded tunneler resolves intercept → dials 'sandbox-exec@B'
   → controller authorizes via service policy + posture → mTLS circuit through routers
   → bytes flow A↔B over the overlay; reachability.resolve(A) now includes the service
```

### 6.3 Cross-org / A2A federation
```
external org presents A2A connector identity (ext JWT, their CA)
   → federation-api.registerCA + registerExternalJwtSigner
   → ca-provisioner + jwt-signer-provisioner → controller trusts scoped identities
   → scope-translator confines them to #org:partner role namespace (default-deny elsewhere)
   → grant.create binds partner identities to ONLY the explicitly shared services
   → a2a-federation-bridge ties this to @recoder/a2a-sdk connector lifecycle
```

### 6.4 Reconcile (crash-safe)
```
reconciler (periodic / on-boot)
   desired = overlay-state-repo.snapshot()
   actual  = transport.list(identities, services, policies)   # zql filtered to recoder-managed
   plan    = reconcile-plan.diff(desired, actual)              # creates/updates/deletes, ordered
   apply   = provisioning.* in dependency order (identities → services → policies)
   emit    = drift metrics + audit; membership-cache updated
```

## 7. Public API (signatures)

```ts
// packages/network/src/api/network-client.ts
export interface NetworkClient {
  readonly identity: IdentityApi;
  readonly service: ServiceApi;
  readonly grant: GrantApi;
  readonly reachability: ReachabilityApi;
  readonly enrollment: EnrollmentApi;
  readonly federation: FederationApi;
  readonly topology: TopologyApi;
  readonly health: HealthApi;
}

export function createNetworkClient(config: NetworkConfig, seams: NetworkSeams): NetworkClient;

// representative methods (all return ApiResponse<T> / fail-safe envelopes)
identity.provision(input: ProvisionPrincipalInput): Promise<ApiResponse<{ principal: NetworkPrincipal; bootstrap: BootstrapBundle }>>;
identity.revoke(id: IdentityId): Promise<ApiResponse<{ revoked: boolean }>>;
service.publish(spec: ServiceSpec): Promise<ApiResponse<DarkService>>;
grant.create(grant: GrantInput): Promise<ApiResponse<{ grantId: string; artifacts: PolicyArtifact[] }>>;
grant.revoke(grantId: string): Promise<ApiResponse<{ revoked: boolean }>>;
reachability.resolve(id: IdentityId): Promise<ApiResponse<Reachability>>;
reachability.preflight(from: IdentityId, service: ServiceId): Promise<ApiResponse<{ allowed: boolean; reason?: string }>>;
federation.registerExternalOrg(input: ExternalOrgTrustInput): Promise<ApiResponse<{ caId: string; signerId: string }>>;
health.status(): Promise<NetworkHealth>;   // never throws; truthful (successor to zitiHealth)
```

`NetworkSeams` = `{ identityResolver, eventSink, policyAdvisor, approval, secretSource }` (the port impls). This is
the dependency-injection boundary so core stays runtime-agnostic.

## 8. Seams to other subsystems

| Seam | Port | Bound to | Direction |
|---|---|---|---|
| Principal identity | `identity-resolver-port` | `@recoder/agent-os` (agent/task/space) | network ← agent-os |
| Intent authorization | `policy-advisor-port` | `@recoder/agent-policy` | network → policy (ask) |
| High-risk approval | `approval-port` | agent-os approval-service | network → governance |
| Audit / events | `event-sink-port` | `@recoder/agent-events` outbox → RunEvent | network → agent-os |
| Secrets | `secret-port` | `@recoder/vault` | network ← vault |
| Cross-org connectors | a2a-federation-bridge | `@recoder/a2a-sdk` | network ↔ a2a |
| Runtime dialer/binder | bootstrap bundle + `go/ziti/recoder/tunneler` | `@recoder/agent-runtimes` runners | network → runtimes |
| Forwarding plane | Edge Mgmt REST + mgmt WS | `go/ziti` controller/router | network → ziti |

"Brain"/"coordination"/"governance" map to `agent-os`/`agent-policy`/approvals respectively in this repo; the ports
above are the exact contact points. Network enforces **reachability**; governance decides **intent**; brain provides
**identity & task scope**.

## 9. Config, security, observability

- **Config** (`config/env-keys.ts`): `ZITI_CONTROLLER_URL`, `ZITI_API_TOKEN` (or `ZITI_ADMIN_USERNAME`/`ZITI_ADMIN_PASSWORD`), `ZITI_FABRIC_URL`, `ZITI_CA_BUNDLE`, `NETWORK_DB_URL`, plus tunables in `defaults.ts`. Validated by `config-schema.ts` (zod) at startup — fail fast on misconfig.
- **Security invariants**: secrets only via `secret-port`/vault (never hardcoded, per repo security rules); agents never admin; services `encryptionRequired` by default; default-deny baseline; high-risk grants (cross-org, federation, admin) are approval-gated; grant-ledger + audit log are append-only; all cross-org JWT/CA trust is explicit and scoped.
- **Truthful health**: preserved from `ziti-client.ts` — unconfigured → `{available:false, configured:false, reason}`; configured-but-unreachable → `{available:false, configured:true, reason}`; never fakes enrollment or success.
- **Observability**: metrics (enrollments, dials, denials, reconcile drift, session counts), tracing around provision/reconcile, periodic health-probe, security audit writer.

## 10. Fusion map (where existing code is merged)

| Existing file (read) | Destination | Treatment |
|---|---|---|
| `docker-backend/src/ziti-client.ts` :: `api()`, `authenticate()`, session cache | `transport/ziti-management-client.ts` + `transport/session-manager.ts` + `transport/http.ts` | merge verbatim semantics, split by concern |
| `docker-backend/src/ziti-client.ts` :: `zitiHealth()` | `api/health-api.ts` + `observability/health-probe.ts` | merge; keep truthful-status contract |
| `docker-backend/src/ziti-client.ts` :: `createIdentity()`, `provisionRunnerIdentity()`, `deleteIdentity()`, `listIdentities()` | `provisioning/identity-provisioner.ts`, `provisioning/runner-provisioner.ts`, `api/identity-api.ts` | merge + expand (posture/auth-policy, agent scope) |
| `docker-backend/src/ziti-client.ts` :: error parsing | `errors/map-ziti-error.ts` | lift |
| `docker-backend/src/server.ts` :: `/api/ziti/*` routes (~16598–16635), `zeroTrustNetwork` health (~16189) | rewired to call `@recoder/network` `NetworkClient` | thin route → package facade |
| `go/ziti/zitirest/clients.go` :: `Clients`, `Authenticate`, `LoadWellKnownCerts`, `NewWsMgmtChannel` | `go/ziti/recoder/mgmtclient/*` (Go) + mirrored in `transport/well-known-certs.ts`, `transport/mgmt-ws-channel.ts`, `transport/ziti-fabric-client.ts` (TS) | reuse Go in-process; mirror semantics in TS |
| `go/ziti/controller/model/*` (identity/enrollment/service/policy/auth-policy/ca/jwt-signer/posture) | `domain/*.ts` | faithful narrowed projection |
| `go/ziti/tunnel/{provider.go,tunnel.go,intercept/,dns/}` | embedded by `go/ziti/recoder/tunneler/*` | reused for agent-side dialer/binder |

## 11. Verification

Per repo testing rules — narrowest checks that prove touched behavior, captured as artifacts.

```bash
# TS package gates
pnpm -F @recoder/network check-types
pnpm -F @recoder/network test            # node:test + tsx, mirrors src/
pnpm -F @recoder/network test -- tests/integration   # against mock + ephemeral test controller

# Go seam gates
go -C go/ziti test ./recoder/...
go -C go/ziti test -race ./recoder/...

# Contract / behavior proofs
#  - health-api.test.ts: truthful status across configured/unreachable/ok
#  - grant-engine.test.ts + reachability-engine.test.ts: default-deny + correct expansion
#  - reconciler.test.ts: idempotent re-apply, drift repair
#  - enroll-runner-e2e.test.ts: provision→enroll→online→dial over loopback fabric
```

Acceptance: no false success — enrollment/dial claims must cite a passing integration test or an observed
`controller-event-tap` online/dial event; controller-unreachable reports environment evidence, not product success.
