# Recoder Platform Status

Last updated: 2026-04-21

## Goal

Keep the live Recoder surfaces working end to end:

- `recoder.xyz`
- `web.recoder.xyz`
- `agents.recoder.xyz`
- `pm.recoder.xyz`
- `agency.recoder.xyz`
- A2A / MCP flows behind them

## Current State

| Platform | URL | Current State |
| --- | --- | --- |
| Hub | `recoder.xyz` | Working. Header simplified to `Agents` + `Dashboard`; dashboard onboarding loop removed; auth UI simplified to OAuth-first flows. |
| Web IDE | `web.recoder.xyz` | Working in production for launch, first turn create, follow-up edit, preview, and snapshot-backed project persistence. |
| Agents | `agents.recoder.xyz` | Main authenticated paths working. Shared ecosystem nav removed; top-right notification/customize controls removed; `Plan` removed from user menu; file pane hydration fallback fixed. |
| PM | `pm.recoder.xyz` | Authenticated PM surface verified working on key routes. |
| Agency | `agency.recoder.xyz` | Authenticated dashboard/projects/settings flows verified. One intermittent RSC prefetch issue remains open. |
| Docker Backend | `docker.recoder.xyz` | Healthy. Redis-backed queue verified. A2A admin surface re-hardened. |
| API Backend | `api.recoder.xyz` | Healthy. |
| Docs | `docs.recoder.xyz` | Live. |

## What Was Fixed

### Hub / Main App

- `recoder.xyz` header simplified to `Agents` + `Dashboard`
- dashboard onboarding redirect loop removed
- main-site auth UI simplified to OAuth-first
- snapshot APIs now read canonical `project_snapshots` directly
- CLI project APIs now read canonical project snapshots instead of chat-history file snapshots

### Web IDE

- auth bridge fixed
- same-origin sandbox create fixed
- preview path fixed
- Web snapshot persistence cleaned up so `app` is the canonical snapshot authority
- legacy `chat-history` / project-state hot-path fallback removed

### Agents

- shared ecosystem nav removed from agents shell
- top-right notification/customize controls removed
- `Plan` removed from user menu
- files pane fallback fixed when sandbox/thread hydration lags
- runtime/API noise reduced

### Backend / Runtime

- Gemini/OpenRouter payload normalization fixed and verified
- paid Gemini runtime mapping fixed and verified
- A2A env drift on prod fixed
- `/api/a2a/agents` now correctly requires admin token
- disk pressure reduced on prod host

### Retired Surfaces

- Chatwoot runtime removed from prod host
- OpenClaw runtime removed from prod host
- `chat.recoder.xyz` now returns `410`
- `openclaw.recoder.xyz` now returns `410`
- repo deploy/runtime config no longer recreates Chatwoot or OpenClaw

## Verified Live

### Web IDE

Verified in production:

- `recoder.xyz` -> `Launch Web IDE`
- `web.recoder.xyz` loads
- first prompt works
- follow-up edit works
- preview works

### PM

Authenticated live verification passed for:

- `/app`
- `/insights`
- `/settings`

### Agency

Authenticated live verification passed for:

- `/dashboard`
- `/projects`
- `/settings`

Direct route loads are good. One intermittent prefetch-only issue remains:

- `recoder-zdp`
  - intermittent `503` on agency RSC prefetch requests like `/clients?_rsc=...`

### Agents

Authenticated live verification passed for:

- `/`
- `/collaboration`
- auth session endpoint
- thread/agent APIs in current flows

### A2A / Control Plane

Verified live:

- `docker-backend/scripts/smoke-public-queue.sh` passes against `https://docker.recoder.xyz`
- queue backend is `redis`
- BYOK readiness passes
- `/api/a2a/health` reports A2A enabled and healthy bridge agents
- `/api/a2a/agents` returns `401` without admin token

## Desired Architecture

- browser-facing auth starts at `app`
- `app` is the authority for session verification and canonical project snapshots
- Web browser talks only to `recoder-web`
- `recoder-web` talks to `docker-backend` plus approved coding-engine services/adapters
- sandboxes are disposable execution state, not persistence
- no browser-critical dependency on direct `docker.recoder.xyz`

## Remaining Work

### Current Real Follow-Up

- `recoder-zdp`
  - intermittent authenticated agency RSC prefetch `503`s
  - direct route loads are fine; issue appears intermittent and likely proxy/prefetch related

### Optional Deeper Verification

- broader authenticated journey testing beyond the route-level sweeps already completed
- deeper post-login flows if needed for launch confidence

## Launch Criteria

Launch is complete when:

- `recoder.xyz` auth + Web bridge work
- `web.recoder.xyz` supports create, follow-up edit, and preview in production
- `agents.recoder.xyz` key authenticated routes work
- `pm.recoder.xyz` key authenticated routes work
- `agency.recoder.xyz` key authenticated routes work
- A2A-dependent flows stay healthy after the latest env/runtime fixes
- `recoder-zdp` is resolved or explicitly accepted as non-blocking

## Notes

- Production evidence wins over old notes.
- Keep this file short and current.
- Use `bd` for detailed tracking, not this file.
- `net::ERR_BLOCKED_BY_ADBLOCKER` is not treated as a product bug.
