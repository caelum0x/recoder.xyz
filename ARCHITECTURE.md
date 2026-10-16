# Recoder — Deep Enterprise Architecture

> **Thesis:** N coding agents run in parallel isolated git worktrees; their divergent
> diffs are converged into one trusted change through a governed, human-approvable merge
> gate that emits a signed evidence record. Recoder owns the state-of-record; runtimes,
> sandboxes, and OSS engines are replaceable adapters around it.
>
> This is a **planning document**. It grounds the target enterprise shape in the code that
> exists today, is honest about what is a stub, and lays out the module tree, the domain
> knowledge graph, the parallel-agents task graph, the scale math, and the interop surface
> (including whether Recoder should sit on Railyard). It describes; it does not modify code.
>
> Companion canonical docs already in-tree: `docs/RECODER-ARCHITECTURE.md` (layer stack +
> engine→module map), `docs/RECODER-MODULES.md` (per-module specs), `docs/PRODUCT-THESIS.md`,
> `docs/SECURITY-POSTURE.md`. This file is the **enterprise-growth** view that sits above them.

---

## 1. What it is + current state

### 1.1 One-paragraph description

Recoder is a **self-hosted desktop app** (Electron, a fork of Wave Terminal — the
`recoder-*` views) that **embeds and supervises a single Node/Express control-plane backend**
(the "conductor"). A user points Recoder at a git repo, describes a task, and launches
**two or more coding agents in parallel** — Claude Code, Codex, Cursor, opencode, pi — each
in its **own isolated git worktree** on a shared **tmux** substrate. Recoder streams each
run, lets the user **compare N diffs side-by-side**, **converges** the winners (auto for
uncontested files, human pick for contested ones, 3-way synthesis for same-file edits) into
a fresh branch, and merges through a **governance gate** that emits a content-hashed,
Ed25519-signable **`ConvergenceEvidence`** record mapped to SOC 2 / EU AI Act / DORA controls.
There is also a **public web app** (`app/`, Next.js 16 on `recoder.xyz`) that is the auth
source-of-record + billing + marketing + docs, and a thin **marketing site** (`site/`).

### 1.2 Real stack (grounded)

| Layer | Technology (actual) | Where |
|---|---|---|
| Desktop shell | Electron 41, React 19, Wave-fork frontend, 21 `recoder-*` views | `apps/desktop/app/frontend` |
| Durable shell (Go) | tmux control-mode driver, session reconciler | `apps/desktop/server` (Go) |
| Control-plane backend | Node + Express 4 + express-ws, 15 composed domains | `backend/src` |
| Web app / auth / billing | Next.js 16, React 19, Payload CMS, Prisma, Better Auth, Dodo Payments (MoR) | `app/` |
| Marketing site | Next.js 16 | `site/` |
| Contract packages | 70 first-party TS packages (`@recoder/*`) | `packages/` |
| Native engines (Rust) | openfang, tensorzero, recoder-governance (napi `.node`) | `backend/engines/rust` |
| Sidecar engines (Py) | mem0, colbert, browser-use, ops-recorder, pal-mcp | `backend/engines/py` |
| Substrate engines | tmux, dmux, recodergit, openclaw (Go/TS) | `apps/desktop/engines`, `apps/desktop/server/engines` |
| Store-of-record | PostgreSQL 17 / Dolt (versioned) + beads (`bd`) issue graph | substrate |
| Interop wire | A2A (Ed25519-signed envelopes), MCP host (14 in-proc servers) | `packages/a2a-*`, `backend` edge |

### 1.3 The 15 backend domains (BUILT + booting)

`backend/src/domains/*` — each fuses its engine dirs behind one governed, health-truthful composer:

`persistence · identity · governance · interop · edge · agent-os · conductor · engines ·
inference · billing · memory · cloud · interop-wire · social · observability`

The **conductor** domain is the heart of the product. Its real subtree already contains the
diamond flow: `fanout/` (fan-out + re-fan), `converge/` (converge-plan, converge ops, file
versions), `review/`, `evidence/` (convergence-evidence, trust, signing, framework-mapping,
merge-trust-gate, preview-evidence, finding-vote), `swarm/`, `wait/`, `attention/`, `audit/`,
`playbook/`, `mcp/`, `remote-attach/`, `terminal/`, `cockpit/`.

### 1.4 Honest maturity — built vs stub

| Area | State | Evidence |
|---|---|---|
| Run → converge → governed-merge loop | **BUILT, end-to-end** | conductor fanout/converge/evidence subtrees; suites green |
| 15 domain composers boot, tsc clean | **BUILT** | `backend/src/domains/*`, 3,076 backend tests ✓ |
| Convergence evidence + signing + framework mapping | **BUILT** | `conductor/evidence/*` |
| Governance gate (napi → UDS → deny-biased TS ladder) | **BUILT on delivery path**; not yet the single gate EVERY write flows through | `governance-gate.service.ts` |
| Inference ladder (TensorZero napi SSE → loopback → BYOK router) | **BUILT**; `feedback()` not wired to outcomes; some call sites bypass ladder | `domains/inference` |
| Memory (beads + mem0 + colbert rerank) | **BUILT but shallow**; 2 mem0 impls (drift), colbert rerank is lexical-fallback when torch absent | `domains/memory`, PARKED items |
| Desktop `recoder-*` views (21) | **BUILT** | `app/frontend/app/view/recoder-*` |
| Website auth/billing (Better Auth, Dodo MoR) | **BUILT**; org/user reconciliation owner-gated | `app/` |
| openfang Hands lifecycle | **PARKED** — napi `runAgent` blocks event loop; needs async seam | depth-gap notes |
| NETWORKING (ziti, recoder-xds) | **STUB / cloud-tier** — registered, no live config push | depth-gap notes |
| Python deep-loop sidecars (mem0, browser-use) | **PARKED** — health-probed shells; TS packages serve live path | depth-gap notes |
| CI / production deploy / canonical trunk | **NOT done, owner-gated** | workflows disabled |

**Bottom line:** the core loop is real and load-bearing; the periphery (deep memory,
networking mesh, cloud/teams tier, multi-runtime breadth) is a mix of shallow-but-wired and
explicitly parked. The enterprise structure below is the shape it grows *into*, not a claim
that it is there.

---

## 2. Target enterprise structure

The dependency law is fixed and must not invert: **apps → edges → domains → engines → substrate.**
A lower layer never imports an upper one. The tree below adds enterprise depth *within* that law.
Each leaf carries a one-line responsibility. `[NEW]` = does not exist yet; unmarked = exists and deepens.

```
recoder.xyz/
├── apps/                                   # SURFACES — consume edges only, no capability logic
│   ├── desktop/                            # THE product (Electron + Wave-fork shell)
│   │   ├── app/frontend/app/view/          # recoder-* views (21 today → grouped below)
│   │   │   ├── run/                         # launch, live terminal, per-worktree stream
│   │   │   ├── compare/                      # N-diff side-by-side, per-file, single-patch
│   │   │   ├── converge/                     # converge-plan review, contested-file picker, 3-way synth
│   │   │   ├── review/                       # verifier findings, finding-vote, merge-readiness
│   │   │   ├── approvals/                    # human gate: approve/deny with evidence
│   │   │   ├── evidence/                     # signed ConvergenceEvidence viewer + export
│   │   │   ├── board/ swarm/ siblings/       # squad/fanout board, sibling runs
│   │   │   ├── memory/ audit/ locks/         # recall candidates, audit chain, work-locks
│   │   │   └── settings/ usage/ capabilities/# BYOK keys, quota, engine health
│   │   ├── app/emain/                       # Electron main: backend supervisor, window mgmt, updater
│   │   └── server/                          # Go durable-shell: tmux control-mode, session reconciler
│   ├── engines/ (desktop-embedded)          # tmux · dmux · recodergit · openclaw (used in place)
│   └── web/  (== app/ today)                 # Next.js public app: auth SoR, billing, docs, download
│
├── backend/                                # HOST — the ONE control plane (recoder-backend)
│   ├── src/bootstrap/                        # compose 15 domains, mount edges, PUBLIC_MOUNT gate
│   ├── src/http/                             # express app, ws upgrade, middleware chain
│   ├── src/shared/                           # cross-domain primitives (ids, result, clock, config)
│   └── src/domains/
│       ├── persistence/                      # store-of-record: PG17/Dolt, migrations, outbox, repos
│       │   ├── repositories/                  # [NEW] one repo per aggregate (Task, Run, Diff, Evidence…)
│       │   ├── outbox/                        # CloudEvents transactional outbox
│       │   └── versioning/                    # Dolt branch/commit of state, time-travel queries
│       ├── identity/                          # actors, orgs, sessions, agent identity, API keys
│       │   ├── principals/ orgs/ sessions/
│       │   ├── agent-identity/                # [NEW] per-agent verifiable identity (Passport-ready)
│       │   └── rbac/                          # [NEW] role/permission model for teams/enterprise
│       ├── governance/                        # the gate: decide→risk→policy→audit, Merkle chain
│       │   ├── gate/                           # governance-gate.service (single write chokepoint)
│       │   ├── policy/                         # deterministic policy eval (allow/deny/needs-approval)
│       │   ├── risk/                           # risk scoring of proposed actions
│       │   ├── audit/                          # Merkle audit chain, tamper-evident seal
│       │   └── approvals/                      # human-gate records, clearance binding to principal
│       ├── conductor/                         # ★ THE run→converge→merge orchestrator (diamond)
│       │   ├── plan/                           # task → split into N independent angles
│       │   ├── fanout/                         # spawn N worker runs in isolated worktrees; re-fan
│       │   ├── runtimes/                       # adapters: claude-code · codex · cursor · opencode · pi · openfang
│       │   ├── substrate/                      # tmux_worktree substrate, worktree lifecycle, reconciler
│       │   ├── stream/                         # per-worktree live event stream (WS)
│       │   ├── compare/                        # pairwise + N-way diff, contested-file detection
│       │   ├── review/                         # verifier separation: independent review context
│       │   ├── converge/                       # converge-plan, converge ops, 3-way file synthesis
│       │   ├── evidence/                       # ConvergenceEvidence build/sign/export, trust, votes
│       │   ├── merge/                           # [NEW] owned single-merge writer, merge-trust-gate
│       │   ├── wait/ attention/ swarm/         # policy waits, attention heuristics, squad coord
│       │   └── playbook/ skill/                 # reusable task specs, compiled instruction bundles
│       ├── agent-os/                          # canonical control-plane state (spaces/tasks/runs/…)
│       │   ├── tasks/ runs/ artifacts/ instructions/  # RunEvent ingestion, artifact store, provenance
│       │   └── recodergit/ github/            # code-graph + gh ops (consolidate 2 engines → 1)
│       ├── inference/                         # LLM gateway ladder (napi → loopback → BYOK router)
│       │   ├── gateway/ router/ providers/     # tensorzero embed, multi-provider BYOK, key vault
│       │   ├── feedback/                       # [NEW] wire delivery outcomes back to inference feedback
│       │   └── embeddings/                     # OpenAI-compatible /embeddings edge + MCP tool
│       ├── memory/                            # recall/harvest: beads + mem0 + colbert rerank
│       │   ├── recall/ harvest/ rank/          # candidate recall, degrade-truthful rerank
│       │   ├── candidates/                     # evidence-backed memory candidates, gated promote()
│       │   └── graph/                          # [NEW] knowledge-graph store + GraphRAG serving (§3)
│       ├── engines/                           # engine supervisor: spawn/health/degrade all OSS engines
│       ├── billing/                           # metering emitters, quotas, MoR (Creem/Polar/Paddle/Dodo)
│       │   ├── metering/                       # per-run + per-inference usage events
│       │   ├── quotas/ entitlements/           # plan limits, dunning grace, overage UpgradeHint
│       │   └── providers/                      # MoR adapters (+ [NEW] Railyard-Mint adapter, §5)
│       ├── interop/                           # untrusted-until-proven edge chain (authorize→risk→policy→audit)
│       ├── interop-wire/                      # A2A envelopes, Ed25519 signer-key binding, HMAC rules
│       ├── social/                            # 8-channel connector ingress (telegram/slack/discord/…)
│       ├── cloud/                             # remote/cloud substrates (Daytona, E2B), teams tier
│       ├── observability/                     # truthful health, metrics, traces, run timelines
│       └── edge/                              # public seams: /api/agent-os · /api/mcp · /api/a2a · /api/social
│
├── packages/                               # CONTRACT layer — thin domain types + pure decision helpers
│   ├── agent-os/ agent-schemas/             # canonical contracts + legal state transitions
│   ├── agent-policy/ governance/            # deterministic policy + Merkle verifier (byte-interop w/ rust)
│   ├── agent-events/ agent-instructions/    # CloudEvents/outbox · instruction load+render+provenance
│   ├── agent-memory/ rag/ retrieval/ brain/ # memory candidate lifecycle · GraphRAG · enrichment
│   ├── a2a-sdk/ a2a-js/ recoder-a2a/        # A2A wire interoperability contracts
│   ├── agent-mcp/ agent-runtimes/ agent-workflows/ coordination/ substrate/  # host ports
│   ├── graph/                                # [NEW] property-graph model + ontology.yaml (§3)
│   └── (…60+ more first-party @recoder/* packages)
│
├── backend/engines/ + apps/desktop/engines/# ENGINES — OSS used in place, never copied
│   ├── rust/   openfang · tensorzero · recoder-governance
│   ├── py/     mem0 · colbert · browser-use · ops-recorder · pal-mcp
│   └── (desktop) tmux · dmux · recodergit · openclaw · beads · multica · ziti · recoder-xds
│
├── deploy/ nginx/ monitoring/ docker*      # OPS — self-host + cloud deploy, reverse proxy, dashboards
├── mcp/                                     # standalone MCP bridges (claude · codex · a2a)
└── docs/                                    # canonical architecture/module/security/thesis docs
```

**Enterprise gaps to add** (each a module, one-line responsibility):

- `backend/src/domains/identity/rbac/` — team roles, org-scoped permissions, SSO/SCIM provisioning.
- `backend/src/domains/conductor/merge/` — extract the single owned-merge writer as its own module.
- `backend/src/domains/memory/graph/` + `packages/graph/` — the domain knowledge graph store (§3).
- `backend/src/domains/inference/feedback/` — close the outcome→inference-feedback loop.
- `backend/src/domains/observability/slo/` — SLOs, error budgets, evidence-export SLA.
- `backend/src/domains/cloud/` deepening — remote substrate fleet, per-tenant isolation, xDS live push.
- `backend/src/domains/billing/providers/railyard-mint/` — metered-usage adapter (§5).

---

## 2.5 OSS foundations (fork / build-on, not net-new)

Recoder is already a fork-first product — the desktop shell is a **fork of Wave Terminal**
(Apache-2.0), and every capability engine is a vendored OSS project *used in place*. The
enterprise build should extend that discipline: **adopt proven, permissively-licensed code
before writing net-new.** The table below is the recommended foundation per surface, with
license, fit, and a reuse-vs-build call. **Only OSI-permissive (MIT / Apache-2.0 / BSD / ISC /
MPL-2.0) or GPL-with-linking-exception** should sit on the shippable path; copyleft that would
infect the product is flagged as **RISK**.

### Desktop shell & UI

| Need | Best OSS | License | Fit / reuse-vs-build |
|---|---|---|---|
| Desktop shell | **Wave Terminal** (already forked) | Apache-2.0 | **Keep the fork.** Owned layers wrap the base; do not re-platform mid-flight. |
| Alt shell (future/lighter) | **Tauri 2** | MIT / Apache-2.0 | Consider only for a lightweight cloud/companion client; **build-on**, not a rewrite of the Electron desktop. |
| Diff/code editor | **Monaco** (`monaco-editor`) | MIT | **Reuse** its diff editor for per-file review; already the VSCode diff engine. |
| Diff rendering | **diff2html**, **react-diff-view** | MIT | **Reuse** for N-way side-by-side compare view. |
| Structural diff | **difftastic** | MIT | **Reuse as engine** for syntax-aware contested-file detection (better than line diff). |
| Terminal frontend | **xterm.js** | MIT | **Reuse** (Wave already uses it) for the live run terminals. |

### Git worktrees, diff & 3-way merge (the substrate core)

| Need | Best OSS | License | Fit / reuse-vs-build |
|---|---|---|---|
| Worktree + repo ops (Rust, pure) | **gitoxide (`gix`)** | MIT **OR** Apache-2.0 | **Preferred build-on.** Cleanest license, pure-Rust, fast; use for worktree create/list/prune + status in the durable shell. |
| Worktree + repo ops (bindings) | **libgit2 / `git2-rs`** | **GPLv2 WITH linking exception** | Usable (the exception permits linking from any license) but gitoxide is license-cleaner; **prefer gix**, keep git2 as fallback for gaps gix hasn't reached. |
| 3-way file synthesis | **diffy** (Rust) / `git merge-file` | Apache-2.0 / GPLv2 (CLI, invoked not linked) | **Reuse** diffy for in-process 3-way; shelling to `git merge-file` is fine (CLI boundary, no linking). |
| Session substrate | **tmux** (already vendored/pinned) | ISC | **Keep** — owned by vendoring + CLI-driving. |
| PTY (backend) | **node-pty** / **portable-pty** (wezterm) | MIT | **Reuse** for runtime process control. |

### Parallel-agent orchestration (patterns, not owners)

Per `AGENTS.md`, canonical task/approval/memory/evidence state **must stay in Recoder-owned
contracts** — orchestration libs are adopted as *patterns/adapters*, never as the state owner.

| Need | Best OSS | License | Fit / reuse-vs-build |
|---|---|---|---|
| Durable DAG execution | **Temporal** / **Restate** | MIT / permissive | **Adopt the pattern** for the diamond's durable retries/timers; Recoder still owns run state. Do not hand it the state-of-record. |
| Agent graph runtime | **LangGraph** | MIT | **Reference pattern** for fan-out/verify/merge; not a dependency that owns state. |
| Multi-agent framing | **CrewAI / AutoGen** | MIT / permissive | Study for role/verifier separation; **build-on ideas**, not the runtime. |
| Coding-agent runtimes | Claude Code, **Codex CLI**, **opencode**, **aider** | mixed / **Apache-2.0** (aider, opencode) | **Reuse as runtime adapters** emitting `RunEvent`s (already the model). |

### Interop, evidence & governance

| Need | Best OSS | License | Fit / reuse-vs-build |
|---|---|---|---|
| Agent-to-agent wire | **A2A** (a2a-project) | Apache-2.0 | **Already adopted** (`packages/a2a-*`); keep. |
| Tool protocol | **Model Context Protocol SDK** | MIT | **Already adopted** (MCP host); keep. |
| Tamper-evident audit | Merkle-tree crates (`rs-merkle`) | MIT / Apache-2.0 | **Reuse** under the governance napi chain (already byte-interop with a TS verifier). |
| Signing | **ed25519-dalek** | BSD-3 / Apache-2.0 | **Already used** for A2A signer keys + evidence signing; keep. |
| Memory / recall | **mem0**, **ColBERT**, **Qdrant** | Apache-2.0 | **Already vendored** as engines; keep license-clean. |

### Railyard internal reuse (Apache-2.0 crates)

Recoder can **reuse Railyard's internal Apache-2.0 crates directly** (source or crate dep),
not just consume its hosted services:

- **`relay/crates/durable-tools`** — durable tool-execution primitives; slot under
  `conductor/wait/` + the durable-DAG retry/timer layer of the diamond.
- **`relay/crates/ts-executor-pool`** — pooled TS/runtime executor; back the fan-out worker
  spawn pool (`conductor/fanout/`) and the inference call pool.
- **`relay/crates/provider-proxy`** — provider-routing proxy; slot as a rung in the inference
  ladder (§5), between the loopback gateway and direct BYOK, sharing routing/spend logic.

Plus **consume Railyard hosted**: **Mint** (metering ledger), **Relay** (model gateway rung),
**Passport** (agent identity) — see §5. All Apache-2.0 → **reuse over rebuild**; they are edge
adapters around Recoder-owned state, consistent with the fusion law.

### GPL / AGPL risk flags

- **libgit2 / git2-rs** — GPLv2 **with linking exception**: *permitted* (the exception allows
  linking from any license), but **prefer gitoxide (MIT/Apache-2.0)** to avoid any question.
- **git CLI, `git merge-file`, tmux-adjacent GPL tools** — GPL, but invoked **as CLI
  subprocesses** (no linking), which is fine; never statically link GPL code into the product.
- **RISK — GitButler** and some "AI git review" UIs ship under **FSL / BSL / non-OSI source-
  available** licenses. **Do not fork** these into the product path; reference for UX only.
- **RISK — any AGPL** review/diff/orchestration service (e.g. some self-host analytics or
  Sourcegraph-adjacent components): AGPL's network-use clause can infect a hosted product.
  **Exclude from the shippable path**; if a capability is only available AGPL, isolate it behind
  a network boundary (separate process/service) or find a permissive alternative.
- **recodergit** is under **PolyForm-Noncommercial** (already noted in-tree) — a **license
  gate** for the commercial product; keep it isolated behind the GitHub module seam and resolve
  before any commercial GA.

**Rule:** shippable path = MIT / Apache-2.0 / BSD / ISC / MPL-2.0 / GPL-with-linking-exception
(link-safe) / GPL-CLI-invoked-only. Everything else is reference-only or network-isolated.

---

## 3. Graph engineering

Two graphs, per the graph-engineering discipline: a **knowledge graph** (what the system
*remembers* — entities + time/provenance-carrying edges) and a **task graph** (how agents
*work* — the parallel-agents diamond).

### 3.1 Domain knowledge graph (ontology)

**Representation choice:** a **property graph** (default for products + agent memory). Recoder
already versions state in Dolt and has a beads issue graph as the cross-agent memory fabric,
so the knowledge graph is a first-class store under `memory/graph/`. Every edge carries
**time** (`since`/`until` or event timestamp) and **provenance** (source run/artifact +
extraction timestamp + confidence) — these are decided now, not retrofitted.

**Competency questions the graph must answer** (the spec + its test suite):

1. Which candidate diffs were merged for task T, and which were discarded and why?
2. Which agent/runtime produced the winning diff for a contested file, and who approved it?
3. What verification ran before merge M, and what was the verdict + evidence hash?
4. Which memory candidates influenced run R, and were they durable-promoted?
5. For an audit: reconstruct the full chain task → runs → diffs → review → merge → evidence.
6. Which files were contested across N runs, and how was each conflict resolved?
7. What did agent A cost (tokens/$) across all its runs this billing period?
8. Which prior task's outcome is most similar to the current one (GraphRAG recall)?

**Core entities (nodes)** — each with a one-line definition:

| Node | Definition |
|---|---|
| `Pilot` | The human operator who launches tasks and holds the approval gate. |
| `Org` | Tenant boundary; owns projects, quotas, policies, members. |
| `Project` | A git repo Recoder is pointed at. |
| `Task` | A described unit of intent (goal, scope, constraints, verification, approvals). |
| `Agent` | A logical worker instance assigned to a task angle. |
| `Runtime` | The execution surface backing an agent (claude-code, codex, cursor, opencode, pi, openfang). |
| `Worktree` | An isolated git worktree on the tmux substrate where one run happens. |
| `Run` | One agent's execution attempt inside one worktree, emitting RunEvents. |
| `RunEvent` | An event emitted by a runtime back to Recoder (the canonical run record). |
| `Diff` / `CandidateDiff` | The change a run produced; a candidate competing for merge. |
| `FileVersion` | A single file's version within a diff (for contested-file resolution). |
| `Review` | An independent verification pass over candidate diffs (separate context). |
| `Finding` | One verifier observation (correct? current? source real?) with a vote. |
| `ConvergencePlan` | The decision of which candidate wins each file (auto vs human pick). |
| `Merge` | The single owned write that fuses survivors into a fresh branch. |
| `ConvergenceEvidence` | Content-hashed sealed record (task+candidates+verdict+verification). |
| `Approval` | The human gate decision authorizing an irreversible action. |
| `GovernanceDecision` | The gate's allow/deny/needs-approval verdict on a write. |
| `MemoryCandidate` | Evidence-backed, TTL-bound wisp proposed for durable memory. |
| `Artifact` | A produced file/log/PR/preview attached as evidence. |
| `PullRequest` | The delivered change on the remote. |
| `Outcome` | The measured result of a merge (tests passed, deployed, reverted). |
| `Policy` / `WorkLock` | The rules and per-path locks constraining writes. |

**Relations (edges)** — precise verbs, with domain→range and the carried time+provenance:

```
Pilot        LAUNCHED        Task            {at, source:ui}
Org          OWNS            Project         {since}
Task         TARGETS         Project         {at, branch}
Task         SPLIT_INTO      Agent           {at, angle}            # fan-out
Agent        RUNS_AS         Runtime         {at}
Agent        EXECUTES_IN     Worktree        {at}
Run          PRODUCED_BY     Agent           {at}
Run          EMITTED         RunEvent        {at, seq}
Run          PRODUCED        CandidateDiff   {at, confidence}
CandidateDiff CONTAINS       FileVersion     {path}
Review       VERIFIES        CandidateDiff   {at, verifier, question}  # separate context
Review       RAISED          Finding         {at, severity}
Finding      VOTED_ON        CandidateDiff   {vote, weight}
ConvergencePlan SELECTS      FileVersion     {reason:auto|human, at}   # one winner per file
Merge        CONVERGES       CandidateDiff   {at, strategy:3way|pick}
Merge        SEALED_BY       ConvergenceEvidence {hash, at}
Approval     GATES           Merge           {at, principal, decision}
GovernanceDecision AUTHORIZED Merge          {at, verdict, riskScore}
MemoryCandidate RECALLED_INTO Run            {at, rerankerReason, confidence}
Run          HARVESTED       MemoryCandidate {at, evidence}
MemoryCandidate PROMOTED_TO  DurableMemory   {at, approver}            # gated
Merge        DELIVERED_AS    PullRequest     {at, url}
Merge        RESULTED_IN     Outcome         {at, testsPassed, reverted}
Policy       CONSTRAINS      Run             {scope}
WorkLock     COVERS          FileVersion     {holder, since, until}
```

**Diagram (knowledge graph, converging on the merge):**

```
 Pilot ──LAUNCHED──▶ Task ──SPLIT_INTO──▶ Agent ──RUNS_AS──▶ Runtime
                      │                     │
                   TARGETS               EXECUTES_IN
                      ▼                     ▼
                   Project              Worktree ──hosts──▶ Run ──EMITTED──▶ RunEvent
                                                             │
                                                        PRODUCED
                                                             ▼
                                                       CandidateDiff ──CONTAINS──▶ FileVersion
                                                        │        ▲                     │
                                                   VERIFIES   VOTED_ON            SELECTS(one winner)
                                                        │        │                     │
                                                     Review ──RAISED──▶ Finding   ConvergencePlan
                                                                                       │
                                                                                    CONVERGES
                                                                                       ▼
                            GovernanceDecision ──AUTHORIZED──▶  Merge  ◀──GATES── Approval (human)
                                                                  │  \
                                                            SEALED_BY  DELIVERED_AS
                                                                  ▼         ▼
                                                    ConvergenceEvidence   PullRequest ──▶ Outcome
```

Every edge is auditable: the Merkle audit chain (`recoder-governance` napi, byte-interoperable
with `packages/governance` verifier) is exactly the tamper-evident serialization of the
edges terminating at `Merge`/`ConvergenceEvidence`. GraphRAG over this graph answers CQ#8
(recall the most similar prior outcome) — that is the `memory/graph/` serving path.

### 3.2 Task graph — the parallel-agents diamond

This is the execution half. It is the classic diamond: **split → parallel workers → separate
verify → one owned merge**, with the **human gate on the irreversible edge (merge/PR)**.

```
                         ┌─ Agent 1 (claude-code)  → Run → CandidateDiff 1 ─┐
                         │      worktree-1                                   │
 Task ──plan/split──────►┼─ Agent 2 (codex)        → Run → CandidateDiff 2 ─┼──► VERIFY ──► CONVERGE ──► [HUMAN GATE] ──► MERGE ──► Evidence + PR
   (independent angles)  │      worktree-2                                   │   (separate    (owned      approve/deny    (single
                         └─ Agent 3 (cursor)       → Run → CandidateDiff 3 ─┘    review        merge)      w/ evidence)     writer)
                                                                                context,
                                                                                diverse Qs)
```

**Why this shape (grounded in the stop rule):**

- **Split only what never reads another's result.** Recoder splits at the *whole-task* level:
  each agent independently attempts the same task in its own worktree — maximally independent,
  no shared mutable state (git worktree isolation enforces "one writer per file" *per run*).
  Sequential sub-steps within a task stay inside a single agent's run.
- **Verify in a separate context (non-negotiable).** `conductor/review/` runs an independent
  review pass; `evidence/finding-vote.ts` + `evidence/convergence-trust.ts` give each verifier
  a different question (correct? current? contested?). A run grading its own diff is never the
  merge authority.
- **One owner of the merge.** `conductor/converge/` + the `[NEW] merge/` module is the single
  writer that fuses survivors (auto for uncontested files, human pick / 3-way synth for
  contested). This is the "single coordinator owning the merge" that cuts error amplification.
- **The human gate on the expensive-to-undo edge.** The approval gate sits at *merge/PR*, not
  on every step — `Approval GATES Merge`, `GovernanceDecision AUTHORIZED Merge`. A denied
  action never reaches git or the remote. Cheap/reversible steps (spawning a run, streaming)
  are ungated.

**Guardrails (the four caps), mapped to existing surfaces:**

1. **Bounded rounds** — `conductor/wait/` + re-fan (`fanout/re-fan.service.ts`) cap converge/retry loops.
2. **One writer per file** — git worktree isolation per run; `WorkLock COVERS FileVersion` at converge.
3. **Routing in written steps** — the diamond is fixed code + task-spec playbooks; the model fills jobs, not the plan.
4. **Hard spawn cap** — a max-N on parallel agents (quota + `coordination` admission).

---

## 4. Scale reality

### 4.1 Owned first-party source today (measured)

| Area | Files | LOC (owned) | Notes |
|---|---|---|---|
| `backend/src` (15 domains) | 1,250 | ~236,000 | the control plane; conductor is the largest domain |
| `apps/desktop/app/frontend/app` | 374 | ~83,000 | Wave-fork shell + 21 recoder-* views |
| `app/` (web: `app/` + `lib/`) | 530 | ~78,000 | Next.js public app, auth SoR, billing |
| `shared/src` | 89 | ~19,000 | cross-cutting shared TS |
| `site/app` | 35 | ~5,200 | marketing site |
| `packages/*` first-party | ~70 pkgs | ~120,000* | 70 `@recoder/*` contract packages (excl. vendored) |
| `apps/desktop/server` (Go, owned) | (subset) | ~40,000* | tmux durable shell (excl. vendored engine clones) |
| **Owned subtotal** | **~2,400** | **~580,000** | *packages/server totals net of vendored OSS engine clones |

> Raw `du` on `packages/` (481 MB) and `apps/desktop/server` (1.25 M lines) is dominated by
> **vendored OSS engine clones used in place** (openfang, tensorzero, browser-use, ziti, etc.).
> Those are engines, not Recoder-authored source — the ~580K owned figure excludes them.

### 4.2 Per-module enterprise estimate (target)

| Module / area | Est. files | Est. LOC | Maturity today |
|---|---|---|---|
| conductor (plan/fanout/converge/review/evidence/merge) | 300–400 | 90k–120k | **built, deepening** |
| agent-os (tasks/runs/artifacts/instructions) | 120–160 | 35k–50k | built |
| governance (gate/policy/risk/audit/approvals) | 90–120 | 25k–35k | built, not yet universal chokepoint |
| identity (principals/orgs/sessions/rbac/agent-identity) | 100–140 | 30k–45k | built; rbac + agent-identity NEW |
| inference (gateway/router/providers/feedback/embeddings) | 70–100 | 20k–30k | built; feedback NEW |
| memory (recall/harvest/rank/candidates/graph) | 90–120 | 25k–40k | built shallow; graph NEW |
| persistence (repos/outbox/versioning) | 80–110 | 25k–35k | built |
| interop + interop-wire (A2A/MCP/edge chain) | 90–120 | 25k–35k | built |
| social (8 connectors) | 80–110 | 20k–30k | built, some channels unwired |
| engines (supervisor + 15 adapters) | 120–160 | 30k–45k | built, several PARKED |
| billing (metering/quotas/providers) | 60–90 | 15k–25k | built |
| cloud (remote substrate/fleet/xds/ziti) | 80–120 | 20k–35k | **stub / cloud-tier** |
| observability (health/metrics/traces/slo) | 50–80 | 12k–20k | built; slo NEW |
| desktop frontend (grouped views) | 400–550 | 90k–130k | built |
| web app (auth/billing/docs) | 500–650 | 80k–110k | built |
| contract packages (`@recoder/*`) | 70+ pkgs | 120k–160k | built, thin by design |
| **Enterprise target total** | **~3,500–4,500** | **~700k–1.0M** (owned) | — |

### 4.3 The "done ladder" (a thin slice is not done)

```
Rung 0  DEMO          One agent, one worktree, manual diff view.                     ✅ surpassed
Rung 1  CORE LOOP     N agents → compare → converge → governed merge → signed        ✅ SHIPPED (green suites)
                      ConvergenceEvidence, single-tenant, local, BYOK.
Rung 2  TRUSTWORTHY   Governance is the single write chokepoint; verifier separation ◐ PARTIAL (gate on delivery
                      enforced; every edge in the knowledge graph audited & signed.     path, not every write)
Rung 3  MULTI-RUNTIME Claude/Codex/Cursor/opencode/pi all first-class + openfang     ◐ PARTIAL (openfang PARKED,
                      async in-process; deep memory recall (colbert real, mem0 one).    2 mem0 impls, rerank lexical)
Rung 4  MULTI-TENANT  Org/RBAC/SSO/SCIM; per-tenant isolation; quota + metering;     ◐ PARTIAL (IDOR swept; org/user
                      IDOR-closed across all domains; billing MoR live.                 reconciliation owner-gated)
Rung 5  CLOUD/TEAMS   Remote substrates (Daytona/E2B), fleet, live xDS/ziti mesh,    ✗ STUB (registered, no live push)
                      squads, shared memory graph across a team.
Rung 6  ENTERPRISE    SOC2/EU-AI-Act/DORA evidence export as SLA; SSO/isolation/     ◐ evidence mapping built;
                      support contracts; audit-grade GraphRAG memory; DR + SLOs.        SLA/DR/SLO NOT built
Rung 7  PRODUCTION    CI/CD, canonical trunk, staged deploy, canary, on-call.        ✗ owner-gated (CI disabled)
```

**Reading the ladder honestly:** Recoder is solidly at **Rung 1, reaching into 2–4**. Rungs
5–7 are stubs or owner-gated. Do not mistake "the core loop is green" (Rung 1) for
"enterprise-ready" (Rung 6). Each rung is a distinct body of work with its own evidence bar.

---

## 5. Interop

### 5.1 What Recoder exposes (edges — untrusted until proven)

| Edge | Surface | Consumers |
|---|---|---|
| `/api/agent-os/*` | canonical control-plane state (spaces/agents/tasks/runs/approvals/artifacts/memory/instructions/policies/events/workflows) | desktop, web, external orchestrators |
| `/api/mcp/*` + `POST /api/mcp/tools/:server/:tool/call` | MCP host (14 in-proc servers) + governed tool-call edge | any MCP client (Claude Code, Codex) |
| `/api/a2a/*` | A2A wire, Ed25519-signed envelopes (external ingress requires ed25519) | other A2A agents, connectors |
| `/api/social/*` | 8-channel connector webhooks/ingress | telegram/slack/discord/signal/imessage/whatsapp/line/feishu |
| `/api/gateway/inference/v1/embeddings` | OpenAI-compatible embeddings | BYOK clients |
| WS `/terminal`, `/api/conductor/workspaces/:id/stream` | live terminal + per-worktree run stream | desktop |
| `/internal/*` (`INTERNAL_SERVICE_KEY`-gated) | worker-to-backend | internal workers only |
| `ConvergenceEvidence` export pack | SOC2 / EU-AI-Act / DORA-mapped signed evidence file | auditors, compliance |

### 5.2 What Recoder consumes

- **Runtimes** (adapters, not owners): Claude Code, Codex, Cursor, opencode, pi, openfang — emit `RunEvent`s back.
- **Model providers** via the inference ladder: TensorZero (napi), then BYOK multi-provider router (keys from the governance vault).
- **Sandboxes/substrates**: local tmux+worktrees (default), Daytona, E2B (cloud tier).
- **Memory/retrieval engines**: mem0 (Qdrant), colbert rerank, beads issue graph.
- **MoR billing**: Creem / Polar / Paddle / Dodo (no Stripe).

### 5.3 Could Recoder use Railyard? (Mint / Relay / Passport)

Railyard's three services map cleanly onto three seams Recoder already has as adapter points.
The governing rule: **Recoder owns the state-of-record; Railyard would be a replaceable adapter
at the edge**, never the owner of task/run/approval/evidence state.

| Railyard service | Recoder seam it plugs into | Fit & recommendation |
|---|---|---|
| **Mint** (metering of agent runs) | `billing/metering/` already emits per-run + per-inference usage events that decrement quotas at the conductor + inference call sites. | **Strong fit.** Add `billing/providers/railyard-mint/` that forwards the *same* metering events (run started/finished, tokens, $, worktree-seconds) to Mint for usage-based invoicing and cross-product rollup, alongside the MoR subscription. Mint becomes the metered-usage ledger; Creem stays the checkout MoR. Low risk — it is an additional emit target on an existing emitter. |
| **Relay** (model gateway) | The inference ladder is exactly a gateway ladder: napi TensorZero → loopback → BYOK router. | **Medium fit, optional rung.** Relay could be inserted as a **rung** in the ladder (e.g. between loopback and direct-BYOK) to centralize provider keys, spend caps, and routing across products. Keep it degrade-safe and *below* the governance vault so BYOK still works offline (local agents must run without an account). Do **not** make Relay the only path — it would break the self-hosted/BYOK/offline promise. |
| **Passport** (agent identity) | `interop-wire` already binds A2A to Ed25519 signer keys; `identity/agent-identity/` is the NEW home for per-agent identity. | **Strong fit for teams/cloud tier.** Passport can issue verifiable agent identities/credentials that the A2A edge and MCP tool-caller verify (replacing/augmenting the raw Ed25519 signer-key binding). This upgrades CQ#2 ("which agent produced this diff, and is it who it claims") from a local key to a portable, revocable identity. Gate it to the cloud/teams tier; local/offline agents keep the built-in signer keys so the no-account path survives. |

**Net:** Mint (metering) and Passport (agent identity) are the two highest-value, lowest-risk
Railyard adoptions and slot into existing seams (`billing/metering`, `interop-wire` +
`identity/agent-identity`). Relay is a reasonable optional gateway rung but must stay optional
to preserve the BYOK/offline/self-hosted guarantee. In all three, Railyard is an **edge adapter
around Recoder-owned state**, consistent with the fusion law (native → subprocess → http-last)
and the "runtimes/sandboxes are replaceable adapters, never owners" invariant.

---

## Key owner decisions (surface these)

1. **Make governance the single write chokepoint (Rung 2).** Today `decide()` runs on the
   delivery path but not *every* module write. Deciding to route all writes through one gate is
   an architectural commitment with real refactor cost — owner call.
2. **Consolidate the duplications** the docs already flag: two mem0 impls, two GitHub engines,
   several memory-recall copies, two terminal restart mechanisms. Each is "move behind one
   composer," not new capability. Owner must sequence this vs. new features.
3. **Cloud/teams tier is a real Rung-5 build, not a flag.** ziti/recoder-xds/multica are
   registered stubs with no live config push. Committing to teams means committing to the
   remote-substrate fleet + live xDS + shared team memory graph.
4. **Railyard adoption scope.** Recommend: adopt **Mint** (metering) and **Passport** (agent
   identity) as edge adapters now; treat **Relay** as an optional inference rung. Requires owner
   sign-off because it touches billing and the auth/identity trust boundary.
5. **Enterprise compliance as SLA (Rung 6).** Evidence mapping to SOC2/EU-AI-Act/DORA exists;
   turning it into a contractual export SLA + DR + SLOs is a distinct, sellable body of work.
6. **Production is owner-gated.** CI is disabled, no canonical trunk, no staged deploy. None of
   the above ships to customers without the owner opening that gate.
```
