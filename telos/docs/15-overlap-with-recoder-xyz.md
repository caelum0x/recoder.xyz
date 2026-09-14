# 15 — Overlap with recoder.xyz (the A/B decision)

**Status:** decided — **Option B (driver-in)**, refined below.
**Context:** Telos now lives at `recoder.xyz/telos`, a separate tree beside `backend/` and `apps/`. This doc maps every Telos surface in `PLAN.md` to what `recoder.xyz/backend` already ships, so we build only what is genuinely new.

## TL;DR

The **Cloud half of Telos already exists** in `backend/src/domains/cloud` + `conductor`. Do not rebuild it. The **only net-new surface is the native Studio** (`recoder-native-d`: 10 verbs, Bevy/Godot-C# drivers, Playproof, cook). Build that as a daemon + drivers and expose it *through* the existing cloud/conductor/mcp surfaces.

## Surface-by-surface map

| Telos (PLAN.md) | Already in recoder.xyz | Verdict |
|---|---|---|
| `apps/api` control plane | `backend/src` (Hono/Express, domains pattern) | **Reuse.** Don't stand up a second API. |
| Sandbox driver: Daytona \| E2B \| Docker | `domains/cloud/adapters/{daytona,e2b,local-container}.adapter.ts` + `sandbox-provisioner.service.ts` | **Done.** Already the exact three drivers, with TTL reaper + reconcile. |
| Ship loop: branch → preview URL (Goal #1) | `domains/cloud/services/preview-deploy.service.ts` + `preview-url-signer.ts` + `preview-target.adapter.ts` (real health probe) | **Done.** Wire `recoder cloud ship` to this, don't reimplement. |
| Deploy driver: **Coolify** \| Kamal | *(not present — uses own preview-target + xDS/envoy)* | **NEW (small).** Add `coolify.adapter.ts` as one more `preview-target` adapter *iff* Coolify is actually wanted over the current path. Decide before building. |
| Multi-tenant isolation | `domains/cloud/services/tenancy.service.ts` + `cloud-write-gate.ts` + `read-scope.ts` | **Done.** "sandboxes cannot see other tenants" is already the write-gate. |
| Prod/stores need `approval_id` | `domains/conductor/` (`approval-clearance`, `checkpoint`, `cockpit`) | **Reuse.** Route `deploy.prod` / `studio.cook` approvals through conductor. |
| Quotas / RBAC | `domains/cloud` billing-quota port + `domains/billing`, `domains/governance` | **Reuse / extend.** Don't build a new quota system. |
| MCP: cloud verbs (`deploy.staging`, `logs.fetch`, …) | `domains/cloud/mcp/{cloud-engine,cloud-write-engine,…}` + root `mcp/` (a2a bridge, codex adapter, recoder-mcp-server) | **Extend existing registry.** Add verbs here, not a parallel MCP server. |
| Engine adapters (worktree/session plumbing) | `domains/engines/` (`dmux-adapter`, `loom-daemon`, `beads`, `colbert`, `browser-use`) | **Reuse.** Studio daemon is a new engine adapter alongside these. |
| **Native Studio: `recoder-native-d`, 10 verbs, Bevy/Godot-C#, Playproof, cook-android** | *(nothing — no bevy/godot/coolify/playproof anywhere in tree)* | **NEW. This is the whole point of Telos.** |

## What this means for the build order

Supersedes the front of `06-roadmap.md`:

1. **Do NOT build** a new control plane, sandbox driver, preview-URL service, tenancy gate, quota system, or approval flow. They exist and are tested.
2. **Studio daemon is the product.** Build `recoder-native-d` (docs/12-daemon.md) + `packages/drivers/studio-bevy` first. Target the roadmap demo verbatim: bevy-2d-platformer → change jump height → `studio.build` → `studio.tick` → `last.png` shows the higher jump.
3. **Expose it through what exists:** register the 10 Studio verbs in the existing MCP registry (`domains/cloud/mcp` + root `mcp/`); gate `studio.cook`/`deploy.prod` via `conductor` approvals; run Studio boxes via the existing `sandbox-provisioner`.
4. **Coolify is a maybe, not a given.** The cloud domain already deploys previews. Only add `coolify.adapter.ts` if there's a concrete reason to prefer it; otherwise drop it from the plan.

## What stays true from the original plan

- Native, not HTML5, not editor-MCP (`docs/08`) — unchanged, this is the wedge.
- 10 verbs, not 200 MCP tools — unchanged.
- Compose, don't merge vendors — **and now: don't merge/duplicate our own `domains/cloud` either.**
- Separate tree under `recoder.xyz` (not inside `apps/desktop`/recoder-code) — honored.

## Single rule added

> **Rule 8.** Telos owns the *native Studio*. The Cloud half (sandbox, preview, tenancy, quota, approval, MCP registry) is `backend/src/domains`. Telos calls into it; it does not re-implement it.

## Landed (Option B in practice)

The two forks are now wired into the existing control plane as adapters — no second plane:

- **resandbox → sandbox provider.** `backend/src/domains/cloud/adapters/resandbox.adapter.ts`
  implements `SandboxProvider` (id `resandbox`), E2B-compatible REST gated on `RESANDBOX_BASE_URL`
  (self-host; API key optional), registered in the provisioner alongside daytona/e2b/local.
- **recloud → deploy target.** `backend/src/domains/cloud/adapters/recloud-deploy.adapter.ts`
  implements `DeployTarget` (kind `preview`), selected by the cloud module when `RECLOUD_BASE_URL`
  is set, triggering real recloud deploys and returning the app's preview URL.

Both are degrade-safe (absent config ⇒ `down`/`Err`, never faked) and type-check clean.

### Runtimes (the other half of each)

- **resandbox orchestrator** — `telos/packages/drivers/sandbox-docker/server.mjs`: a zero-dep
  Node server implementing the E2B-compatible REST over local Docker. Point `RESANDBOX_BASE_URL`
  at it. HTTP layer smoke-tested; container lifecycle pending a healthy Docker host.
- **recloud provisioning** — `recloud-deploy.adapter.ts` now provisions a fresh preview app per
  deploy via recloud's tRPC (`application.create` → `saveGitProvider` → `domain.generateDomain`
  → `domain.create` → `application.deploy`) using `x-api-key`, driven by `RECLOUD_ENVIRONMENT_ID`
  /`RECLOUD_SERVER_ID`; falls back to the `metadata.recloud` webhook path. tRPC shapes are
  source-derived — confirm against a live recloud.

Remaining: validate recloud provisioning against a running instance; Firecracker/multi-tenant
isolation for the orchestrator (GOAL non-goal for v1).
