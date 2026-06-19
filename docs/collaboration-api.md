# Recoder Agent Platform — API Reference

Reference for the agent capability + collaboration endpoints added on
`docker-backend`. All routes are JSON; most require `Authorization: Bearer <token>`
(noted otherwise). Responses use the `{ success, data }` envelope. Every backend
power is fail-safe (truthful health, never fake success).

## Capabilities

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/capabilities` | no | Live status of every capability (coding runtimes, secure runner, browser verify, memory, docs, code intel, LLM router, agent skills, zero-trust, billing, collaboration) |

## Coding runtimes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/coding-runtime/runtimes` | List runtimes + branded catalog |
| POST | `/api/coding-runtime/session` | Start a session (`runtimeType: auto` classifies + adaptively routes) |
| POST | `/api/coding-runtime/prompt` | Run a prompt; opt-in `injectDocs[]` (Context7), `useMemory`, `codeContext`; `auto` mode auto-enriches |

## Unified LLM router

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/llm/providers` | 12 providers + which keys are configured |
| POST | `/api/llm/route` | Recommend provider/model by prompt complexity |
| POST | `/api/llm/chat` | Chat completion (`provider/model`, BYOK-aware; `autoModel:true` for complexity routing) |

## Secure runner (E2B) · Browser verification · Memory · Docs

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/e2b/health` (no auth) · POST `/api/e2b/exec` · `/api/e2b/run` · DELETE `/api/e2b/sandbox/:id` | Ephemeral secure code/command execution |
| GET | `/api/browser/verify/health` (no auth) · POST `/api/browser/verify` · `/api/browser/verify/ai` | Deterministic + AI page verification |
| GET | `/api/memory/mem0/health` (no auth) · POST `/api/memory/mem0/add` · `/search` · GET `/all` · DELETE `/:memoryId` | LLM-managed memory (OSS Qdrant or platform) |
| GET | `/api/context7/health` (no auth) · `/api/context7/resolve` · POST `/api/context7/docs` · `/api/context7/inject` | Up-to-date library docs |

## Code intelligence

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/code-graph/build` | Build a graph from `files[]` → `{graphId, stats}` |
| GET | `/api/code-graph/:graphId` (`?full`) · `/search` · `/symbol` · `/file-symbols` · `/who-imports` · `/dependencies` | Navigate the graph |

## Zero-trust (OpenZiti) · Billing (Polar)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ziti/health` (no auth) · `/api/ziti/identities` · POST `/api/ziti/identities` · `/api/ziti/runners` · DELETE `/api/ziti/identities/:id` | Provision zero-trust identities/enrollment |
| GET | `/api/billing/polar/health` (no auth) · `/products` · POST `/checkout` · GET `/subscriptions` | Fail-safe billing (additive; does not touch existing entitlements) |

## Squads (agent + human teams)

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/api/a2a/squads` | List (owner-scoped) / create. Squads may carry `projectId` as the default runtime project |
| POST | `/api/a2a/squads/import` | Create from a portable squad JSON |
| GET | `/api/a2a/squads/:id` (`?withPresence=true`) | Detail (optionally with member presence) |
| PATCH / DELETE | `/api/a2a/squads/:id` | Update (name/description/leader/default `projectId`) / delete |
| POST | `/api/a2a/squads/:id/clone` · `/api/a2a/squads/:id/export` (GET) | Duplicate / export portable JSON |
| POST | `/api/a2a/squads/:id/members` · PATCH/DELETE `/members/:memberId` | Add member / set role or member `projectId` / remove |

## Squad dispatch

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/a2a/squads/:id/dispatch` | Fan a task to the team (`strategy`: all/leader/round-robin/best-match). Delivers to agent A2A inboxes; opt-in `execute:true` runs on explicit `projectId`, a single targeted member `projectId`, or the squad default `projectId` (session-on-demand) |
| GET | `/api/a2a/squads/:id/tasks` · `/api/a2a/squads/:id/stats` | Task list / dispatch metrics |
| POST | `/api/a2a/squad-tasks/:taskId/assignments/:memberId` | Transition an assignment (queued/in_progress/completed/failed) → updates presence + skill profiles |

## Presence · Collaboration feed/events

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/a2a/presence?agentIds=a,b` · `/api/a2a/presence/:agentId` · POST `/workload` | Availability × workload, batch-derived |
| GET | `/api/a2a/collaboration/feed` · `/summary` · `/events` · `/roster` | Activity, summary, recent events, cross-squad agent roster |
| GET | `/api/a2a/collaboration/stream` | Live SSE event stream (`?token=` for EventSource auth) |

## Agent skill profiles

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/agent-skills/record` | Record a task outcome (compounds skills) |
| GET | `/api/agent-skills` · `/api/agent-skills/leaderboard` (`?skill=`) · `/api/agent-skills/:agentId` | List / ranked leaderboard / one profile |
| POST | `/api/agent-skills/rank` | Rank given agents for given skills |

## Workflow step runner

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/workflows/run-steps` | Run a composed step list. Step types: `llm`, `http`, `code`, `branch`, `trigger`, `squad`, `parallel` (concurrent sub-steps), `conditional` (then/else). `{{_lastOutput}}` flows between steps |

## Frontend (recoder-agents, via the `/dx/*` → docker-backend proxy)

`/squads` · `/squads/[id]` · `/team` · `/workflows` · `/workflows/runner` · `/capabilities`.

## Self-hosting

`docker-backend/docker-compose.capabilities.yml` (Correction 2026-06-19: prod compose
provisions Qdrant + OpenZiti only; Ollama/vLLM removed — cloud LLM instead) +
`scripts/setup-capabilities.sh`, `provision-ziti-runner.sh`, `smoke-capabilities.sh`.
Prod policy: cloud LLM + on-box Qdrant/ziti; no Ollama/vLLM on the 16GB/no-GPU box
(`.env.capabilities.recoder-server`).
