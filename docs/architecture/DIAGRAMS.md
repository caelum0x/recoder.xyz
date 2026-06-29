# Recoder — Architecture Diagrams

> A true map of the monorepo. Every node label below is a **real directory** from
> the inventory (see [`../DIRECTORY-MAP.md`](../DIRECTORY-MAP.md)). These diagrams
> are the visual companion to [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (the L0→L4
> layering, BYOK, the swappable substrate, governance fail-closed, the Envoy/XDR/AMI
> spine) and [`../PRODUCTS.md`](../PRODUCTS.md) (the four shipping surfaces).
>
> Conventions used in the diagrams:
> - **solid arrow** = in-process import (`m: in-process-import`).
> - **dashed arrow** (`-.->`) = spawned subprocess / CLI (`m: subprocess-cli`) or an
>   IPC/UDS/HTTP hop.
> - **thick arrow** (`==>`) = an HTTP / WebSocket edge (`m: http-edge`).
> - Parked / provenance-only trees are shown with a `park` style where relevant.

---

## 1. System-of-systems — the five layers

The whole product is one stack in five layers: agents physically run on a **substrate**
(L0), owned **engines** (L1) supply the brains, a single **runtime host** `docker-backend`
(L2) mounts those engines and exposes the APIs, **surfaces** (L3) consume the host, and
**distribution** (L4) ships + gates it. Read top-to-bottom: each layer only depends on
the one above it, and `docker-backend` is the single waist every surface talks through.

```mermaid
flowchart TD
  subgraph L4["L4 · Distribution"]
    distribution["packages/distribution"]
    billing["py/recoder-billing"]
    authpkg["packages/auth"]
    vault["packages/vault"]
  end

  subgraph L3["L3 · Surfaces"]
    desktop["apps/desktop (the paid product)"]
    appcloud["app + site (recoder.xyz cloud)"]
    mobile["apps/mobile"]
    mcpsurface["mcp + packages/cli + recoder-skill"]
    gw["apps/agent-gateway + apps/agent-worker"]
  end

  subgraph L2["L2 · Runtime Host"]
    backend["docker-backend/src — Express/express-ws host\n/api/conductor /api/agent-os /api/a2a /api/connectors"]
  end

  subgraph L1["L1 · Engines (owned brains)"]
    agentos["packages/agent-os (state spine)"]
    runtime["packages/runtime + packages/agent-runtimes"]
    gov["packages/governance + crates/recoder-governance + packages/agent-policy"]
    brain["packages/brain + packages/recodergit + packages/agent-memory"]
    coord["packages/coordination"]
    pal["packages/pal (planner/router)"]
    interop["packages/interop + packages/a2a-sdk + packages/agent-mcp + shared/src/a2a"]
    net["packages/network + go/recoder-xds"]
    events["packages/agent-events + packages/oss-registry"]
    picluster["pi cluster: pi-agent-core / pi-ai / pi-coding-agent / pi-tui"]
  end

  subgraph L0["L0 · Substrate (where agents run)"]
    substrate["packages/substrate (contract)"]
    tmux["c/tmux + git worktrees"]
    dmux["ts/dmux (operator console)"]
    daytona["packages/agent-sandbox + sandbox-daytona + daytona-*-api-client"]
  end

  L4 --> L3
  L3 ==> backend
  backend --> L1
  L1 --> substrate
  substrate --> tmux
  substrate --> daytona
  tmux -.-> dmux
```

---

## 2. Product SERVER internals — `docker-backend`

`docker-backend/src` is the L2 waist: it **imports the L1 engines in-process**, **spawns
heavier engines as CLIs/sidecars** (tmux, the agent CLIs, the Rust governance daemon, the
PAL/mem0 servers), and **exposes HTTP/WS edges** to every surface. This diagram shows the
three integration modes meeting in one process: solid = import, dashed = spawn/IPC, thick = HTTP/WS.

```mermaid
flowchart LR
  clients["cockpit / app / mobile / MCP+A2A clients"]

  subgraph host["docker-backend/src (L2 host)"]
    conductor["conductor (workspace-service, tmux-orchestrator, run-tailer)"]
    aos["agent-os routes /api/agent-os"]
    a2agw["A2A + connectors /api/a2a /api/connectors"]
    runadapter["runtime adapters (claude-code / codex / pi / opencode / in-process)"]
  end

  clients ==>|HTTP/WS| host

  %% in-process imports (L1 engines)
  conductor --> substrate["packages/substrate"]
  conductor --> coord["packages/coordination"]
  conductor --> govpkg["packages/governance"]
  conductor --> brain["packages/brain"]
  aos --> agentos["packages/agent-os"]
  aos --> events["packages/agent-events + oss-registry"]
  a2agw --> interop["packages/interop + a2a-sdk + agent-mcp"]
  a2agw --> connectors["ts/extracted-from-openclaw (connectors)"]
  a2agw --> shareda2a["shared/src/a2a"]
  runadapter --> runtime["packages/runtime + agent-runtimes"]
  runadapter --> picluster["pi-agent-core / pi-ai / pi-coding-agent"]

  %% subprocess-cli / sidecars
  substrate -.->|TMUX_BIN| tmux["c/tmux + git worktree"]
  runadapter -.->|BYOK CLI| agentcli["claude / codex / pi / opencode (user's login)"]
  govpkg -.->|UDS IPC| rustkernel["crates/recoder-governance daemon"]
  interop -.->|stdio| palmcp["py/pal-mcp-server"]
  brain -.->|HTTP| mem0srv["py/mem0 + packages/mem0"]
  brain -.->|spawn| recodergit["packages/recodergit (code-graph MCP/CLI)"]
  brain -.->|BD_BIN| beads["go/beads (bd)"]
  substrate -.->|remote| daytona["sandbox-daytona + daytona-*-api-client"]
```

---

## 3. DESKTOP app — `apps/desktop` boots an embedded backend

The desktop product is an Electron shell that **supervises an embedded `docker-backend`**
on a loopback port, then points the Preact `cockpit` UI at it — turning the `.dmg` from an
empty shell into a working local runtime host (Roadmap M1). It bundles `c/tmux` via
`TMUX_BIN`, mints an `sk_` key, health-gates the boot, and authenticates through the cloud
via device-flow. Everything below the Electron line runs **100% locally, BYOK**.

```mermaid
flowchart TD
  user["user (downloads .dmg / brew --cask)"]

  subgraph electron["apps/desktop (Electron shell)"]
    main["main.js (deep-link auth, native menus)"]
    supervisor["backend supervisor (spawn + health-gate)"]
    cockpit["apps/desktop/cockpit (Preact board UI)"]
  end

  embedded["embedded docker-backend (loopback port, sk_ key)"]
  tmux["c/tmux (bundled via TMUX_BIN)"]
  worktree["git worktree (per workspace)"]
  agentcli["agent CLI: claude / codex / pi (BYOK login)"]
  rustkernel["crates/recoder-governance daemon (optional)"]
  cloud["recoder.xyz (device-flow auth + entitlement)"]

  user --> main
  main --> supervisor
  supervisor -.->|spawn + /api/conductor/health| embedded
  main ==>|loadFile| cockpit
  cockpit ==>|/api/conductor/*| embedded
  embedded -.->|TMUX_BIN| tmux
  tmux --> worktree
  worktree -.-> agentcli
  embedded -.->|UDS| rustkernel
  main ==>|device-flow| cloud
```

---

## 4. CLOUD control plane — `recoder.xyz` (`app` + `site`)

The cloud is the spine that monetizes + connects the desktop: **Better Auth on `app/` is the
identity source of truth**, the desktop/CLI sign in via the OAuth **device-flow**, and
`packages/distribution` resolves entitlements against the **Polar MoR billing engine**
(`py/recoder-billing`). `site/` is the marketing + **download/releases** funnel. The local
desktop authenticates + bills here but runs agents on the user's machine.

```mermaid
flowchart TD
  deviceclient["desktop / CLI (apps/desktop, packages/cli)"]

  subgraph cloud["recoder.xyz cloud control plane"]
    appnext["app (Next.js — Better Auth source of truth)"]
    sitenext["site (marketing + download)"]
    distribution["packages/distribution (device-flow + entitlement gate)"]
    authpkg["packages/auth (cross-domain session/JWT)"]
    vault["packages/vault (secret encryption at rest)"]
    cloudhost["docker-backend (cloud runtime host — optional remote substrate)"]
  end

  billing["py/recoder-billing (Polar MoR: licenses, webhooks, IPC)"]
  releases["GitHub releases (.dmg / brew artifacts)"]

  deviceclient ==>|OAuth device authorization grant| appnext
  appnext --> authpkg
  appnext --> distribution
  distribution -.->|IPC: entitlement / checkout| billing
  distribution --> vault
  sitenext ==>|Download| releases
  deviceclient ==>|remote substrate runs| cloudhost
  cloudhost --> distribution
```

---

## 5. MCP / Agents-IN surface — Recoder as a tool other agents drive

Recoder is itself an **MCP server + A2A endpoint + portable skill**, so an external Claude
Code / Codex / Cursor (or a chat channel) can create workspaces, run tasks, and request
approvals. Every inbound envelope is **hostile-by-default**: `packages/interop` verifies the
Ed25519 signature, checks identity + MCP permissions, runs policy, and audits — before
`docker-backend` does anything. The `mcp/` + `recoder-a2a` servers are the wire; `interop` is the gate.

```mermaid
flowchart LR
  extagents["external agents: Claude Code / Codex / Cursor / Slack-Discord-Telegram"]

  subgraph wire["MCP/A2A wire"]
    mcpserver["mcp/recoder-a2a-server.js"]
    recodera2a["packages/recoder-a2a (publishable MCP server, 8 tools)"]
    skill["recoder-skill (portable agent skill)"]
    cli["packages/cli (recoder / rec)"]
  end

  subgraph gate["packages/interop (hostile-by-default ingress)"]
    sig["verifyEd25519Signature"]
    perm["admitSignedMcpCall (MCP permission)"]
    pol["policy → packages/agent-policy"]
    aud["audit → governance"]
  end

  agentmcp["packages/agent-mcp (registry + permissions)"]
  a2asdk["packages/a2a-sdk + shared/src/a2a (envelopes, state map)"]
  connectors["ts/extracted-from-openclaw (channel connectors)"]
  backend["docker-backend /api/a2a /api/mcp /api/connectors"]

  extagents -.->|stdio MCP| mcpserver
  extagents -.->|stdio MCP| recodera2a
  extagents --> skill
  extagents --> cli
  mcpserver ==> gate
  recodera2a ==> gate
  connectors ==> gate
  sig --> perm --> pol --> aud
  gate --> agentmcp
  gate --> a2asdk
  agentmcp ==> backend
  a2asdk ==> backend
```

---

## 6. AGENT-COMMS via `packages/pal` — the bus that lets agents talk  ★

**The key diagram.** Agents do not message each other directly. Each agent CLI runs
**backgrounded in its own tmux session** (a subprocess of `docker-backend`), and they
communicate **through the server**: `packages/pal` plans/routes work, `packages/coordination`
holds **work-locks** (so codex and claude-code never stomp the same files) and runs the
**A2A handoff bus**, and `shared/src/a2a` carries the **signed envelopes**. This is how
`codex ⇄ claude-code ⇄ pi` and `claude-code ⇄ claude-code` coordinate: tmux for isolation,
pal+coordination in the server for the conversation.

```mermaid
flowchart TD
  subgraph tmuxlayer["L0 · isolated tmux sessions (subprocess-cli, BYOK)"]
    a1["claude-code #1 (worktree A, tmux pane)"]
    a2["claude-code #2 (worktree B, tmux pane)"]
    cdx["codex (worktree C, tmux pane)"]
    piA["pi (worktree D, tmux pane)"]
  end

  subgraph server["docker-backend (the bus runs in-process here)"]
    runtailer["run-tailer (RunEvent stream out of each tmux session)"]
    pal["packages/pal — plan: which runtime/skill/risk/approval"]
    coordination["packages/coordination — work-locks + conflict detect + reaper"]
    handoff["coordination HandoffBus (A2A handoff)"]
    envelopes["shared/src/a2a + packages/a2a-sdk (signed TaskEnvelope)"]
    agentos["packages/agent-os (state of record)"]
  end

  a1 -.->|stdout| runtailer
  a2 -.->|stdout| runtailer
  cdx -.->|stdout| runtailer
  piA -.->|stdout| runtailer

  runtailer --> agentos
  agentos --> pal
  pal --> coordination
  coordination -->|grant / deny file lock| dispatch["dispatch back to tmux pane"]
  coordination --> handoff
  handoff --> envelopes
  envelopes --> agentos

  %% the actual cross-agent comms loop, all through the server
  dispatch -.->|resume work| a1
  dispatch -.->|resume work| a2
  dispatch -.->|resume work| cdx
  dispatch -.->|resume work| piA

  handoff -. "codex ⇄ claude-code ⇄ pi handoff (via envelopes)" .-> envelopes
```

---

## 7. TEAMS / ENTERPRISE mesh — Envoy · xDS · XDR · Merkle audit · AMI

The teams/enterprise spine is a **zero-trust Envoy mesh** fronting the cloud/team host:
Envoy's `ext_authz` filter calls **`packages/governance`** and **fails closed** (governance
down ⇒ edge denies). `go/recoder-xds` serves dynamic LDS/CDS/RDS over ADS so config updates
without restarts; Envoy access-logs feed the **XDR** detections, which seal into the
governance **Merkle audit chain**. The whole thing ships as an **AMI self-host** image for
regulated VPCs. None of this is on the local desktop path.

```mermaid
flowchart TD
  agents["agent fleet traffic (cross-machine)"]

  subgraph dataplane["Envoy data plane (packages/network config)"]
    envoy["Envoy L7 proxy (mTLS, ext_authz filter)"]
    accesslog["JSON access logs"]
  end

  subgraph control["control plane"]
    xds["go/recoder-xds (ADS: LDS/CDS/RDS, no-restart)"]
    network["packages/network (Envoy config gen + contract.json)"]
  end

  subgraph govlayer["governance (fail-closed)"]
    govpkg["packages/governance (ext_authz backing)"]
    rustkernel["crates/recoder-governance daemon (UDS)"]
    merkle["SHA-256 Merkle audit chain"]
  end

  xdr["packages/network/xdr (7 detections: anomalous principals, denied bursts)"]
  ami["deploy/packer AMI + docker-compose.selfhost.yml"]

  agents ==>|request| envoy
  envoy ==>|ext_authz| govpkg
  govpkg -.->|UDS IPC| rustkernel
  govpkg -->|deny when daemon down| envoy
  network --> envoy
  xds -->|dynamic config| envoy
  network -. "TS↔Go contract.json" .-> xds
  envoy --> accesslog
  accesslog --> xdr
  xdr --> merkle
  rustkernel --> merkle
  ami -.->|boots host+governance+envoy+xds in customer VPC| dataplane
```

---

## 8. BRAIN / RAG — one shared context every agent reads once

`packages/brain` is the inter-agent memory unifier: it assembles a single **BrainContext**
from repo intelligence (`packages/recodergit` code-graph), semantic recall
(`packages/mem0` / `py/mem0`), the task graph (`go/beads`), and doc/RAG ingestion
(`packages/document-preprocessor` → `packages/rag`). LLM calls are traced to
`packages/langfuse`, and BYOK secrets are decrypted via `packages/vault`. Agents read the
assembled context **once** instead of each re-reading the repo (FR-4).

```mermaid
flowchart TD
  subgraph brainengine["packages/brain (BrainContext assembly)"]
    assemble["assemble BrainContext"]
    doctors["runtime doctors / engine-resolver"]
  end

  recodergit["packages/recodergit (code-graph: symbols, impact, context-pack)"]
  mem0ts["packages/mem0 (TS memory client)"]
  mem0py["py/mem0 (mem0ai server over HTTP)"]
  agentmem["packages/agent-memory (candidate/review + vector search)"]
  beads["go/beads (bd task graph)"]
  context7["packages/context7-sdk (live library docs)"]

  subgraph ragpipe["RAG ingest pipeline"]
    docprep["packages/document-preprocessor (PDF/text/md extract)"]
    rag["packages/rag (chunk → embed → search → generate)"]
    websearch["packages/web-search (URL → markdown)"]
  end

  langfuse["packages/langfuse (LLM/RAG trace)"]
  vault["packages/vault (BYOK secret decrypt)"]
  agents["agents read BrainContext once"]

  recodergit --> assemble
  mem0ts --> assemble
  mem0ts -.->|HTTP| mem0py
  agentmem --> assemble
  beads --> assemble
  context7 --> assemble
  docprep --> rag --> assemble
  websearch --> docprep
  assemble --> doctors
  rag -.-> langfuse
  assemble --> vault
  assemble ==> agents
```

---

## 9. RUNTIME driver contract — one `RuntimeDriver` over three substrates

The core mechanism: `packages/agent-runtimes` defines **one `RuntimeDriver` contract**, with
one driver per agent CLI (claude-code / codex / pi / opencode / in-process). The driver runs
the agent **exactly how the user is logged in (BYOK)** and streams normalized `RunEvent`s —
*regardless of substrate*. `packages/substrate` picks the physical substrate per workspace:
**`tmux_worktree`** (local default), **`daytona`** (remote), or **`in_process`** (embedded).
The orchestration layer above never sees the difference.

```mermaid
flowchart TD
  conductor["docker-backend conductor (workspace lifecycle)"]

  subgraph contract["packages/agent-runtimes — RuntimeDriver contract"]
    driver["packages/runtime: one driver per CLI"]
    dcc["drivers/claude-code (claude -p, BYOK)"]
    dcdx["drivers/codex (← ts/oh-my-codex)"]
    dpi["drivers/pi (← pi-coding-agent)"]
    dopen["drivers/opencode (← ts/opencode)"]
    dinproc["drivers/in-process (owned tool loop)"]
  end

  subgraph substrate["packages/substrate — resolveRuntimeCommand picks one"]
    tmuxsub["tmux_worktree (LOCAL default): c/tmux + git worktree"]
    daytonasub["daytona (REMOTE): sandbox-daytona + daytona-*-api-client"]
    inprocsub["in_process: runtime tool loop"]
  end

  runevents["RunEvent stream → agent-os state + cockpit"]

  conductor --> contract
  driver --> dcc & dcdx & dpi & dopen & dinproc
  contract --> substrate
  substrate --> tmuxsub
  substrate --> daytonasub
  substrate --> inprocsub
  tmuxsub -.->|backgrounded CLI| runevents
  daytonasub -.->|nohup + exit marker + tail| runevents
  inprocsub --> runevents
```
