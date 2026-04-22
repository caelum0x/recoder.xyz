# Recoder Platform Status

Last updated: 2026-04-22

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
| Web IDE | `web.recoder.xyz` | Working end to end. Broken local settings/publish UI removed; auth works; project creation works; Daytona sandbox bring-up works; preview auto-start recovers dead Vite servers; single-turn and follow-up coding edits were browser-verified against a live project. |
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
- broken local `Settings` surface removed
- broken local `Deploy` / `Go Live` entrypoints removed
- preview health polling bounded so it stops background thrash after the startup window
- Web snapshot persistence cleaned up so `app` is the canonical snapshot authority
- legacy `chat-history` / project-state hot-path fallback removed
- project creation recovered by moving `recoder-web` off Neon-backed runtime DB config and back to host Postgres
- Daytona runner inode exhaustion identified and cleaned up so fresh sandboxes can install dependencies again
- preview now redirects to the direct Daytona URL only when a real preview port is up
- Daytona preview auto-start no longer double-starts the same project
- Pi Daytona writes now land in the real sandbox even when the model falls back to legacy `recoderAction` text output
- live browser verification passed for both first-turn and second-turn Web IDE edits on the same project

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
- authenticated profile and quota endpoints work
- authenticated project creation works again
- sandbox creation works again
- Daytona-backed preview health reports `5173` responding after auto-start
- live preview renders through the direct Daytona URL
- first-turn Web IDE edit verified on a live project
- second-turn follow-up edit verified on the same live project

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

- active in-progress agents/backend cleanup tickets remain in `bd`
  - use `bd list --status in_progress` for the live queue

### Optional Deeper Verification

- broader authenticated journey testing beyond the route-level sweeps already completed
- deeper post-login flows if needed for launch confidence

## Launch Criteria

Launch is complete when:

- `recoder.xyz` auth + Web bridge work
- `web.recoder.xyz` supports create, follow-up edit, and same-origin preview rendering in production
- `agents.recoder.xyz` key authenticated routes work
- `pm.recoder.xyz` key authenticated routes work
- `agency.recoder.xyz` key authenticated routes work
- A2A-dependent flows stay healthy after the latest env/runtime fixes
- `recoder-2hzs` is resolved
- `recoder-ylcl` is resolved
- `recoder-hb6` is resolved
- `recoder-i3v` is resolved
- `recoder-zdp` is resolved or explicitly accepted as non-blocking

## Notes

- Production evidence wins over old notes.
- Keep this file short and current.
- Use `bd` for detailed tracking, not this file.
- `net::ERR_BLOCKED_BY_ADBLOCKER` is not treated as a product bug.

  - too many hops
      - browser -> web.recoder.xyz
      - web -> recoder-web
      - recoder-web -> docker-backend
      - docker-backend -> Daytona
      - Daytona -> Vite dev server
  - two preview paths instead of one
      - /preview/:id
      - /api/sandbox-preview/:id/*
  - mixed responsibilities
      - nginx, recoder-web, and docker-backend all touched preview behavior
      - headers, base href, websocket upgrade, and caching were all modified in more than one place
  - health checks were fake-good
      - “5173 responds” was treated as “live preview works”
      - that is not enough for Vite
  - env drift
      - recoder-web was still pointed at Neon through env files
      - production compose and live env were not the same truth
  - Daytona runner hygiene was poor
      - inner Docker inode exhaustion broke installs
      - preview looked like “timeout” but the real issue was runtime exhaustion

  Why this breaks specifically with Vite:

  - Vite dev mode is not just static files on a port
  - it relies on:
      - transformed import URLs
      - @vite/client
      - @react-refresh
      - working websocket upgrade
      - consistent host/origin/path assumptions
  - once you rewrite HTML and proxy assets/ws through multiple layers, small mismatches cause white pages

  Bluntly: other projects keep preview simple. We made it too clever.

  The clean fix is:

  1. choose one preview architecture
  2. stop rewriting Vite traffic in multiple places
  3. either:
      - use direct sandbox origin with proper wildcard/domain routing, or
      - proxy everything through exactly one gateway
  4. if embedded preview is required, disable HMR and use iframe reloads instead of proxying Vite dev websockets

  Best practical direction:

  - short term:
      - make preview “no-HMR iframe reload only”
      - one path only
      - no @vite/client, no @react-refresh, no websocket dependence
  - long term:
      - move to direct sandbox preview domains or a single-purpose preview gateway

  So yes:

  - URLs were wrong
  - websocket handling was wrong
  - CORS/header handling was wrong
  - Vite is exposing the weakness
  - Daytona is not the main problem
  - our proxy design is the main problem

  If you want, I can stop trying to preserve Vite HMR and implement the simpler “preview without HMR, hard refresh on file changes” path
  first.
