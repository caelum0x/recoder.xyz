# Subsystem: `interop` — A2A Wire Interoperability + MCP Host/Registry

> **Status:** Architecture spec (design of record).
> **Owner:** Lead architect, interop subsystem.
> **Location:** `packages/interop` (TypeScript control-plane engine) — consolidates the existing
> `packages/a2a-sdk` (wire-level A2A contracts) and `packages/agent-mcp` (MCP registry + tool-permission
> contracts) into one owned engine, and fuses the real MCP host (`mcp/`, `py/pal-mcp-server`) and the
> social/connector gateways (`ts/extracted-from-openclaw`) plus the running A2A services in
> `docker-backend/src/a2a/`.
> **Scope:** First-party fusion. All code here is owned and merged — never a thin HTTP wrapper around the
> originals (per `.claude/rules/security.md` and the repo "deep integration LOCKED" rule).

---

## 1. Purpose / Mission

The `interop` subsystem is Recoder's **agent-to-agent and tool/connector interop surface**. It is the
boundary where *external* parties — other agents (A2A), tool servers (MCP), and human/social channels
(connectors) — meet Recoder's control plane. Three concrete jobs:

1. **A2A wire interoperability.** Speak the canonical Agent-to-Agent (A2A) protocol over the wire so an
   external org's agent can submit a task to Recoder, stream progress, and receive a result — and so a
   Recoder agent can reach *out* to an external A2A agent. This is request/response + streaming, agent
   cards, task/message envelopes, error taxonomy, and **signed-envelope** authentication.
2. **MCP host + registry.** Be the Model Context Protocol host: register tool servers (tasks, runs,
   artifacts, approvals, github, repo, browser, memory, deploy, billing, preview, logs, git_nexus, beads,
   oss), route tool calls, **gate every call by permission + risk + policy**, and audit it. Plus host
   *external* MCP servers (the real cloned `py/pal-mcp-server`, project-scoped stdio servers) without
   trusting their self-described tool surface.
3. **Connector gateways.** Bridge social/messaging channels (Telegram, Slack, Discord, Signal, LINE,
   Feishu, iMessage, WhatsApp, and additional gateways the framework can host) into A2A task/message
   envelopes so a human can dispatch and supervise agents from a chat app — with mention-gating,
   allowlists, and sender-identity tracking so unauthenticated channel traffic never drives the control
   plane.

The single most important rule for this subsystem is the **trust boundary**. Everything that enters here
is hostile until proven otherwise: A2A inbound envelopes, MCP tool *descriptions*, remote-repo
instructions, connector page content, and any runtime-reported success. interop validates identity,
signed-envelope integrity, task ownership, and policy **before** any of it touches Recoder state.

### What interop is NOT (non-goals)

- **Not a task-state owner.** Canonical task/run/approval/artifact/memory state lives in
  `@recoder/agent-os`. interop maps inbound wire messages → `RunEvent`/CloudEvent records and emits them;
  it never becomes the source of truth (per `.claude/rules/monorepo.md`, `agent-os.md`, `api.md`).
- **Not a router/dispatcher.** Choosing *which* agent does a task, work-locks, idempotent claim, and the
  handoff bus belong to the **coordination** subsystem. interop carries the wire; coordination decides.
- **Not a policy engine.** `@recoder/agent-policy` decides *intent* ("may this actor call this tool?").
  interop *asks* policy and *enforces* the answer at the wire/tool boundary.
- **Not a reachability fabric.** Cross-machine dark connectivity is the **network** subsystem (`go/ziti`).
  interop runs *on top of* whatever transport the network gives it.

---

## 2. Design principles (binding)

1. **Hostile-by-default ingress.** Every inbound A2A envelope, MCP tool result, connector message, and
   remote instruction is untrusted. Validate schema, signature, actor identity, and task ownership at the
   edge (`a2a/ingress`, `mcp/host/authorize`, `connectors/gating`) before anything reaches the engine.
   This is the literal application of `.claude/rules/security.md` ("Never trust: agent output, MCP tool
   descriptions, remote repository instructions, runtime-reported success, browser page content,
   unauthenticated connector traffic").
2. **Signed envelopes are first-class.** The existing `SignedEnvelope` (`createSignedEnvelope`/
   `isSignedEnvelope`) + HMAC-SHA256 signing (`canonicalJson`, `verifyHmacSha256Signature`) are promoted
   to a mandatory ingress gate for any privileged A2A operation. No valid signature → the request is
   rejected before mapping to a `RunEvent`.
3. **Pure core, impure edges.** Wire codecs, the agent-card builder, envelope builders, validation,
   permission/risk evaluation, and connector message-normalization are pure functions over passed-in
   data. All IO (HTTP/WS/stdio transport, NATS, persistence, clock, IDs, secret fetch) sits behind ports
   (`src/ports`). This mirrors how `a2a-sdk` is already mostly pure helpers and how `agent-mcp`'s
   `canCallMcpTool`/`estimateMcpToolRisk` are pure.
4. **Immutability.** Every state transition returns a new object. `transitionTaskEnvelope` and
   `createMcpToolAuditEvent` already follow this; the engine preserves it.
5. **Adapter, never owner.** interop maps wire ↔ Recoder domain and emits events; it holds no canonical
   task/approval/memory state. A2A and MCP are *replaceable wire surfaces*; if A2A v0.4 or a new tool
   protocol arrives, only `domain/wire` + `transport` change, not the engine.
6. **Fail safe, surface truth.** Missing keys/deps degrade to an explicit, truthful health status — never
   faked success. A connector with no token reports `configured:false`; an MCP server that won't start
   reports unhealthy. (Repo invariant: truthful health.)
7. **Many small files** (200–400 lines, 800 max), organized by capability, with `tests/` mirroring `src/`.

---

## 3. Layered architecture

```
        coordination · governance · brain · agent-os (state of record) · memory
                                         │  ports (interfaces)
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │  packages/interop  (TypeScript control-plane engine)                               │
  │                                                                                    │
  │   public API ─► engine ─► a2a/ (wire)   mcp/ (host+registry)   connectors/ (chat)  │
  │       │           │          │                 │                      │            │
  │   domain types    │      ingress/codec     authorize/route       gating/normalize  │
  │       │           │      sign/verify       risk/policy/audit      mention/allowlist │
  │   persistence ◄───┴──────────┴──────────────────┴──────────────────────┘           │
  │   (audit ledgers, registry, sessions)                                              │
  │   observability ◄──────────────────────────────────────────────────────────────┐  │
  └───────────────────────────────────┬─────────────────────────────────────────────┘  │
                                       │  transport: HTTP/JSON-RPC · stdio · WebSocket · NATS
  ┌────────────────────────────────────▼─────────────────────────────────────────────┐ │
  │  wire surfaces (owned, merged)                                                     │ │
  │  • A2A REST/JSON-RPC + /.well-known/agent.json   (from a2a-sdk + docker-backend)  │ │
  │  • MCP host: in-proc TS servers + external stdio (mcp/, py/pal-mcp-server)        │ │
  │  • connector gateways (ts/extracted-from-openclaw: telegram/slack/discord/...)    │ │
  └───────────────────────────────────────────────────────────────────────────────────┘
                                       │
              external A2A agents · MCP tool servers · social channels · humans
```

The TypeScript package owns the domain model, the validation/codec/permission engine, the host/registry,
and the seams. External MCP servers (the Python `pal-mcp-server`, project stdio servers) and the social
gateways are **driven** by this engine through ports — their algorithms are merged in, their *processes*
are supervised, never blindly trusted.

---

## 4. What gets fused (read sources)

Every row below cites a path verified on disk (Glob/Read) during design.

| Source (real path, read) | What it is | How it fuses in |
|---|---|---|
| `packages/a2a-sdk/src/canonical-a2a-types.ts` | Canonical A2A wire types (auto-gen from JSON Schema): `AgentCard`, `Message`, `Task`, `TaskState`, `SendMessageRequest`, `JSONRPCResponse`, `Part`/`TextPart`/`FilePart`/`DataPart`, `SecurityScheme`, ~80 error/response types | Becomes `domain/wire/canonical-a2a.ts` (re-exported as the `CanonicalA2A` namespace). The wire vocabulary, owned verbatim. |
| `packages/a2a-sdk/src/schemas/signed-envelope.ts` | `SignedEnvelope<T>`, `createSignedEnvelope`, `isSignedEnvelope`, `SIGNED_ENVELOPE_VERSION` | `domain/envelope/signed-envelope.ts` + promoted to the mandatory ingress gate in `a2a/ingress/verify-envelope.ts`. |
| `packages/a2a-sdk/src/schemas/task-envelope.ts` | `TaskEnvelope`, `TaskState`, `ALLOWED_STATE_TRANSITIONS`, `isValidTransition`, `transitionTaskEnvelope`, `createTaskEnvelope`, terminal-state set | `domain/envelope/task-envelope.ts` — the canonical task envelope + legal transition table, owned. |
| `packages/a2a-sdk/src/schemas/agent-card.ts` | `AgentCard`, `AgentCardSkill`, `AgentCardSecurityScheme` | `domain/wire/agent-card.ts` + `a2a/agent-card/builder.ts` (serves `/.well-known/agent.json`). |
| `packages/a2a-sdk/src/signing/hmac.ts` | `canonicalJson`, `createHmacSha256Signature`, `verifyHmacSha256Signature`, `createSignedEnvelopeSignature` | `a2a/sign/hmac.ts` — the crypto primitives behind ingress verification + outbound signing. |
| `packages/a2a-sdk/src/ingress.ts` | `normalizeInboundEnvelope` + options/result | `a2a/ingress/normalize.ts` — inbound normalization, hardened with the verify gate in front. |
| `packages/a2a-sdk/src/client/a2a-client.ts` | `A2AClient` (`listTasks`/`sendMessage`/`cancelTask`), `A2AClientOptions` | `a2a/client/a2a-client.ts` — outbound calls to external A2A agents, signed. |
| `packages/a2a-sdk/src/server/handlers.ts` | `A2AServerHandlers` interface (`agentCard`/`listTasks`/`getTask`/`sendMessage`/`cancelTask`) | `a2a/server/handlers.ts` + `ports/a2a-handlers-port.ts` — the inbound contract the engine implements. |
| `packages/a2a-sdk/src/envelope-builders.ts` | `buildCodexEnvelope`/`buildClaudeEnvelope`, `start/complete/fail/cancelEnvelope`, `a2aErrorToTaskErrorInfo` | `a2a/envelope/builders.ts` — connector→envelope construction. |
| `packages/a2a-sdk/src/error-mapping.ts` | `mapCodexError`/`mapClaudeError`/`mapHttpError`/`mapConnectorError`/`wrapUnknownError` | `errors/map-wire-error.ts` — uniform error mapping at the edge. |
| `packages/a2a-sdk/src/schemas/error-taxonomy.ts` | `A2AErrorCode`, `A2A_ERROR_CODE_REGISTRY`, `buildA2AError`, severity/category enums | `errors/a2a-error-taxonomy.ts` — owned error registry. |
| `packages/a2a-sdk/src/audit-helpers.ts` | `emitTask*`/`emitConnector*`/`emitPolicy*`, `emitAuditForTransition` | `a2a/audit/audit-helpers.ts` → routed through `EventSinkPort` to agent-events outbox. |
| `packages/a2a-sdk/src/validation.ts` | `validateTaskEnvelope`/`validateAuditEvent`/`validateA2AError`/`validateAgentProfile`/`validateInstructionBundle` + assert/guards | `a2a/validation/*` — boundary validators, one file per validated type. |
| `packages/a2a-sdk/src/agent-profile.ts`, `task-intent.ts`, `instruction-bundle.ts`, `policy.ts` | `AgentProfile`/`createAgentProfile`, `TaskIntent`, `InstructionBundle`, `AgentPermissionPolicy`/`ApprovalGate`/`ApprovalPolicy`/`RuntimeHealth` | `domain/profile/*` and `domain/policy-contracts.ts` — shared contracts (some re-exported from agent-os via seam, not forked). |
| `packages/a2a-sdk/src/bridge-contract.ts` | `A2A_BRIDGE_ENDPOINTS`, bridge job/heartbeat/run-history/checkpoint helpers (`createApprovalCheckpoint`, `createHandoffCheckpoint`, `createRunHistoryEvent`, `isBridgeJob`, ...) | `a2a/bridge/*` — the runtime bridge contract for connector runtimes. |
| `packages/agent-mcp/src/registry.ts` | `McpServerKind` (17 kinds), `McpServerRegistration`, `McpRegistry` | `mcp/registry/registry.ts` + `domain/mcp/server-registration.ts`. |
| `packages/agent-mcp/src/permissions.ts` | `canCallMcpTool`, `McpToolCallInput`, `McpToolCallDecision` | `mcp/policy/can-call.ts` — pure tool-permission gate. |
| `packages/agent-mcp/src/host/mcp-host.ts` | `RecoderMcpHost` (`authorize`/`call`), `McpToolExecutor`, `McpToolResult`, `McpToolAuditRecord`, `McpToolAuditSink` | `mcp/host/mcp-host.ts` — the host composition (authorize→execute→audit). |
| `packages/agent-mcp/src/host/tool-router.ts` | `McpToolRouter` (`register`/`call`), `McpToolHandler` | `mcp/host/tool-router.ts` — in-proc tool dispatch. |
| `packages/agent-mcp/src/host/session-manager.ts` | `McpSessionManager` (`upsert`/`list`/`get`/`remove`), `McpSession` | `mcp/host/session-manager.ts` — per-agent MCP session tracking. |
| `packages/agent-mcp/src/policy/tool-risk.ts` | `estimateMcpToolRisk`, `McpToolRisk` (low/medium/high) | `mcp/policy/tool-risk.ts` — pure risk scorer. |
| `packages/agent-mcp/src/policy/permission-check.ts` | `checkMcpToolPermission` (risk + policy) | `mcp/policy/permission-check.ts`. |
| `packages/agent-mcp/src/policy/audit.ts` | `McpToolCallStatus`, `McpToolCall`, `McpToolAuditEvent`, `createMcpToolCall`, `createMcpToolAuditEvent` | `mcp/audit/*` — owned MCP audit records. |
| `packages/agent-mcp/src/servers/*.ts` (github/repo/tasks/runs/artifacts/approvals/browser/memory/work-locks/deployment/billing/git-nexus/beads/oss/preview/logs) | 16 `McpServerRegistration` constants + `registerMemoryMcpTools`/`registerWorkLocksMcpTools` | `mcp/servers/*` — the canonical in-proc server catalog, owned. |
| `docker-backend/src/mcp-manager.ts` | `MCPManager` (`startServer`/`stopServer`/`callTool`/`listTools`/`checkIdleServers`), `MCPServerConfig`, `MCPTool`; spawns MCP servers as child processes, JSON-RPC, idle cleanup | `mcp/external/process-manager.ts` + `transport/stdio/*` — supervises external stdio MCP servers (project-scoped + pal-mcp-server). |
| `docker-backend/src/agent-os/routes/mcp-control.routes.ts` | `createAgentMcpRouter` — `/servers`, `/tools`, `/tools/:serverId/:toolName/check`, `/resources`, `/prompts` | rewired to call `@recoder/interop` `McpHost` facade; route stays thin. |
| `docker-backend/src/a2a/a2a-event-bus.ts` | `A2AEventBus` (`publish`/`subscribeGlobal`/`subscribeTask`/`subscribeChannel`/`subscribeWorkspace`/`getRecentEvents`), `A2AEventType`, NATS JetStream mirror | `transport/event-bus/*` — the SSE/event fan-out for wire surfaces (handoff/coordination semantics stay in coordination; interop reuses transport mechanics). |
| `docker-backend/src/a2a/agent-registry.service.ts` | `AgentRegistryService` (`register`/`discover`/`recordHeartbeat`/`getHealth`/`selfRegister`/`registerDefaults`), protocol kinds rest/jsonrpc/mcp, tiers | `a2a/registry/*` + `ports/agent-directory-port.ts` — external/A2A agent discovery surface. |
| `docker-backend/src/a2a/autonomous-routing.service.ts` | `processHandoff`/`executeDelegation`, `@mention` intent parse (handoff:/delegate:/review:), `wireAutonomousRouting` | the **intent parse** + connector→A2A bridge piece merges into `connectors/routing/mention-router.ts`; the delegation/handoff *execution* defers to coordination via seam. |
| `docker-backend/src/a2a/context-bridge.service.ts` | `ContextBridgeService` (`createContext`/`transferContext`/`appendContext`), `InMemoryContextStore`/`RedisContextStore` | `a2a/context/*` — context snapshot transfer across the wire. |
| `mcp/recoder-a2a-server.js`, `mcp/recoder-codex-adapter.js`, `mcp/recoder-mcp-server/manifest.json` (+ bridge/adapter manifests) | The repo MCP host surface: WebSocket A2A bridge tools (`recoder_list_agents`, `recoder_list_tasks`, `recoder_send_task`, `recoder_create_thread`, `recoder_sandbox_exec`, `recoder_get_thread`), 15 registered canonical servers, runtime/adapter manifests | `mcp/external/recoder-a2a-server-adapter.ts` + `mcp/manifests/*` — the external host bridge is supervised; manifests become the registry seed. |
| `py/pal-mcp-server/server.py` (+ `tools/`, `providers/`, `systemprompts/`) | Real cloned Python MCP server (`pal-mcp-server` v9.8.2): stdio transport, 18 tools (`chat`, `thinkdeep`, `planner`, `consensus`, `codereview`, `precommit`, `debug`, `secaudit`, `docgen`, `analyze`, `refactor`, `tracer`, `testgen`, `challenge`, `apilookup`, `clink`, `listmodels`, `version`), multi-provider | Hosted as an **external stdio MCP server** via `mcp/external/pal-server.ts` + `transport/stdio/stdio-client.ts`. Not transpiled; supervised + permission-gated + audited like any external server. |
| `ts/extracted-from-openclaw/gateway-core/` (`gateway/server.impl.ts`, `channels/*`) | Channel framework: routing, sessions/lanes, mention-gating, allowlists, sender-identity, command-gating, device/Tailscale auth, abort, chunking | `connectors/gateway/*` + `connectors/channels/*` — the connector runtime core, owned. |
| `ts/extracted-from-openclaw/social-gateways/{telegram,slack,discord,signal,line,feishu,imessage,whatsapp}/` | Per-channel clients: monitor/send/probe/accounts/bot-handlers (e.g. `sendMessageTelegram`, `monitorSlackProvider`, `probeSignal`, `createLineBot`, `whatsapp/normalize`) | `connectors/social/*` — each connector adapter, owned and normalized to one `ConnectorPort`. |

> **Note on the connector roster.** The task brief named WordPress/Gmail/Teams/LinkedIn/Meet; the
> *actually-present* gateways under `ts/extracted-from-openclaw/social-gateways/` are **Telegram, Slack,
> Discord, Signal, LINE, Feishu, iMessage, WhatsApp**. This doc grounds in the real tree. The
> `connectors/gateway/` framework is connector-agnostic, so WordPress/Gmail/Teams/LinkedIn/Meet are
> future adapters that implement the same `ConnectorPort` — they are listed in §6 as planned adapter
> files, clearly marked, not as already-extracted code.

> **Note on Go/Python.** We do **not** transpile the Python `pal-mcp-server`. We host it as a real MCP
> server process behind `transport/stdio`, with the same authorize→risk→policy→audit gate every other
> server gets. This honors "runtimes/OSS are adapters around Recoder state, not owners."

---

## 5. Relationship to the existing contract packages

`packages/a2a-sdk` and `packages/agent-mcp` exist today as **contract** packages. `packages/interop`
consolidates them into one **engine** package:

- The **types/contracts** (`SignedEnvelope`, `TaskEnvelope`, `AgentCard`, `McpServerRegistration`,
  `McpToolCall`, error taxonomy, `AgentProfile`, `InstructionBundle`, policy contracts) move into
  `interop/src/domain/**` and are re-exported unchanged so existing importers keep compiling.
- The **behavior** scattered across `a2a-sdk` helpers, `agent-mcp/host`, `docker-backend/src/a2a/*`, and
  `docker-backend/src/mcp-*` is fused into `interop/src/{a2a,mcp,connectors,engine}/**`.
- During migration, `@recoder/a2a-sdk` and `@recoder/agent-mcp` become **thin façade re-exports** of
  `@recoder/interop` (so no downstream import path breaks), then are deprecated. The monorepo rule that
  "`packages/a2a-sdk` owns wire-level A2A interop contracts" is satisfied: interop *is* that owner now,
  with a2a-sdk as its published contract entrypoint until removal (see §13 migration).

interop depends on `@recoder/agent-os` (domain reuse: Task/Run/Approval/AgentProfile),
`@recoder/agent-policy` (intent decisions), `@recoder/agent-memory` (memory candidate emission — already a
dep of agent-mcp), and `@recoder/agent-events` (outbox). The pure core depends only on `ports`, so those
package couplings live at the seams, not in the engine.

---

## 6. Full file tree

> Every `src/` file below is a real functional module with the stated single responsibility, organized
> into `domain/ ports/ engine/` plus capability modules (`a2a/ mcp/ connectors/`), adapters
> (`transport/ persistence/`), `seams/ config/ observability/ errors/ util/`, with a mirrored `tests/`.

```
packages/interop/
├── package.json                                   # @recoder/interop; deps: @recoder/agent-os, agent-policy, agent-memory, agent-events, zod
├── tsconfig.json                                  # extends @recoder/tsconfig; strict
├── tsup.config.ts                                 # ESM+CJS+dts (mirrors agent-mcp/tsup.config.ts; multi-entry like a2a-sdk)
├── vitest.config.ts                               # unit + contract + integration runner
├── README.md                                      # quickstart + trust-boundary invariants
├── CHANGELOG.md                                   # subsystem changelog
│
├── src/
│   ├── index.ts                                   # public API barrel — the ONLY entry consumers import
│   │
│   ├── config/
│   │   ├── index.ts                               # config barrel
│   │   ├── interop-config.ts                      # InteropConfig type (a2a base url, mcp idle ttl, connector enable flags)
│   │   ├── env.ts                                 # read+validate env via zod, fail-fast on missing required secrets
│   │   ├── env-keys.ts                            # canonical env var names (A2A_SIGNING_KEY, NATS_URL, connector tokens) — single source
│   │   ├── defaults.ts                            # default TTLs/limits as named constants (idle 5min, max 3 servers, heartbeat 90s)
│   │   └── feature-flags.ts                       # toggles: requireSignedIngress, externalMcpEnabled, connectorAutoReply
│   │
│   ├── domain/                                    # owned contracts (fused from a2a-sdk + agent-mcp; extended here)
│   │   ├── index.ts                               # domain barrel
│   │   ├── ids.ts                                 # branded ids (TaskId, MessageId, AgentId, ServerId, ToolCallId, SessionId, ConnectorId)
│   │   ├── clock.ts                               # Clock port type + iso() helper (deterministic-time seam)
│   │   ├── wire/
│   │   │   ├── index.ts                           # wire barrel
│   │   │   ├── canonical-a2a.ts                   # MERGED canonical-a2a-types.ts → CanonicalA2A namespace (AgentCard/Message/Task/Part/...)
│   │   │   ├── agent-card.ts                      # MERGED schemas/agent-card.ts (AgentCard/AgentCardSkill/AgentCardSecurityScheme)
│   │   │   ├── jsonrpc.ts                          # JSON-RPC 2.0 request/response/error shapes (from JSONRPCResponse + method envelopes)
│   │   │   ├── transport-protocol.ts              # TransportProtocol enum (rest|jsonrpc|mcp) — from canonical + registry protocol kinds
│   │   │   ├── message-part.ts                    # Part/TextPart/FilePart/DataPart + guards (MERGED)
│   │   │   └── security-scheme.ts                 # SecurityScheme projection (apiKey|http|oauth2|mtls) for agent cards
│   │   ├── envelope/
│   │   │   ├── index.ts                           # envelope barrel
│   │   │   ├── signed-envelope.ts                 # MERGED signed-envelope.ts (SignedEnvelope<T>, create/isSignedEnvelope, version)
│   │   │   ├── task-envelope.ts                   # MERGED task-envelope.ts (TaskEnvelope, transitions, terminal set, transitionTaskEnvelope)
│   │   │   ├── task-state.ts                      # TaskState enum + TERMINAL_TASK_STATES + isTerminalState (extracted)
│   │   │   ├── state-transitions.ts               # ALLOWED_STATE_TRANSITIONS + isValidTransition (extracted, pure)
│   │   │   ├── task-artifact.ts                   # TaskArtifact/TaskArtifactType (MERGED)
│   │   │   ├── task-result.ts                     # TaskResult/TaskErrorInfo/TaskPolicySnapshot (MERGED)
│   │   │   ├── connector-info.ts                  # TaskConnectorInfo/TaskAgentRef (MERGED)
│   │   │   └── inbound-envelope.ts                # NormalizedInboundEnvelope type (output of ingress)
│   │   ├── mcp/
│   │   │   ├── index.ts                           # mcp domain barrel
│   │   │   ├── server-registration.ts             # MERGED registry.ts McpServerRegistration + McpServerKind (17 kinds)
│   │   │   ├── tool-descriptor.ts                 # ToolDescriptor (name/description/inputSchema) — UNTRUSTED until validated
│   │   │   ├── tool-call.ts                        # MERGED policy/audit.ts McpToolCall + McpToolCallStatus
│   │   │   ├── tool-result.ts                     # MERGED host McpToolResult (content/metadata)
│   │   │   ├── tool-permission.ts                 # MERGED permissions.ts McpToolCallInput/McpToolCallDecision
│   │   │   ├── tool-risk.ts                        # McpToolRisk enum (low|medium|high) (MERGED)
│   │   │   ├── mcp-session.ts                      # MERGED session-manager.ts McpSession
│   │   │   ├── resource-descriptor.ts             # MCP resource descriptor (uri/name/mimeType)
│   │   │   └── prompt-descriptor.ts               # MCP prompt descriptor (name/arguments)
│   │   ├── connector/
│   │   │   ├── index.ts                           # connector domain barrel
│   │   │   ├── connector-kind.ts                  # ConnectorKind enum (telegram|slack|discord|signal|line|feishu|imessage|whatsapp|...)
│   │   │   ├── connector-account.ts               # ConnectorAccount (id, kind, enabled, scopes) — provenance-tracked
│   │   │   ├── inbound-message.ts                 # NormalizedInboundMessage (sender, chatType, text, attachments) — wire-agnostic
│   │   │   ├── outbound-message.ts                # OutboundMessage (target, text, chunks, replyTo)
│   │   │   ├── sender-identity.ts                 # SenderIdentity (channel handle ↔ Recoder principal, unverified by default)
│   │   │   ├── chat-type.ts                        # ChatType (dm|group|channel) (from gateway-core chat-type.ts)
│   │   │   └── mention.ts                          # ParsedMention (intent handoff|delegate|review + target + prompt)
│   │   ├── profile/
│   │   │   ├── index.ts                           # profile barrel
│   │   │   ├── agent-profile.ts                   # MERGED agent-profile.ts (AgentProfile/capabilities/vendor surface/runtime kind)
│   │   │   ├── task-intent.ts                      # MERGED task-intent.ts (TaskIntent union + guard)
│   │   │   └── instruction-bundle.ts              # MERGED instruction-bundle.ts (InstructionBundle + provenance)
│   │   ├── policy-contracts.ts                    # MERGED policy.ts (AgentPermissionPolicy/ApprovalGate/ApprovalPolicy/RuntimeHealth)
│   │   ├── interop-event.ts                       # InteropEvent (CloudEvent-shaped envelope for the bus)
│   │   ├── health.ts                              # InteropHealth (per-surface truthful readiness)
│   │   └── effect.ts                              # Effect ADT (EmitEvent|PersistAudit|CallTool|SendWire|NotifyConnector|...)
│   │
│   ├── result/
│   │   ├── index.ts                               # Result<T,E> + ok()/err()/map/andThen
│   │   └── guards.ts                              # isOk/isErr
│   │
│   ├── errors/
│   │   ├── index.ts                               # error barrel
│   │   ├── interop-error.ts                       # base InteropError (code + context, no secret leakage)
│   │   ├── error-codes.ts                         # InteropErrorCode enum (INVALID_ENVELOPE, BAD_SIGNATURE, TOOL_DENIED, ...)
│   │   ├── a2a-error-taxonomy.ts                  # MERGED error-taxonomy.ts (A2AErrorCode registry, buildA2AError, severity/category)
│   │   ├── map-wire-error.ts                      # MERGED error-mapping.ts (mapCodex/Claude/Http/Connector/wrapUnknown)
│   │   ├── signature-error.ts                     # SignatureVerificationError (rejected at ingress)
│   │   ├── ownership-error.ts                     # TaskOwnershipError (actor doesn't own the task)
│   │   ├── tool-denied-error.ts                   # ToolDeniedError / ApprovalRequiredError (carries policy decision + risk)
│   │   └── to-result.ts                           # err→Result<T> mapper (never throw across the public boundary)
│   │
│   ├── ports/                                     # interfaces the engine depends on; adapters implement
│   │   ├── index.ts                               # ports barrel
│   │   ├── a2a-handlers-port.ts                   # MERGED server/handlers.ts A2AServerHandlers (inbound contract)
│   │   ├── a2a-client-port.ts                     # outbound A2A call port (implemented by client adapter)
│   │   ├── agent-directory-port.ts                # external/A2A agent registry read (capabilities/health/protocol)
│   │   ├── tool-executor-port.ts                  # MERGED host McpToolExecutor (call a tool, in-proc or external)
│   │   ├── tool-catalog-port.ts                   # list servers/tools/resources/prompts (UNTRUSTED descriptors)
│   │   ├── connector-port.ts                      # uniform connector contract (monitor/send/probe/react) all gateways implement
│   │   ├── event-sink-port.ts                     # emit InteropEvent → agent-events outbox (no direct bus coupling)
│   │   ├── audit-sink-port.ts                     # persist McpToolAuditEvent / A2A audit (MERGED McpToolAuditSink)
│   │   ├── policy-advisor-port.ts                 # ask agent-policy whether a tool call / handoff is allowed (intent)
│   │   ├── approval-gate-port.ts                  # open/await approval for gated tool calls + handoffs
│   │   ├── task-state-port.ts                     # read/write canonical task state via agent-os (NOT owned here)
│   │   ├── memory-candidate-port.ts               # emit reviewable memory candidates (never write durable memory)
│   │   ├── secret-port.ts                         # fetch signing keys / connector tokens from vault (no hardcoding)
│   │   ├── context-store-port.ts                  # MERGED context-bridge store (transfer task context)
│   │   ├── registry-store-port.ts                 # persist MCP server + A2A agent registrations
│   │   ├── session-store-port.ts                  # persist MCP sessions / connector sessions
│   │   ├── clock-port.ts                          # now()/iso() deterministic in tests
│   │   ├── id-generator-port.ts                   # taskId/messageId/toolCallId/eventId
│   │   └── metrics-port.ts                        # counters/histograms/gauges (observability seam)
│   │
│   ├── a2a/                                        # A2A WIRE INTEROP module (fuses a2a-sdk + docker-backend a2a)
│   │   ├── index.ts                               # a2a barrel
│   │   ├── sign/
│   │   │   ├── index.ts                           # sign barrel
│   │   │   ├── hmac.ts                            # MERGED signing/hmac.ts (canonicalJson, create/verifyHmacSha256, createSignedEnvelopeSignature)
│   │   │   ├── envelope-signer.ts                 # sign outbound SignedEnvelope (uses SecretPort for key)
│   │   │   └── key-resolver.ts                    # resolve signing/verify key by issuer (rotation-aware, vault-backed)
│   │   ├── ingress/
│   │   │   ├── index.ts                           # ingress barrel
│   │   │   ├── verify-envelope.ts                 # MANDATORY gate: verify signature + version before anything (hostile-by-default)
│   │   │   ├── normalize.ts                       # MERGED ingress.ts normalizeInboundEnvelope (after verify)
│   │   │   ├── actor-resolver.ts                  # resolve + authenticate inbound actor (agent identity)
│   │   │   ├── ownership-check.ts                 # assert the actor owns/may-touch the referenced task
│   │   │   └── replay-guard.ts                    # nonce/timestamp window dedup (reject replayed signed envelopes)
│   │   ├── agent-card/
│   │   │   ├── index.ts                           # agent-card barrel
│   │   │   ├── builder.ts                         # build Recoder AgentCard (skills/capabilities/securitySchemes)
│   │   │   └── well-known.ts                      # serve /.well-known/agent.json (discovery)
│   │   ├── envelope/
│   │   │   ├── index.ts                           # envelope barrel
│   │   │   ├── builders.ts                        # MERGED envelope-builders.ts (buildCodex/Claude, start/complete/fail/cancel)
│   │   │   └── transition.ts                      # apply transitionTaskEnvelope + emit audit (pure→effects)
│   │   ├── validation/
│   │   │   ├── index.ts                           # validation barrel
│   │   │   ├── validate-task-envelope.ts          # MERGED validation.ts validateTaskEnvelope/assert/guard
│   │   │   ├── validate-audit-event.ts            # MERGED validateAuditEvent
│   │   │   ├── validate-a2a-error.ts              # MERGED validateA2AError
│   │   │   ├── validate-agent-profile.ts          # MERGED validateAgentProfile
│   │   │   └── validate-instruction-bundle.ts     # MERGED validateInstructionBundle
│   │   ├── client/
│   │   │   ├── index.ts                           # client barrel
│   │   │   ├── a2a-client.ts                      # MERGED client/a2a-client.ts (listTasks/sendMessage/cancelTask), signed outbound
│   │   │   └── client-options.ts                  # A2AClientOptions (baseUrl/token/fetchImpl) + signing hook
│   │   ├── server/
│   │   │   ├── index.ts                           # server barrel
│   │   │   ├── handlers.ts                        # implements A2AServerHandlers over the engine (agentCard/listTasks/getTask/sendMessage/cancel)
│   │   │   ├── jsonrpc-dispatch.ts                # JSON-RPC method dispatch (message/send, tasks/get, tasks/cancel)
│   │   │   └── streaming.ts                        # SSE/streaming response for sendStreamingMessage
│   │   ├── registry/
│   │   │   ├── index.ts                           # registry barrel
│   │   │   ├── agent-registry.ts                  # MERGED agent-registry.service.ts (register/discover/list), persisted via port
│   │   │   ├── discovery.ts                       # capability/platform/tier discovery query (read-only)
│   │   │   └── defaults.ts                        # registerDefaults seed (recoder surfaces) (MERGED registerDefaults)
│   │   ├── context/
│   │   │   ├── index.ts                           # context barrel
│   │   │   ├── context-transfer.ts               # MERGED context-bridge transferContext/appendContext (over ContextStorePort)
│   │   │   └── context-snapshot.ts               # ContextSnapshot assembly (workspace_files/history/env)
│   │   ├── audit/
│   │   │   ├── index.ts                           # audit barrel
│   │   │   └── audit-helpers.ts                   # MERGED audit-helpers.ts (emitTask*/Connector*/Policy*, emitAuditForTransition)
│   │   └── bridge/
│   │       ├── index.ts                           # bridge barrel
│   │       ├── bridge-contract.ts                # MERGED bridge-contract.ts (endpoints, paths, predicates)
│   │       ├── checkpoints.ts                     # createApproval/HandoffCheckpoint, createRunHistoryEvent
│   │       └── heartbeat.ts                        # bridge heartbeat + job-result paths (isBridgeJob/isBridgeHeartbeatRequest)
│   │
│   ├── mcp/                                        # MCP HOST + REGISTRY module (fuses agent-mcp + docker-backend mcp)
│   │   ├── index.ts                               # mcp barrel
│   │   ├── registry/
│   │   │   ├── index.ts                           # registry barrel
│   │   │   ├── registry.ts                        # MERGED registry.ts McpRegistry (register/list/get), persisted via port
│   │   │   └── catalog-validator.ts              # validate UNTRUSTED tool/resource/prompt descriptors before exposing
│   │   ├── host/
│   │   │   ├── index.ts                           # host barrel
│   │   │   ├── mcp-host.ts                        # MERGED host/mcp-host.ts RecoderMcpHost (authorize→call→audit)
│   │   │   ├── tool-router.ts                     # MERGED host/tool-router.ts (in-proc handler dispatch)
│   │   │   ├── session-manager.ts                # MERGED host/session-manager.ts (upsert/list/get/remove)
│   │   │   └── authorize.ts                       # the gate: identity → risk → policy → approval (pre-call)
│   │   ├── policy/
│   │   │   ├── index.ts                           # policy barrel
│   │   │   ├── can-call.ts                        # MERGED permissions.ts canCallMcpTool (pure decision)
│   │   │   ├── tool-risk.ts                       # MERGED policy/tool-risk.ts estimateMcpToolRisk (pure)
│   │   │   └── permission-check.ts               # MERGED policy/permission-check.ts checkMcpToolPermission (risk+policy)
│   │   ├── audit/
│   │   │   ├── index.ts                           # audit barrel
│   │   │   ├── tool-call.ts                       # MERGED policy/audit.ts createMcpToolCall + status transitions
│   │   │   └── audit-event.ts                     # MERGED createMcpToolAuditEvent → AuditSinkPort
│   │   ├── external/
│   │   │   ├── index.ts                           # external barrel
│   │   │   ├── process-manager.ts                # MERGED mcp-manager.ts MCPManager (start/stop/callTool/listTools/idle sweep)
│   │   │   ├── server-config.ts                  # MERGED MCPServerConfig (id/name/command/args/env)
│   │   │   ├── pal-server.ts                      # host py/pal-mcp-server as external stdio server (config + supervision)
│   │   │   ├── recoder-a2a-server-adapter.ts     # supervise mcp/recoder-a2a-server.js (recoder_* tools) as external server
│   │   │   └── idle-reaper.ts                     # idle-timeout sweep (5min default) → stop server effect
│   │   ├── servers/                               # canonical in-proc tool servers (MERGED agent-mcp/servers/*)
│   │   │   ├── index.ts                           # server catalog barrel + registerDefaults
│   │   │   ├── tasks-server.ts                    # tasks.list/get/create/update/claim
│   │   │   ├── runs-server.ts                     # runs.list/get/transition/append_log/attach_evidence
│   │   │   ├── artifacts-server.ts                # artifacts.list/get/create/link
│   │   │   ├── approvals-server.ts                # approvals.list/request/decide/status
│   │   │   ├── github-server.ts                   # github.search/pr.create/pr.comment
│   │   │   ├── repo-server.ts                     # repo.read/search/diff
│   │   │   ├── browser-server.ts                  # browser.open/snapshot/verify
│   │   │   ├── memory-server.ts                   # memory.search/candidate.create/review (registerMemoryMcpTools)
│   │   │   ├── work-locks-server.ts               # work_locks.list/acquire/release (registerWorkLocksMcpTools)
│   │   │   ├── git-nexus-server.ts                # git_nexus.search_code/get_package_map/impact_report/context_pack
│   │   │   ├── beads-server.ts                    # beads.ready/show/create/update/close/sync
│   │   │   ├── oss-server.ts                      # oss.list/get/health/patch_policy
│   │   │   ├── preview-server.ts                  # preview.issue_url/health/browser_check/attach_evidence
│   │   │   ├── logs-server.ts                     # logs.append/stream/search/attach
│   │   │   ├── deployment-server.ts               # deploy.preview/status/rollback
│   │   │   └── billing-server.ts                  # billing.plan.read/usage.read
│   │   └── control/
│   │       ├── index.ts                           # control barrel
│   │       └── mcp-control-facade.ts             # facade backing /api/mcp/* (servers/tools/check/resources/prompts) — replaces route logic
│   │
│   ├── connectors/                                # CONNECTOR GATEWAYS module (fuses extracted-from-openclaw)
│   │   ├── index.ts                               # connectors barrel
│   │   ├── gateway/
│   │   │   ├── index.ts                           # gateway barrel
│   │   │   ├── gateway-server.ts                  # MERGED gateway/server.impl.ts core (multi-channel routing/sessions/lanes)
│   │   │   ├── session.ts                         # MERGED channels/session.ts (lane/thread session state)
│   │   │   ├── targets.ts                         # MERGED channels/targets.ts (resolve delivery targets)
│   │   │   ├── reply-prefix.ts                    # MERGED channels/reply-prefix.ts (sender-prefix metadata)
│   │   │   ├── chunking.ts                        # outbound message chunking/delivery (from connector chunk logic)
│   │   │   ├── abort.ts                           # MERGED gateway/chat-abort.ts (cancel in-flight chat)
│   │   │   └── config-reload.ts                   # MERGED gateway/config-reload.ts (hot connector config)
│   │   ├── channels/
│   │   │   ├── index.ts                           # channels barrel
│   │   │   ├── registry.ts                        # MERGED channels/registry.ts (channel registration)
│   │   │   ├── channel-config.ts                  # MERGED channels/channel-config.ts
│   │   │   ├── chat-type.ts                        # MERGED channels/chat-type.ts (dm|group|channel)
│   │   │   ├── sender-identity.ts                # MERGED channels/sender-identity.ts (channel handle → principal)
│   │   │   └── conversation-label.ts             # MERGED channels/conversation-label.ts
│   │   ├── gating/                                # TRUST BOUNDARY for unauthenticated connector traffic
│   │   │   ├── index.ts                           # gating barrel
│   │   │   ├── allowlist-match.ts                # MERGED channels/allowlist-match.ts (who may invoke)
│   │   │   ├── mention-gating.ts                 # MERGED channels/mention-gating.ts (require @mention to act)
│   │   │   ├── command-gating.ts                 # MERGED channels/command-gating.ts (allowlisted commands)
│   │   │   └── device-auth.ts                     # MERGED gateway/device-auth.ts (device/principal auth before action)
│   │   ├── routing/
│   │   │   ├── index.ts                           # routing barrel
│   │   │   ├── mention-router.ts                 # MERGED autonomous-routing parseIntent (handoff:/delegate:/review:) → A2A envelope
│   │   │   ├── normalize-inbound.ts              # connector message → NormalizedInboundMessage → TaskEnvelope (via a2a/)
│   │   │   └── deliver-outbound.ts               # OutboundMessage → connector send (via ConnectorPort)
│   │   ├── social/                               # per-channel adapters (MERGED social-gateways/*) → one ConnectorPort each
│   │   │   ├── index.ts                           # social barrel
│   │   │   ├── telegram/
│   │   │   │   ├── index.ts                       # telegram adapter barrel (implements ConnectorPort)
│   │   │   │   ├── accounts.ts                    # MERGED telegram/accounts.ts
│   │   │   │   ├── monitor.ts                     # MERGED telegram/monitor.ts (monitorTelegramProvider)
│   │   │   │   ├── send.ts                        # MERGED telegram/send.ts (sendMessageTelegram/reactMessageTelegram)
│   │   │   │   ├── bot-handlers.ts                # MERGED telegram/bot-handlers.ts (createTelegramBot/webhook)
│   │   │   │   └── normalize.ts                   # telegram update → NormalizedInboundMessage
│   │   │   ├── slack/
│   │   │   │   ├── index.ts                       # slack adapter barrel
│   │   │   │   ├── accounts.ts                    # MERGED slack/accounts.ts (resolve accounts/tokens)
│   │   │   │   ├── actions.ts                     # MERGED slack/actions.ts (send/edit/delete/react/pin/read)
│   │   │   │   ├── monitor.ts                     # MERGED slack/monitor.ts (monitorSlackProvider)
│   │   │   │   ├── probe.ts                       # MERGED slack/probe.ts (probeSlack health)
│   │   │   │   └── normalize.ts                   # slack event → NormalizedInboundMessage
│   │   │   ├── discord/
│   │   │   │   ├── index.ts                       # discord adapter barrel
│   │   │   │   ├── accounts.ts                    # MERGED discord/accounts.ts
│   │   │   │   ├── api.ts                         # MERGED discord/api.ts (Discord API wrapper)
│   │   │   │   ├── monitor.ts                     # MERGED discord/monitor.ts (monitorDiscordProvider)
│   │   │   │   ├── send.ts                        # MERGED discord/send.ts (sendMessageDiscord/sendPollDiscord)
│   │   │   │   ├── probe.ts                       # MERGED discord/probe.ts
│   │   │   │   └── normalize.ts                   # discord message → NormalizedInboundMessage
│   │   │   ├── signal/
│   │   │   │   ├── index.ts                       # signal adapter barrel
│   │   │   │   ├── accounts.ts                    # MERGED signal/accounts.ts
│   │   │   │   ├── client.ts                      # MERGED signal/client.ts (daemon client)
│   │   │   │   ├── monitor.ts                     # MERGED signal/monitor.ts (monitorSignalProvider)
│   │   │   │   ├── send.ts                        # MERGED signal/send.ts (sendMessageSignal/reactions)
│   │   │   │   └── normalize.ts                   # signal message → NormalizedInboundMessage
│   │   │   ├── line/
│   │   │   │   ├── index.ts                       # line adapter barrel
│   │   │   │   ├── accounts.ts                    # MERGED line/accounts.ts
│   │   │   │   ├── bot.ts                         # MERGED line/bot.ts (createLineBot/webhook callback)
│   │   │   │   ├── monitor.ts                     # MERGED line/monitor.ts (monitorLineProvider)
│   │   │   │   ├── send.ts                        # MERGED line/send.ts (push/reply message)
│   │   │   │   ├── flex-templates.ts              # MERGED line/flex-templates.ts (rich Flex messages)
│   │   │   │   ├── markdown-to-line.ts            # MERGED line/markdown-to-line.ts
│   │   │   │   └── normalize.ts                   # line event → NormalizedInboundMessage
│   │   │   ├── feishu/
│   │   │   │   ├── index.ts                       # feishu adapter barrel
│   │   │   │   ├── accounts.ts                    # MERGED feishu/accounts.ts
│   │   │   │   ├── client.ts                      # MERGED feishu/client.ts
│   │   │   │   ├── monitor.ts                     # MERGED feishu/monitor.ts
│   │   │   │   ├── send.ts                        # MERGED feishu/send.ts
│   │   │   │   └── normalize.ts                   # feishu message → NormalizedInboundMessage
│   │   │   ├── imessage/
│   │   │   │   ├── index.ts                       # imessage adapter barrel
│   │   │   │   ├── accounts.ts                    # MERGED imessage/accounts.ts
│   │   │   │   ├── client.ts                      # MERGED imessage/client.ts (macOS bridge)
│   │   │   │   ├── monitor.ts                     # MERGED imessage/monitor.ts
│   │   │   │   ├── send.ts                        # MERGED imessage/send.ts
│   │   │   │   ├── probe.ts                       # MERGED imessage/probe.ts (macOS availability)
│   │   │   │   └── normalize.ts                   # imessage → NormalizedInboundMessage
│   │   │   └── whatsapp/
│   │   │       ├── index.ts                       # whatsapp adapter barrel
│   │   │       ├── normalize.ts                   # MERGED whatsapp/normalize.ts (JID normalization)
│   │   │       ├── client.ts                      # whatsapp client (to be completed; minimal in source)
│   │   │       └── monitor.ts                     # whatsapp monitor (planned, ConnectorPort shape)
│   │   └── planned/                              # PLANNED adapters (NOT yet in source) implementing ConnectorPort
│   │       ├── index.ts                           # planned barrel (clearly marked not-yet-extracted)
│   │       ├── wordpress.ts                       # PLANNED WordPress connector adapter
│   │       ├── gmail.ts                           # PLANNED Gmail connector adapter
│   │       ├── teams.ts                           # PLANNED MS Teams connector adapter
│   │       ├── linkedin.ts                        # PLANNED LinkedIn connector adapter
│   │       └── meet.ts                            # PLANNED Google Meet connector adapter
│   │
│   ├── engine/                                    # composed CORE ENGINE (facade over a2a/ mcp/ connectors/)
│   │   ├── index.ts                               # engine barrel
│   │   ├── interop-engine.ts                      # InteropEngine: wires modules + ports; main composition root
│   │   ├── engine-builder.ts                      # builder/DI: inject ports, return engine (functional options)
│   │   ├── effect-runner.ts                       # interprets Effect[] against ports (the ONLY place effects run)
│   │   ├── command-bus.ts                         # dispatch commands (ReceiveA2AMessage, CallTool, IngestConnectorMsg...)
│   │   ├── commands.ts                            # command ADT + zod schemas (validate at boundary)
│   │   ├── query-bus.ts                           # read-side (agent card, tool catalog, registry, health)
│   │   └── queries.ts                             # query ADT + zod schemas
│   │
│   ├── transport/                                 # the wire adapters (IO)
│   │   ├── index.ts                               # transport barrel
│   │   ├── http/
│   │   │   ├── index.ts                           # http barrel
│   │   │   ├── jsonrpc-server.ts                 # JSON-RPC 2.0 HTTP server adapter (A2A inbound)
│   │   │   ├── rest-router.ts                     # /api/a2a/* + /api/mcp/* express bindings (thin → engine)
│   │   │   ├── sse.ts                             # SSE streaming adapter (task progress)
│   │   │   └── fetch-client.ts                    # outbound fetch wrapper (timeout/retry/error-map) for A2AClient
│   │   ├── stdio/
│   │   │   ├── index.ts                           # stdio barrel
│   │   │   ├── stdio-client.ts                    # MCP stdio JSON-RPC client (talks to external servers)
│   │   │   └── child-process.ts                  # spawn/supervise child MCP process (from mcp-manager)
│   │   ├── websocket/
│   │   │   ├── index.ts                           # ws barrel
│   │   │   └── ws-bridge.ts                       # WebSocket A2A bridge (from mcp/recoder-a2a-server.js)
│   │   └── event-bus/
│   │       ├── index.ts                           # event-bus barrel
│   │       ├── inproc-event-bus.ts               # MERGED a2a-event-bus.ts local EventEmitter dispatch + scoped subs
│   │       ├── nats-event-bus.ts                 # MERGED a2a-event-bus.ts NATS JetStream mirror path
│   │       ├── event-keys.ts                     # global/task/channel/workspace subscription keys (MERGED)
│   │       ├── retention.ts                       # recent-event ring buffer + TTL (MERGED getRecentEvents)
│   │       └── redaction.ts                       # strip secrets from event payloads before publish
│   │
│   ├── persistence/                               # adapters implementing the store ports
│   │   ├── index.ts                               # persistence barrel + factory(env → stores)
│   │   ├── memory/
│   │   │   ├── index.ts                           # in-memory adapters (default; tests + single-process)
│   │   │   ├── memory-registry-store.ts          # Map-backed RegistryStorePort
│   │   │   ├── memory-session-store.ts           # Map-backed SessionStorePort
│   │   │   ├── memory-audit-sink.ts              # in-memory audit (test/local)
│   │   │   └── memory-context-store.ts           # MERGED InMemoryContextStore
│   │   ├── postgres/
│   │   │   ├── index.ts                           # postgres adapters (production source of record)
│   │   │   ├── pg-registry-store.ts              # MCP server + A2A agent registrations table
│   │   │   ├── pg-session-store.ts               # MCP/connector sessions table
│   │   │   ├── pg-audit-sink.ts                  # tool-call + A2A audit ledger (append-only)
│   │   │   └── sql/
│   │   │       ├── 0001_registry.sql             # server/agent registrations
│   │   │       ├── 0002_sessions.sql             # sessions
│   │   │       ├── 0003_tool_audit.sql           # MCP tool-call audit ledger
│   │   │       └── 0004_a2a_audit.sql            # A2A wire audit ledger
│   │   └── redis/
│   │       ├── index.ts                           # redis adapters (fast-path)
│   │       ├── redis-context-store.ts            # MERGED RedisContextStore (context transfer)
│   │       └── redis-replay-cache.ts             # signed-envelope nonce replay cache
│   │
│   ├── seams/                                      # explicit cross-subsystem boundaries (anti-corruption layer)
│   │   ├── index.ts                               # seams barrel
│   │   ├── agent-os-seam.ts                       # map A2A Task/Message ↔ agent-os Task/Run; read/write canonical state
│   │   ├── coordination-seam.ts                   # hand @mention delegations to coordination (it owns dispatch/handoff)
│   │   ├── governance-seam.ts                     # PolicyAdvisor + ApprovalGate impls calling agent-policy
│   │   ├── memory-seam.ts                          # emit reviewable memory candidates (best connector/tool for intent)
│   │   ├── events-seam.ts                          # InteropEvent → agent-events outbox → RunEvent
│   │   ├── network-seam.ts                         # run wire surfaces over the network overlay (dark transport)
│   │   └── secret-seam.ts                          # SecretPort impl via @recoder/vault (signing keys/connector tokens)
│   │
│   ├── observability/
│   │   ├── index.ts                               # observability barrel
│   │   ├── logger.ts                              # scoped child loggers (mirrors docker-backend createLogger)
│   │   ├── metrics-registry.ts                    # counters/gauges/histograms behind MetricsPort
│   │   ├── tracing.ts                             # trace-context stamped on every InteropEvent (wire→tool→event chain)
│   │   ├── health-probe.ts                        # per-surface readiness (a2a/mcp/connectors) → InteropHealth (truthful)
│   │   └── diagnostics.ts                          # dump registry/sessions/recent-events for support
│   │
│   └── util/
│       ├── index.ts                               # util barrel
│       ├── canonical-json.ts                      # stable JSON canonicalization (shared by sign + dedup)
│       ├── hash.ts                                # stable hash for ids/dedup keys
│       ├── assert.ts                              # invariant() guard for impossible states
│       ├── time.ts                                # ms<->iso, TTL window math (from task expiresAt logic)
│       ├── redact.ts                              # secret redaction helper (shared by transport + logger)
│       └── backoff.ts                             # bounded exponential backoff for transient wire errors
│
└── tests/                                          # mirrors src/ 1:1 (unit) + contracts + integration + property
    ├── unit/
    │   ├── domain/
    │   │   ├── signed-envelope.test.ts
    │   │   ├── task-envelope.test.ts
    │   │   ├── state-transitions.test.ts
    │   │   ├── server-registration.test.ts
    │   │   ├── tool-permission.test.ts
    │   │   └── mention.test.ts
    │   ├── a2a/
    │   │   ├── sign/
    │   │   │   ├── hmac.test.ts
    │   │   │   ├── envelope-signer.test.ts
    │   │   │   └── key-resolver.test.ts
    │   │   ├── ingress/
    │   │   │   ├── verify-envelope.test.ts
    │   │   │   ├── normalize.test.ts
    │   │   │   ├── actor-resolver.test.ts
    │   │   │   ├── ownership-check.test.ts
    │   │   │   └── replay-guard.test.ts
    │   │   ├── agent-card/
    │   │   │   ├── builder.test.ts
    │   │   │   └── well-known.test.ts
    │   │   ├── envelope/
    │   │   │   ├── builders.test.ts
    │   │   │   └── transition.test.ts
    │   │   ├── validation/
    │   │   │   ├── validate-task-envelope.test.ts
    │   │   │   ├── validate-audit-event.test.ts
    │   │   │   ├── validate-a2a-error.test.ts
    │   │   │   ├── validate-agent-profile.test.ts
    │   │   │   └── validate-instruction-bundle.test.ts
    │   │   ├── registry/
    │   │   │   ├── agent-registry.test.ts
    │   │   │   └── discovery.test.ts
    │   │   ├── context/
    │   │   │   └── context-transfer.test.ts
    │   │   └── bridge/
    │   │       ├── bridge-contract.test.ts
    │   │       └── checkpoints.test.ts
    │   ├── mcp/
    │   │   ├── registry/
    │   │   │   ├── registry.test.ts
    │   │   │   └── catalog-validator.test.ts
    │   │   ├── host/
    │   │   │   ├── mcp-host.test.ts
    │   │   │   ├── tool-router.test.ts
    │   │   │   ├── session-manager.test.ts
    │   │   │   └── authorize.test.ts
    │   │   ├── policy/
    │   │   │   ├── can-call.test.ts
    │   │   │   ├── tool-risk.test.ts
    │   │   │   └── permission-check.test.ts
    │   │   ├── audit/
    │   │   │   ├── tool-call.test.ts
    │   │   │   └── audit-event.test.ts
    │   │   ├── external/
    │   │   │   ├── process-manager.test.ts
    │   │   │   ├── pal-server.test.ts
    │   │   │   └── idle-reaper.test.ts
    │   │   └── servers/
    │   │       ├── tasks-server.test.ts
    │   │       ├── runs-server.test.ts
    │   │       ├── memory-server.test.ts
    │   │       ├── work-locks-server.test.ts
    │   │       └── git-nexus-server.test.ts
    │   ├── connectors/
    │   │   ├── gating/
    │   │   │   ├── allowlist-match.test.ts
    │   │   │   ├── mention-gating.test.ts
    │   │   │   ├── command-gating.test.ts
    │   │   │   └── device-auth.test.ts
    │   │   ├── routing/
    │   │   │   ├── mention-router.test.ts
    │   │   │   └── normalize-inbound.test.ts
    │   │   └── social/
    │   │       ├── telegram-normalize.test.ts
    │   │       ├── slack-normalize.test.ts
    │   │       ├── discord-normalize.test.ts
    │   │       ├── signal-normalize.test.ts
    │   │       ├── line-normalize.test.ts
    │   │       └── whatsapp-normalize.test.ts
    │   ├── engine/
    │   │   ├── interop-engine.test.ts
    │   │   ├── effect-runner.test.ts
    │   │   └── command-bus.test.ts
    │   ├── errors/
    │   │   ├── a2a-error-taxonomy.test.ts
    │   │   └── map-wire-error.test.ts
    │   └── util/
    │       ├── canonical-json.test.ts
    │       └── hash.test.ts
    ├── contracts/                                  # port-contract tests run against EVERY adapter impl
    │   ├── connector-port.contract.ts              # every social adapter satisfies monitor/send/probe/normalize
    │   ├── tool-executor-port.contract.ts          # in-proc + external stdio executors behave identically
    │   ├── registry-store.contract.ts              # memory + postgres
    │   ├── session-store.contract.ts               # memory + postgres
    │   ├── audit-sink.contract.ts                  # memory + postgres (append-only)
    │   ├── context-store.contract.ts               # memory + redis
    │   ├── event-bus.contract.ts                   # inproc + nats (dedup + ordering)
    │   └── run-all-adapters.ts                      # parametrizes contracts over each adapter
    ├── property/
    │   ├── envelope-sign-verify-roundtrip.prop.ts  # ∀ payloads: sign→verify === valid; tamper → invalid
    │   ├── task-transition-legal.prop.ts           # ∀ transition seqs: only ALLOWED_STATE_TRANSITIONS accepted
    │   └── tool-gate-denies-unpermitted.prop.ts    # ∀ inputs: high-risk/unpermitted never auto-allowed
    ├── integration/
    │   ├── a2a-inbound-signed-e2e.test.ts          # signed sendMessage → verify → map → RunEvent
    │   ├── a2a-inbound-unsigned-rejected.test.ts   # missing/bad signature → rejected before state touch
    │   ├── a2a-outbound-call-e2e.test.ts           # A2AClient → external mock agent (signed)
    │   ├── mcp-tool-call-gated-e2e.test.ts         # call tool → risk+policy+approval → execute → audit
    │   ├── mcp-external-pal-e2e.test.ts            # spawn pal-mcp-server stdio → list+call a tool → idle reap
    │   ├── connector-mention-to-task-e2e.test.ts   # telegram @mention → gating → TaskEnvelope → coordination seam
    │   └── connector-unauthorized-blocked.test.ts  # non-allowlisted sender → no action taken
    └── fixtures/
        ├── envelopes.ts                            # signed/unsigned/tampered envelope fixtures
        ├── agents.ts                               # AgentCard/AgentProfile fixtures
        ├── tools.ts                                # McpServerRegistration + tool-call fixtures (incl. malicious descriptions)
        ├── connectors.ts                           # inbound message fixtures per channel
        ├── mock-a2a-agent.ts                       # in-memory external A2A agent
        ├── mock-mcp-server.ts                      # in-memory stdio MCP server fake
        └── clock.ts                                # deterministic FakeClock + FakeIdGenerator
```

### Planned functional file count

- TypeScript `src/`: **~178** functional files (config, domain, ports, errors, result, a2a, mcp,
  connectors, engine, transport, persistence, seams, observability, util — including the per-channel
  social adapters and SQL migrations).
- `tests/` mirror tree: **~95** files.

The `src/` functional surface is well over the 100-file design target (the connector roster alone — 8
real channels × ~5 files each, plus the gateway/channels/gating framework — accounts for ~70 files; the
A2A + MCP engines another ~90). Excluding the `planned/` connector stubs (6 files, clearly marked), the
**already-grounded functional surface is ~172 files**.

---

## 7. Module-by-module design

### 7.1 `domain/` — owned contracts (fuses, does not fork)

interop owns its domain types but **merges** the existing `a2a-sdk`/`agent-mcp` primitives:

- `domain/wire/canonical-a2a.ts` is the merge target for `packages/a2a-sdk/src/canonical-a2a-types.ts` —
  the auto-generated A2A wire vocabulary (`AgentCard`, `Message`, `Task`, `Part` union, `SendMessageRequest`,
  `JSONRPCResponse`, the ~80 error/response types), re-exported as `CanonicalA2A`.
- `domain/envelope/signed-envelope.ts` merges `schemas/signed-envelope.ts` verbatim (`SignedEnvelope<T>`,
  `createSignedEnvelope`, `isSignedEnvelope`, `SIGNED_ENVELOPE_VERSION`). This is the type the entire
  ingress trust gate is built on.
- `domain/envelope/task-envelope.ts` merges `schemas/task-envelope.ts` (`TaskEnvelope`, the
  `ALLOWED_STATE_TRANSITIONS` table, `isValidTransition`, `transitionTaskEnvelope`, terminal-state set).
  The transition table is split into `state-transitions.ts` so the pure transition logic is testable in
  isolation (property test in §12).
- `domain/mcp/*` merges the `agent-mcp` registry/permission/audit shapes (`McpServerRegistration` + the
  17 `McpServerKind`s, `McpToolCallInput`/`McpToolCallDecision`, `McpToolCall`/`McpToolCallStatus`,
  `McpToolRisk`, `McpSession`). `tool-descriptor.ts` is explicitly modeled as **untrusted** input — a
  server's self-described `description`/`inputSchema` is data to be validated, never an instruction.
- `domain/profile/*` and `domain/policy-contracts.ts` merge `agent-profile.ts`, `task-intent.ts`,
  `instruction-bundle.ts`, and `policy.ts`. Where these overlap with agent-os domain (`AgentProfile`),
  the canonical version is read through `seams/agent-os-seam.ts` rather than forked.

`domain/effect.ts` defines the `Effect` ADT — the engine emits `Effect[]`; only `engine/effect-runner.ts`
interprets them. This keeps the three capability modules pure and testable without HTTP/stdio/NATS.

### 7.2 `a2a/` — A2A wire interoperability

The heart of inbound safety is `a2a/ingress/`:

1. `verify-envelope.ts` is the **mandatory first gate**. It runs `verifyHmacSha256Signature`
   (`a2a/sign/hmac.ts`, merged from `signing/hmac.ts`) + `isSignedEnvelope` + version check. No valid
   signature → `SignatureVerificationError`, request dropped, nothing mapped. This makes the repo
   security rule ("never trust... unauthenticated connector traffic / agent output") executable.
2. `replay-guard.ts` rejects replayed envelopes (nonce/timestamp window via `redis-replay-cache.ts`).
3. `actor-resolver.ts` authenticates the inbound agent identity; `ownership-check.ts` asserts the actor
   may touch the referenced task (task ownership is read from agent-os via seam).
4. Only then does `normalize.ts` (merged `ingress.ts` `normalizeInboundEnvelope`) produce a
   `NormalizedInboundEnvelope`, which `seams/agent-os-seam.ts` maps to a `RunEvent`.

`a2a/agent-card/` builds and serves `/.well-known/agent.json` (discovery). `a2a/server/handlers.ts`
implements the existing `A2AServerHandlers` contract (`agentCard`/`listTasks`/`getTask`/`sendMessage`/
`cancelTask`) over the engine, with `jsonrpc-dispatch.ts` mapping JSON-RPC methods and `streaming.ts`
handling `sendStreamingMessage` over SSE. `a2a/client/a2a-client.ts` (merged `client/a2a-client.ts`) makes
**signed** outbound calls to external A2A agents. `a2a/registry/` merges `agent-registry.service.ts`
(register/discover/list) but persists through `RegistryStorePort` instead of an in-memory singleton.
`a2a/audit/audit-helpers.ts` merges the `audit-helpers.ts` emitters, routed to the events outbox.
`a2a/bridge/` merges `bridge-contract.ts` (the runtime bridge endpoints/checkpoints/heartbeat).

Note the deliberate split: **autonomous-routing's `processHandoff`/`executeDelegation`** is *not* fully
owned here. interop owns the **intent parse** (`connectors/routing/mention-router.ts`) and the wire; the
*decision* of who runs the handoff and the work-lock/claim belongs to **coordination** and is invoked via
`seams/coordination-seam.ts`. This respects the documented boundary (coordination owns the handoff bus).

### 7.3 `mcp/` — MCP host + registry

`mcp/host/mcp-host.ts` merges `RecoderMcpHost` and enforces the pipeline on **every** tool call:

```
authorize.ts:  identity → estimateMcpToolRisk (tool-risk.ts)
                       → checkMcpToolPermission (permission-check.ts, asks PolicyAdvisorPort)
                       → if requiresApproval: ApprovalGatePort.open + await
              → canCallMcpTool final decision (can-call.ts)
   call.ts:   tool-router.ts (in-proc) OR external/process-manager.ts (stdio)
   audit:     createMcpToolCall → status transitions → createMcpToolAuditEvent → AuditSinkPort
```

The 16 canonical in-proc servers merge from `agent-mcp/servers/*` into `mcp/servers/*` unchanged in tool
surface (tasks/runs/artifacts/approvals/github/repo/browser/memory/work-locks/git-nexus/beads/oss/preview/
logs/deployment/billing). `memory-server.ts` and `work-locks-server.ts` keep their
`registerMemoryMcpTools`/`registerWorkLocksMcpTools` registration functions (they need injected state).

`mcp/external/` merges `docker-backend/src/mcp-manager.ts` (`MCPManager`): it spawns external MCP servers
as child processes over stdio JSON-RPC, with the **same idle reaper** (5-min default, max 3 per project).
`pal-server.ts` configures the real `py/pal-mcp-server` as one such external server;
`recoder-a2a-server-adapter.ts` supervises `mcp/recoder-a2a-server.js`. Critically: external servers'
advertised tools pass through `registry/catalog-validator.ts` and the **same authorize gate** — a malicious
external server cannot smuggle an unpermitted tool, and its tool *descriptions* are never executed as
instructions.

`mcp/control/mcp-control-facade.ts` backs the existing `/api/mcp/*` routes (`mcp-control.routes.ts`'s
`/servers`, `/tools`, `/tools/:serverId/:toolName/check`, `/resources`, `/prompts`) — the Express route
becomes a thin call into this facade.

### 7.4 `connectors/` — connector gateways

`connectors/gateway/gateway-server.ts` merges the core of `gateway-core/gateway/server.impl.ts`
(multi-channel routing, sessions/lanes, abort, config-reload, chunking). `connectors/channels/*` merges
the channel framework (registry, config, chat-type, sender-identity, conversation-label).

`connectors/gating/` is the **connector trust boundary** and merges the gateway-core gating files:
`allowlist-match.ts` (who may invoke), `mention-gating.ts` (require an explicit @mention to act),
`command-gating.ts` (allowlisted commands only), `device-auth.ts` (authenticate the principal). An inbound
message that fails gating produces **no** control-plane action — this is the executable form of "never
trust unauthenticated connector traffic."

`connectors/routing/mention-router.ts` merges `autonomous-routing.service.ts`'s `parseIntent` (the
`handoff:`/`delegate:`/`review:` @mention grammar) and turns a gated, parsed mention into a `TaskEnvelope`
+ a `coordination-seam` delegation request. `normalize-inbound.ts` converts each channel's native event
into the wire-agnostic `NormalizedInboundMessage`.

`connectors/social/*` merges each real gateway under `ts/extracted-from-openclaw/social-gateways/`
(telegram, slack, discord, signal, line, feishu, imessage, whatsapp), each normalized behind one
`ConnectorPort` (`monitor`/`send`/`probe`/`normalize`). `connectors/planned/*` holds the clearly-marked
future adapters (wordpress/gmail/teams/linkedin/meet) that implement the same port — they are stubs, not
extracted code, and are excluded from the "grounded" file count.

### 7.5 `engine/` — composition root

`interop-engine.ts` is the facade consumers use. It owns no canonical state; it wires the three modules to
the injected ports. `command-bus.ts`/`query-bus.ts` give a single zod-validated entry. `effect-runner.ts`
is the **only** place IO runs against ports.

---

## 8. Data flow

### 8.1 Inbound A2A (signed task submission)

```
POST /api/a2a (JSON-RPC message/send)                [transport/http/jsonrpc-server]
   │
   ▼
a2a/ingress/verify-envelope (MANDATORY)              [a2a/sign/hmac verifyHmacSha256]
   ── bad/missing signature ──► SignatureVerificationError → 401, NOTHING mapped
   │
   ▼
replay-guard ── replayed ──► drop (idempotent)
actor-resolver → authenticated AgentId
ownership-check ── not owner ──► TaskOwnershipError
   │
   ▼
a2a/ingress/normalize → NormalizedInboundEnvelope     [merged normalizeInboundEnvelope]
   │
   ▼
seams/agent-os-seam: map → RunEvent (canonical state) [agent-os owns it]
seams/events-seam: emit InteropEvent → outbox
   │
   ▼
a2a/server/streaming: SSE task progress back to caller (transitionTaskEnvelope per update)
```

Unsigned/tampered submissions never reach state mapping (`integration/a2a-inbound-unsigned-rejected.test.ts`).

### 8.2 MCP tool call (gated)

```
agent calls tool (in-proc or via MCP session)         [mcp/host/session-manager]
   │
   ▼
mcp/host/authorize:
   estimateMcpToolRisk(tool)                           [pure]
   checkMcpToolPermission(input)  ── asks ──► PolicyAdvisorPort (agent-policy)
   requiresApproval? ── yes ──► ApprovalGatePort.open → await
   canCallMcpTool(...)  ── deny ──► ToolDeniedError (carries decision + risk)
   │ allow
   ▼
mcp/host/call:  tool-router (in-proc)  |  external/process-manager (stdio)
   │   (external tool result is data, NEVER executed as instruction)
   ▼
mcp/audit: createMcpToolCall → status → createMcpToolAuditEvent → AuditSinkPort
seams/events-seam: InteropEvent → outbox
```

### 8.3 Connector mention → task

```
inbound message (telegram/slack/...)                  [connectors/social/*/monitor]
   │
   ▼
connectors/social/*/normalize → NormalizedInboundMessage
   │
   ▼
connectors/gating:
   device-auth + allowlist-match  ── fail ──► NO ACTION (silently ignored / logged)
   mention-gating: requires @mention ── none ──► NO ACTION
   command-gating: allowlisted only
   │ pass
   ▼
connectors/routing/mention-router: parseIntent (handoff:/delegate:/review:)
   → TaskEnvelope (a2a/envelope/builders) + delegation request
   │
   ▼
seams/coordination-seam: hand to coordination (it owns dispatch/claim/handoff)
seams/agent-os-seam: RunEvent; reply delivered via connectors/routing/deliver-outbound
```

Non-allowlisted senders take no action (`integration/connector-unauthorized-blocked.test.ts`).

### 8.4 Outbound A2A (Recoder reaches an external agent)

```
engine command: CallExternalAgent(agentId, message)
   → a2a/registry/discovery: resolve external AgentCard + endpoint + securityScheme
   → a2a/client/a2a-client.sendMessage (signed via envelope-signer + key-resolver)
   → transport/http/fetch-client (timeout/retry/error-map)
   → map response → InteropEvent → outbox
```

---

## 9. Public API surface (`src/index.ts`)

```ts
// ── Engine (primary entry) ──────────────────────────────────────────────────
export { InteropEngine } from './engine/interop-engine';
export { buildInteropEngine } from './engine/engine-builder';
export type { InteropEngineOptions, InteropSeams } from './engine/engine-builder';

// ── A2A wire surface ────────────────────────────────────────────────────────
export { A2AClient } from './a2a/client/a2a-client';
export type { A2AServerHandlers } from './ports/a2a-handlers-port';
export { buildAgentCard, serveWellKnownAgentCard } from './a2a/agent-card';
export { verifyInboundEnvelope, normalizeInboundEnvelope } from './a2a/ingress';
export { createSignedEnvelope, isSignedEnvelope } from './domain/envelope/signed-envelope';
export { canonicalJson, verifyHmacSha256Signature } from './a2a/sign/hmac';

// ── MCP host + registry ─────────────────────────────────────────────────────
export { McpHost } from './mcp/host/mcp-host';
export { McpRegistry } from './mcp/registry/registry';
export { McpToolRouter } from './mcp/host/tool-router';
export { McpSessionManager } from './mcp/host/session-manager';
export { canCallMcpTool } from './mcp/policy/can-call';
export { estimateMcpToolRisk } from './mcp/policy/tool-risk';
export { checkMcpToolPermission } from './mcp/policy/permission-check';
export * as mcpServers from './mcp/servers';

// ── Connectors ──────────────────────────────────────────────────────────────
export { createConnectorGateway } from './connectors/gateway';
export type { ConnectorPort } from './ports/connector-port';
export { parseMention } from './connectors/routing/mention-router';

// ── Domain types ────────────────────────────────────────────────────────────
export type {
  SignedEnvelope, TaskEnvelope, TaskState, AgentCard,
  McpServerRegistration, McpServerKind, McpToolCall, McpToolCallDecision, McpToolRisk,
  ConnectorKind, NormalizedInboundMessage, ParsedMention,
  AgentProfile, TaskIntent, InstructionBundle, InteropEvent, InteropHealth, Effect,
} from './domain';
export * as CanonicalA2A from './domain/wire/canonical-a2a';

// ── Ports (for adapter authors) ─────────────────────────────────────────────
export type {
  ToolExecutorPort, ToolCatalogPort, ConnectorPort, AgentDirectoryPort,
  EventSinkPort, AuditSinkPort, PolicyAdvisorPort, ApprovalGatePort,
  TaskStatePort, MemoryCandidatePort, SecretPort, ContextStorePort,
  RegistryStorePort, SessionStorePort, ClockPort, IdGeneratorPort, MetricsPort,
} from './ports';

// ── Built-in adapters ───────────────────────────────────────────────────────
export * as memory from './persistence/memory';
export * as postgres from './persistence/postgres';
export { InProcEventBus, NatsEventBus } from './transport/event-bus';

// ── Errors & Result ─────────────────────────────────────────────────────────
export {
  InteropError, InteropErrorCode, SignatureVerificationError, TaskOwnershipError,
  ToolDeniedError, ApprovalRequiredError, buildA2AError, A2A_ERROR_CODE_REGISTRY,
} from './errors';
export type { Result } from './result';

// ── Config ──────────────────────────────────────────────────────────────────
export type { InteropConfig } from './config/interop-config';
export { loadInteropConfig } from './config/env';
```

---

## 10. Seams to other subsystems

| Subsystem | Seam file | Direction | Contract |
|-----------|-----------|-----------|----------|
| **agent-os** (state of record) | `seams/agent-os-seam.ts`, `ports/task-state-port.ts` | bidirectional | Maps inbound A2A/connector messages → `RunEvent`; reads Task/Run/AgentProfile + task ownership. interop never owns task state. |
| **coordination** (dispatch/handoff) | `seams/coordination-seam.ts` | interop → coordination | Hands parsed @mention delegations to coordination, which owns work-locks, idempotent claim, and the handoff bus. interop carries the wire only. |
| **governance** (policy/approvals) | `seams/governance-seam.ts`, `ports/policy-advisor-port.ts`, `ports/approval-gate-port.ts` | interop → governance | Every MCP tool call + gated handoff asks `PolicyAdvisorPort`; risky calls `await ApprovalGatePort`. Deny is terminal. |
| **memory** | `seams/memory-seam.ts`, `ports/memory-candidate-port.ts` | interop → memory | Emits **reviewable memory candidates** (e.g., "connector X / tool Y best for intent Z") with evidence — never writes durable memory directly. |
| **network** (overlay) | `seams/network-seam.ts` | interop → network | Runs A2A/MCP/connector transports over the dark overlay; interop assumes reachability, network provides it. |
| **events/outbox** | `seams/events-seam.ts`, `transport/event-bus/*`, `domain/interop-event.ts` | interop → events | All wire/tool/connector transitions become CloudEvent-shaped `InteropEvent`s on the bus/outbox. |
| **vault** | `seams/secret-seam.ts`, `ports/secret-port.ts` | interop ← vault | Signing keys + connector tokens fetched from vault; never hardcoded. |
| **brain/intelligence** | (read-only via `ports/policy-advisor-port` hints) | optional | Intent classification for routing is advisory; never overrides policy or signature checks. |

---

## 11. Error handling

- **Never throw across the public boundary.** Command/query handlers return `Result<T, InteropError>`.
  Internal pure functions may throw typed errors caught at the engine edge and mapped via
  `errors/to-result.ts`.
- **Typed error codes** (`errors/error-codes.ts`): `INVALID_ENVELOPE`, `BAD_SIGNATURE`,
  `REPLAYED_ENVELOPE`, `TASK_OWNERSHIP_DENIED`, `TOOL_DENIED`, `APPROVAL_REQUIRED`, `TOOL_RISK_TOO_HIGH`,
  `SERVER_UNAVAILABLE`, `CONNECTOR_NOT_CONFIGURED`, `INVALID_COMMAND`. (Reuses the `agent-mcp` /
  `a2a-sdk` taxonomy where applicable — no `EXTERNAL_SERVICE_ERROR`/`FORBIDDEN` per repo convention;
  use `SERVER_UNAVAILABLE` / authz codes.)
- **A2A error taxonomy preserved** — `errors/a2a-error-taxonomy.ts` keeps `A2A_ERROR_CODE_REGISTRY` +
  `buildA2AError` (severity/category) so wire error responses stay protocol-compliant.
- **Wire error mapping** — `errors/map-wire-error.ts` merges `error-mapping.ts`
  (`mapCodex`/`mapClaude`/`mapHttp`/`mapConnector`/`wrapUnknown`) so heterogeneous failures become uniform
  `A2AError`s at the edge.
- **Conflict/denial errors carry evidence** — `ToolDeniedError` carries the `McpToolCallDecision` + risk;
  `SignatureVerificationError` names the failing check (never the secret).
- **Boundary validation** — every command/query is zod-parsed (`engine/commands.ts`); the A2A validators
  (`a2a/validation/*`, merged from `validation.ts`) validate envelopes/audit events/profiles before use.
- **No silent swallow.** Best-effort paths (context transfer, connector reply) log via
  `observability/logger.ts` and surface a low-severity event rather than failing the whole flow — but the
  degradation is always *visible*.
- **No secret leakage** — `transport/event-bus/redaction.ts` + `util/redact.ts` strip secrets from every
  event payload and log line before emit.

---

## 12. Configuration (`config/`)

`interop-config.ts` (all overridable via env, validated in `env.ts`, defaults in `defaults.ts`):

| Key | Default | Source |
|-----|---------|--------|
| `a2a.requireSignedIngress` | `true` | security invariant (signed-envelope gate) |
| `a2a.signingKeyRef` | `env A2A_SIGNING_KEY` (vault ref) | `signing/hmac.ts` |
| `a2a.replayWindowMs` | `300_000` | new (replay guard) |
| `a2a.protocolVersion` | `0.3.0` | RecoderAgentCard protocolVersion |
| `mcp.maxServersPerProject` | `3` | `mcp-manager.ts` |
| `mcp.idleTimeoutMs` | `5 * 60_000` | `mcp-manager.ts` idle cleanup |
| `mcp.requireApprovalRisk` | `high` | `tool-risk.ts` threshold |
| `connector.requireMention` | `true` | gateway-core mention-gating |
| `connector.enabled[kind]` | per-token presence | connector accounts (fail-safe off) |
| `transport.natsUrl` | `env NATS_URL` | `a2a-event-bus.ts` NATS path |
| `event.retentionTtlMs` / `event.maxRecords` | `6h` / bounded | `a2a-event-bus.ts` retention |
| `flags.externalMcpEnabled` | `true` | `feature-flags.ts` |

Secrets (signing key, connector tokens, NATS creds, DB URL) are read from env/vault only; **fail-fast if a
required one is missing**, and connectors **fail safe to disabled** when their token is absent (truthful
health, never faked). This is the repo invariant ("billing and runtime health must fail safe when keys or
dependencies are missing").

---

## 13. Observability (`observability/`)

- **Logger** (`logger.ts`): structured per-module child loggers (mirrors `docker-backend` `createLogger`).
- **Metrics** (`metrics-registry.ts` behind `MetricsPort`): `interop_a2a_inbound_total{result}`,
  `interop_a2a_signature_rejections_total`, `interop_mcp_tool_calls_total{server,decision}`,
  `interop_mcp_tool_risk_total{risk}`, `interop_mcp_external_servers{state}` (gauge),
  `interop_connector_messages_total{kind,gated}`, `interop_connector_health{kind}` (gauge),
  `interop_wire_latency_ms` (histogram).
- **Tracing** (`tracing.ts`): trace-context stamped on every `InteropEvent` so an inbound message →
  tool call → outbound reply chain is traceable end-to-end.
- **Health probe** (`health-probe.ts`): per-surface truthful readiness — A2A signing key present?, each
  MCP server reachable?, each connector configured + probe-ok? → `InteropHealth`. Backs the `/api/a2a` and
  `/api/mcp` health surfaces. Honors the frontend rule: "show control-plane state... If data is
  unavailable, show the missing source clearly instead of faking success."
- **Diagnostics** (`diagnostics.ts`): `dumpSnapshot()` returns registry, sessions, and recent events for
  support.

---

## 14. Verification plan

Per `.claude/rules/testing.md` — narrowest checks that prove touched behavior, captured as artifacts.

```bash
# Type + format (repo gates)
pnpm --filter @recoder/interop check-types
pnpm --filter @recoder/interop format

# Unit (pure modules; no IO) — must hit ≥80% per common/testing.md
pnpm --filter @recoder/interop test:unit

# Port-contract tests run against EVERY adapter (memory + postgres + redis + nats; in-proc + stdio)
pnpm --filter @recoder/interop test:contracts

# Property tests for the three core invariants
pnpm --filter @recoder/interop test:property

# Integration (signed ingress, gated tool call, external pal server, connector mention)
pnpm --filter @recoder/interop test:integration

# Agent-OS contract/eval suites (interop participates as a wire surface)
pnpm test:contracts:agent-os
```

**Invariants the suite must prove (the reason this subsystem exists):**

1. **Signed-ingress is mandatory** — `integration/a2a-inbound-unsigned-rejected.test.ts` +
   `property/envelope-sign-verify-roundtrip.prop.ts`: any unsigned/tampered envelope is rejected *before*
   it touches canonical state; a valid sign→verify roundtrip always passes, any tamper fails.
2. **Tool calls are always gated** — `property/tool-gate-denies-unpermitted.prop.ts` +
   `integration/mcp-tool-call-gated-e2e.test.ts`: no high-risk/unpermitted tool is ever auto-allowed;
   every call is risk-scored, policy-checked, approval-gated when required, and audited.
3. **External MCP servers are sandboxed by the same gate** — `integration/mcp-external-pal-e2e.test.ts`:
   spawning the real `pal-mcp-server` over stdio, listing + calling a tool goes through authorize+audit;
   a malicious tool description is data, never an instruction; idle servers are reaped.
4. **Unauthenticated connector traffic takes no action** — `integration/connector-unauthorized-blocked.test.ts`:
   a non-allowlisted / unmentioned message produces no control-plane effect.
5. **Task transitions stay legal** — `property/task-transition-legal.prop.ts`: only
   `ALLOWED_STATE_TRANSITIONS` are accepted; terminal states are terminal.
6. **Truthful health** — `observability/health-probe` tests assert configured/unreachable/ok states are
   reported honestly; a missing connector token yields `configured:false`, never a faked-OK.

CI runs unit + contracts + property on every push; integration on PR. Coverage gate 80% (per
`common/testing.md`), with `a2a/`, `mcp/`, `domain/`, `errors/` expected ≥90% (pure code).

---

## 15. Migration plan

interop consolidates two **published** contract packages, so the migration is staged to avoid breaking any
importer:

1. **Land `packages/interop` with merged engine** — copy the merged sources in, keep the existing
   `domain/**` type identities byte-compatible (re-exporting `SignedEnvelope`, `TaskEnvelope`, `AgentCard`,
   `McpServerRegistration`, etc. unchanged).
2. **Turn `@recoder/a2a-sdk` + `@recoder/agent-mcp` into façade re-exports** of `@recoder/interop` (same
   export paths, including a2a-sdk's sub-path exports `./schemas`, `./envelope-builders`, `./policy`,
   `./bridge-contract`, etc.). No downstream import path breaks.
3. **Rewire the backend routes** — `/api/a2a/*` (`server.ts` ~15561–16485) and `/api/mcp/*`
   (`server.ts` ~9966–10106, `agent-os/routes/mcp-control.routes.ts`) become thin calls into the
   `InteropEngine` / `McpHost` / `A2AServerHandlers` facades. Behavior preserved, logic centralized.
4. **Migrate `docker-backend/src/a2a/*` + `mcp-manager.ts`** to delegate to `@recoder/interop` (registry,
   event bus, context bridge, MCP process manager). The intent-parse stays; the dispatch/handoff defers to
   coordination via seam.
5. **Migrate external servers** — register `py/pal-mcp-server` and `mcp/recoder-a2a-server.js` through
   `mcp/external/*` with the standard authorize+audit gate.
6. **Deprecate then remove** the standalone contract packages once all importers resolve through
   `@recoder/interop` (a release later). The monorepo's stated owner of A2A wire contracts is preserved —
   interop *is* that owner, with a2a-sdk as its published entrypoint until removal.

Acceptance: no false success. A2A/MCP/connector claims must cite a passing contract/integration test or an
observed event; missing keys/deps report environment evidence (truthful health), not product success.

---

## 16. Build & packaging

- `tsup.config.ts` — ESM + CJS + `.d.ts`, multi-entry (mirrors `a2a-sdk`'s sub-path exports so
  `@recoder/interop/schemas`, `/policy`, `/bridge-contract` resolve; mirrors `agent-mcp`'s tsup shape).
- `package.json` deps: `@recoder/agent-os` (domain reuse), `@recoder/agent-policy` (intent decisions),
  `@recoder/agent-memory` (candidate emission), `@recoder/agent-events` (outbox), `zod` (validation).
  Optional peers: `nats` (event bus), `pg` (postgres adapter), `ioredis` (context/replay cache), and the
  connector SDKs (`ws`, channel clients) — all lazy-loaded so the pure core has zero hard runtime deps.
- No secrets in the package (per `feedback_no_secrets_in_packages` memory): env/vault only, templates only.
