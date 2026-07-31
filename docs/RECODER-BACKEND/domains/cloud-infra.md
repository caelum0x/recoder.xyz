# Domain: Cloud, Sandboxes & Multi-tenancy

**Folder prefix:** `backend/src/domains/cloud/` (+ used-in-place Go engines `apps/desktop/server/engines/{ziti,recoder-xds}`)
**DI key:** `cloud`
**Public interface:** `CloudModule` (from `index.ts`)
**Tier:** Cloud/Teams (built; the mesh data plane is *registered but not live* until launch).

> **Status — SHIPPED (Phase 10, commit `0c7a063e7`; serial-integrated `489f2c95b`).** Live under `backend/src/domains/cloud/` (NOT `backend/src/modules/*`), mounted at `/api/agent-os/cloud` via the edge route table (`DOMAIN_REGISTRY.cloud.mountBase`), one of the 15 truthful health sources at boot. ~40 files, 33 domain tests. The mesh (ziti/xDS) stays registered/observable with no live data plane. This design doc has been reconciled to that shipped surface — where the built shape diverged from the original plan (adapter filenames, the read/write MCP split, tenant edge shape) the doc now describes what shipped.

---

## 1. Overview

The `cloud` domain is the **substrate provider for everything that runs off the local box**. It owns:

1. **Remote sandboxes** — provisioning/lifecycle of Daytona and E2B (and a local-container fallback) sandboxes that the `conductor` domain drives via the `@recoder/substrate` exec/reconcile ports. State-of-record for every sandbox lives in Postgres (`cloud_sandboxes`), so a restart reconciles instead of leaking.
2. **Preview deployments** — deploy a run's artifact to a preview target, mint **signed, expiring preview URLs** (HMAC over deployment id + tenant + exp), and report **truthful preview health** (never inferred from a 200).
3. **Fleet / supervisor** — a manifest of cloud capacity nodes (sandbox pools, preview runners, mesh endpoints) with heartbeat-based `up|down` and capacity accounting.
4. **Multi-tenancy isolation** — tenant tier (`self-host | cloud | teams`), isolation level, region pinning, and **quota enforcement** applied *before* any provider call.
5. **Networking mesh diagnostics** — the ziti (zero-trust overlay) + recoder-xds (Envoy xDS) surface. **Registered and observable, no live data plane yet**: we expose identity/cluster registration status and health, but do not route production traffic through it until launch.
6. **Deploy targets, domain/DNS, self-host vs cloud split** — target registry, custom-domain add + DNS/TLS verification records, and the flag that decides whether a capability provisions locally or in the cloud.

**Boundary discipline.** The domain never shells out to a provider ad hoc. Every provider (Daytona, E2B, ziti, xds) is reached through a **port** in `ports/` with a **degrade-safe adapter** in `adapters/`. Missing keys/binaries → the engine reports `down`, the module reports `degraded:true`, and edges return `SERVICE_UNAVAILABLE` — never a faked success. Every **write** (provision, destroy, deploy, preview-URL mint, add/verify/remove-domain) routes through the governance gate (`decide → audit`); every **edge** is guarded by the identity auth middleware, and every **MCP call** additionally clears the interop `authorize→risk→policy→audit` chain at the host boundary before it reaches a tool.

---

## 2. File Tree (~40 files)

```
backend/src/domains/cloud/
  index.ts                                  # factory createCloudModule(deps) + CloudModule interface
  cloud-module.ts                           # composer: fuses provisioner+deploy+fleet+tenancy+mesh behind one interface
  config.ts                                 # CloudConfig slice (zod) from AppConfig
  types.ts                                  # domain value types (Sandbox, Deployment, PreviewUrl, Tenant, FleetNode, MeshEndpoint, DeployTarget)
  health.ts                                 # aggregates per-engine up|down into HealthReport

  ports/
    sandbox-provider.port.ts                # SandboxProvider (provision/get/destroy/exec/status) — reuses @recoder/agent-sandbox shape
    deploy-target.port.ts                   # DeployTarget + PreviewService (deploy/status/health)
    mesh.port.ts                            # MeshDiagnostics (ziti identities + xds clusters, status only)
    governance-gate.port.ts                 # CloudGovernanceGatePort (decide/audit seam every write passes)
    cloud-repository.port.ts                # SandboxRepo/DeploymentRepo/TenantRepo/FleetRepo/DomainRepo/MeshRepo/PreviewTokenRepo interfaces

  adapters/
    daytona.adapter.ts                      # Daytona provider (via @recoder/sandbox-daytona) — degrade-safe
    e2b.adapter.ts                          # E2B provider (via @recoder/agent-sandbox e2b-provider) — degrade-safe
    local-container.adapter.ts              # local docker/container fallback provider (self-host tier)
    preview-target.adapter.ts               # preview deploy target (build → publish → base URL) for the deploy service
    dns-verifier.adapter.ts                 # REAL node:dns TXT + node:tls cert prober (injected as domainVerifier)
    http.ts                                 # shared fetch/probe helper the adapters use for real health probes
    ziti-mesh.adapter.ts                    # loopback REST/CLI to apps/desktop/server/engines/ziti — status only
    xds-envoy.adapter.ts                    # recoder-xds adapter (uses @recoder/network xds-contract) — status only

  services/
    sandbox-provisioner.service.ts          # quota-checked provisioning, provider selection, reconcile, TTL reaper
    preview-deploy.service.ts               # deploy → sign URL → health probe → persist Deployment
    preview-url-signer.ts                   # HMAC signer/verifier for signed expiring preview URLs (+ revocation check)
    fleet-supervisor.service.ts             # fleet manifest, heartbeats, capacity accounting
    tenancy.service.ts                      # tenant tier/isolation/region + quota resolution + self-host-vs-cloud split
    mesh-diagnostics.service.ts             # merges ziti+xds status into one diagnostics view
    domains.service.ts                      # custom-domain CRUD + DNS/TLS verification (verifier is an injected seam)
    cloud-write-gate.ts                     # guardCloudWrite/recordCloudAudit — the shared governance decide→audit helpers

  repositories/
    cloud.repository.ts                     # concrete repo impls over persistence QueryExecutor (:param SQL)

  routes/
    cloud.routes.ts                         # HTTP edges, zod-validated, sendSuccess/sendError

  mcp/
    cloud-engine.ts                         # READ-only MCP tools: tenant_read/sandboxes_list/preview_health/mesh_status/fleet_status
    cloud-write-engine.ts                   # governed WRITE MCP tools: sandbox_provision/destroy + domain_add/verify/remove
    cloud-mesh-engine.ts                    # SHIPPED: ziti mesh READ tools (services_list/enrollment_status/topology) + governed WRITE cloud_mesh_enroll
    cloud-xds-engine.ts                     # SHIPPED: recoder-xds READ-only tools (xds_snapshot/clusters/routes/listeners/endpoints)

  __tests__/
    sandbox-provisioner.test.ts             # quota reject + provider fallback + reconcile
    preview-url-signer.test.ts              # sign/verify/expiry/revocation/tamper
    tenancy.quota.test.ts                   # tier isolation + quota exhaustion
    mesh-degrade.test.ts                    # ziti/xds absent → down, module degraded, no throw
    cloud.routes.test.ts                    # auth + validation + governance-gate on writes
    cloud-domains-fleet.routes.test.ts      # domain CRUD/verify + fleet heartbeat/register edges
    domains.service.test.ts                 # domain lifecycle + DNS/TLS verify state machine
    dns-verifier.adapter.test.ts            # real TXT/TLS prober (truthful pending when unconfigured)
    cloud-read-mcp.test.ts                  # read tools + tenant-subject binding (cross-tenant refused)
    cloud-write-mcp.test.ts                 # write tools + governance + tenant-subject binding

backend/migrations/
  cloud_0001_core.sql                       # cloud_tenants, cloud_sandboxes, cloud_deployments, cloud_preview_tokens
  cloud_0002_fleet_mesh.sql                 # cloud_fleet_nodes, cloud_domains, cloud_mesh_endpoints
```

Used-in-place engines (never copied): `apps/desktop/server/engines/ziti` (Go, zero-trust overlay), `apps/desktop/server/engines/recoder-xds` (Go, Envoy xDS control plane).

---

## 3. Per-file responsibilities

| Path | Lang | Kind | Responsibility | Key exports |
|---|---|---|---|---|
| `index.ts` | ts | service | Pure factory + the one public interface for the domain | `createCloudModule(deps: CloudModuleDeps): CloudModule`, `interface CloudModule`, `interface CloudModuleDeps` |
| `cloud-module.ts` | ts | service | Composer: wires provider adapters + services behind `CloudModule`; reports per-engine health; routes writes through governance gate | `class CloudComposer` |
| `config.ts` | ts | config | zod slice of `AppConfig` (provider keys, preview base domain, HMAC secret, region defaults, tenancy tier defaults); fail-safe when secrets absent | `CloudConfig`, `cloudConfigSchema`, `sliceCloudConfig(app)` |
| `types.ts` | ts | type | Domain value types + status enums | `Sandbox`, `SandboxStatus`, `Deployment`, `DeployTargetKind`, `SignedPreviewUrl`, `Tenant`, `TenantTier`, `FleetNode`, `MeshEndpoint`, `DomainRecord` |
| `health.ts` | ts | service | Collect each adapter's `up|down`, compute `degraded` | `buildCloudHealth(engines): HealthReport` |
| `ports/sandbox-provider.port.ts` | ts | port | Provider-agnostic sandbox contract (consumed by conductor via substrate) | `interface SandboxProvider { provision, get, destroy, exec, status }`, `ProvisionSpec`, `ProviderId` |
| `ports/deploy-target.port.ts` | ts | port | Deploy + preview contract | `interface DeployTarget`, `interface PreviewService { deploy, status, health }`, `PreviewHealth` |
| `ports/mesh.port.ts` | ts | port | Read-only mesh status contract (registration + health, no traffic) | `interface MeshDiagnostics { zitiIdentities, xdsClusters, status }` |
| `ports/governance-gate.port.ts` | ts | port | The `decide → audit` seam every cloud write passes (bootstrap injects the Phase-3 gate) | `CloudGovernanceGatePort`, `GovernanceAction`, `GateDecisionContext`, `GateVerdict` |
| `ports/cloud-repository.port.ts` | ts | port | Repository interfaces this domain declares; persistence-backed impl injected | `SandboxRepository`, `DeploymentRepository`, `TenantRepository`, `FleetRepository`, `DomainRepository`, `MeshRepository`, `PreviewTokenRepository` |
| `adapters/daytona.adapter.ts` | ts | client | Daytona provider using `@recoder/sandbox-daytona`; auth-preflight; maps SDK errors → `Result`; `down` when key missing | `createDaytonaAdapter(deps): SandboxProvider` |
| `adapters/e2b.adapter.ts` | ts | client | E2B provider using `@recoder/agent-sandbox` e2b-provider; degrade-safe | `createE2bAdapter(deps): SandboxProvider` |
| `adapters/local-container.adapter.ts` | ts | client | Local docker/container fallback for self-host tier; no cloud key needed | `createLocalContainerAdapter(deps): SandboxProvider` |
| `adapters/preview-target.adapter.ts` | ts | client | The preview deploy target (build → publish → base URL) the deploy service drives | `createPreviewTarget(deps): DeployTarget` |
| `adapters/dns-verifier.adapter.ts` | ts | client | REAL DNS/TLS ownership prober (node:dns TXT + node:tls cert); injected as `domainVerifier` | `createDnsTlsVerifier(deps): DomainVerifierPort` |
| `adapters/http.ts` | ts | client | Shared `fetch`/`probe` helper the adapters use for real health probes | `globalFetch`, `probe`, `FetchLike`, `HttpResponse` |
| `adapters/ziti-mesh.adapter.ts` | ts | client | Loopback REST/CLI to ziti Go engine; returns identity list + health; `down` if binary/endpoint absent | `createZitiMeshAdapter(cfg, log)` |
| `adapters/xds-envoy.adapter.ts` | ts | client | recoder-xds status via `@recoder/network` xds-contract; cluster/listener registration snapshot | `createXdsEnvoyAdapter(cfg, log)` |
| `services/sandbox-provisioner.service.ts` | ts | service | Resolve tenant quota → pick provider (tier + region + availability) → provision → persist → emit RunEvent; TTL reaper + reconcile against provider truth | `createSandboxProvisionerService(deps): { provision, destroy, list, get, reconcile, reapExpired }` |
| `services/preview-deploy.service.ts` | ts | service | Deploy artifact to target, mint signed URL, probe real health, persist `Deployment` + token; governance-gated | `createPreviewDeployService(deps): { deploy, status, getSignedUrl, health }` |
| `services/preview-url-signer.ts` | ts | service | Stateless HMAC-SHA256 sign/verify of `{deploymentId, tenantId, exp}` + revocation lookup | `createPreviewUrlSigner(...)` |
| `services/fleet-supervisor.service.ts` | ts | service | Register/heartbeat fleet nodes; compute capacity + `up|down`; expose manifest | `createFleetSupervisorService(deps): { heartbeat, register, list }` |
| `services/tenancy.service.ts` | ts | service | Resolve/ensure `Tenant` (tier/isolation/region/quota); decide self-host-vs-cloud; enforce cross-tenant isolation `WHERE tenant_id = :tenant_id` | `createTenancyService(deps): { resolve, ensure, checkQuota, effectiveQuota, placement }` |
| `services/mesh-diagnostics.service.ts` | ts | service | Merge ziti + xds adapter snapshots into one diagnostics view; persist registry rows | `createMeshDiagnosticsService(deps): { status }` |
| `services/domains.service.ts` | ts | service | Custom-domain CRUD + DNS/TLS verification (verifier injected); truthful `pending` when unconfigured | `createDomainsService(deps): { list, get, add, verify, remove }` |
| `services/cloud-write-gate.ts` | ts | service | The shared governance `decide → audit` helpers every write edge + write MCP tool call | `guardCloudWrite(...)`, `recordCloudAudit(...)` |
| `repositories/cloud.repository.ts` | ts | repository | Concrete repo impls over persistence `QueryExecutor` (parameterized `:param` SQL, tenant-scoped) | `createCloudRepositories(qx): { sandboxes, deployments, tenants, fleet, domains, mesh, previewTokens }` |
| `routes/cloud.routes.ts` | ts | route | Express router: tenant, sandboxes, deployments, preview, fleet, domains, mesh; zod-validate inbound; governance decide→audit on writes | `buildCloudRouter(deps): Router` |
| `mcp/cloud-engine.ts` | ts | client | READ-only MCP introspection tools; tenant subject bound to the host-authorized `McpToolCaller` | `buildCloudMcpTools(module): McpToolRegistration[]` |
| `mcp/cloud-write-engine.ts` | ts | client | Governed WRITE MCP tools (sandbox provision/destroy + domain add/verify/remove); same subject-binding + `decide → audit` | `buildCloudWriteMcpTools(deps): McpToolRegistration[]` |
| `mcp/cloud-mesh-engine.ts` | ts | client | **SHIPPED.** ziti mesh READ tools (`cloud_mesh_services_list`/`enrollment_status`/`topology`, engine-status, no subject) + governed WRITE `cloud_mesh_enroll` (caller's-own-tenant subject binding + `decide → audit`, degrade-safe when controller absent) | `buildCloudMeshMcpTools(deps): McpToolRegistration[]`, `CloudMeshMcpDeps` |
| `mcp/cloud-xds-engine.ts` | ts | client | **SHIPPED.** recoder-xds READ-only introspection tools (`cloud_xds_snapshot`/`clusters`/`routes`/`listeners`/`endpoints`); mesh-wide infra, no tenant subject; empty well-formed results with engine `status` named when xDS absent | `buildCloudXdsMcpTools(module): McpToolRegistration[]` |
| `__tests__/sandbox-provisioner.test.ts` | ts | test | Quota reject, provider fallback (daytona down → e2b), reconcile drops orphan | — |
| `__tests__/preview-url-signer.test.ts` | ts | test | Sign/verify roundtrip, expiry, tamper, revocation | — |
| `__tests__/tenancy.quota.test.ts` | ts | test | Tier placement + quota exhaustion → `SERVICE_UNAVAILABLE` | — |
| `__tests__/mesh-degrade.test.ts` | ts | test | ziti/xds absent → engines `down`, module `degraded`, no throw | — |
| `__tests__/cloud.routes.test.ts` | ts | test | Auth required, zod rejects bad body, write hits governance gate | — |
| `__tests__/cloud-domains-fleet.routes.test.ts` | ts | test | Domain CRUD/verify + fleet heartbeat/register edges | — |
| `__tests__/domains.service.test.ts` | ts | test | Domain lifecycle + DNS/TLS verify state machine | — |
| `__tests__/dns-verifier.adapter.test.ts` | ts | test | Real TXT/TLS prober; truthful pending when unconfigured | — |
| `__tests__/cloud-read-mcp.test.ts` | ts | test | Read tools + tenant-subject binding (cross-tenant refused) | — |
| `__tests__/cloud-write-mcp.test.ts` | ts | test | Write tools + governance + tenant-subject binding | — |
| `migrations/cloud_0001_core.sql` | sql | migration | tenants, sandboxes, deployments, preview_tokens | — |
| `migrations/cloud_0002_fleet_mesh.sql` | sql | migration | fleet_nodes, domains, mesh_endpoints | — |

---

## 4. DB Schema

All tables carry `tenant_id` and enforce app-layer isolation (`WHERE tenant_id = :tenant_id` — **no Supabase RLS**). Owned by `persistence`; migrations are canonical SQL. **Shipped note:** every `id` primary key and `tenant_id`/`*_id` foreign key is `text` (not `uuid`) in the built migrations; the `uuid` annotations below describe intent only. Every statement is idempotent (`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`).

**`cloud_tenants`**
`id uuid pk`, `org_id uuid`, `owner_user_id uuid`, `tier text check(self-host|cloud|teams)`, `isolation_level text`, `region text`, `quota jsonb` (max_sandboxes, max_concurrent, max_preview, cpu/mem caps), `created_at timestamptz`, `updated_at timestamptz`.

**`cloud_sandboxes`**
`id uuid pk`, `tenant_id uuid fk`, `user_id uuid`, `run_id uuid null` (agent-os Run), `provider text (daytona|e2b|local)`, `external_id text`, `status text (pending|running|stopped|error|reaped)`, `region text`, `image text`, `resources jsonb`, `created_at`, `expires_at timestamptz null` (TTL), `last_heartbeat timestamptz`, `metadata jsonb`. Index `(tenant_id, status)`, `(expires_at)`.

**`cloud_deployments`**
`id uuid pk`, `tenant_id uuid fk`, `sandbox_id uuid null`, `run_id uuid null`, `target text`, `status text (building|live|failed|expired)`, `commit_sha text`, `preview_base_url text`, `health_status text (unknown|healthy|unhealthy)`, `last_health_at timestamptz`, `created_at`, `expires_at`. Index `(tenant_id, status)`.

**`cloud_preview_tokens`**
`id uuid pk`, `deployment_id uuid fk`, `token_hash text` (sha256 of issued token), `exp timestamptz`, `revoked boolean default false`, `created_at`. Revocation lookup by `deployment_id`.

**`cloud_fleet_nodes`**
`id uuid pk`, `tenant_id uuid null` (null = shared pool), `kind text (sandbox|preview|mesh)`, `status text (up|down|draining)`, `capacity jsonb`, `manifest jsonb`, `last_seen timestamptz`, `created_at`. Index `(kind, status)`.

**`cloud_domains`**
`id uuid pk`, `tenant_id uuid fk`, `hostname text unique`, `verification_status text (pending|verified|failed)`, `dns_records jsonb` (expected TXT/CNAME), `tls_status text (none|pending|active)`, `created_at`. Custom-domain / DNS surface.

**`cloud_mesh_endpoints`**
`id uuid pk`, `tenant_id uuid fk`, `service text`, `ziti_identity text null`, `xds_cluster text null`, `status text (registered|active|down)`, `registered_at`, `metadata jsonb`. Registered-but-no-live-data-plane registry.

---

## 5. HTTP Edges

Mounted by the `edge` domain route table under `/api/agent-os/cloud` (`DOMAIN_REGISTRY.cloud.mountBase`). All pass the identity auth middleware; writes additionally hit the injected `CloudGovernanceGatePort` `decide → audit` seam (`guardCloudWrite`/`recordCloudAudit`) — an absent gate degrades open (warn-logged), an erroring gate fails **closed** (503 `AUTHZ_SERVICE_ERROR`). The internal fleet-ingest edges are gated by `mw.requireInternal` (`INTERNAL_SERVICE_KEY`), served from the same router (there is **no** separate `/internal/*` cloud mount).

The tenant is always derived from the authenticated principal (org scope wins), **never** from the body.

| Method | Path | Purpose | Gate |
|---|---|---|---|
| GET | `/api/agent-os/cloud/tenant` | The caller's tenant (auto-provisioned on first read) + quota + placement | read (ensure = write → governance) |
| GET | `/api/agent-os/cloud/sandboxes` | List the caller tenant's sandboxes | read |
| POST | `/api/agent-os/cloud/sandboxes` | Provision sandbox (quota-checked) | write → governance |
| GET | `/api/agent-os/cloud/sandboxes/:id` | Sandbox status (tenant-scoped) | read |
| DELETE | `/api/agent-os/cloud/sandboxes/:id` | Destroy sandbox | write → governance |
| POST | `/api/agent-os/cloud/deployments` | Deploy artifact → preview | write → governance |
| GET | `/api/agent-os/cloud/deployments/:id` | Deployment status | read |
| GET | `/api/agent-os/cloud/deployments/:id/url` | Mint/return signed, expiring preview URL | write → governance (token mint) |
| GET | `/api/agent-os/cloud/deployments/:id/health` | Truthful preview health probe | read |
| GET | `/api/agent-os/cloud/mesh` | ziti/xds diagnostics snapshot | read |
| GET | `/api/agent-os/cloud/fleet` | Fleet manifest + capacity | read |
| GET | `/api/agent-os/cloud/domains` | List the caller tenant's custom domains | read |
| POST | `/api/agent-os/cloud/domains` | Add custom domain + DNS records | write → governance |
| GET | `/api/agent-os/cloud/domains/:id` | One custom domain (tenant-scoped) | read |
| POST | `/api/agent-os/cloud/domains/:id/verify` | Re-check DNS/TLS verification | write → governance |
| DELETE | `/api/agent-os/cloud/domains/:id` | Detach a custom domain | write → governance |
| POST | `/api/agent-os/cloud/fleet/heartbeat` | Node heartbeat (worker→backend) | `INTERNAL_SERVICE_KEY` |
| POST | `/api/agent-os/cloud/fleet/register` | Node registers into the manifest | `INTERNAL_SERVICE_KEY` |

> **Reconciled vs the original plan:** tenant resolution is a singular `GET /tenant` (no `POST /tenants` — the tenant auto-provisions, gated as a write only when it does not exist yet); the signed-URL edge is `/deployments/:id/url` (not `/preview`) and is a governed **write** because it mints a token; domains added full CRUD (`GET` list, `GET /:id`, `DELETE /:id`) and verify is a `POST` (mutating); fleet ingest is two edges (`/heartbeat` + `/register`) on the cloud router under `requireInternal`, not a `/internal/*` mount.

MCP tools (registered as the `cloud` server into the interop-gated MCP host; the governed HTTP edge `POST /api/mcp/tools/:server/:tool/call` is **LIVE**). The surface is split across four engines, all surfaced through the module's `mcp()` and wired in bootstrap as `{ name: 'cloud', tools: () => cloud.mcp() }`: a READ engine (`mcp/cloud-engine.ts` → `buildCloudMcpTools`), a governed WRITE engine (`mcp/cloud-write-engine.ts` → `buildCloudWriteMcpTools`), plus **SHIPPED** the mesh introspection/enrollment engine (`mcp/cloud-mesh-engine.ts` → `buildCloudMeshMcpTools`) and the xDS introspection engine (`mcp/cloud-xds-engine.ts` → `buildCloudXdsMcpTools`):

- **Read:** `cloud_tenant_read`, `cloud_sandboxes_list`, `cloud_preview_health`, `cloud_mesh_status`, `cloud_fleet_status`.
- **Write (governed):** `cloud_sandbox_provision`, `cloud_sandbox_destroy`, `cloud_domain_add`, `cloud_domain_verify`, `cloud_domain_remove`.
- **Mesh — read (SHIPPED, ziti overlay, no data plane):** `cloud_mesh_services_list` (registered services + status/encryption/role attrs), `cloud_mesh_enrollment_status` (enrolled vs outstanding token + expiry), `cloud_mesh_topology` (engine status + identity/service/enrollment counts). Engine-status reads — no tenant subject; an absent controller yields empty lists + a `down` engine, never a fake.
- **Mesh — write (SHIPPED, governed):** `cloud_mesh_enroll` — enrol a ziti identity/edge-router into the caller's **own** tenant (no args-named subject; cross-tenant CLOSED). Runs the same injected `CloudGovernanceGatePort` `decide → audit` seam as the HTTP edges (blocking verdict → truthful `{ok:false, effect:'blocked'}`, erroring gate fails **closed**, absent gate degrades open with a warn); a missing caller → `AUTH_REQUIRED`. Truthful `{ok:false}` when the controller is absent.
- **xDS — read (SHIPPED, recoder-xds Envoy control plane, read-only):** `cloud_xds_snapshot` (served-snapshot version + engine status + resource counts), `cloud_xds_clusters` (CDS: name/discovery type/endpoint count), `cloud_xds_routes` (RDS: virtual hosts + prefix→cluster routes), `cloud_xds_listeners` (LDS: address + ordered HCM HTTP filter chain + RDS route ref), `cloud_xds_endpoints` (upstream endpoints per cluster). Mesh-wide infra reads — no tenant subject; config is pushed by the backend network layer, never mutated through a tool. Absent xDS engine (`:18000` gRPC / loopback introspection) → empty, well-formed results with the engine `status` named; endpoints/clusters report `registered` (served config), never a live health probe.

There is no `cloud_deploy` or `cloud_preview_url` MCP tool — deploy and signed-URL minting are HTTP-edge only. **Tenant-subject binding (security hardening rounds 1–6, AUDIT COMPLETE 2026-07-31):** every subject-bearing cloud tool derives the tenant from the host-authorized `McpToolCaller` (`caller.userId`/`orgId`), never from free-form args — a non-privileged caller is bound to its own tenant (an args-named subject is honoured only for an `admin`/`internal` scope, and the caller is ownership-checked before any authz/quota/data seam). A missing caller → `AUTH_REQUIRED`; a cross-tenant subject → `AUTHZ_PROJECT_ACCESS_DENIED`. This cloud domain's subject-binding on its HTTP edges and MCP tools is part of the closed multi-tenant IDOR set — the sweep covered the original 8 domains (conductor, agent-os, memory, governance, social, cloud, observability, inference) plus `interop` + `edge` (2026-07-31), with one residual filed (`recoder-xiqj`, governance approval-clearance). It is not a blanket audit of every one of the 15 spine domains.

---

## 6. Interfaces exposed / consumed

**Exposes (to other domains):**
- `SandboxProvider` — consumed by `conductor` (via `@recoder/substrate` remote/exec ports) to run agents in remote worktrees.
- `PreviewService` / `DeployTarget` — consumed by `agent-os` (Run completion → preview) and `edge` (signed preview passthrough).
- `MeshDiagnostics` — consumed by `observability` (mesh health) and the frontend cloud surface.
- `TenancyService.placement` — consumed by any domain needing self-host-vs-cloud routing.
- `CloudModule.health()` — aggregated by `bootstrap` into `/health` + `/api/agent-os/health`.

**Consumes (from other domains / packages):**
- `@recoder/auth` `Session` — every request actor + tenant claim.
- `persistence` `QueryExecutor` — all data access (parameterized `:param`).
- `@recoder/governance` gate — every write.
- `@recoder/interop` chain — every edge + MCP call.
- `@recoder/agent-events` `RunEvent` — emitted on provision/deploy/destroy for the outbox drain.
- `@recoder/substrate` — remote exec/reconcile ports the conductor stands on.
- `@recoder/network` — xds-contract + envoy-config + ports/types for the xds adapter.
- `AppConfig` slice from `bootstrap/config`.

---

## 7. Reuse notes (REUSE vs NEW)

**REUSE (do not rebuild):**
- `@recoder/agent-sandbox` — `provider.ts` (SandboxProvider shape), `daytona-provider.ts`, `e2b-provider.ts`, `local-container-provider.ts`. The domain's provider port mirrors this; adapters wrap these.
- `@recoder/sandbox-daytona` + `@recoder/daytona-api-client` + `@recoder/daytona-toolbox-api-client` — Daytona SDK/toolbox.
- `@recoder/substrate` — remote/exec/reconcile/observe ports (conductor↔sandbox seam).
- `@recoder/network` — `envoy-config.ts`, `ext-authz`, `xds-contract.ts`, `overlay.ts`, `ports.ts`, `types.ts` for the xds/ziti adapters.
- Go engines in place: `apps/desktop/server/engines/{ziti,recoder-xds}` — driven via loopback REST/CLI, never copied.
- Existing MCP engines `backend/src/agent-os/mcp/{preview-engine.ts,deployment-engine.ts}` — folded into the cloud MCP surface (shipped as a read engine `mcp/cloud-engine.ts` + a governed write engine `mcp/cloud-write-engine.ts`); the preview/deploy logic lives in `PreviewDeployService`.
- Legacy `backend/src/sandbox/*` (CUT dir) logic — container lifecycle/pool/recovery/snapshot/daytona-client/e2b-client is **ported DB-backed** into `sandbox-provisioner.service.ts` + adapters (re-introduced only because it is now Postgres state-of-record, per the CUT rule).
- Shared envelope `sendSuccess`/`sendError`/`createError` + `ErrorCode` (`SERVICE_UNAVAILABLE`, `AUTHZ_PROJECT_ACCESS_DENIED`; **no `FORBIDDEN`/`EXTERNAL_SERVICE_ERROR`**), `@recoder/logger`, zod from `@recoder/agent-schemas`.

**NEW (this domain writes):**
- All 7 DB tables + 2 migrations (state-of-record is new — sandboxes/deployments were ephemeral before).
- `preview-url-signer.ts` (stateless HMAC signed URLs + revocation) — new.
- `tenancy.service.ts` (tier/isolation/quota/placement) — new (multi-tenancy did not exist).
- `fleet-supervisor.service.ts` (manifest + heartbeat capacity) — new.
- `mesh-diagnostics.service.ts` + ziti/xds adapters as **read-only status** — new (registered, no live data plane).
- `domains.service.ts` + `adapters/dns-verifier.adapter.ts` (real node:dns TXT + node:tls cert prober) — new custom-domain CRUD + DNS/TLS verification.
- `services/cloud-write-gate.ts` (`guardCloudWrite`/`recordCloudAudit`) + `ports/governance-gate.port.ts` — the shared `decide → audit` seam every write edge and write MCP tool passes.
- The composer, ports, routes, the split read/write MCP engines, and repositories — new domain scaffolding.

---

## 8. Degrade-safe behavior (truthful health)

- **No provider key** → adapter reports `down`; provisioner falls back local (self-host tier) or returns `SERVICE_UNAVAILABLE`; module `degraded:true`. Never faked.
- **ziti/xds binary or endpoint absent** → mesh adapters `down`; `/mesh` returns `{status:'down', engines:[...]}` with the missing source named; module `degraded:true`.
- **Preview health probe fails** → `health_status='unhealthy'` persisted; edge returns the real state, not a 200.
- **Quota exhausted** → `SERVICE_UNAVAILABLE` with user-safe message; no partial provision.
- **Secrets missing at boot** → config slice marks provider unavailable; domain still boots and reports degraded (fail-safe, per critical rule #5).

---

## 9. Implementation order

1. `types.ts`, `config.ts`, `ports/*` — contracts first (compile-time seam for the other 13 domains).
2. `migrations/*` + `repositories/cloud.repository.ts` — state-of-record (Postgres).
3. `services/tenancy.service.ts` + `tenancy.quota.test.ts` — isolation/quota gates everything downstream.
4. `adapters/{daytona,e2b,local-container}` + `services/sandbox-provisioner.service.ts` + `sandbox-provisioner.test.ts` — core substrate.
5. `services/preview-url-signer.ts` + `preview-deploy.service.ts` + `preview-url-signer.test.ts` — deploy + signed URLs.
6. `services/fleet-supervisor.service.ts` — fleet manifest + heartbeat.
7. `adapters/{ziti-mesh,xds-envoy}` + `services/mesh-diagnostics.service.ts` + `mesh-degrade.test.ts` — registered, read-only.
8. `health.ts`, `cloud-module.ts`, `index.ts` — compose + health aggregate.
9. `routes/cloud.routes.ts` + `cloud.routes.test.ts` — edges (interop + governance).
10. `mcp/cloud-engine.ts` — MCP tools + wiring-checklist registration.

**Verification:** `pnpm check-types`, `pnpm test` (domain suite), `pnpm test:contracts:agent-os`, and the existing `scripts/verify-byok-e2e.sh` for provider-key degrade paths. Provisioning/deploy/domain writes are governance-gated and approval-eligible per the production rule.
