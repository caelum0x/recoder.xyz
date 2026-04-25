# Recoder Platform Status

Last updated: 2026-04-23

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
| Web IDE | `web.recoder.xyz` | Working end to end for live app-task coding loops. Auth, project creation, sandbox bring-up, preview routing, first-turn generation, and multi-turn follow-up edits are verified in production. |
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
- fresh production app-task run now completes end to end: first turn, follow-up turn, and working preview URL
- browser-facing Daytona preview URLs now prefer signed preview links for fresh project payloads
- fresh live proof confirmed signed preview host token differs from `sandbox.id`

### Agents
- remove shared navbar from agents chat page
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
- fresh live app-task run returned `HTTP 200`, follow-up turn returned `HTTP 200`, and the preview URL served the generated updated page

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

Direct route loads are good.

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

- active in-progress cleanup/detail tickets remain in `bd`
  - use `bd list --status in_progress` for the live queue
  - current live queue:
    - `recoder-138`
    - `recoder-3cs`
    - `recoder-lje`
    - `recoder-lma`

### Optional Deeper Verification

- broader authenticated journey testing beyond the route-level sweeps already completed
- deeper post-login flows if needed for launch confidence

## Launch Criteria

Launch is complete when:

- `recoder.xyz` auth + Web bridge work
- `web.recoder.xyz` supports create, follow-up edit, and same-origin preview rendering in production
- `web.recoder.xyz` supports full real app-task loops without sandbox/session/storage exhaustion
- `agents.recoder.xyz` key authenticated routes work
- `pm.recoder.xyz` key authenticated routes work
- `agency.recoder.xyz` key authenticated routes work
- A2A-dependent flows stay healthy after the latest env/runtime fixes
- `recoder-2hzs` is resolved
- `recoder-ylcl` is resolved
- `recoder-hb6` is resolved
- `recoder-i3v` is resolved
- `recoder-96g` is resolved

## Notes

- Production evidence wins over old notes.
- Keep this file short and current.
- Use `bd` for detailed tracking, not this file.
- `net::ERR_BLOCKED_BY_ADBLOCKER` is not treated as a product bug.

## Problems

This section is the clean working list of issues. Raw repeated console tails were removed.

### Main App / Mail

- `recoder.xyz` is live again.
- auth routes work.
- signup-email reaches account creation.
- DNS/mail setup is mostly in place:
  - `mail.recoder.xyz` -> `77.42.23.19`
  - DKIM exists
  - SPF includes the server IP and mail host
  - DMARC is set to quarantine
- remaining mail blocker:
  - Postfix is accepting injected mail but not flushing queued mail to recipients
  - local sendmail handoff works
  - end-to-end inbox delivery is still not proven

### Agents

- `agents.recoder.xyz` is not stable yet.
- reported runtime errors:
  - `/v1/agent/start` returns `503`
  - `Sandbox creation failed: Sandbox resolver returned no sandbox`
  - optimistic agent start fails
  - thread retry fails
  - some `/v1/threads/...` requests return `404`
  - `/v1/project/<id>/sandbox/start` returns `500`
  - `Failed to get sandbox: [Errno 104] Connection reset by peer`
  - `Node cannot be found in the current page`
- deployed bundle also showed deep-coding i18n misses:
  - `recoder.prompts.deep-coding.0`
  - `recoder.prompts.deep-coding.1`
  - `recoder.prompts.deep-coding.2`
  - `recoder.prompts.deep-coding.3`
  - `recoder.prompts.deep-coding.4`
  - `recoder.prompts.deep-coding.5`
  - `recoder.prompts.deep-coding.6`
  - `recoder.prompts.deep-coding.7`

### Web IDE

- `web.recoder.xyz` is not stable yet.
- reported runtime errors:
  - container/sandbox bring-up returns `500`
  - `Could not create Docker container. Make sure docker-backend is running`
  - terminal/preview initialization gets skipped because the container is unavailable
- project creation also fails:
  - `/api/projects` returns `500`
  - `ProjectsPage Error creating project: Internal server error`
- UI cleanup still needed:
  - many web components still have white backgrounds
  - buttons/panels are visually inconsistent with the dark UI

### PM

- `pm.recoder.xyz` is not stable yet.
- reported page crash on feature route:
  - `TypeError: Failed to construct 'URL': Invalid URL`
  - `Parsing error: Failed to construct 'URL': Invalid URL`
- reported browser warning:
  - `Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true`

### Dashboard / UX Cleanup

- dashboard is too complicated and too crowded.
- simplify top-level items and repeated framing.
- current clutter called out:
  - `Overview`
  - `Developer Keys`
  - `Projects`
  - `Usage`
  - `Analytics`
  - `Settings`
  - nested `Settings`
  - `AI Provider Keys`
  - `Account`
  - `Launch`
  - `CLI`
  - `Web IDE`
- duplicated or low-value content should be reduced:
  - repeated name/email blocks
  - `Welcome back`
  - `Beta Status`
  - `Beta User`
  - `100% Free Forever`
  - oversized promo cards
- `Launch` should show all relevant platforms, not just:
  - `CLI`
  - `Web IDE`
- remove or redesign weak/broken sections:
  - `Platform Activity`
  - `Agents Unavailable`
  - `Agency Unavailable`
  - `PM Unavailable`
  - `Web IDE 0 total / 0 active`

### Short Platform Summary

- app: live, but outbound mail still blocked by host mail transport
- agents: broken runtime paths still exist
- web: broken container/project creation paths still exist
- pm: feature page URL construction crash still exists
