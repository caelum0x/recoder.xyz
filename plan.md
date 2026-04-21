# Recoder Platform Status

Last updated: 2026-04-21

## Goal

Keep the public Recoder surfaces working end to end:

- `recoder.xyz`
- `web.recoder.xyz`
- `agents.recoder.xyz`
- `pm.recoder.xyz`
- `agency.recoder.xyz`
- A2A / MCP / SDK flows that depend on them

## Current State

| Platform | URL | Current State |
| --- | --- | --- |
| Hub | `recoder.xyz` | Auth and Launch Web IDE bridge working. Header simplified to `Agents` + `Dashboard`; dashboard onboarding redirect loop removed; main-site auth UI is OAuth-first. |
| Web IDE | `web.recoder.xyz` | Launch, coding, preview, and follow-up edit working in production with clean latest browser pass. |
| Agents | `agents.recoder.xyz` | Main authenticated paths working. Shared ecosystem nav removed from agents shell; top-right notification/customize controls removed; `Plan` entry removed from user menu; generated-file Files pane fallback fix deployed. Remaining runtime/API instability still exists. |
| PM | `pm.recoder.xyz` | Authenticated PM surface verified clean again. |
| Agency | `agency.recoder.xyz` | Authenticated launch/workspaces/playground/tasks/settings verified clean in the latest sweep. |
| Docker Backend | `docker.recoder.xyz` | Running and backing Web IDE production flow. |
| API Backend | `api.recoder.xyz` | Running. |
| Docs | `docs.recoder.xyz` | Live. |

## What Was Fixed

### Web IDE

- auth bridge fixed
- same-origin sandbox create fixed
- Daytona toolbox path corrected to `/api/toolbox/...`
- Daytona file writes now land in `/home/daytona`
- Daytona install/start path now works for Web IDE Vite projects
- preview probing and same-origin preview proxy now work
- `/api/docker/*` websocket proxying fixed through `recoder-web` and nginx

### PM / Agency / Agents

- PM shared shell UI removed
- Agency shared shell UI removed
- PM runtime/build issues fixed enough for authenticated use
- Agents activity/auth paths restored
- host/backend service drift corrected enough for public product use
- Agents shared ecosystem nav removed
- Agents top-right notification/customize controls removed
- Agents user-menu `Plan` entry removed
- Agents Files pane now uses discovered sandbox IDs when thread/project hydration lags

### Hub / Main App

- `recoder.xyz` header simplified to `Agents` + `Dashboard`
- dashboard onboarding redirect loop removed
- main-site sign-in/sign-up UI simplified to OAuth-first flows
- manual verify-email / resend-email UI removed from the primary auth flow

## Verified Live

### Web

Browser-verified:

- open `https://recoder.xyz`
- click `Launch Web IDE`
- land on `https://web.recoder.xyz/`
- send first prompt
- preview becomes visible
- send follow-up edit
- follow-up result appears in UI
- latest browser pass completed with `0` 4xx, `0` 5xx, `0` console errors

Backend/runtime-verified:

- sandbox create returns `200`
- batch file write returns `200`
- Daytona sandbox contains real project files
- dependencies install
- Vite starts
- preview route returns `200` during the working path

### PM

- `pm.recoder.xyz/insights` authenticated flow was restored and verified live
- latest authenticated PM sweep returned clean:
  - `status: 200`
  - `url: https://pm.recoder.xyz/insights`
  - no console errors
  - no page errors
  - no failing responses

### Agency

- authenticated launch/auth paths working
- latest authenticated Agency sweep verified:
  - dashboard `200`
  - workspaces `200`
  - playground `200`
  - tasks `200`
  - settings/team `200`
  - zero 5xx responses
- no console errors reproduced in latest authenticated sweep

### Agents

- main authenticated activity path restored
- websocket/API path regressions from earlier round were reduced enough for current public use
- latest authenticated Agents sweep verified:
  - home/auth path works
  - `/v1/threads` `200`
  - `/v1/system/status` `200`
  - `/v1/agents` `200`
  - agent start `200`
  - zero `/v1/*` 5xx responses
- remaining Agents warnings:
  - duplicated `404` traffic still appears for:
    - `/v1/thread/:id/agent-runs`
    - `/v1/threads/:id`
  - intermittent `502` traffic still appears for:
    - `/v1/agents/active-runs`
    - `/v1/agent-runs/active`
    - `/api/auth/session-token`
    - `/v1/threads?page=...`
    - `/v1/bookmarks?...`
    - `/v1/ratings?...`
  - one dashboard RSC `503` was seen in production sweeps
  - Board/Canvas entry path still needs a cleaner authenticated check
  - Gemini / OpenRouter LiteLLM payload failure remains unresolved:
    - `litellm.BadRequestError`
    - Google provider says request must include at least one `parts` field
    - tracked in `bd` as `recoder-5hg`
  - chat response visibility/render timing still needs post-deploy verification on fresh authenticated runs

## Estate Scope

This estate includes:

- product/runtime surfaces: `app`, `backend`, `docker-backend`, `recoder-web`, `recoder-agents`, `recoder-pm`, `recoder-agency`, `packages`, `shared`
- orchestration/tooling surfaces: `mcp`, `oh-my-codex`, `oh-my-openagent`, `packages/recoder-code`, `packages/recoder-cli-router`, `packages/recoder-a2a`, `recoder-skill`, `skills`, `tools`
- runtime-integrated coding engines and related upstream code: `opencode`, Pi agents, Hermes agents, and the adapters that run them inside Daytona or service-backed coding flows
- reference/parity/imported surfaces that still matter for extraction or migration work: `openclaw`, `extracted-from-openclaw`, `claw-code-parity`, `homebrew-recoder`, `tasks`
- control-plane env surfaces: `.env.a2a.workers`, `.env.a2a.workers.example`, `.env.desktop-release.example`

## Canonical Systems

- `app`: auth, Launch Web IDE bridge, internal service auth, snapshot-backed project persistence
- `docker-backend`: sandbox lifecycle, exec, file ops, preview, runtime auth/ownership checks
- `recoder-web`: browser IDE product surface
- `backend`: legacy `/v1` API backing `recoder-agents`
- `recoder-agents`: agents frontend
- `recoder-pm`: PM product subtree
- `recoder-agency`: Agency product subtree
- `packages`: shared package source of truth
- `shared`: cross-app types/contracts

## Adapter Layers

- `mcp`: thin MCP/A2A bridge surface
- `packages/recoder-a2a`: published A2A/MCP connector
- `packages/recoder-cli-router`: CLI provider router
- `packages/recoder-code`: separate CLI workspace tied to coding-agent workflows
- `skills`, `recoder-skill`: skill-definition and delivery surfaces
- `tools`: ops/interoperability utilities, especially A2A tooling
- `homebrew-recoder`: packaging/distribution adapter
- `oh-my-codex`: Codex orchestration layer
- `oh-my-openagent`: OpenCode plugin/orchestration layer

## Runtime-Integrated Coding Engines

- `opencode` is part of the Web coding-engine layer when used to power Recoder Web or Agents coding flows
- Pi agents and Hermes agents are part of the same coding-engine layer when mounted in Daytona sandboxes or exposed as backend services
- these engines are not just references; they are part of the live coding path when used for Loveable/Bolt-style generation, editing, and follow-up coding loops

## Reference / Imported Systems

- `openclaw`: upstream or parallel codebase
- `extracted-from-openclaw`: extracted reference modules for reuse/porting
- `claw-code-parity`: parity/rewrite research workspace
- `tasks`: local task/reference surface

## Desired Architecture

- browser-facing auth starts at `app`
- Web browser talks only to `recoder-web`
- `recoder-web` talks to `docker-backend` plus approved coding-engine services/adapters
- coding engines such as `opencode`, Pi, and Hermes run inside Daytona sandboxes or as controlled backend services
- `docker-backend` uses Daytona only for sandbox lifecycle, exec, file ops, and preview
- no browser-critical dependency on direct `docker.recoder.xyz`
- sandboxes are disposable execution state, not persistence
- `app` remains the authority for session verification and canonical project snapshots
- new React projects default to Vite

## Priority Order

1. Clean up Agents residual authenticated route/UI warnings and runtime/API instability
2. Finish snapshot/persistence cleanup
3. Verify A2A / control-plane health after Web and Agents cleanup

## Runtime Checklist

For post-deploy verification of the remaining Agents startup issues, use:

- `docs/agents-startup-runtime-checklist.md`

## Current Blockers By Owner Surface

- `app` + `recoder-web`: live Web auth proof still depends on a fresh valid bridge/session token; authenticated `/api/projects` proof is blocked on session freshness, not missing route code
- `app` + `recoder-web`: snapshot migration is incomplete; hub snapshots are preferred, but legacy `projects` and chat-history `fileSnapshot` coupling still exists
- `backend` + `recoder-agents`: remaining startup instability is now a deployment/runtime verification problem more than a local frontend-gating problem; latest production sweeps still show duplicated thread detail / agent-runs `404`s, intermittent thread-scoped `503`s, and inconsistent behavior across runs
- `recoder-agents`: Board/Canvas authenticated entry path still needs a cleaner deployed verification pass; chat response visibility/render timing still needs post-deploy verification after the latest branch-side mitigations
- A2A/control plane: worker flows depend on Redis stream config, shared-secret alignment, internal service URLs, and orchestration policy from `.env.a2a.workers`
- host ops: disk remains tight and previously stopped services still need cleanup/restart planning

## Launch Criteria

Launch is complete when:

- `recoder.xyz` auth + Web bridge work
- `web.recoder.xyz` supports first-turn create, follow-up edit, and preview in production without transient browser errors
- `agents.recoder.xyz` key authenticated routes work
- `pm.recoder.xyz` key authenticated routes work
- `agency.recoder.xyz` key authenticated routes work
- A2A / MCP dependent flows still work after final Web cleanup

## Notes

- Production evidence wins over old notes.
- Keep this file short and current.
- Use `bd` for detailed task tracking, not this file.
- `app/` request is mostly done, but the full multi-surface request is not fully complete.
- `recoder.xyz` nav/auth simplification is deployed.
- `recoder-agents` shell/files fixes are deployed.
- Paid Gemini runtime mapping and the old OpenRouter `parts` failure were fixed and verified in production.
- Remaining work is broader authenticated/runtime verification plus Web snapshot cleanup, A2A verification, and host ops cleanup.
- `net::ERR_BLOCKED_BY_ADBLOCKER` is not considered a product bug.
