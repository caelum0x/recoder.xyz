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
| 1 | **brain** | `packages/brain` | Shared memory: repo intelligence + semantic recall + docs + task graph, **assembled once per repo/task and reused by every agent** (the token-waste killer). | [brain.md](./brain.md) | seam shipped; needs re-ground on real OSS |
| 2 | **governance** | `packages/governance` + `crates/recoder-governance-*` | Policy spine: model/risk routing, approval risk tiers, permission enforcement, tamper-evident audit + replay. | [governance.md](./governance.md) | designed |
| 3 | **coordination** | `packages/coordination` | Fleet coherence: work-locks, dependency-aware idempotent dispatch, A2A handoff bus, drift reconciler. | [coordination.md](./coordination.md) | designed |
| 4 | **runtime** | `packages/runtime` | Drives the user's own agent CLIs headless behind one driver contract; translates native streams → `RunEvent`. | [runtime.md](./runtime.md) | designed |
| 5 | **substrate** | `packages/substrate` + `docker-backend/src/conductor` | Restart-survivable isolation + launch: local **tmux + git worktrees**, remote **Daytona**. | [substrate.md](./substrate.md) | partial code shipped |
| 6 | **network** | `packages/network` + `go/ziti` | Zero-trust dark overlay (OpenZiti): cryptographic agent identity, default-deny, policy-scoped reachability across machines/orgs. | [network.md](./network.md) | designed |
| 7 | **interop** | `packages/interop` (← `a2a-sdk` + `agent-mcp`) | A2A wire interoperability + MCP host/registry + connector gateways — the agent-to-agent and tool surface. | [interop.md](./interop.md) | designing |
| 8 | **distribution** | `packages/distribution` + `homebrew-recoder/` + apps | How Recoder ships & monetizes: CLI distribution + device-flow auth, tap publishing, billing/entitlements, signed artifact/preview delivery. | [distribution.md](./distribution.md) | designing |

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
| `packages/agent-memory` | Reviewed memory-candidate lifecycle helpers (folded into **brain**'s write-back lane). |
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
| **GitNexus** | `ts/gitnexus` | TS | brain (`repo/`) | Tree-sitter AST ingestion → code knowledge graph (LadybugDB/`lbug`) → embeddings → search/RAG → MCP. The real repo-intelligence engine. |
| **mem0** | `py/mem0` (+ `mem0-ts/src/oss`) | Py/TS | brain (`memory/`) | Semantic recall: embeddings, vector stores (pgvector/qdrant/memory), LLM fact-extraction, scoring/bm25, history. |
| **context7-sdk** | `packages/context7-sdk` | TS | brain (`docs/`) | External library docs: `searchLibrary`, `getContext`, retrying HTTP client. |
| **beads** | `go/beads` | Go | brain (`tasks/`) | Durable task graph on Dolt: versioned deps, ready/blocked, cycles, history. |
| **multica** | `go/multica` | Go | brain + coordination | Knowledge/memory service parts; squad/claim recovery semantics. |
| **continuum** | `ts/continuum` | JS/Swift | brain (`activity/`) + interop (MCP) | Desktop working-context source: on-device OCR of the focused window + meeting transcription → episode store → `bge-m3` embeddings/RRF recall, exposed as read-only `recall`/`catch_up`/`profile` MCP tools (PII-redacted, local-first). The "what is the human doing now" source. |
| **openfang** | `crates/openfang` | Rust | governance | Approval manager, SHA-256 Merkle audit chain, model router, tool policy (deny-wins glob). |
| **claw-code-parity** | `crates/claw-code-parity` | Rust | governance | Permission modes/policy, permission enforcer, lane policy engine. |
| **ops-recorder** | `py/ops-recorder` | Py | governance | `WorkSignal` model + deterministic signal IDs. |
| **ziti** (OpenZiti) | `go/ziti` | Go | network | Controller, routers, tunneler, enrollment, PKI — the dark-overlay data plane. |
| **oh-my-codex** | `ts/oh-my-codex` | TS | runtime | Codex CLI driver patterns (headless print/json/exec). |
| **oh-my-openagent** / **open-agents** | `ts/oh-my-openagent`, `ts/open-agents` | TS | runtime | Open agent driver + event-stream translation patterns. |
| **pi** (coding agent) | `packages/pi-*` | TS | runtime | In-process pi agent driver (core/ai/tui/coding-agent). |
| **tmux** | `c/tmux` | C | substrate | Real terminal multiplexer — driven via CLI for restart-survivable sessions (never reimplemented). |
| **dmux** | `ts/dmux` | TS | substrate | Dev-agent multiplexer: per-task tmux pane + git worktree + agent launch + lifecycle hooks. |
| **sandbox-daytona** | `packages/sandbox-daytona` | TS | substrate (`remote/`) | Daytona sandbox client (remote isolation backend). |
| **a2a-sdk** | `packages/a2a-sdk` | TS | interop | A2A wire contracts (AgentCard, message/task envelopes). |
| **agent-mcp** | `packages/agent-mcp` | TS | interop | MCP registry + tool-permission contracts. |
| **pal-mcp-server** | `py/pal-mcp-server` | Py | interop | Real MCP server implementation. |
| **extracted-from-openclaw** | `ts/extracted-from-openclaw` | TS | interop | Social/connector gateways — real extracted roster: **Telegram · Slack · Discord · Signal · LINE · Feishu · iMessage · WhatsApp** (WordPress/Gmail/Teams/LinkedIn/Meet are planned, not yet present). |
| **polar** | `ts/polar` | TS | distribution | Billing/monetization: subscriptions, entitlements, checkout. |
| **homebrew-recoder** | `homebrew-recoder/` | Ruby | distribution | Homebrew tap for CLI distribution. |

> **Mock → real correction (why this plan was re-grounded).** The first brain design was
> written against thin in-repo stubs: `packages/git-nexus` (192 lines across 8 files) and a
> TS-only `packages/mem0` assumption. Those are **mocks**. The real engines are now cloned
> and owned: `ts/gitnexus` (1,860 TS files — Tree-sitter knowledge graph) and `py/mem0`
> (Python core + `mem0-ts/src/oss` TS SDK whose layout matches the original fusion paths).
> `brain.md`'s `repo/` module must fuse the real GitNexus core
> (`ts/gitnexus/gitnexus/src/core/{tree-sitter,ingestion,graph,embeddings,lbug,search,
> incremental}` + `gitnexus-shared/src/{graph,scope-resolution}`), and its `memory/` paths
> repoint from `packages/mem0/src/...` → `py/mem0/mem0-ts/src/oss/src/...`. The mock
> packages stay as the type-shim seam during the merge, then collapse into `packages/brain`.

### Candidate OSS — full triage

Curated against the 8-subsystem thesis. The bar: does it fill a slot a subsystem already
needs? "Validates the stack" = the upstream of code we already own (confirms the architecture).

**Already own (upstreams of our vendored OSS — listed firehose confirmed these):**
multica · openfang · GitNexus · polar · pal-mcp-server · pi · mem0 · a2a-js · open-agents ·
daytona · context7 · beads · ziti · dmux · continuum. → see §5.

**Tier 1 — cloning now (fills a named subsystem slot):**

| OSS | → | Why |
|---|---|---|
| **opencode** (`anomalyco/opencode`) → `ts/opencode` | runtime | Driver for the `opencode` AgentSurface `runtime.md` already names. |
| **qwen-code** (`QwenLM/qwen-code`) → `ts/qwen-code` | runtime | Driver for the `qwen_code` surface `runtime.md` names. |
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
| 0 | OSS acquisition | Clone + de-git real GitNexus, mem0, tmux, dmux into `ts/ py/ c/` | ✅ done |
| 1 | **brain** | Re-ground `repo/` on real GitNexus, `memory/` on `py/mem0/mem0-ts`; build assemble-once cache; land tokens-saved metric | 🔜 next (verify-gated) |
| 2 | **governance** | Rust governance crates (approval/audit/routing/permission) + TS `packages/governance` over typed IPC | designed |
| 3 | **coordination** | Work-locks + dispatch + handoff bus + reconciler | designed |
| 4 | **runtime** | Driver contract + Claude/Codex/opencode/pi drivers + RunEvent translation | designed |
| 5 | **substrate** | Promote `docker-backend/src/conductor` → `packages/substrate`; fuse real tmux + dmux + Daytona | partial shipped |
| 6 | **network** | `packages/network` SDK + `go/ziti/recoder` seam | designed |
| 7 | **interop** | Consolidate `a2a-sdk` + `agent-mcp` → `packages/interop`; fuse pal-mcp-server + connectors | designing |
| 8 | **distribution** | `packages/distribution`: CLI dist + polar billing + tap + signed delivery | designing |
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
