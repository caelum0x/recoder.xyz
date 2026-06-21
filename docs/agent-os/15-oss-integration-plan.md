<!-- Generated 2026-06-21 by oss-integration-mapping workflow; grounded asset->subsystem wiring plan. -->

I have enough verified ground truth. The agent-os spine already has real domain models, ports, and substantial services (run-history 596, work-signal 377), `mem0` is an 18-line interface stub with no real client dependency, polar-webhook is real (513 lines) but not wired to billing events, sandbox storage is in-memory, and no canonical A2A schemas are vendored. There are already Recoder-internal adapter packages (`@recoder/pal`, `@recoder/git-nexus`, `@recoder/beads-adapter`, `recoder-a2a`) that wrap several assets. Writing the plan now.

# Recoder Agent OS — OSS Integration Plan (Phase 2)

## 1. Thesis

Recoder already has a real Agent OS spine: `packages/agent-os` ships concrete domain models, ports, and services for every Phase-2 subsystem (e.g. `run-history-service.ts` ~596 LOC, `work-signal-service.ts` ~377 LOC, `task-routing-service.ts`, `runtime-evidence-service.ts`, `approval-service.ts`), `packages/a2a-sdk` ships a 10-schema validation layer and a 4,729-LOC `a2a-gateway.ts` in `docker-backend`, and Recoder-internal adapter packages already exist (`@recoder/pal`, `@recoder/git-nexus`, `@recoder/beads-adapter`, `recoder-a2a`). The job is therefore **not to build subsystems** — it is to replace the remaining thin seams (the 18-line `mem0-adapter.ts`, the in-memory `SandboxRecord` store, the unwired `polar-webhook.ts`, the schema-from-hand `validation.ts`, the 41-line `runtime-evidence-service.ts`) with **real, production-grade OSS** behind the ports that already exist. Adopt where a port already begs for a backend; adapt where the asset is a full product; extract where only a state machine is worth the cost; defer on-box LLM serving outright on a 16GB/no-GPU box. No new stubs.

## 2. Asset → Subsystem Map

| Asset | What it really is | Maturity | Maps to | Approach | First step | Effort |
|---|---|---|---|---|---|---|
| A2A Protocol Spec (`A2A/`) | Canonical proto + JSON Schema spec repo (not impl) | production | a2a-contract | adopt-as-dependency | Vendor `a2a.proto`+JSON Schema into `packages/a2a-sdk/schemas/canonical/`; make `validation.ts` reference it | S |
| `a2a-js` SDK | Official A2A JS/TS SDK (v0.3.13), server+client, 22 tests | production | a2a-contract, capability-routing | adopt-as-dependency | Add `@a2a-js/sdk` as peer dep; reuse its `AgentCard`/`AgentExecutor` types in `a2a-gateway.ts` | M |
| `packages/a2a-sdk` (internal) | Recoder A2A domain layer, validation, bridge contract | usable | a2a-contract, pm-approval, capability-routing, runtime-evidence | already-integrated / refactor | Lean `validation.ts` on canonical schema + `a2a-js` types; one-way envelope→bridge transforms | M |
| `recoder-a2a` (pkg) | Recoder A2A↔MCP bridge, 6 tools, v3.1.0, published | production | capability-routing, registry-session | adopt-as-dependency | Route its `send_task`/`list_agents` through bridge job queue, not ad-hoc REST | S |
| `opencode` | Bun ACP coding agent + session/DB/tool registry | production | registry-session, capability-routing, runtime-evidence | extract-subset (types only) | Adopt ACP session/tool types as reference for registry-session; do **not** import Bun runtime | M |
| `pi` | Minimal Node agent harness (`pi-agent-core`) | usable | registry-session, capability-routing, runtime-evidence | adopt-as-dependency | Use `pi-agent-core` `runAgentLoop()` as a `runtime-adapter` port impl | M |
| `oh-my-codex` | TS+Rust Codex orchestrator (authority/replay/backlog) | usable | registry-session, pm-approval, run-history-unify | extract-subset | Port authority-lease state machine into `work-lock-service`/registry-session | L |
| `oh-my-openagent` | OpenCode plugin harness, multi-model routing | production | capability-routing, mcp/planning, memory | adapt-via-adapter | Reference model-capability aliases for routing; do not import OpenCode plugin API | M |
| `open-agents` | Vercel ToolLoopAgent + tool system, 200+ tests | production | runtime-evidence, capability-routing, run-history-unify | extract-subset | Port tool-loop+tool set as a `runtime-adapter`; drop Vercel Workflow coupling | M |
| `gemini-cli` | Google CLI w/ `packages/a2a-server` + core loop | production | a2a-contract, capability-routing, runtime-evidence | adapt-via-adapter | Use `a2a-server` as conformance reference for our gateway; provider adapter for routing | M |
| `qwen-code` | Multi-provider CLI (OpenAI/Anthropic/Gemini/…) | production | capability-routing, mcp/planning, memory | adapt-via-adapter | Mine its provider/model-detection logic for capability-routing model selector | M |
| `openfang` | Rust Agent OS (kernel/approval/router/memory) | production | many | extract-subset (sidecar) | Port `ModelRouter` complexity scoring into `task-routing-service`; approval risk levels into `approval-service` | L |
| `OpenClaw` | Full WhatsApp/multi-channel gateway product | production | capability-routing, registry-session, observability | adapt-via-adapter (already partly) | `a2a-openclaw-adapter.ts` exists — extend channel allowlists → capability scopes | M |
| `claw-code-parity` | Rust Claude Code parity harness (TaskRegistry, PermissionEnforcer) | usable | mcp/planning, runtime-evidence, pm-approval, sandbox | extract-subset (sidecar) | Bind `PermissionEnforcer` to `approval-service` via capability scopes | M |
| `ClawWork` | Python economic/billing benchmark + EconomicTracker | usable | billing, runtime-evidence, observability | adapt-via-adapter | Wrap `EconomicTracker` as a billing collector behind a usage port | M |
| `Daytona` | Sandbox infra runtime, ~90ms spin-up, multi-SDK | production | sandbox, runtime-evidence | adopt-as-dependency | Replace in-memory `SandboxRecord` store in `sandboxes.ts` with Daytona SDK | M |
| `E2B` | Cloud sandbox SDK (self-host via separate Terraform) | production | sandbox, runtime-evidence | adapt-via-adapter (fallback) | `e2b-adapter.ts` behind same sandbox port; secondary to Daytona | M |
| `stagehand` | AI browser automation (act/extract/observe/agent) | production | browser, runtime-evidence | adopt-as-dependency | Wrap V3 context as a browser-runtime adapter emitting evidence (screenshots) | M |
| `agent-browser` | Rust CDP browser daemon, no LLM | production | browser, runtime-evidence | adopt-as-dependency (sidecar) | Socket adapter translating A2A actions → daemon commands → evidence | M |
| `mem0` | Production memory layer, Qdrant-backed, TS+Py SDK | production | memory, runtime-evidence | adopt-as-dependency | Replace 18-line `mem0-adapter.ts` with real `MemoryClient` (cloud-LLM + on-box Qdrant) | M |
| `context7` | Live docs fetcher via MCP | production | mcp/planning, observability | adapt-via-adapter | Wire into instruction compilation pre-flight (top-N libs from deps) | M |
| `GitNexus` | Code knowledge-graph engine (`@recoder/git-nexus` wraps it) | production | runtime-evidence, memory | adopt-as-dependency | Run as scheduled pre-flight; ingest graph behind `memory-store` port — **license gate** | M |
| `Multica` | Go+TS managed-agents SaaS | production | pm-approval, capability-routing, memory | vendor-and-fork (defer) | Reference its approval/skill-graph model; do not fork now | L |
| `ops-recorder` | Python work-signal detector (~184 LOC) | usable | runtime-evidence, observability | port-to-TS (mostly done) | `work-signal-service.ts` (377 LOC) exists — finish GitHub/Linear normalizer ports + webhook wiring | S |
| MCP Directory + A2A/Codex adapters (`mcp/`, `shared/`) | Node MCP host + WS bridge + codex adapter | production | a2a-contract, registry-session, capability-routing | adopt-as-dependency | Move inbound WS queue to Redis stream; validate every msg via `a2a-sdk` | M |
| `pal-mcp-server` | Python multi-model orchestration MCP (23+ tools) | production | mcp/planning, capability-routing, observability | adapt-via-adapter (`@recoder/pal` exists) | Route capability requests to PAL tools w/ model hints from policy | L |
| `ziti` | Vendored OpenZiti, already wired (`ziti-client.ts`) | production | capability-routing, runtime-evidence | adopt (done) | Surface `zitiHealth()` as a registry-session boot prerequisite signal | S |
| `polar` | Vendored Polar billing platform | production | billing | adopt-as-dependency | Wire `polar-webhook.ts` (513 LOC, already real) to Recoder usage/entitlement events | M |
| `backend` | Python FastAPI agent monolith (61K LOC) | production | runtime-evidence, mcp/planning, run-history-unify | adapt-via-adapter | Emit its run state as `RunHistoryEvent`s into `run-history-service` sink | M |
| `beads` | Go+Dolt task graph + `beads-mcp` (`@recoder/beads-adapter` exists) | production | run-history-unify, registry-session, pm-approval | adapt-via-adapter (adapter exists) | Use `@recoder/beads-adapter` to sync TaskSpec ↔ beads; map deps → approval blockers | M |
| `ollama` | Vendored local LLM runtime (Go/C++) | production | none | **defer** | Keep behind future `llm-router` provider slot; do not run on-box | XL |
| `vllm` | Vendored GPU LLM serving engine | production | none | **defer** | Same; datacenter-GPU only | XL |

## 3. Per-Subsystem Wiring (PR-sized first changes)

### a2a-contract — the gate everything else passes through
- **Wire:** `A2A/` (canonical spec) + `a2a-js` SDK behind the existing `packages/a2a-sdk` + `docker-backend/src/a2a-gateway.ts`.
- **Reality:** `packages/a2a-sdk/src/schemas/` already has 10 hand-authored schemas (`task-envelope.ts`, `agent-card.ts`, `error-taxonomy.ts`, `signed-envelope.ts`, …) and `validation.ts`. No `schemas/canonical/` exists yet.
- **First PR:** Add `packages/a2a-sdk/schemas/canonical/` containing the vendored `a2a.proto` + generated JSON Schema from `A2A/specification/`. Add a single conformance test `a2a-sdk/src/canonical-conformance.test.ts` asserting our `TaskEnvelope`/`AgentCard`/`A2AError` schemas are a superset of canonical fields. Do **not** rip out `validation.ts` yet — just fail CI on drift. (effort S)
- **Follow-up PR:** Import `@a2a-js/sdk` types into `a2a-gateway.ts` for `AgentCard`; keep Express instance shared (pin version to avoid diamond conflict noted in the inventory).

### registry-session — durable agent identity + bridge reconcile
- **Wire:** `recoder-a2a` (bridge), MCP Directory WS bridge (`mcp/`, `shared/`), `@recoder/beads-adapter`, `ziti` health, optionally `oh-my-codex` authority leases.
- **Reality:** `agent-profile-reconciliation-service.ts` and `work-lock-service.ts` already exist in `packages/agent-os/src/services/`.
- **First PR:** Replace the in-memory inbound task queue in the MCP WS bridge with a Redis stream (`RECODER_A2A_INTENT_STREAM_KEY`), and key bridge sessions by `agent workspace + enrollment identity` (use `zitiHealth()` as a boot prerequisite) instead of an ephemeral per-instance `SESSION_ID`. Feed reconciled identities into `agent-profile-reconciliation-service`. (effort M)

### pm-approval — partly done
- **Wire:** existing `approval-service.ts` (68 LOC) + `domain/approval.ts`; reference `openfang` risk levels and `claw-code-parity` `PermissionEnforcer`; `@recoder/beads-adapter` for blockers.
- **First PR:** Map A2A capability scopes (bash/file/network) to `domain/approval.ts` risk tiers using openfang's `approval.rs` taxonomy as the rubric (port the enum, not the Rust). Add beads dependency edges → approval blockers via `@recoder/beads-adapter`. (effort M)

### capability-routing — route by capability/policy/assignee/intent
- **Wire:** existing `task-routing-service.ts` (182 LOC) + `policy-engine` port + `@recoder/pal`; mine model-selection logic from `qwen-code`/`openfang ModelRouter`/`oh-my-openagent` aliases.
- **First PR:** Add a cost/complexity-aware model selector to `task-routing-service` modeled on openfang's `routing.rs` complexity scoring, fed by `@recoder/pal`. Source model aliases from `oh-my-openagent`'s capability-alias map. Cloud-LLM only (no local providers). (effort M)

### runtime-evidence — normalize git/stdout/stderr/preview
- **Wire:** existing `runtime-evidence-service.ts` (only 41 LOC — thin) + `domain/runtime-evidence.ts`; evidence producers from `stagehand`/`agent-browser` (screenshots), Daytona/E2B (stdout/stderr), GitNexus (repo graph), `ops-recorder` (work signals).
- **First PR:** Expand `runtime-evidence-service.ts` from 41 LOC to a real normalizer that accepts `{git, stdout, stderr, preview, screenshot}` tuples and persists `RuntimeEvidence` records. Make the sandbox route (below) and browser adapters its first producers. (effort M)

### run-history-unify
- **Wire:** existing `run-history-service.ts` (596 LOC — already substantial) as the canonical sink; `@recoder/beads-adapter`→beads/Dolt for durable audit; `backend` run-state as an event producer.
- **First PR:** Add a `RunHistoryEvent` producer adapter for the Python `backend` runner (`execute_agent_run`) that POSTs normalized events into `run-history-service`, with an explicit `agent_run_id ↔ A2A task_id` id-map table (called out as a divergence risk in the inventory). (effort M)

### Cross-cutting

- **memory:** Replace the 18-line `packages/agent-memory/src/adapters/mem0-adapter.ts` (currently just an interface over a `search()` shim, no real client, no `mem0ai` dep) with a real `Mem0MemoryAdapter` backed by `mem0` in **cloud-LLM + on-box Qdrant** mode. Add `mem0ai` to `packages/agent-memory/package.json` (currently has zero runtime deps). Keep it behind the existing `memory-store` port; `postgres-pgvector.ts` adapter already exists as the fallback. (effort M)
- **mcp/planning:** Wire `context7` doc-fetch + `@recoder/pal`/`pal-mcp-server` into an instruction-compile pre-flight that resolves top-N libs from `package.json`/`pyproject.toml` and logs which libs/versions were injected (observability). (effort M)
- **sandbox:** Replace the in-memory `SandboxRecord` `Map` in `docker-backend/src/public-api/routes/sandboxes.ts` (line ~57 "in-memory for now", 1,125 LOC) with a `Daytona` SDK adapter behind a `SandboxProvider` port; add `e2b-adapter.ts` as fallback. Sandbox lifecycle events feed `runtime-evidence-service`. (effort M)
- **browser:** Add `stagehand` (LLM-driven) and `agent-browser` (Rust CDP daemon, deterministic) as two browser-runtime adapters behind one port; both emit annotated screenshots into runtime-evidence. (effort M)
- **billing:** Wire `polar-webhook.ts` (513 LOC, already real handlers, **not yet** connected to Recoder events) → emit `UsageEvent`/entitlement changes (`subscription.created`→enable, `subscription.canceled`→revoke) with a TTL entitlement cache. Optionally layer `ClawWork` `EconomicTracker` as a per-run token-cost collector behind a usage port. (effort M)
- **observability:** Surface `ziti` health, context7 fetch logs, and PAL tool/model/token results as evidence/metrics. `agent-observability` + `langfuse` packages already exist as the sink. (effort S–M)

## 4. Sequenced Build Order (Phase-2 waves)

**Wave 0 — Contract gate (unblocks all):**
1. Vendor canonical A2A schema into `a2a-sdk/schemas/canonical/` + conformance test. (S)
2. Adopt `a2a-js` types in `a2a-gateway.ts`. (M)
> *Unblocks:* every inbound/outbound envelope, registry-session, capability-routing.

**Wave 1 — Identity + sink foundations (need the contract):**
3. registry-session: Redis-stream bridge queue + identity keying + ziti boot signal. (M)
4. run-history-unify: confirm `run-history-service` as sink; add `backend` event producer + id-map. (M)
> *Unblocks:* runtime-evidence (needs a sink + session), pm-approval (needs durable run id).

**Wave 2 — Evidence + routing (need identity/sink):**
5. runtime-evidence-service: grow from 41 LOC to real normalizer. (M)
6. sandbox: Daytona adapter replaces in-memory store → first evidence producer. (M)
7. capability-routing: cost/complexity model selector via `@recoder/pal` + openfang scoring. (M)

**Wave 3 — Approvals + cross-cutting value:**
8. pm-approval: capability-scope → risk-tier mapping + beads blockers. (M)
9. memory: real `mem0` adapter (cloud LLM + Qdrant). (M)
10. mcp/planning: context7 + PAL instruction pre-flight. (M)
11. browser: stagehand + agent-browser adapters → evidence. (M)

**Wave 4 — Commercial + polish:**
12. billing: wire `polar-webhook` to usage/entitlement events; optional ClawWork tracker. (M)
13. observability: PAL/context7/ziti metrics into `agent-observability`/`langfuse`. (S–M)
14. ops-recorder: finish GitHub/Linear normalizer ports + webhook refresh. (S)

**Heavy/deferred-decision items (do not block waves):** openfang sidecar, claw-code-parity sidecar, Multica fork, full beads/Dolt-per-workspace — schedule only after Waves 0–2 prove the port boundaries.

## 5. DEFER / DROP

| Item | Decision | Reason |
|---|---|---|
| `ollama` | **DEFER (XL)** | 16GB/no-GPU box; a 7B model alone needs ~10GB and would thrash under agent load. Keep behind a future `llm-router` provider slot only. Strategy is cloud LLM + on-box Qdrant. |
| `vllm` | **DEFER (XL)** | Requires CUDA + datacenter GPUs and continuous batching; fails loudly on CPU-only. No on-box benefit; no built-in Anthropic Messages API. |
| `Multica` (Go fork) | **DEFER (L)** | Full SaaS platform; vendor-and-fork inherits workspace/auth cruft and a Go↔TS boundary. Use as a *reference* for approval/skill-graph design; reconsider only after the TS spine is proven. |
| `oh-my-codex` Rust runtime | **DEFER / extract-later (L)** | Undocumented Rust state machine, tightly coupled to Codex CLI + tmux team orchestration; only the authority-lease concept is worth porting, after registry-session lands. |
| `openfang` / `claw-code-parity` full adoption | **DEFER to sidecar (L/M)** | Rust↔Node FFI/sidecar cost is real; adopt only the *types/rubrics* now (approval risk levels, ModelRouter scoring, PermissionEnforcer mapping), full sidecar later. |
| `opencode` Bun runtime | **DROP runtime, adopt types** | Bun runtime mismatch with Node `docker-backend`; take ACP session/tool *type* shapes as reference, not the engine. |
| `backend` MCP registry as evidence source | **DROP for evidence** | Inventory notes it captures tool *schema* only, not runtime execution evidence — use it as a run-state producer, not an evidence source. |
| GitNexus shipping commercially | **GATE, not drop** | PolyForm-Noncommercial license — founder must confirm a commercial license before it ships in a paid path; safe to use internally/pre-flight meanwhile. |
| `oh-my-openagent` / SUL-1.0 | **adapt only, license-gate** | SUL-1.0 redistribution restrictions; extract patterns (model aliases, hook model), do not vendor as a dependency. |

---

*Note for implementers:* several seams the source gap-analysis described as "stubs" are already real in this repo — `run-history-service.ts` (~596 LOC), `work-signal-service.ts` (~377 LOC), `polar-webhook.ts` (513 LOC), `task-routing-service.ts`, `agent-profile-reconciliation-service.ts`, and Recoder-internal adapter packages `@recoder/pal`, `@recoder/git-nexus`, `@recoder/beads-adapter`, `recoder-a2a`. The genuinely thin/unwired seams to attack first are: `mem0-adapter.ts` (18 LOC, no real client/dep), `runtime-evidence-service.ts` (41 LOC), the in-memory `SandboxRecord` store in `sandboxes.ts`, the absence of `a2a-sdk/schemas/canonical/`, and `polar-webhook.ts` not yet emitting Recoder usage/entitlement events.
