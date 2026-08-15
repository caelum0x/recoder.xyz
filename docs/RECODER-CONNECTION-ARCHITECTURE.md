# Recoder Connection Architecture

Status: canonical process, transport, ownership, and trust-boundary specification for
the macOS arm64 private beta, 2026-08-15.

This document answers: which processes exist, how they connect, which protocol each
connection uses, where state lives, how lifecycle is supervised, and how a request
moves from the user to an agent and back. Product behavior is defined in
[RECODER-FULL-PRODUCT-SPEC.md](./RECODER-FULL-PRODUCT-SPEC.md).

## 1. Product topology

```text
Hosted account plane
  recoder.xyz (Next.js)
    auth + invite + device flow + account
                    ^ HTTPS device authorization/token refresh
                    |
macOS desktop       |
  Electron main process ---------------------------------------------+
    | IPC/preload                         | child process supervision |
    v                                     v                           v
  React renderer                    Go recoder-server           Node recoder-backend
    | HTTP/WS                           | Wave/wsh RPC              | HTTP/WS/MCP
    | dynamic loopback URL              | terminal/window state     | product control plane
    |                                   | local secret writer       |
    |                                   +---------------------------+
    |                                                 local filesystem/state
    +---------------------------> /api/conductor, /api/agent-os, /api/mcp
                                                          |
                     +----------------+---------------------+------------------+
                     |                |                     |                  |
                 Loom daemon       tmux server          native NAPI        sidecars/CLI
                 NDJSON UDS         CLI/control         in-process         loopback/stdio
                     |                |                     |                  |
                     +----------------+---------- agent runtime ---------------+
                                                  in isolated git worktree
```

The desktop contains two backend processes with different jobs:

- The **Go server** is the Wave-derived terminal shell backend. It owns windows,
  blocks, terminal plumbing, wsh RPC, local shell/SSH/file primitives, and the secret
  store writer.
- The **Node backend** is the Recoder control plane. It owns workspaces, runs,
  orchestration, governance, agent-os state, MCP, engine adapters, review, converge,
  and merge.

They share the desktop lifecycle and selected filesystem resources. They do not form
two competing product control planes.

## 2. Process inventory

| Process/component | Started by | Lifetime | Primary responsibility | Failure behavior |
|---|---|---|---|---|
| Electron main | OS/user | App lifetime | Window lifecycle, process supervision, IPC, safeStorage, update/install | Fatal only when the shell cannot run |
| React renderer | Electron | Window lifetime | Board, terminal, diff, review, settings | Reload/recreate; durable backend state remains |
| Go `recoder-server` | Electron | App lifetime | Wave shell state and RPC/terminal services | Existing desktop policy may terminate app; report exact failure |
| Node `recoder-backend` | Electron | App lifetime, restartable | Agent control plane and HTTP/WS/MCP edge | Restart with backoff; renderer sees degraded/failed status |
| Loom `loom server` | Node backend | Backend/reattached lifetime | Default native worktree, PTY, agent state, attention | Protocol health failure makes Loom unavailable; default Loom launch fails loud |
| tmux server | Substrate CLI | Can outlive backend | Terminal sessions and recovery/introspection | Reconcile marks missing/orphaned sessions |
| Coding-agent CLI | Loom/tmux/ACP substrate | Workspace attempt | Execute user task in isolated worktree | Exit becomes run event and delivery state, not automatic success |
| Native NAPI addon | Node backend | Node process lifetime | OpenFang, TensorZero, governance, Lance | Missing/load error produces truthful degraded engine state |
| Python/Go sidecar | Engine supervisor | Optional/restartable | Memory, browser, rerank, signals, squads | Bounded probe/restart; core loop continues when optional |
| `bd`, `git`, `gh`, dmux, RecoderGit CLI | Node/backend agent | One-shot or tool lifetime | Issue graph, SCM, layout, optional code graph | Return structured failure/unavailable reason |
| Tsunami app | Go/wsh extension path | Optional block lifetime | Custom Go/VDOM Wave app | Isolated from private-beta core |

Evidence: Electron's Node-backend boot contract is documented in
`apps/desktop/app/emain/emain-backend.ts:4-18`; the Go server entry point is
`apps/desktop/server/cmd/server/main-server.go:4-52`; the Node composition root is
`backend/src/bootstrap/index.ts:1787-1800`.

### 2.1 Source-tree ownership

| Source tree | Architectural role | Private-beta posture |
|---|---|---|
| `app/` | Hosted Next account plane: invite, auth, device-code issue/authorization/token/refresh, account UI | Required only for invited identity; never owns local execution or merge |
| `apps/desktop/` | Desktop distribution root containing Electron/Wave app, Go shell, native engines, packaging, and optional extensions | Product artifact boundary |
| `apps/desktop/engines/dmux` | Vendored multiplexing/layout engine consumed through a narrow CLI/pure-layout adapter | Optional compare-grid/attention helper; not a UI authority |
| `apps/desktop/engines/loom` | Vendored Rust PTY/worktree/agent daemon and public NDJSON protocol | Default execution substrate; narrow governed capability absorption |
| `apps/desktop/engines/openclaw` | Connector and social-ingress implementation used by the backend social domain | Deferred from local private-beta workflow |
| `apps/desktop/engines/recodergit` | Vendored code-graph/GitHub engine | Development/self-host only; excluded from DMG by license gate |
| `apps/desktop/engines/tmux` | Pinned tmux source/binary and session substrate | Configured fallback, recovery, and control-mode path |
| `apps/desktop/server` | Wave-derived Go shell server, wsh RPC, blocks, generic terminal/file/SSH primitives, secret-store writer | Required desktop shell host; not agent control plane |
| `apps/desktop/tsunami` | Go/VDOM Wave extension framework and demos | Optional extension mechanism; not beta core or a second control plane |
| `backend/engines/py` | Python browser, memory, rerank, signals, and deliberation sidecars | Optional and not bundled in arm64 beta |
| `backend/engines/rust` | OpenFang, TensorZero, and governance native implementations/NAPI artifacts | Capability engines behind TypeScript ports; degrade truthfully when absent |
| `backend/src` | Node product control plane: bootstrap, identity, governance, Agent OS, Conductor, engines, HTTP/WS/MCP, persistence, evidence | Canonical local orchestration boundary |

Vendored engine trees are implementation supply, not automatically active product
surface. Activation occurs only through a backend-owned port with lifecycle, health,
policy, and failure contracts.

## 3. Connection catalog

### 3.1 Renderer to Electron

- **Transport:** Electron context-isolated preload IPC.
- **Purpose:** get current backend URL, subscribe to backend URL changes, initiate
  sign-in, read identity, and use desktop-only operations.
- **Authority:** renderer is untrusted input. Main-process handlers validate and own
  OS-level actions.
- **Dynamic-port rule:** synchronous IPC covers initial render; an event broadcasts a
  new URL after backend readiness (`apps/desktop/app/emain/emain-ipc.ts:261-280`,
  `apps/desktop/app/emain/preload.ts:76-80`).

### 3.2 Renderer to Node control plane

- **Transport:** loopback HTTP and WebSocket.
- **Address:** the IPC-injected URL; `http://127.0.0.1:3100` is only the development
  default, not authoritative state.
- **HTTP responsibilities:** environment/runtime discovery, workspace lifecycle,
  diffs, checks, approvals, compare/converge, evidence, merge, agent-os reads, and
  governed MCP calls.
- **WebSocket responsibilities:** `/terminal` for terminal control-mode traffic and
  `/api/conductor/workspaces/:id/stream` for live RunEvents
  (`backend/src/bootstrap/index.ts:1984-1995`).
- **Reconnect:** derive WS origin from the same current backend URL; invalidate stale
  clients when IPC supplies a new URL; then replay durable events before tailing live.

The renderer does not import engine code, open native sockets, invoke sidecars, or
read engine storage directly.

### 3.3 Renderer to Go shell server

- **Transport:** Wave shell's local HTTP/WS and generated wsh RPC clients.
- **Purpose:** tabs, blocks, native terminal rendering, configuration, local
  connections/files, and secret management.
- **Boundary:** product actions that create, govern, review, converge, or merge an
  agent workspace go through the Node control plane. Generic terminal/shell behavior
  remains in Go.

### 3.4 Electron to hosted `recoder.xyz`

- **Transport:** HTTPS only.
- **Flow:** `POST /api/auth/cli/device` -> browser authorization -> poll
  `POST /api/auth/cli/token` with device-code grant -> refresh-token grant.
- **Storage:** the desktop session is encrypted with Electron `safeStorage` in the
  app user-data directory (`apps/desktop/app/emain/emain-device-auth.ts:12-29`).
- **Validation:** only `http`/`https` verification URLs may be opened; server-provided
  `file:` or custom schemes are refused.
- **Failure:** expired, denied, invalid, or refresh-failed states clear/replace account
  session state without deleting local runs.

The hosted app is the account source of truth (`app/lib/auth-config.ts:1-16`). The
private-beta local backend remains a loopback solo-owner control plane; a future team
backend must validate hosted identity instead of enabling solo mode.

### 3.5 Electron to child processes

#### Go server

Electron resolves and spawns the architecture-specific `recoder-server` binary and
injects Wave data/config paths, auth key, web/WS endpoints, resources path, and the
planned Recoder gateway endpoint. The Go process owns its Wave database and RPC
router. Closing stdin participates in its shutdown contract
(`apps/desktop/server/cmd/server/main-server.go:99-112`).

#### Node backend

Electron chooses a free loopback port, creates a private backend data directory,
persists an internal-service credential, and spawns Electron as Node with
`<resources>/backend/dist/server.js` in packaged builds
(`apps/desktop/app/electron-builder.config.cjs:95-117`). It injects:

- `HOST=127.0.0.1` and the selected port;
- `RECODER_SOLO_MODE=1` and desktop single-tenant posture;
- private `DATA_DIR` and `RECODER_SQLITE_PATH`;
- pinned tmux/native paths;
- an allowlisted subset of BYOK/connector settings;
- internal credentials needed by local MCP/worker edges.

Readiness is based on real health, not child PID. On readiness, Electron broadcasts
the effective URL and updates the shell AI gateway configuration. Death restarts with
backoff and does not silently retain a stale healthy state.

## 4. Node backend composition

The backend is assembled in this dependency order:

```text
persistence -> identity -> governance -> engines -> inference -> interop
            -> agent-os -> conductor -> billing -> memory -> cloud
            -> interop-wire -> social -> observability -> edge.listen
```

The concrete start order is `backend/src/bootstrap/index.ts:2005-2039`; shutdown is
the reverse at `backend/src/bootstrap/index.ts:2046-2062`.

### 4.1 State domains

- **Persistence** owns the shared Postgres seam when configured.
- **Agent OS** owns tasks, runs, immutable RunEvents, outbox, approvals/workflow read
  models, and the embedded SQLite state-of-record used by the desktop.
- **Conductor** owns workspace execution and delivery lifecycle, while delegating
  canonical run/event persistence to Agent OS.
- **Governance** owns policy decisions, approvals, work locks, secret metadata, and
  audit chain.
- **Memory** owns recall/harvest/retrieval composition; candidate promotion remains
  reviewable.

The embedded desktop sets one SQLite file under its private backend data directory so
agent-os records and conductor workspace state survive Node restarts
(`apps/desktop/app/emain/emain-backend-core.ts:407-411`,
`backend/src/domains/conductor/adapters/sqlite-workspace-repository.adapter.ts:3-15`).

### 4.2 Capability domains

- **Engines** owns one engine registry, process registry, NAPI loader set,
  daemon/sidecar supervisors, CLI adapters, and MCP host.
- **Inference** owns the NAPI -> loopback -> direct BYOK ladder and usage records.
- **Interop** owns admission and the governance-backed interop chain.
- **Interop wire** owns A2A agent cards, task dispatch, handoff, and remote sender
  behavior.
- **Cloud/social/billing** are composed but are not private-beta core dependencies.
- **Observability** reads all truthful health sources and provides aggregate health,
  logs, metrics, alerts, and signals.

## 5. Edge and route architecture

The edge owns one Express app, one HTTP server, one global middleware chain, one WS
upgrade dispatcher, and one terminal error tail (`backend/src/http/app.ts:1-20`).

### 5.1 Route families

| Base | Owner | Role |
|---|---|---|
| `/health`, `/health/full`, `/metrics` | Observability | Product and operator health |
| `/api/auth`, `/api/identity` | Identity | Backend identity/session/API-key/device seams |
| `/api/agent-os` | Agent OS, governance, memory, cloud, observability | State, approvals, memory, cloud, diagnostics |
| `/api/conductor` | Conductor | Workspaces, runtimes, terminal, diff, review, converge, merge |
| `/api/mcp` | Engines/interop | Governed MCP registry and tool execution |
| `/api/gateway` | Inference | Control and OpenAI-compatible infer/stream/embed |
| `/api/a2a`, `/api/interop`, `/.well-known` | Interop/interop-wire | A2A discovery, signed ingress, dispatch |
| `/api/social` | Social | Connector/webhook edge; deferred for private beta |
| `/api/billing` | Billing | Commercial account behavior; excluded from beta gate |
| `/internal/*` | Owning domains | Local worker/service operations behind internal key |

Bootstrap mounts the providers at `backend/src/bootstrap/index.ts:1801-1969`.

### 5.2 Guarding law

Each domain router currently self-guards. Bootstrap deliberately mounts providers
through the shared global chain without applying a second generic auth layer
(`backend/src/bootstrap/index.ts:1794-1800,1997-1998`). Therefore:

- every new route must state its auth, tenant/owner, governance, rate, and body-parser
  requirements in the owning router;
- `/internal/*` must require the internal service key and fail closed when absent;
- untrusted webhook routes must preserve raw bytes for signature validation;
- the WS upgrader must enforce the same origin/auth posture as HTTP;
- route health must show missing/skipped providers rather than exposing a 404 as an
  apparently healthy capability.

The generic route-table convention is fail-closed (`backend/src/domains/edge/route-table.ts:45-55`),
but the current bootstrap override means self-guards are the operative protection.

## 6. Agent execution connection

### 6.1 Launch sequence

```text
Renderer POST workspace
  -> Conductor validates principal/repo/runtime/request
  -> Governance decides workspace creation/setup
  -> Agent OS records task/run/workspace intent
  -> Substrate creates isolated git worktree
  -> Conductor writes secret-free .mcp.json
  -> Substrate starts agent CLI/native runtime
  -> Terminal output + structured RunEvents stream
  -> Completion harvests memory/evidence and opens review
```

No launch is considered real until the substrate returns a worktree path and session
handle and the run-event record contains the launch outcome.

### 6.2 Loom path

- **Transport:** NDJSON over a Recoder-owned Unix domain socket.
- **Protocol:** exact version 20 ping handshake
  (`backend/src/domains/engines/loom-daemon.ts:45-58`).
- **Lifecycle:** Node resolves the packaged/dev/PATH binary, strips backend secrets,
  starts or adopts a healthy daemon, and passes the same socket to all Loom clients.
- **Launch:** `worktree.create`, then `agent.start`; failed start best-effort removes
  the new worktree (`backend/src/domains/conductor/adapters/loom-substrate.adapter.ts:215-281`).
- **Handle:** Recoder persists Loom's public root pane id, not its internal terminal
  id. Agent verbs accept pane ids or unique agent names
  (`backend/src/domains/conductor/adapters/loom-substrate.adapter.ts:257-283`).
- **Output/control:** `agent.read`, `agent.get`, `agent.prompt`, `pane.send_text`,
  subscriptions, and snapshots use the same daemon, not duplicate processes. Current
  workspace output is captured by the generic poll tailer and emitted as RunEvents;
  Loom does not yet have a bidirectional PTY stream equivalent to tmux control mode
  (`backend/src/domains/conductor/adapters/run-tailer.adapter.ts:1-23`).
- **Steering:** submitted messages use agent-aware `agent.prompt`; non-submitted text
  uses `pane.send_text`. Routing is selected from the workspace's stored substrate,
  so a Loom pane id is never sent to tmux
  (`backend/src/domains/conductor/adapters/loom-steer-transport.adapter.ts:19-63`).
- **Default:** Loom is enabled/default unless `CONDUCTOR_LOOM_DISABLED`; if default
  Loom is unhealthy, the launch fails instead of silently changing substrate
  (`backend/src/bootstrap/index.ts:856-887`).

#### Loom capability boundary

Recoder does **not** expose the whole Loom application inside the desktop. The
vendored engine has roughly 94 public protocol methods. The TypeScript protocol
adapter deliberately types 13 methods, and current production composition directly
uses ten: `ping`, `session.snapshot`, `worktree.create`, `worktree.remove`,
`agent.start`, `agent.get`, `agent.read`, `agent.prompt`, `pane.send_text`, and
`events.subscribe`. This is deep substrate use, not full API coverage.

| Loom capability family | Recoder status | Product ownership |
|---|---|---|
| Daemon health/adoption and protocol negotiation | Used | Node backend supervises one secret-stripped daemon and fails loud. |
| Native worktree create/remove | Used | Loom performs isolation; Recoder stores canonical workspace/run identity. |
| Native agent start/status/read/prompt | Used | Drives launch, polled capture, liveness, continue, swarm, remote-attach service, and user steer. |
| Bidirectional terminal byte stream | Missing product adapter | Current Loom output is captured into RunEvents and input is governed steer, not PTY parity (`recoder-wtlm`). |
| Session snapshots and agent-status events | Used | Feeds needs-attention and status read models; Recoder owns attribution and durable events. |
| Server-side `agent.query`, `agent.wait`, `worktree.status` | Typed, not in the core composition | Adopt only when they replace a concrete polling/read bottleneck; host Git remains review truth. |
| Workspace/tab/pane focus, split, resize, layout, graphics | Not used | Wave/Electron owns product windows, tiling, terminal rendering, and navigation. Two layout authorities would conflict. |
| Loom TUI, popup, window-title, native notification UI | Not used | Recoder keeps one terminal-plain desktop shell and contextual notifications. |
| Loom integrations and 592-plugin ecosystem | Intentionally not exposed | Arbitrary plugin argv bypasses Recoder governance. Governed skills are separate unfinished work (`recoder-ne6o`, `recoder-ubyg`). |
| Loom SSH remote install/attach/update flow | Not connected to Recoder | A real remote product requires hosted authentication, policy, transport, and durable shared state (`recoder-n5pc`). |
| Server config reload/live handoff/agent-manifest management | Internal/unadopted | Recoder controls process lifecycle and runtime discovery; adoption requires an explicit lifecycle contract. |

The design rule is capability absorption, not UI absorption: add a Loom verb when it
strengthens the terminal -> review -> merge loop behind Recoder governance. Do not
mirror Loom's complete TUI or plugin product into React.

### 6.3 tmux path

- **Transport:** pinned tmux CLI plus control mode.
- **Ownership:** the backend drives the vendored binary, names Recoder sessions, and
  maps session/worktree handles into workspace records.
- **Durability:** tmux can outlive the Node process; boot reconciliation scans real
  sessions and compares them with durable records (`backend/src/bootstrap/index.ts:918-931`).
- **Steer:** bounded user messages use `send-keys`; a gone session refuses.

### 6.4 Agent-to-MCP path

Each worktree receives a secret-free `.mcp.json` pointing to the vendored stdio bridge.
The agent starts the bridge as an MCP server; the bridge calls the backend's loopback
MCP HTTP edge using process-injected internal credentials. The backend:

1. resolves the caller/principal;
2. locates the registered server/tool;
3. evaluates interop and per-tool governance;
4. invokes the in-process adapter, CLI, NAPI, daemon, or sidecar;
5. records the verdict and result metadata;
6. returns a truthful completed, denied, needs-approval, failed, or unavailable result.

MCP is the governed capability chokepoint. Native behavior performed directly by an
external agent inside its worktree is bounded by OS/worktree isolation and reviewed as
a diff; it is not falsely described as per-operation MCP governance.

## 7. Engine transport matrix

The closed engine catalog is defined at `backend/src/domains/engines/constants.ts:18-64`.

| Transport | Engines | Connection | Supervision | Private-beta posture |
|---|---|---|---|---|
| NAPI | OpenFang, TensorZero, governance | In-process `.node` | Process-lifetime load | Packaged when artifact exists; truthful degrade otherwise |
| Daemon | ColBERT, ops-recorder, Multica, Ziti, TensorZero loopback | Loopback HTTP | Shared process registry, probe, restart | Optional; not release-gating |
| Sidecar | mem0, browser-use, pal-mcp | Loopback HTTP or stdio MCP | Shared sidecar supervisor | Optional; Python not bundled for beta |
| CLI | beads, dmux, tmux, RecoderGit | One-shot subprocess / managed CLI server | Exit/result capture | tmux/beads/dmux packaged; RecoderGit excluded |
| In-process TS | OpenClaw connectors and owned package capabilities | Module import/port | Node lifecycle | Deferred from core UI |
| Unix daemon outside catalog | Loom | NDJSON Unix socket | Dedicated manager/adoption | Default core substrate |

Every long-lived loopback service binds `127.0.0.1`, never a routable interface
(`backend/src/domains/engines/constants.ts:1-8,75-88`).

## 8. State and storage map

| State | Owner | Storage | Restart behavior |
|---|---|---|---|
| Hosted user/invite/device sessions | `app/` | Hosted auth database (`user` and legacy `users` remain distinct) | Independent of desktop |
| Desktop account token | Electron | `safeStorage` ciphertext in userData | Reloaded/refreshed |
| Wave tabs/blocks/config | Go server | Wave local data/config store | Survives app restart |
| BYOK secrets | Go writer/Electron crypto | One encrypted `secrets.enc` | Read allowlist at backend spawn |
| Workspaces/tasks/runs/events | Agent OS + conductor | Embedded `state-of-record.sqlite` in desktop; Postgres in shared deployment | Durable |
| Git source/change truth | Git | Repository + isolated worktrees + branches/commits | Durable until explicit cleanup |
| Live terminal/runtime | Loom/tmux/agent | Loom pane id + UDS daemon or tmux/process state | Reattach/reconcile where possible |
| Issue graph/memory | Beads/memory domain | Repository `.beads`/Dolt and memory stores | Reviewable and durable per engine |
| Retrieval vectors | Memory/Lance or external Qdrant | Private backend data dir or configured service | Optional/degraded |
| Governance audit/evidence | Governance/conductor | State repository + exported artifacts | Durable and append-oriented |

No optional engine may become the sole owner of workspace, run, or merge truth.

## 9. Trust boundaries

1. **Internet -> hosted app:** normal web auth, OAuth callback, device flow, invite and
   rate-limit boundaries.
2. **Hosted app -> desktop:** device tokens are account credentials; verification URLs
   are untrusted server input until scheme-checked.
3. **Renderer -> Electron:** IPC input is untrusted and limited to exposed preload APIs.
4. **Renderer -> local backend:** loopback reduces exposure but does not remove request
   validation, CSRF/origin, ownership, or governance requirements.
5. **Agent process -> MCP bridge:** prompt-controlled input; exact caller, tool, target,
   risk, and audit must be bound by the host.
6. **Agent -> worktree:** native agent commands can mutate only the isolated checkout
   and user-accessible OS resources; merge remains a separate governed boundary.
7. **Backend -> engine:** adapters constrain arguments, timeouts, environment, and
   output. Daemons receive minimal env; Loom specifically strips backend secrets.
8. **Local solo -> shared deployment:** `RECODER_SOLO_MODE` is legal only on loopback
   with local/non-shared databases. The boot guard refuses unsafe combinations
   (`backend/src/bootstrap/solo-mode-guard.ts:81-118`).

## 10. Packaging contract

The private-beta artifact packages:

- Electron renderer/main/preload;
- architecture-specific Go `recoder-server` and `wsh`;
- embedded Node backend dist, self-contained node modules, package/data template;
- tmux, Loom, beads, and dmux artifacts;
- governance, Lance, OpenFang, and TensorZero native addons.

The current source list is `apps/desktop/app/electron-builder.config.cjs:77-189`.
Packaging fails loudly when required extra resources are absent
(`apps/desktop/app/electron-builder.config.cjs:250-270`).

The artifact does not package:

- RecoderGit, until licensing is resolved;
- Multica, until licensing and product need are resolved;
- Python sidecars for the private beta;
- x64/universal native artifacts;
- remote/cloud infrastructure as a requirement for local work.

Signing/notarization success is not enough. Release acceptance requires staple
verification and a clean-machine install/boot/product-loop run.

## 11. Failure and recovery contract

| Failure | Required behavior |
|---|---|
| Preferred backend port busy | Select another loopback port, broadcast it, reconnect renderer |
| Node backend crashes | Mark degraded, restart with backoff, retain SQLite/git/substrate state |
| Go server crashes | Surface shell failure; do not claim product remains ready |
| Loom absent/protocol mismatch | Mark Loom unavailable; default Loom launch fails loud; user may configure tmux fallback |
| tmux session gone | Reconcile record, stop streaming, expose retry/new-attempt action |
| Agent CLI absent/auth missing | Refuse launch with runtime-specific guidance |
| Optional sidecar/NAPI absent | Capability unavailable; core loop continues if not required |
| Hosted auth expired | Refresh; on failure start device sign-in; retain local workspaces |
| Governance needs approval | Pause exact action/target; inline approve/reject |
| Governance unavailable | Deny sensitive write or report unavailable; never bypass silently |
| Diff/check read fails | Review remains blocked/degraded with the source error |
| Merge conflict or stale base | Refuse merge and show recoverable conflict/rebase/converge path |
| RecoderGit requested in packaged app | Report unavailable/licensing-excluded, never auto-download or fake result |

## 12. Target simplifications

The current architecture works but composition is concentrated in
`backend/src/bootstrap/index.ts`. Product evolution should reduce fragility by:

1. extracting a product-wiring layer for conductor/interop/cloud/observability late
   bindings while keeping domains port-driven;
2. moving remaining domain-adjacent environment reads into normalized `AppConfig`;
3. making the account-identity/local-execution-principal mapping explicit;
4. keeping one canonical backend URL state for HTTP and WS clients;
5. retaining the single edge server and single MCP governance chokepoint;
6. refusing new user-facing engine dashboards or a second desktop control plane.
