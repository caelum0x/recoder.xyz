# Recoder — Whole-Codebase Architecture & Product Plan

> **This is the master plan.** It defines what Recoder is, the eight owned subsystems
> it is built from, the open-source code fused into each, and the order in which the
> fusions land build-green. Each subsystem has its own deep design doc in this folder
> (`brain.md`, `governance.md`, `coordination.md`, `runtime.md`, `substrate.md`,
> `network.md`, `interop.md`, `distribution.md`) — every one specifies a real
> 100+-functional-file package, not a stub.

---

## 1. What Recoder is

Recoder is an **Agent OS control plane** — not a chat app, not a prompt library. It runs
the user's *own* coding agents (Claude Code, Codex, opencode, pi, Gemini CLI, Qwen Code,
browser agents, A2A externals), coordinates many of them in parallel across machines and
orgs, and keeps the canonical record of every task, approval, memory, artifact, and audit
event below the model where it can be enforced — not trusted.

The product thesis (and the moat): **the backend / control-plane spine is the product.**
v1's user-facing surfaces failed; the durable value is the infrastructure that makes a
fleet of heterogeneous coding agents safe, coordinated, auditable, and cheap to run.
Runtimes and OSS systems are **replaceable execution surfaces and fused components** around
Recoder-owned state — never owners of that state.

### The four load-bearing invariants

1. **State of record lives in `@recoder/agent-os`.** Task, approval, artifact, memory, and
   verification state never migrate into Claude Code, Codex, MCP, Daytona, E2B, or any
   adapter. Subsystems emit/consume shared `RunEvent`/CloudEvent records.
2. **Security is enforced below the model.** Instruction files shape behavior; hooks,
   policy gates, signed envelopes, and server-side validation *enforce* it. Never trust
   agent output, MCP tool descriptions, remote repo instructions, runtime-reported success,
   browser page content, memory candidates, or unauthenticated connector traffic.
3. **Fail safe, surface truth.** Missing keys/deps degrade explicitly (annotated, reported
   in health) instead of throwing or faking success. Health, approval, and verification
   status are always truthful.
4. **Durable memory is reviewable.** Memory is proposed as evidence-backed candidates and
   approved through governance — never written silently as runtime state.

---

## 2. The architecture in one picture

```
                          Humans: intent · scope · constraints · verification · approvals
                                                   │
                                                   ▼
   ┌──────────────────────────────  RECODER AGENT OS  ──────────────────────────────────┐
   │                                                                                      │
   │   CONTROL-PLANE CORE  (owns canonical state — contracts + legal transitions)         │
   │   @recoder/agent-os · a2a-sdk · agent-instructions · agent-policy · agent-events      │
   │   · agent-memory · agent-runtimes · agent-workflows · agent-mcp                       │
   │                                                                                      │
   │   EIGHT OWNED SUBSYSTEMS  (first-party fusions of OSS — merged & edited, not wrapped) │
   │   ┌──────────┬──────────────┬──────────────┬──────────┐                              │
   │   │  brain   │  governance  │ coordination │ runtime  │   ← think · decide · dispatch │
   │   ├──────────┼──────────────┼──────────────┼──────────┤                              │
   │   │substrate │   network    │   interop    │ distrib. │   ← isolate · connect · ship  │
   │   └──────────┴──────────────┴──────────────┴──────────┘                              │
   └──────────────────────────────────────────────────────────────────────────────────────┘
                                                   │ emits RunEvent / consumes TaskSpec
                                                   ▼
        EXECUTION SURFACES (adapters):  Claude Code · Codex · opencode · pi · Gemini ·
                                        Qwen · browser agents · external A2A connectors
```

The control-plane **core packages** own the contracts and the only legal state transitions.
The **eight subsystems** are the owned engines that fuse open-source code into Recoder. The
**execution surfaces** are replaceable.

---

## 3. The eight subsystems

| # | Subsystem | Lives at | One line | Doc | Status |
|---|-----------|----------|----------|-----|--------|
| 1 | **brain** | `packages/brain` | Shared memory: repo intelligence + semantic recall + docs + task graph + **desktop activity**, **assembled once per repo/task and reused by every agent** (the token-waste killer). | [brain.md](./brain.md) | **built & green** — 5 real sources behind ports (gitnexus · continuum · mem0 · context7 · beads), wired into `docker-backend` (flag-gated); now with **assemble-once content-addressed cache + tokens-saved metric** + degrade-safe mem0/context7 source-lighting (**161 tests**, `cfd181394`) |
| 2 | **governance** | `packages/governance` + `crates/recoder-governance/` | Policy spine: model/risk routing, approval risk tiers, permission enforcement, tamper-evident audit + replay. | [governance.md](./governance.md) | **built & green; wired** — TS facade `@recoder/governance` (domain · policy · approval · enforcement[deny-biased fallback] · Merkle audit · routing · UDS-IPC client), **131/131 tests**; **owned Rust workspace** `crates/recoder-governance/` (8 crates: types · permission · approval · routing · audit · kernel · ipc · daemon), **246/246 tests**, **daemon binary built**, Merkle hash **cross-language pinned** to the TS verifier via a golden vector (`recoder-governance-audit/tests/ts_interop.rs`). **Wired into the conductor delivery gate** (`governance-gate.ts decideDelivery`, fail-closed). **Gap:** TS facade ↔ daemon are not yet wired into one running process (the IPC path is integration-tested in-Rust over a real UDS, but the Node client talks to a live daemon only when one is launched). See BUILD-STATUS §5/§14. |
| 3 | **coordination** | `packages/coordination` | Fleet coherence: work-locks, dependency-aware idempotent dispatch, A2A handoff bus, drift reconciler. | [coordination.md](./coordination.md) | **built & green; wired** — **267/267 tests** (`node --test`); wired into the conductor for **claim-before-launch + handoff-on-review** (`coordination-integration.ts` → `workspace-service.ts`, degrade-safe), backed by a **durable `PostgresClaimStore`** (CAS: `SELECT … FOR UPDATE` + `ON CONFLICT`, `7807f9e94`) and **durable Postgres lock store** (restart-survivable). **Gaps:** NATS transport, contract/property/integration test suites, and Postgres handoff/squad/presence stores are not yet shipped (see coordination.md §0.1). See BUILD-STATUS §4. |
| 4 | **runtime** | `packages/runtime` | Drives the user's own agent CLIs headless behind one driver contract; translates native streams → `RunEvent`. | [runtime.md](./runtime.md) | **built & green; now WIRED** — 160/160 tests; the real engine now drives `apps/agent-worker`'s `runtime-registry` **and** an `in_process` conductor substrate (`b83e21ff0`). The proven live `claude -p` run still went through the canonical **tmux+worktree conductor driver**; `@recoder/runtime` is the second, now-imported driver path. See BUILD-STATUS §10. |
| 5 | **substrate** | `packages/substrate` + `docker-backend/src/conductor` | Restart-survivable isolation + launch: local **tmux + git worktrees**, remote **Daytona**. | [substrate.md](./substrate.md) | **built & green; engine + supporting modules adopted; local/remote drivers still in backend** — real `@recoder/substrate` v0.1.0 (contract · **8-CLI** command resolver · registry · errors · ports · exec · review · observe · **`WorkspaceEngine`** · reconcile · factory; **82 src files**), **64 tests pass** (`node --test`, verified 2026-06-29). Adopted by 8 conductor files (`runtime-commands.ts`, `substrate.ts`, `review.ts`, `run-tailer.ts`, `workspace-service.ts`, `substrate-tmux.ts`, `substrate-daytona.ts`). **Honest gap:** the tmux/Daytona driver bodies + `publish/`/`config/`/`observability/` are NOT in the package yet (still in `docker-backend/src/conductor`); Daytona real-runtime path is secret-gated. Live-agent run PROVEN through the backend tmux+worktree driver (`claude -p`, exit 0, diff, teardown). See substrate.md §13. |
| 6 | **network** | `packages/network` (`@recoder/network`) + `docker-backend/src/network` (adapter) + `go/recoder-xds` (Envoy) · ziti deferred | **Envoy-based** zero-trust L7: real Envoy v3 bootstrap (mTLS · fail-closed `ext_authz`→governance · access-log) + a Go Envoy **xDS** control plane + **XDR** access-log→detections. (ziti dark-overlay is a deferred future option.) | [network.md](./network.md) | **built (Envoy)** — pure `@recoder/network` Envoy bootstrap + default-deny ext_authz + XDR (`packages/network`, **31/31 tests**), adopted by `docker-backend/src/network` (`/api/network`, `/internal/network/authz`, **5 adapter tests**); `go/recoder-xds` real Go xDS (`go-control-plane` v0.14.0, ADS/LDS/CDS/RDS, builds, **13 Go tests**); XDR 4 detections sealed into the governance Merkle audit (`b6fb599a3`, `a4436f3fc`, `6d1cf0611`). **ziti deferred (infra-gated).** Live proxy run + real mTLS needs ops/creds. See BUILD-STATUS §14. |
| 7 | **interop** | `packages/interop` (← `a2a-sdk` + `agent-mcp`) | A2A wire interoperability + MCP host/registry + connector gateways — the agent-to-agent and tool surface. | [interop.md](./interop.md) | **partial; ingress gate WIRED** — real ed25519 + signed-ingress gate (`packages/interop/src/{ed25519,signed-ingress-gate}.ts`), **54/54 tests**, **wired into the LIVE A2A gateway** ingress middleware (`docker-backend/src/a2a/`, `b83e21ff0`, degrade-safe behind `RECODER_A2A_STRICT_INGRESS`). MCP host facade + PAL hosting shipped & adopted by `/api/mcp` (`d120c80fb`); the full engine tree (engine/ports/transport/persistence/seams) is design-of-record. **Connectors:** `@recoder/connectors` exports **7 live channels** (telegram/slack/signal/imessage/whatsapp/line/feishu, dispatch-tested); **Discord NOT exported** (un-extracted bot core, 172 TS errors — honest gap). See interop.md §0/§17 + BUILD-STATUS §2. |
| 8 | **distribution** | `packages/distribution` + `py/recoder-billing` + packaging | How Recoder ships & monetizes: CLI device-flow auth, **typed `BillingPort` + real Polar MoR adapter**, homebrew/desktop packaging, enterprise (org/seats · SSO/OIDC · usage · device-registry). | [distribution.md](./distribution.md) | **building** — `@recoder/distribution` built (device-flow · `BillingPort` + **real Polar adapter** · license-key/webhook→entitlement · homebrew/desktop packaging · org/seats · SSO/OIDC · usage · device-registry), **88/88 TS tests PASS** (re-run 2026-06-29). `py/recoder-billing` Polar fusion is broad (checkout/order/payout/subscription/webhook/stripe/metering/portal + signed internal-api) but its **~94 py tests are unverified** — corrupt `pyproject.toml` + missing deps block collection. **Polar = Merchant of Record** (Turkey/no-Stripe). **Live Polar checkout secret-gated** (needs `POLAR_ACCESS_TOKEN` + real product/price IDs). Public-artifact publishing (sites/domains/previews) NOT yet fused. See distribution.md §6–7. |

> Reading order for newcomers: **brain → governance → coordination → runtime** (the agent's
> think/decide/dispatch/execute loop), then **substrate → network → interop → distribution**
> (isolate/connect/integrate/ship).

---

## 4. The control-plane core (owns canonical state)

These packages are **not** subsystems — they are the contracts the subsystems are adapters
around (per `.claude/rules/monorepo.md`). Subsystems must not move canonical state out of them.

| Package | Owns |
|---|---|
| `packages/agent-os` | Domain contracts + legal state transitions (TaskSpec, AgentProfile, WorkLock, Approval, Artifact, Run). The state of record. |
| `packages/a2a-sdk` | Wire-level A2A interoperability contracts (folded into **interop**). |
| `packages/agent-instructions` | Instruction loading, rendering, provenance (the compiled bundles runtimes consume). |
| `packages/agent-policy` | Deterministic policy decisions (folded into **governance**). |
| `packages/agent-events` | CloudEvents + outbox envelopes (`RunEvent` transport). |
| `packages/agent-memory` | Reviewed memory-candidate lifecycle helpers (intended write-back lane for **brain**; **not yet wired into `packages/brain`** — `Brain.record` currently calls `MemoryPort.remember` directly, see [brain.md §Gaps](./brain.md#11-gaps--not-yet-live-honest)). |
| `packages/agent-runtimes` | Runtime adapter contracts (the port **runtime** implements). |
| `packages/agent-workflows` | Workflow definitions + driver contracts. |
| `packages/agent-mcp` | MCP registry + tool-permission contracts (folded into **interop**). |

---

## 5. The OSS fusion stack (the keystone)

Recoder is built by **fusing** battle-tested open source into owned subsystems — we *merge
and edit the source*, we do **not** thin-HTTP-wrap it. OSS lives under language-grouped
directories (`crates/` Rust, `go/` Go, `py/` Python, `ts/` TypeScript, `c/` C) as de-git'd
owned source, then merges into the target subsystem.

| OSS (real, owned) | Path | Lang | Fuses into | Provides |
|---|---|---|---|---|
| **RecoderGit** | `ts/recodergit` | TS | brain (`repo/`, via `@recoder/recodergit` CLI/MCP — *not* vendored in-package) | Tree-sitter AST ingestion → code knowledge graph (LadybugDB/`lbug`) → embeddings → search/RAG → MCP. The real repo-intelligence engine; consumed as a workspace dep behind `RepoIntelPort`. |
| **mem0** | `py/mem0` (+ `mem0-ts/src/oss`) | Py/TS | brain (`memory/`, via a REST adapter — SDK *not* imported) | Semantic recall over a self-hosted mem0 server. Reached through `memory/mem0-memory.ts` (fetch, **secret-gated**: `MEM0_BASE_URL`/`MEM0_API_KEY`), not by merging mem0 source files. |
| **context7-sdk** | `packages/context7-sdk` | TS | brain (`docs/`, via a fetch adapter — SDK *not* imported) | External library docs. The Brain replicates the context7 wire shape in `docs/context7-docs.ts` (**secret-gated**: `CONTEXT7_API_KEY`), not by merging the SDK. |
| **beads** | `go/beads` | Go | brain (`tasks/`, via the `bd` CLI — *not* the Dolt store) | Durable task graph. The Brain shells `bd` in `tasks/beads-tasks.ts`; the `go/beads` Dolt RPC backend is not wired into this package today. |
| **multica** | `go/multica` | Go | brain + coordination | Knowledge/memory service parts; squad/claim recovery semantics. |
| **continuum** | `packages/continuum` (`@recoder/continuum`; promoted from `ts/continuum` in `756cb7232`) | JS/Swift | brain (`activity/`) + interop (MCP) | Desktop working-context source: on-device OCR of the focused window + meeting transcription → episode store → `bge-m3` embeddings/RRF recall, exposed as read-only `recall`/`catch_up`/`profile` MCP tools (PII-redacted, local-first). The "what is the human doing now" source. |
| **openfang** | `crates/openfang` | Rust | governance | Approval manager, SHA-256 Merkle audit chain, model router, tool policy (deny-wins glob). |
| **claw-code-parity** | `crates/claw-code-parity` | Rust | governance | Permission modes/policy, permission enforcer, lane policy engine. |
| **ops-recorder** | `py/ops-recorder` | Py | governance | `WorkSignal` model + deterministic signal IDs. |
| **Envoy / go-control-plane** | `packages/network` (`@recoder/network` bootstrap+ext_authz+XDR) · `docker-backend/src/network` (adapter) · `go/recoder-xds` (xDS) | TS/Go | network | The **deployable** L7 realization: Envoy v3 bootstrap (mTLS · fail-closed `ext_authz`→governance · access-log) + a Go Envoy xDS control plane (`go-control-plane` v0.14.0, ADS/LDS/CDS/RDS). This is what `network` is built on today. Live proxy boot + real mTLS is infra-gated. |
| **ziti** (OpenZiti) | `go/ziti` | Go | network (**deferred**) | Controller, routers, tunneler, enrollment, PKI — the dark-overlay data plane. **Deferred / infra-gated** future option; the live network subsystem is Envoy-based (above). |
| **oh-my-codex** | `ts/oh-my-codex` | TS | runtime | Codex CLI driver patterns (headless print/json/exec). |
| **oh-my-openagent** / **open-agents** | `ts/oh-my-openagent`, `ts/open-agents` | TS | runtime | Open agent driver + event-stream translation patterns. |
| **pi** (coding agent) | `packages/pi-*` | TS | runtime | In-process pi agent driver (core/ai/tui/coding-agent). |
| **tmux** | `c/tmux` | C | substrate | Real terminal multiplexer — driven via CLI for restart-survivable sessions (never reimplemented). |
| **dmux** | `ts/dmux` | TS | substrate | Dev-agent multiplexer: per-task tmux pane + git worktree + agent launch + lifecycle hooks. |
| **sandbox-daytona** | `packages/sandbox-daytona` | TS | substrate (`remote/`) | Daytona sandbox client (remote isolation backend). |
| **a2a-sdk** | `packages/a2a-sdk` | TS | interop | A2A wire contracts (AgentCard, message/task envelopes). |
| **agent-mcp** | `packages/agent-mcp` | TS | interop | MCP registry + tool-permission contracts. |
| **pal-mcp-server** | `py/pal-mcp-server` | Py | interop | Real MCP server implementation. |
| **extracted-from-openclaw** | `ts/extracted-from-openclaw` (`@recoder/connectors`) | TS | interop | Social/connector gateways. **7 exported live** (`ConnectorPort` subpaths, dispatch-tested): **Telegram · Slack · Signal · iMessage · WhatsApp · LINE · Feishu**. **Discord** source present but **NOT exported** (un-extracted bot core, 172 TS errors — honest gap). WordPress/Gmail/Teams/LinkedIn/Meet are not present (planned). |
| **Polar** (Merchant of Record) | `py/recoder-billing` + `@recoder/distribution` Polar adapter | TS/Py | distribution | Billing/monetization fused as a **typed `BillingPort` with a real Polar adapter** (`packages/distribution/src/channels/billing/adapters/polar-billing-adapter.ts`) + Python fusion `py/recoder-billing` (broad: checkout/order/payout/subscription/webhook/stripe/metering/portal + benefit/license-key + signed internal-api; its ~94 tests are currently **unverified** — corrupt `pyproject.toml` + missing deps block pytest). **Polar chosen as Merchant of Record** (the MoR is the seller — solves Turkey/no-Stripe); Dodo/Creem/Paddle = one-adapter add. **Live checkout is secret-gated** (`POLAR_ACCESS_TOKEN` + real product/price IDs). (The old `ts/polar` tree was retired in `34b2d4a83`; this fusion was rebuilt fresh.) |
| **homebrew-recoder** | `homebrew-recoder/` | Ruby | distribution | Homebrew tap for CLI distribution. |

> **Mock → real correction (what actually shipped).** The first brain design was written
> against thin in-repo stubs (`packages/git-nexus`, a TS-only `packages/mem0` assumption). The
> real engines are now cloned and owned elsewhere in the monorepo — `ts/recodergit` (Tree-sitter
> knowledge graph) and `py/mem0` (Python core + `mem0-ts/src/oss` TS SDK). **What shipped is the
> adapter model, not an in-process merge of those source trees into `packages/brain`.** The Brain
> reaches RecoderGit via the `@recoder/recodergit` CLI/MCP (`repo/recodergit-repo-intel.ts`,
> `repo/recodergit-mcp-repo-intel.ts`), and reaches mem0/context7 via secret-gated REST/fetch
> adapters that **do not import the SDKs**. The earlier claim that `brain.md`'s `repo/`/`memory/`
> modules vendor `ts/recodergit/.../core/{tree-sitter,ingestion,graph,…}` and
> `py/mem0/mem0-ts/src/oss/src/...` files in-package is **not what was built** — see
> [brain.md §Gaps](./brain.md#11-gaps--not-yet-live-honest) for the honest current state.

### Candidate OSS — full triage

Curated against the 8-subsystem thesis. The bar: does it fill a slot a subsystem already
needs? "Validates the stack" = the upstream of code we already own (confirms the architecture).

**Already own (upstreams of our vendored OSS — listed firehose confirmed these):**
multica · openfang · RecoderGit · polar · pal-mcp-server · pi · mem0 · a2a-js · open-agents ·
daytona · context7 · beads · ziti · dmux · continuum. → see §5.

**Tier 1 — cloning now (fills a named subsystem slot):**

| OSS | → | Why |
|---|---|---|
| **opencode** (`anomalyco/opencode`) → `ts/opencode` | runtime | Driver for the `opencode` AgentSurface `runtime.md` already names. |
| **qwen-code** (`QwenLM/qwen-code`) → ~~`ts/qwen-code`~~ **retired** (`34b2d4a83`) | runtime | Would have driven the `qwen_code` surface `runtime.md` names; the clone was removed as superseded. Re-source if that surface is revived. |
| **browser-use** (`browser-use/browser-use`) → `py/browser-use` | runtime / substrate | The `browser` AgentSurface — make sites accessible to agents. |
| **lance** (`lance-format/lance`) → `crates/lance` | brain | The "dedicated vector index" gap: vector index + **data versioning** (aligns with version time-travel), 100× random access over object storage. Candidate prod recall store. |
| **ColBERT** (`stanford-futuredata/ColBERT`) → `py/colbert` | brain | SOTA late-interaction neural retrieval — recall-quality upgrade over plain pgvector/bge-m3. |
| **tensorzero** (`tensorzero/tensorzero`) → `crates/tensorzero` | governance / observability | LLM gateway + model routing + eval + observability (Rust) — pairs with openfang's router. |

**Tier 2 — strong, add when the owning subsystem lands:**

| OSS | → | Why |
|---|---|---|
| **AI-Scientist-v2** (BFTS/AIDE engine only) | coordination / workflows | Port the agentic best-first **tree search** (experiment-manager, N trees, parallel workers, node scoring, debug-depth retry). Skip the paper/ML layers. |
| **postiz-app** (`gitroomhq/postiz-app`) | interop | Agentic social-media scheduling — the Agency/PM social-hub connectors (matches the OpenClaw-gateway extraction goal). |
| **git-mcp** (`idosal/git-mcp`) | interop | Remote MCP for any GitHub project. |
| **opencode-channels** (`kortix-ai/opencode-channels`) | interop | Slack/Discord/Telegram chat adapters. |
| **E2B** (`e2b-dev/E2B`) | substrate | Sandbox **fallback** backend (Daytona is primary — matches sandbox strategy). |
| **stagehand** / **lightpanda** | runtime | Browser-surface alternatives to evaluate against browser-use. |
| **suql** (`stanford-oval/suql`) | brain | Conversational query over structured + unstructured data. |
| **storm** (`stanford-oval/storm`) | research workflow | Cited long-form report generation (overlaps the deep-research skill). |
| **searxng** | brain / web-search | Privacy metasearch to feed research recall. |
| **models.dev** (`anomalyco/models.dev`) | language-model-registry | Open AI-model database (data, not engine). |
| **x402** / **creem** | distribution | Agent-native HTTP payments + payment integrations (forward-looking monetization). |
| **slatedb** | persistence | Embedded storage on object storage, if a non-pg backend is needed. |
| **goose · cline · Roo-Code · hermes-agent** | runtime | Additional agent drivers (`roo-code-types` already owned). |

**Parked — off the Agent-OS thesis (explicit, with reason):**

- **App builders** (giselle*, libra, dyad, bolt.new-extended, suna, sonicjs, devpush, dokploy, sst, supermemory-stack) — v0/Lovable/Vercel clones. v1 user-facing surfaces already failed → pivot to the control-plane Agent OS. Off-thesis.
- **Finance/trading** (FinceptTerminal, nofx, dexter, global-intel, borsa-mcp, DefiLlama, perpetual-trading, RobotTraders) — finance vertical, not a control plane.
- **Research models / inference** (continuous-thought-machines, PokeeResearch, MiroFish, KoboldAI, **vLLM**) — model internals/serving. Memory: **no on-box GPU/vLLM** (cloud LLM only). Off-thesis.
- **Notebook/PM/wiki surfaces** (open-notebook, PageLM, docmost, colanode, eververse, paperless-ngx) — product surfaces, not infra.
- **Misc/off-thesis** (worldmonitor, mike[legal], airi, pollinations, Galaxies-dev RN clones, repo2txt, yente, Lemonade, uniswap-ai, **neon** [we migrated *off* Neon → self-hosted Postgres], weld/lance-ray [only if we go distributed], ClawWork [openclaw abandoned], agent-computer-use, page-agent, sitegeist, complexity/scira [Perplexity clones], polaris, threads/chatgpt/fintech clones).

Process for adding any candidate: clone into the matching language dir (`crates/go/py/ts/c`),
strip `.git`, prune non-source cruft, add a §5 row, specify the merge target in the owning
subsystem's doc. Never thin-wrap.

---

## 6. Fusion doctrine

1. **Merge & own, never thin-wrap.** Clone the real OSS into `crates/go/py/ts/c`, strip its
   `.git`, then merge the source *into* the target package and edit it as ours. No HTTP shim,
   no adapter-only layer. (Rust kernels are spoken to over typed IPC/FFI, not HTTP.)
2. **Adapter, not owner.** A subsystem consumes `TaskSpec`/`AgentProfile`/`WorkLock` from
   `agent-os` and emits `RunEvent`/`PolicyDecision`/`Approval`/`AuditEntry` back. It never
   becomes the source of truth.
3. **Pure core, impure edges.** The deterministic engine takes state in and returns new
   state + effects; all IO (persistence, events, clock, IDs) sits behind ports. Unit-testable
   without a DB or network.
4. **Many small files.** 200–400 lines typical, 800 max; one responsibility per file;
   organized by capability with a mirrored `tests/` tree.
5. **Ports for every adapter.** Concrete backends (Dolt, pgvector, qdrant, Daytona, ziti,
   context7.com) sit behind interfaces with **contract tests** every implementation satisfies.

---

## 7. Build / fusion order & status (honest)

| Phase | Subsystem | What lands | Status |
|---|---|---|---|
| 0 | OSS acquisition | Clone + de-git real RecoderGit, mem0, tmux, dmux into `ts/ py/ c/` | ✅ done |
| 1 | **brain** | ✅ **DONE** — ports foundation; real adapters behind every port: gitnexus (`RepoIntelPort`, degrade-safe), **continuum desktop-activity** (`ActivityPort`), mem0 (`MemoryPort`), context7 (`DocsPort`), beads (`TaskGraphPort`); all 5 wired into `docker-backend` `BrainService` (flag-gated, default off). **assemble-once content-addressed cache + tokens-saved metric + degrade-safe source-lighting** now landed (`cfd181394`). 161 tests. | ✅ built & green |
| 2 | **governance** | ✅ **TS facade built** — domain · policy · approval · enforcement (deny-biased fallback) · Merkle audit · routing · UDS-IPC client; **131/131 tests**; **wired into the conductor delivery gate** (`governance-gate.ts decideDelivery`, fail-closed) `4011d96cb`. ✅ **Owned Rust workspace built** (`crates/recoder-governance/`, 8 crates, **246/246 tests**, daemon binary built, audit Merkle golden-vector pinned to the TS verifier, `049caea72`). **Gap:** facade↔daemon not yet fused into one running process. | ✅ built & green (TS facade + Rust workspace); cross-process wiring pending |
| 3 | **coordination** | Work-locks + dispatch + handoff bus + reconciler | ✅ built & green; wired (267/267; conductor claim-before-launch + handoff-on-review; durable Postgres claim + lock store). Gaps: NATS / contract+property+integration suites / pg handoff·squad·presence stores not yet shipped (see coordination.md §0.1) |
| 4 | **runtime** | Driver contract + Claude/Codex/opencode/pi drivers + RunEvent translation | ✅ built & green; **now wired** (`apps/agent-worker` runtime-registry + `in_process` conductor substrate, `b83e21ff0`) |
| 5 | **substrate** | Real `@recoder/substrate` v0.1.0 (contract · **8-CLI** command resolver · registry · errors · ports · exec · review · observe · `WorkspaceEngine` · reconcile · factory) **adopted by 8 conductor files**; tmux/Daytona driver bodies still in `docker-backend/src/conductor` | ✅ built & green; engine + supporting modules adopted (**64 tests**); local/remote drivers + publish/config/observability still backend-side; Daytona real-run secret-gated (substrate.md §13) |
| 6 | **network** | **Realized on Envoy** — `docker-backend/src/network` Envoy v3 bootstrap (mTLS · fail-closed `ext_authz`→governance · access-log, **31/31**) + `go/recoder-xds` Go xDS control plane + XDR detections→Merkle audit (`b6fb599a3`, `a4436f3fc`) | ✅ built (Envoy); **ziti deferred (infra-gated)**; live proxy run ops-gated |
| 7 | **interop** | Real **ed25519 signed-ingress gate wired into the LIVE A2A gateway** (`b83e21ff0`); **MCP host facade + PAL hosting shipped, adopted by `/api/mcp`** (`d120c80fb`); consolidate `a2a-sdk` + `agent-mcp` → `packages/interop` (engine tree still design-of-record); 7 connectors live, Discord blocked (172 errs) | partial — ingress gate + MCP facade wired (54/54); engine/connectors fusion pending |
| 8 | **distribution** | `@recoder/distribution` built: device-flow + `BillingPort` + **real Polar MoR adapter** + homebrew/desktop packaging + org/seats/SSO/usage/device-registry (**88/88 TS tests PASS**); `py/recoder-billing` Polar fusion broad (checkout/order/payout/subscription/webhook/stripe/metering/portal + signed internal-api) but **~94 py tests unverified** (corrupt pyproject + missing deps) | ✅ building — public-artifact publishing not yet fused; live Polar checkout secret-gated |
| 9 | wire-in | Wire `@recoder/brain` into `docker-backend` so live agent runs use it | pending |

**No subsystem is marked complete until it builds green** (`pnpm -F <pkg> check-types && build
&& test`). Disk pressure on the local Mac previously blocked verification — that is now clear
(37% used, ~19 GiB free), so each fusion lands verified, not blind-generated.

---

## 8. Verification gates

Per `.claude/rules/testing.md` — run the narrowest check that proves the touched behavior:

```bash
# Package-scoped inner loop (per subsystem)
pnpm -F @recoder/<pkg> check-types
pnpm -F @recoder/<pkg> test         # ≥80% coverage on pure modules
pnpm -F @recoder/<pkg> build

# Agent OS contract + eval gates (subsystems sit under the Agent OS boundary)
pnpm agent:instructions:check
pnpm test:contracts:agent-os
pnpm test:evals:agent-os
pnpm format && pnpm check-types

# Rust governance crates
cargo test -p recoder-governance-*        # from crates/ workspace
# Go seams
go test ./...                              # go/beads, go/ziti/recoder, go/multica
```

Every non-trivial change ships at least one verification artifact (targeted test,
deterministic script run, or reproducible runtime check). Blocked verification is reported
as a blocker — never hidden behind an implementation-only "done".

---

## 9. Repository layout

```
recoder.xyz/
├── packages/            # ~90 owned TS packages: agent-os core + the 8 subsystems + shared libs
│   ├── agent-os/        #   ← state of record (contracts + transitions)
│   ├── brain/  governance/  coordination/  runtime/      # subsystems 1–4
│   ├── substrate/  network/  interop/  distribution/     # subsystems 5–8 (as they land)
│   ├── git-nexus/  mem0/                                 # mock shims → collapse into brain
│   └── pi-*/  context7-sdk/  beads-adapter/  sandbox-daytona/  ...
├── crates/              # owned Rust OSS: openfang, claw-code-parity (→ governance)
├── go/                  # owned Go OSS: beads (→ brain), ziti (→ network), multica (→ brain/coord)
├── py/                  # owned Python OSS: mem0 (→ brain), ops-recorder (→ gov), pal-mcp-server (→ interop)
├── ts/                  # owned TS OSS: gitnexus, dmux, oh-my-codex, open-agents, polar, extracted-from-openclaw
├── c/                   # owned C OSS: tmux (→ substrate)
├── apps/                # deployed surfaces: agent-gateway, agent-worker, desktop, mobile
├── docker-backend/      # Express service runtime + conductor wiring (→ substrate backend glue)
├── docs/subsystems/     # THIS FOLDER — the master plan + 8 deep subsystem designs
└── scripts/             # deterministic verify/closeout suites
```

---

## 10. How to use this plan

- **Designing or changing a subsystem?** Read its detail doc here first — it carries the full
  file tree, fusion map, ports, and verification plan. Keep this README's tables in sync when
  a subsystem's location, fused OSS, or status changes.
- **Adding OSS to the stack?** Clone into the matching language dir, de-git, add a row to the
  §5 fusion table, and specify the merge target in the owning subsystem's doc. Never thin-wrap.
- **Building?** Follow §7 order; nothing is "done" until §8 gates pass green.
