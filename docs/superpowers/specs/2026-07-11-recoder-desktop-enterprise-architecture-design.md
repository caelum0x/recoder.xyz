# Recoder Enterprise Architecture Blueprint — Desktop-First

- **Status:** Draft for review
- **Date:** 2026-07-11
- **Author:** Chief-architect synthesis of a 12-subsystem read-only planning fan-out (25 agents) + adversarial enterprise-review board.
- **Scope:** The Recoder **desktop app** (`apps/desktop`) as the flagship product, with the Agent OS control plane + `docker-backend` as an **embedded (individual) + self-hostable/VPC (enterprise)** backend spine.
- **Out of scope (deprecated/dropped):** Web IDE; web agent platforms (`recoder-agents`, `recoder-agency`, `recoder-pm`, `recoder-web`). `apps/mobile` is a secondary companion, not the product.

## Product Decisions (ratified by the user, 2026-07-11)

| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| PD1 | Self-host / VPC hosting model | **Both, tiered** — customer-managed IaC (Terraform/Helm) as the default enterprise SKU; Recoder-managed dedicated hardware / managed Postgres+Redis as a premium tier. | DR SLA (RTO≤30m / RPO≤5m) is customer-config in the IaC SKU and Recoder-owned in the managed SKU. Current single Hetzner box is **not** an HA target; new hardware/managed services required for the managed tier. |
| PD2 | Committed compliance scope | **All: SOC2 Type II + GDPR + ISO 27001 + FedRAMP / air-gapped.** | Forces a **fully self-hosted / air-gapped identity + offline-license path** (recoder.xyz-as-sole-IdP is insufficient for FedRAMP), strict data residency, offline revocation with machine-binding, and an evidence-automation pipeline from Phase 3. |
| PD3 | Signing & license key custody | **Both: cloud KMS baseline + dedicated HSM** for high-assurance/FedRAMP. | KMS for Phase-1 signing; HSM custody for license-authority + FedRAMP keys. A key-custody + rotation + compromise-recovery runbook is a P0 deliverable and gates all Phase-1 signing. |

---

## 1. Executive Summary

**Enterprise-grade desktop Recoder** is one product — an Electron 33 cockpit that embeds and supervises a local `docker-backend` — shipped in two deployment shapes from a single codebase:

- **Individual / Embedded mode** (the flagship): the desktop app spawns `docker-backend` over `127.0.0.1` loopback in `RECODER_SOLO_MODE`. Single-tenant, single-operator, zero external dependency, offline-first, JSON/SQLite persistence, OS-keychain secrets. **No Postgres, no Redis, no SSO, no license server required.** Every enterprise feature degrades safe to this baseline.
- **Enterprise Self-Host / VPC mode**: the *same* `docker-backend` image runs as a horizontally-scaled network service inside the customer's boundary, backed by Postgres 17 + Redis + Qdrant + Meilisearch, with federated identity (SSO/SAML/SCIM), tenant isolation, tamper-evident audit, HA/DR, quotas/SLAs, and fleet management. The desktop cockpit becomes a thin front-end that **attaches** to (does not supervise) that backend.

The **north-star invariant** across both modes: `recoder.xyz` remains the auth source of truth (Better Auth); `packages/agent-os` owns the domain contracts and legal state transitions; runtimes and sandboxes (tmux, Daytona, E2B) are replaceable adapters that **never own canonical task, approval, memory, audit, or licensing state**. The `user` (auth principal) and `users` (org membership) models stay separate everywhere. The desktop reflects backend-decided RBAC — it never invents roles.

The core design move that makes enterprise possible without forking the codebase: **a `RuntimeProfile` capability descriptor resolved once at boot** (EMBEDDED vs SELF_HOST) that every subsystem reads instead of re-deriving deployment intent from scattered `if (env)` checks. The two modes run **identical code paths**; only configuration and which adapters are wired differ. Tenancy, audit, quota, and identity are the *same* code exercised in both modes — EMBEDDED resolves to a `LOCAL_TENANT` sentinel and a permissive-but-safe single-operator principal. **`RuntimeProfile` fails closed:** if unset, subsystems assume `SELF_HOST` strictness, never EMBEDDED permissiveness.

This is a real enterprise product (multi-tenancy, SSO/SAML/SCIM, RBAC, tamper-evident audit, SOC2/ISO27001/GDPR/FedRAMP, HA/DR, SLAs, self-host/VPC, fleet management) — **not an MVP**.

---

## 2. Target-State Architecture (Layered View)

### 2.1 Layer stack

```
┌──────────────────────────────────────────────────────────────────────┐
│ DISTRIBUTION & TRUST PLANE                                             │
│  3-target signed pipeline (macOS notarize / Win Authenticode /        │
│  Linux GPG+AppImage) · ed25519-signed update manifest + pinned key ·  │
│  SLSA provenance · MSI/.pkg/ADMX fleet install · KMS/HSM signing keys │
└──────────────────────────────────────────────────────────────────────┘
        ▼ (signed artifact, verified at install + runtime self-check)
┌──────────────────────────────────────────────────────────────────────┐
│ DESKTOP SHELL (apps/desktop — Electron 33 main process)               │
│  managed-policy.js (signed, machine-scoped) · update-channels.js ·    │
│  secret-store.js (OS keychain via safeStorage) · structured-logger ·  │
│  backend-supervisor.js (embedded-spawn | attach-mode + failover)      │
└──────────────────────────────────────────────────────────────────────┘
        ▼ loopback IPC / context-bridge (token NEVER via process.argv)
┌──────────────────────────────────────────────────────────────────────┐
│ COCKPIT UI (Preact, thin read-only control-plane renderer)            │
│  CockpitSession (tenant+identity, read-only) · useCan(scope) gate ·   │
│  OrgSwitcher · ApprovalsInbox · AuditLogView · AdminConsole ·         │
│  ObservabilityDrawer · BackendProfile (embedded|self-host|fleet)      │
│  Signed bundle manifest + strict CSP/SRI                              │
└──────────────────────────────────────────────────────────────────────┘
        ▼  X-Recoder-Org + X-Recoder-Request-Id + Bearer  (HTTP/WS)
┌──────────────────────────────────────────────────────────────────────┐
│ CONTROL PLANE (docker-backend + Agent OS packages)                    │
│  RuntimeProfile descriptor (EMBEDDED | SELF_HOST) ── resolved at boot │
│  Composition root (AppContext) + modules/*.register(app, ctx)         │
│  Pipeline: requestContext→authenticate→resolveTenant→authorize(scope) │
│            →enforceQuota→audit                                        │
│  packages/agent-os: TenantContext, Principal, AuditEnvelope, RBAC,    │
│    Entitlement/Quota, Approval+escalation, Signature/Attestation      │
│  packages/agent-events (CloudEvents+Outbox), agent-policy,            │
│    agent-memory, agent-instructions, agent-workflows, a2a-sdk         │
└──────────────────────────────────────────────────────────────────────┘
        ▼ ports (tenant-scoped)              ▼ A2A gateway (tenant-bound)
┌───────────────────────────────┐  ┌────────────────────────────────────┐
│ EXECUTION — Conductor (local) │  │ EXECUTION — Sandbox (remote)        │
│  tmux_worktree · in_process   │  │  Sandbox Broker → substrate-daytona │
│  admission-queue (admit/queue │  │  RemoteLease (tenant-bound) ·       │
│   /reject) · leader-lease (HA)│  │  Quota Ledger · Sandbox Reaper ·    │
│  RunEvent hash-chain          │  │  Substrate Pool (region/HA) ·       │
│                               │  │  in-sandbox egress default-deny     │
└───────────────────────────────┘  └────────────────────────────────────┘
        ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ DATA & STATE LAYER                                                     │
│  EMBEDDED: encrypted SQLite/JSONL under userData (offline-first)      │
│  SELF_HOST: Postgres17 (RLS + org_id) + pgvector/Qdrant + Meilisearch │
│    HA (primary+replica, Patroni, WAL/PITR) · KMS envelope secrets     │
│    versioned desktop↔cloud SyncContract · region-pinned residency     │
└──────────────────────────────────────────────────────────────────────┘

CROSS-CUTS (span all layers): Identity/SSO/SCIM · Billing/Entitlements ·
Security/Audit/Compliance · Observability/SLOs · Fleet Policy Push
```

### 2.2 Deployment Mode A — Individual / Embedded (flagship)

```
   ┌─────────────────────── User's Machine ───────────────────────┐
   │  Electron Shell (main.js)                                     │
   │   ├─ managed-policy.js → permissive defaults (no MDM)         │
   │   ├─ secret-store.js → OS Keychain (device token, sk_ keys)   │
   │   └─ backend-supervisor.js ── spawns ──┐                      │
   │                                         ▼                      │
   │  Cockpit UI ◄── loopback IPC ──► docker-backend :3001         │
   │   (LOCAL_TENANT, useCan=all)      RuntimeProfile=EMBEDDED      │
   │                                    ├─ single-tenant shim       │
   │                                    ├─ in-process rate limits   │
   │                                    ├─ solo-approval            │
   │                                    ├─ Conductor: tmux_worktree │
   │                                    └─ SQLite/JSONL @ userData  │
   │                                                                │
   │  Auth: RFC 8628 device-flow ─────► recoder.xyz (only online   │
   │        (Better Auth token)         dependency; offline-capable)│
   └──────────────────────────────────────────────────────────────┘
   Remote sandbox: opt-in only. No Postgres/Redis/SSO/license needed.
```

### 2.3 Deployment Mode B — Enterprise Self-Host / VPC

```
        Customer IdP (Okta/Azure/Auth0) ──SAML/OIDC/SCIM──┐
                                                          ▼
   Desktop fleet (managed-policy: backend=remote)   ┌─────────────────┐
   ┌──────────────┐  ┌──────────────┐               │ recoder.xyz OR  │
   │ Cockpit(attach)│ │ Cockpit(attach)│──device-flow─►│ self-hosted     │
   │ BackendProfile │ │ BackendProfile │  signed JWT   │ identity conn.  │
   │ = fleet-endpt  │ │ = fleet-endpt  │  (org,scopes) │ (FedRAMP/airgap)│
   └──────┬─────────┘ └──────┬─────────┘               │ License Auth.   │
          │  X-Recoder-Org + JWT                       └─────────────────┘
          ▼                                                     │ offline
   ┌────────────────── Customer VPC boundary ──────────────────┐│ license
   │  Load Balancer (readiness-gated)                          ││ file (ed25519)
   │    ├─ docker-backend replica 1 (stateless gateway) ◄──────┘▼
   │    ├─ docker-backend replica 2   RuntimeProfile=SELF_HOST  │
   │    └─ docker-backend replica N   (leader-lease → 1 owns    │
   │         │                         reconcile/timer loop)    │
   │         ▼ tenant-scoped ports                              │
   │  ┌─────────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐ │
   │  │ Postgres17  │ │  Redis   │ │  Qdrant   │ │Meilisearch│ │
   │  │ RLS+org_id  │ │ streams/ │ │ tenant-   │ │ tenant-   │ │
   │  │ primary+    │ │ quota/   │ │ prefixed  │ │ prefixed  │ │
   │  │ replica+PITR│ │ ratelimit│ │ collections│ │ indexes   │ │
   │  └─────────────┘ └──────────┘ └───────────┘ └───────────┘ │
   │  Audit ledger (append-only, hash-chained) → SIEM export   │
   │  Regional pools (Daytona) for sandbox residency pinning   │
   │  KMS/Vault + HSM (envelope encryption, license authority) │
   └───────────────────────────────────────────────────────────┘
```

---

## 3. Cross-Cutting Enterprise Pillars

Each pillar states **the decision** and **the mechanism**, citing subsystems.

### 3.1 Multi-tenancy & Isolation
- **Decision:** Tenancy is a first-class, structurally-required field on domain contracts — not adapter-injected context. Isolation is **defense-in-depth**: typed at the domain, enforced at the DB, checked at every port.
- **Mechanism:** `TenantContext {tenantId, orgId, residencyRegion, dataClassification?}` + `Principal` value types threaded through Space/Workspace/TaskRun/Approval/PolicyDecision/Artifact/Memory/RunEvent/WorkLock/InstructionBundle/Outbox (*Agent OS Core Contracts*). A single `resolveTenantContext()` seam returns `LOCAL_TENANT` on desktop, real context on hosted. In the backend, a `resolveTenant` middleware pins `TenantContext` per request; ownership key moves from `userId` to `(orgId, projectId)` (*docker-backend Control Plane*). Postgres RLS with per-request `SET LOCAL app.current_org` GUC enforces isolation below the app layer (*Data & State*, *Conductor*). Qdrant/Meilisearch use tenant-prefixed collections + payload-filter enforcement. A2A resolves `TenantRef` once at ingress and asserts tenant match on every read/write; cross-tenant envelope crafting is a hard gateway DENY (*A2A*). Sandbox IDs stop being capabilities — every op is gated by a tenant-bound `RemoteLease` (*Sandbox*).

### 3.2 RBAC + SSO/SAML/SCIM
- **Decision:** `recoder.xyz` (or, for FedRAMP/air-gapped, a self-hosted identity connector) federates identity IN and mints tenant-scoped tokens; the backend **consumes verified claims and never becomes a second IdP**. RBAC is one unified role model.
- **Mechanism:** SAML 2.0 / OIDC connectors + SCIM 2.0 (Users/Groups, JIT provision/deprovision) terminate at the identity authority; short-lived JWTs (`org_id, workspace_ids, roles, scopes, tier, exp`) signed by a Recoder JWKS (*Identity*, *Security/Fleet*, *A2A*). The unified `Role/Permission` model lives in `packages/agent-os` (collapsing the two divergent org/role models in `enterprise/organization.ts` vs `distribution/channels/org`) with a compatibility mapping layer (*Identity*, *Core Contracts*). SAML uses a **vetted XML-DSig verifier** (external security review), deny-by-default until per-org certs configured. Cockpit `useCan(scope)` gates affordances only — server enforces (*Cockpit UI*). SCIM writes only the `users`/Membership plane, never `user`.

### 3.3 Audit & Compliance (SOC2 / ISO27001 / GDPR / FedRAMP)
- **Decision:** Audit is **intrinsic and tamper-evident**, produced by the same pure function that computes each state change — impossible to mutate canonical state without emitting an audit record. Security-relevant audit is **always-on**, even when performance telemetry is opt-in.
- **Mechanism:** `AuditEnvelope` wraps every mutating transition; `transition*Audited` siblings return `{next, audit}` (*Core Contracts*). One append-only, **hash-chained** ledger (each row carries prior hash + monotonic seq + periodic signed checkpoint **externally anchored to WORM/S3 object-lock or a transparency log**) built on the existing agent-events outbox/CloudEvent pattern — Postgres in SELF_HOST, encrypted SQLite/JSONL under userData in EMBEDDED (*Security/Fleet*, *Data*, *A2A*, *Billing*). Per-hop **chain-of-custody signing** for cross-agent handoffs. Retention/legal-hold + WORM/object-lock SIEM export (Splunk/Datadog/S3). GDPR right-to-erasure is a cross-store cascade (Postgres + Qdrant + Meilisearch + backup tombstones) recorded without breaking the hash chain (*Data*). Compliance-control mapping + evidence-collection automation lands in Phase 3, not Phase 5.

### 3.4 HA/DR & Scale (self-host only)
- **Decision:** Gateways are **stateless**; exactly one process owns the reconcile/timer loop via leader election; desktop EMBEDDED is the trivial always-leader single instance. DR SLA is customer-config (IaC SKU) or Recoder-owned (managed SKU) per PD1.
- **Mechanism:** `RuntimeProfile` gates all HA. Container state → `ContainerStateStore` with leases/heartbeat; in-memory `containers` Map retired for SELF_HOST (*Control Plane*). Conductor `leader-lease.ts` (Postgres advisory lock) with fencing tokens + idempotent orphan finalization (*Conductor*). Postgres primary+replica (Patroni), WAL archiving, PITR (RPO ≤5min / RTO ≤30min), **PgBouncer in session-pooling mode or per-transaction `SET` verification to prevent `SET LOCAL` GUC bleed**; Redis sentinel; Qdrant/Meilisearch replicated snapshots (*Data*, *Security/Fleet*). Graceful SIGTERM drain + liveness/readiness split gate the LB for rolling deploys (*Control Plane*). Durable job queue with visibility timeout + at-least-once + idempotency for A2A workers (*A2A*). Control-plane region-failover topology is defined; the identity authority is itself HA (a down IdP means the fleet cannot mint tokens).

### 3.5 SLAs / Quotas / Rate-Limiting
- **Decision:** Quota is **fail-safe deny to the free floor** on unresolved plan; hard-blocks only where contract explicitly configures; **local BYOK desktop work is never quota-blocked** (but still emits audit + honors DLP).
- **Mechanism:** `resource-governor` → tenant-partitioned admission controller with **three outcomes: admit / queue / reject** (*Conductor*). `QuotaLedger` + Redis-backed distributed rate limits keyed on `tenant:org_id`, replacing in-process limiters (*Control Plane*, *A2A*). Sandbox `quota-ledger.ts` meters sandbox-minutes/concurrency before Daytona create (*Sandbox*). Outbox-backed usage pipeline (lossless) feeds soft warnings (75/90/100%) + configurable hard blocks + priority/reserved capacity (*Billing*). `denyReason` classifier (`quota_exceeded | rate_limited | data_residency | entitlement_denied | rbac_denied | ...`) surfaces truthful reasons to the cockpit (*Core Contracts*).

### 3.6 Data Residency
- **Decision:** Region is a first-class tenant dimension; no bridge job, sandbox, or audit event silently crosses a residency boundary.
- **Mechanism:** `region` on `TenantContext`/organization selects region-pinned Postgres/Qdrant/Meilisearch endpoints via the `TenantRouter`; `residency` on RunEvents (*Data*). Sandbox `substrate-pool.ts` pins leases to allowed regions; A2A `region` shard router rejects cross-region routing (*Sandbox*, *A2A*). Air-gapped/VPC deployments register only local pools.

### 3.7 Observability / SLOs
- **Decision:** OpenTelemetry-native, tenant-tagged. Performance telemetry is **off/no-op by default** for solo; **security telemetry is always-on**. Opt-in OTLP export per fleet. Correlation IDs propagate desktop→backend→db.
- **Mechanism:** `X-Recoder-Request-Id` stamped at the cockpit, threaded through internal calls into Pino logs (*Cockpit*, *Control Plane*). OTel spans covering create→launch→tail→deliver with tenant attributes; real histogram bucketing replaces fake p50/p99 (*Conductor*, *A2A*). Tenant-tagged Prometheus/OTLP metrics enable the currently-disabled auth/billing/A2A alert-rule groups (*Security/Fleet*). In-app Observability drawer + `/health/full` breakdown, no external APM required for embedded (*Cockpit*).

### 3.8 Secret Management (OS Keychain + KMS/HSM)
- **Decision:** One `SecretVault` abstraction; OS-native at-rest encryption on desktop, KMS+HSM in SELF_HOST; **explicit surfaced degraded state, never a silent plaintext fallback**.
- **Mechanism:** Desktop `secret-store.js` / `secret-vault.js` routes device token, minted `sk_` keys, per-install salts, `INTERNAL_SERVICE_KEY`, `API_KEY_HASH_SALT`, BYOK keys through macOS Keychain / Windows Credential Manager (DPAPI) / Linux libsecret via Electron `safeStorage`, with expiry/rotation/revocation (*Desktop Shell*, *Security/Fleet*). Cockpit token stops flowing through `process.argv` — loopback context-bridge only. SELF_HOST backend secrets move behind a `SecretsProvider`/`KmsProvider` port (KMS/Vault envelope encryption, HSM for license authority) with the env-key path retained as the embedded degrade-safe fallback (*Control Plane*, *Data*).

### 3.9 Code-Signing Supply Chain
- **Decision:** Trust is decoupled from the transport; signing keys never live on a build laptop (KMS/HSM per PD3); every release is provenance-attested and runtime-verified; updates are **version-monotonic** (downgrade-attack rejected).
- **Mechanism:** 3-target signed pipeline (macOS `@electron/notarize` + hardened runtime / Windows Authenticode/Azure Trusted Signing / Linux GPG `.deb`/`.rpm` + AppImage `.sig`), degrade-safe skip locally / fail-loud in CI (*Desktop Shell*). ed25519-signed SHA-256 **version-monotonic** update manifest + **pinned public update key** + self-hostable generic provider; electron-updater verifies payload signature and rejects downgrades; staged rollout with a signed kill/rollback command + tested "bricked fleet" recovery path (*Desktop Shell*). SLSA/in-toto provenance attestation per release; KMS/HSM signing keys; SBOM generation + transitive-CVE merge-gate + a documented Electron/Chromium security-update SLA; runtime integrity self-check of asar/backend/tmux hashes at startup (*Desktop Shell*, *Security/Fleet*). Sandbox images cosign-verified, pinned by digest (*Sandbox*).

### 3.10 Fleet Management / Policy Push
- **Decision:** Enterprise admins push **signed** policy bundles; desktops fetch, verify signature, apply via the agent-policy engine, report compliance back as audited events. Unsigned/spoofed bundles are rejected (deny-by-default). MDM overrides user.
- **Mechanism:** Machine-scoped signed **Managed Policy** (macOS Managed Preferences plist / Windows HKLM+ADMX / Linux `/etc/recoder/managed-policy.json`) read before first window: sets update-channel allow-list, backend mode, telemetry/SIEM sink, retention windows, feature gates, with published schema + precedence rules (*Desktop Shell*). `fleet-policy-client.js` fetches/verifies/applies dynamic bundles (allowed tools, egress, sandbox rules) and reports compliance (*Security/Fleet*). MDM/GPO silent install (MSI/.pkg/ADMX, Jamf/Intune) + offline/air-gapped install with manual verified update import (*Desktop Shell*).

### 3.11 Endpoint DLP & Threat Model (desktop)
- **Decision:** A compromised or lost endpoint must not become an unbounded exfiltration primitive; local data is device-bound and remotely revocable.
- **Mechanism:** BYOK keys, source, and audit logs under `userData` are encrypted at rest with device-bound keys (OS keychain-sealed); MDM-enforced disk-encryption requirement; app-level egress allow-list; remote-wipe / device-revocation on de-provision (ties to SCIM + device-registry kill-switch); optional clipboard/screenshot policy controls via Managed Policy. Local runs still emit audit and honor DLP even when not quota-blocked (*Desktop Shell*, *Security/Fleet*, *Identity*).

### 3.12 Incident Response (first-class)
- **Decision:** IR is a named deliverable, not an afterthought.
- **Mechanism:** IR runbook (detection → containment → eradication → recovery → notification → post-mortem) with breach-notification SLA per compliance regime, forensic log preservation (WORM audit + tamper-evidence), and a customer-notification contract. Detection hooks off always-on security telemetry (*Security/Fleet*).

---

## 4. Subsystem Focus — MCP Host & Tools

(Patched separately after the fan-out; the other 11 subsystems are folded into §3/§5.)

**Current state:** two parallel host implementations plus a legacy process manager, none tenant-aware. `packages/agent-mcp` correctly owns registry + permission contracts (`registry.ts` flat in-memory `Map`, no `org_id`; `permissions.ts` `canCallMcpTool`; `host/mcp-host.ts` authorize→execute→audit with best-effort audit). Risk gating in `policy/tool-risk.ts` + `packages/agent-policy/src/rules/mcp-tool-risk.ts` (regex over `toolName` only; recently hardened to gate `clink`). Backend seam `docker-backend/src/agent-os/mcp/interop-host.ts` is a **process-wide singleton** (no per-org isolation). A **second, ungated** path exists: `docker-backend/src/routes/mcp.routes.ts` + `src/mcp-manager.ts` spawns arbitrary `npx -y <pkg>` and merges `{...process.env, ...config.env}` into the child (every backend secret leaks to every tool server; carries a `SUPPLY-CHAIN RISK` comment). **`.mcp.json` lines 42-44 contain live hardcoded `DAYTONA_API_KEY` / `RECODER_API_TOKEN` / `RECODER_SESSION_TOKEN` (+`GITHUB_TOKEN`) committed to the repo.**

**Enterprise target:** collapse the two host paths into **one gated host**; make the registry the tenant boundary (`TenantMcpRegistryProvider` keyed by `org_id`, `resolveTenantHost(orgId)` replacing the singleton; RLS on `mcp_server_registration`/`mcp_tool_grant`). Layered permission decision: (1) registry admission, (2) `ToolRiskProfile` (extends the regex baseline with `server.kind`/`server.trust`/declared side-effects, floors untrusted servers at `medium`), (3) fail-safe entitlement, (4) `RuntimeProfile`-aware approval routing (EMBEDDED permissive single-operator auto-satisfy for medium; SELF_HOST routes every `needs_approval` to an agent-os approval record; FedRAMP/air-gapped denies any `origin` not on the signed allowlist and blocks non-local transports). Secrets move out of `.mcp.json` and out of raw spawn env into a `SecretVaultPort` resolved **at call time** into a per-call, per-server scope (`mcp_tool_grant.secretRefs`). **Tool descriptions from external servers are treated as untrusted input** — validated against the org's registered `toolNames` allowlist, undeclared tools rejected, descriptions carry provenance and are never treated as instructions. Every `tool.call` audits into the hash-chained ledger (args-hash, never secret values). agent-mcp keeps only the decision shape + risk; approval/audit **state** stays in agent-os.

**Key changes (ordered, incremental):** purge+rotate `.mcp.json` secrets → fix spawn env leak (`mcp-manager.ts:136`) → add optional `orgId`/`origin`/`trust` to registration → `TenantMcpRegistryProvider` → RLS tables → `ToolRiskProfile` → thread `RuntimeProfile` + approval routing → external tool-schema validation → hash-chained audit sink → quarantine then deprecate the ungated `/api/mcp/:projectId/call` → FedRAMP allowlist-transport profile last.

**Risks:** legacy path stays ungated until quarantine (track as known gap, per truthful-health rule); `.mcp.json` secrets are already in git history (rotation mandatory, does not undo exposure); boundary erosion (keep approval persistence out of agent-mcp); RLS correctness is a release gate (cross-tenant negative tests required); vault as new hot-path SPOF (must degrade to truthful failure, never ambient-env fallback); `RuntimeProfile` default must fail closed to SELF_HOST strictness.

---

## 5. Phased Roadmap

Milestones sequenced by dependency + risk. **Every phase keeps the EMBEDDED desktop path zero-config and unchanged**, enforced by `RuntimeProfile` contract tests.

### Phase S0 — Security Hotfixes (ship immediately, out-of-band)
Three **live** vulnerabilities are not deferrable to their "natural" phase — they ship now as standalone fixes with loud-audit compat windows:
1. **`verifyBridgeToken` accepts any non-empty bearer** — add signature/exp/revocation/scope validation (*A2A*). Largest active trust-boundary defect.
2. **Unauthenticated sandbox-by-ID get/exec/delete across users** — gate every sandbox route on a tenant-bound lease (*Sandbox*). RCE + exfil primitive.
3. **Hardcoded secrets in `.mcp.json`** — replace with `${secretRef}` placeholders, **rotate** the exposed `DAYTONA_API_KEY`/`RECODER_API_TOKEN`/`RECODER_SESSION_TOKEN`/`GITHUB_TOKEN`, coordinate with the secrets-in-git-history remediation (*MCP*).
- **Exit criteria:** each fix has a regression test; the three vulns are closed on `main` with audit evidence; no EMBEDDED behavior change.

### Phase 0 — Contract & Boot Foundation *(highest-leverage first phase)*
**Why first:** every enterprise capability depends on tenancy/identity/audit being *typed* and on one boot-time profile switch. Almost entirely additive (optional fields, new value types), near-zero blast radius; unblocks all parallel downstream work.
- **Core Contracts:** land `TenantContext`, `Principal`, `AuditEnvelope`, `rbac`, `entitlement`, `attestation`, `residency` value types + `LOCAL_TENANT`/`SYSTEM_PRINCIPAL` sentinels; add `tenant?`/`principal?` as **optional** to Space/Workspace/TaskRun/Artifact/Memory/WorkLock/InstructionBundle; `resolveTenantContext()` seam.
- **Control Plane:** `RuntimeProfile` descriptor (fails closed to SELF_HOST) + route existing deployment checks through it; `AppContext` scaffold + opt-in middleware pipeline on the 28+ extracted routers.
- **Desktop Shell:** signed Managed Policy schema + ed25519 release-manifest/provenance format defined; **key-custody + rotation + compromise-recovery runbook (PD3)** written; CI emits manifests + provenance for existing macOS builds (no runtime change).
- **Identity:** promote canonical Org/Membership/Role/Seat/License/AuditEvent/SsoConfig/ScimResource contracts into agent-os (both existing org models compile as adapters); freeze **one** deny-by-default Role/Permission matrix with authz tests before any adapter.
- **Exit criteria:** `pnpm check-types` + `test:contracts:agent-os` green; `RuntimeProfile` contract tests assert EMBEDDED needs no Postgres/Redis/SSO; desktop solo path byte-for-byte unchanged; key-custody runbook ratified.

### Phase 1 — Desktop Trust & Secrets (ships independently, desktop-only)
- **Desktop Shell:** Windows Authenticode + Linux GPG/AppImage signing; pinned-key **version-monotonic** signed update manifest + generic provider + staged rollout + signed kill/rollback; update channels (stable/beta/enterprise) reading the Managed Policy allow-list; structured logger (rotation/retention/redaction/encryption); signed crash webhook.
- **Security/Fleet + Shell:** `SecretVault`/`secret-store.js` (OS keychain, expiry/rotation, explicit degraded state); remove `process.argv` token path; **KMS/HSM** code-signing keys + SLSA provenance + SBOM + CVE merge-gate + runtime integrity self-check; endpoint-DLP (device-bound encryption, egress allow-list, remote-wipe hook).
- **Cockpit:** signed bundle manifest verification + strict CSP/SRI; proactive session/license-expiry handling.
- **Exit criteria:** all three OS targets ship signed; SmartScreen warning gone; secrets in keychain with surfaced degraded state on headless Linux; update payload signature verified against pinned key; downgrade rejected.

### Phase 2 — Persistent Tenancy Spine (SELF_HOST enablement, guarded)
**Why here:** depends on Phase 0 contracts; the RLS/persistence migration is the **highest-blast-radius** change and must precede all multi-tenant features.
- **Data:** migration governance (advisory locks + down scripts) first; add `org_id` columns (nullable) + backfill; `TenantRouter` + GUC transaction wrapper; **PgBouncer session-pooling or per-txn `SET` verification**; RLS in **log-only** then enforcing per pilot tenant; NOT NULL after backfill verified; **CI cross-tenant leak test as a merge gate**.
- **Control Plane:** persist `TenantRepository` (Postgres in SELF_HOST, single-tenant shim in EMBEDDED); `resolveTenant` middleware; ownership key → `(orgId, projectId)`; namespace Redis/NATS/DATA_DIR/Agent OS rows by `orgId`.
- **Conductor:** migrations 0003 (tenant columns) → prove all queries scoped → 0004 (RLS enable); `admission-queue` (admit/queue/reject) behind flag.
- **Identity:** replace in-memory Org/Audit stores with Postgres repos (dual-write → read-flip per org); hash-chained audit initialized + externally anchored.
- **Exit criteria:** two-org integration tests prove isolation (no cross-tenant leak, no legitimate query denied); RLS enforcing on pilot tenant; EMBEDDED single-tenant shim path unchanged; **GA gated on zero-leak proof, not pilot-tenant enforce**.

### Phase 3 — Enterprise Identity, Audit, Compliance & Billing Truth
**Why here:** needs the persistent tenancy spine; delivers the compliance + entitlement backbone.
- **Identity:** wire OIDC SSO store + `/api/agent-os/sso/*` + SSO-initiated device-flow branch; **self-hosted identity connector for FedRAMP/air-gapped** (offline token minting + JWKS distribution without internet); device-registry kill-switch + `deviceBoundRefresh` into CLI token path; device-management cockpit portal; SCIM 2.0 in **observe-only** (mandatory bake duration + admin-confirm + break-glass owner recovery before real de-provisioning); SAML behind vetted XML-DSig + external pentest, deny-by-default.
- **Security/Fleet + A2A + Billing + Data:** cut all audit writes to the **one hash-chained externally-anchored ledger** (shadow-write + parity tests → flip reads); WORM/SIEM export; retention/legal-hold; **compliance control-mapping + evidence-automation** (audit export, access reviews, change logs).
- **Billing:** Entitlement Resolver v2 (license→subscription→free-floor) as additive wrapper; durable tenant-partitioned billing tables; Polar reconciliation/backfill + durable webhook dedupe; ed25519 **offline License File** + License Authority (HSM private key) with machine-binding + max offline grace + heartbeat-on-reconnect; outbox usage pipeline; quota/SLA soft-warn layer; **FinOps: per-tenant cost attribution + hard spend caps + unit-economics model**.
- **A2A:** TenantContext warn-then-enforce; JWT/JWKS verification; chain-of-custody signing.
- **Exit criteria:** tamper-verify passes on audit chain (incl. external anchor); SSO pilot org live; air-gapped identity+license unlocks an offline fixture end-to-end; SCIM observe-only diff reviewed; billing degrade-safety verified (missing keys → free floor); SOC2/GDPR evidence pipeline producing artifacts.

### Phase 4 — Scale, HA/DR & Remote Execution Hardening
**Why here:** needs tenancy airtight before statelessness/leases; SELF_HOST-only, EMBEDDED untouched.
- **Control Plane + Conductor:** `ContainerStateStore` with fenced leases; `leader-lease.ts` (fencing tokens, idempotent orphan finalization); stateless gateways; graceful drain + readiness split; distributed rate-limit/`QuotaLedger`; per-service scoped `ServiceIdentity` tokens (retire shared `INTERNAL_SERVICE_KEY`); region-failover topology.
- **Sandbox:** Sandbox Broker (shadow → enforce tenant authz on all sandbox routes); RemoteLease table; Quota Ledger; Sandbox Reaper (dry-run → enforce); Substrate Pool (region/HA); per-workspace scoped Daytona creds; cosign image verification; streaming file transfer; **in-sandbox egress default-deny** (log-only → allowlist → deny, with audited per-task escape hatches).
- **Data:** Postgres HA (primary+replica, Patroni) + WAL/PITR + PgBouncer; completed remote backup + **restore drill publishing measured RPO/RTO**; model-versioned embeddings (HNSW).
- **A2A:** stateless gateways + durable drainable worker queue.
- **Exit criteria:** kill-leader failover test passes; two-replica SELF_HOST recovers container ownership + shares limits; restore drill meets RPO≤5min/RTO≤30min (or the SLA is revised to measured reality); sandbox cross-tenant access denied; egress default-deny working.

### Phase 5 — Fleet, Residency, Observability & GA Hardening
- **Desktop Shell + Security/Fleet:** MSI/.pkg/ADMX + Jamf/Intune/GPO silent install; offline/air-gapped install + manual verified update import; supervisor attach-mode + remote failover; signed fleet policy-push + compliance reporting; optional team-shared mTLS backend bind (default-off — evaluate whether to build at all).
- **Data + Sandbox + A2A:** region field + residency routing; GDPR erasure cascade; regional sandbox/audit pools; data-classification-driven retention + encryption policy + PII inventory.
- **Observability (all):** OTel/OTLP export + tenant-tagged Prometheus; enable disabled alert groups (gated on metric-presence); per-org dashboards; SLO alerting; live quota headers in cockpit SubstratesPanel.
- **Cockpit:** OrgSwitcher + team/space scoping; ApprovalsInbox (canonical `/api/agent-os/approvals`); AuditLogView + export; AdminConsole (SSO/SCIM/RBAC/seats/license/quota/residency); BackendProfile + cluster/failover/TLS-aware HealthStrip.
- **Identity/Billing:** unify UserRole/OrganizationRole; enable SCIM real de-provisioning (after observe-only bake); enforce concurrent-session caps + geo/IP allow-lists with break-glass; enterprise Contract/PO model.
- **Exit criteria:** enterprise reference deployment (2+ replicas, Postgres, Redis, OTLP, KMS/HSM) passes full verification suite; SOC2 Type II + ISO27001 + GDPR + FedRAMP evidence packs; air-gapped self-host validated; external pentest clean; SmartScreen/notarization/GPG all clean; `RuntimeProfile` contract tests still prove EMBEDDED zero-config.

---

## 6. Platform-Wide Decisions (resolving subsystem conflicts)

- **D1 — Tenant isolation: RLS-first, schema-per-tenant opt-in.** Postgres RLS with `org_id` + `SET LOCAL app.current_org` is the SELF_HOST default; `TenantRouter` behind the repository contract makes schema-/database-per-tenant an opt-in config for regulated tenants; EMBEDDED uses a single-tenant no-op shim. Roll out RLS log-only → enforce; PgBouncer pooling mode chosen to preserve `SET LOCAL`. *Why:* defense-in-depth below app filtering, one migration path, physical isolation is a config lever not a fork.
- **D2 — `server.ts` decomposition: incremental module-per-PR, never big-bang.** ~14k-line `server.ts` → thin composition root (`AppContext`) + `modules/*.register(app, ctx)`, one module per PR behind **characterization tests** capturing current behavior + per-PR rollback. Middleware pipeline lands as opt-in wrappers first so audit/quota can't be silently skipped.
- **D3 — Embedded vs self-host: one `RuntimeProfile`, one protocol.** Frozen `RuntimeProfile {mode, multiTenant, distributedState, requireApprovals, ssoRequired, quotaBackend, rateLimitBackend}` resolved once at boot; **fails closed to SELF_HOST**. Identical wire protocol (HTTP/WS + Bearer + `X-Recoder-Org` + `X-Recoder-Request-Id`); EMBEDDED loopback, SELF_HOST LB. Supervisor gains explicit `attach` mode. Enforced by contract tests guaranteeing EMBEDDED never requires Postgres/Redis/SSO.
- **D4 — Local↔cloud sync: cloud canonical, desktop offline-first replica.** SELF_HOST team backend owns canonical state; desktop reconciles via a versioned `SyncContract` (version vectors / `updated_at` LWW for scalar state, user-mediated resolution for document conflicts, tombstones for deletes); desktop never mutates canonical state directly. EMBEDDED local store *is* canonical.
- **D5 — One audit ledger, one identity/org model, one tier enum.** Collapse duplicates: one hash-chained externally-anchored audit ledger (replaces `AuditLogStore`, `a2a-audits.json`, `enterprise/audit-log.ts`); one `Role/Permission` + Org/Membership/Seat model in `packages/agent-os`; one `Plan` enum (`free/pro/team/enterprise`), retiring `enterprise/billing.ts`'s divergent set. Via compatibility adapters, contract-first, no big-bang.
- **D6 — Entitlement resolution order (fail-safe): license → subscription → free floor.** One Entitlement Resolver → immutable `ResolvedEntitlement` snapshot per `Subject{user|org}`; missing/expired/unverifiable always degrades to the free floor, never inflates. Air-gapped uses signed offline license (machine-bound, bounded offline grace); online hosts layer short-TTL revocation.
- **D7 — recoder.xyz is the primary IdP; backend consumes claims; a self-hosted identity connector serves fully air-gapped/FedRAMP.** Backend + A2A gateway verify signed claims, never re-implement auth. `user` and `users` stay separate.
- **D8 — Hosting/compliance/custody per PD1–PD3.** Both hosting tiers (IaC default + managed premium); full compliance scope (SOC2 II + GDPR + ISO27001 + FedRAMP/air-gapped); KMS baseline + HSM for high-assurance keys.

---

## 7. Top Risks & Open Questions

### Load-bearing risks (mitigations are mandatory, not optional)
1. **RLS rollout (Phase 2)** — highest blast radius; a missed tenant-scoped query leaks cross-tenant data or breaks the solo path. *Mitigation:* columns+backfill first, prove all queries scoped, log-only before enforce, PgBouncer pooling-mode, CI leak test as merge gate, GA gated on zero-leak proof.
2. **`verifyBridgeToken` (S0)** — accepts any non-empty bearer today; ship the fix first.
3. **Unauthenticated sandbox-by-ID (S0)** — gate on tenant lease before any enterprise sale.
4. **Signing/pinned-update-key custody (PD3)** — leaked key forges trusted builds or bricks the fleet on rotation; HSM/KMS custody + dual-key transition + tested rollback + version-monotonic updates.
5. **SAML XML-DSig** — signature-wrapping auth-bypass class; vetted library + external review + deny-by-default.
6. **Server-capacity reality** — current single Hetzner box (16GB / 94% disk / no-GPU) cannot host HA; PD1 managed tier requires new hardware/managed services + disk-pressure/retention guards to avoid ENOSPC.
7. **In-sandbox egress default-deny** — too-tight allowlists break legit runs (git/npm/pip); log-only → observed-allowlist → deny with audited escape hatches.
8. **SCIM de-provisioning is destructive** — observe-only bake + admin confirm + break-glass recovery for `enforceSSO` lockout.
9. **Supply chain** — prior Next.js RCE + on-box miner history; SBOM + CVE merge-gate + Electron/Chromium patch-cadence SLA required.

### Open questions still needing a decision
- **Q1 — Physical isolation tier (D1):** which regulated-tenant SKUs justify schema-/database-per-tenant vs shared-RLS? Affects `TenantRouter` complexity + pricing.
- **Q2 — Offline license grace vs revocation exposure (D6):** max time an air-gapped license may honor `notAfter` after revocation; machine-binding policy for high-assurance deals.
- **Q3 — Team-shared local backend (non-loopback + mTLS):** build it, or force teams onto full SELF_HOST? Widens the embedded backend attack surface; default-off agreed.
- **Q4 — CloudEvents `source` format break** (opaque → `recoder://<region>/<tenant>/<source>`): deprecation window + whether external A2A consumers subscribe today.

---

## 8. Verification Strategy

Preferred focused checks (from `.claude/rules/testing.md`):

```bash
pnpm agent:instructions:check
pnpm test:contracts:agent-os
pnpm test:evals:agent-os
pnpm check-types
```

Per-phase gates are the "Exit criteria" above. Cross-tenant isolation, RLS-enforce, failover, and restore-drill checks are **release gates**, not implementation-complete claims. Health, approval, and verification status stay truthful — no implied success without evidence (per `CLAUDE.md`).

---

## Appendix — Provenance

Produced by a read-only planning workflow (`recoder-desktop-enterprise-architecture`, run `wf_41b877a8-e2e`): 12 subsystems × (map [Explore] → design [architect]) pipeline → synthesis → adversarial review; MCP subsystem designed in a follow-up architect pass. 25 agents, ~1.9M subagent tokens. No source files were modified during planning.
