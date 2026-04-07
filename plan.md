# Recoder Platform — Current Status

Last updated: 2026-04-07 (evening session)

## ONE GOAL: Make all platforms work end to end
recoder.xyz auth not works manuel auth not work also we do not have free resend api key anymore no verificaiton mails either
### Platform State

| Platform | URL | Status |
|----------|-----|--------|
| **agents** | agents.recoder.xyz | Can only do messages/chats. No real coding — agent can't create React apps, only HTML/CSS. Sandbox auto-stop + broken preview breaks the code->run->preview cycle. |
| **web** | web.recoder.xyz | Basic — no continuous development or edits. Pi agent wired but not deployed yet. |
| **A2A** | docker.recoder.xyz/api/a2a | Only works locally (Claude Code <-> Codex via MCP bridge). No web UI, no docs, no public pages. |
| **PM** | pm.recoder.xyz | **FIXED** — was crash-looping due to broken `@logtail/next` pnpm symlink. `pnpm install` + restart fixed it. Auth redirects to recoder.xyz unified login. |
| **Agency** | agency.recoder.xyz | **FIXED** — was returning 500 on all authenticated pages. Root cause: PostgreSQL stuck in recovery mode. Force-restarted PG, restarted PM2. Playground, workspaces, dashboard all working. Separate auth from recoder.xyz. |
| **recoder.xyz** | recoder.xyz | Auth source of truth (Better Auth). Dashboard/Billing/Projects pages are stubs. |

### What each platform needs to be "working end to end"

**agents.recoder.xyz — must be able to code real apps:**

Root cause analysis (2026-04-07): **The infrastructure is all there.** The agent
has create_file, edit_file, execute_command, expose_port tools via Daytona sandbox.
The system prompt tells the LLM to use them. Preview works via VNC + port exposure.
The problem is a **wiring gap** — the `deep-coding` mode exists in the UI (Terminal
icon in chat input) but is never sent to the backend API.

Gaps found:
1. `chat-input.tsx` handleSubmit passes `{ agent_id, model_name }` but NOT `mode`.
   The ModeButton sets `selectedMode` in Zustand store but it's never read in submit.
2. `ThreadComponent.tsx` handleSubmitMessage doesn't accept `mode` in options.
3. `unifiedAgentStart` in `agents.ts` doesn't include `mode` in FormData.
4. Backend `POST /agent/start` already accepts `mode: Optional[str] = Form(None)` —
   the backend is ready, the frontend just doesn't send it.
5. When `mode = 'deep-coding'`, backend routes to `_execute_deep_coding_run` which
   calls `DOCKER_BACKEND_URL/api/opencode/{project_id}` (or Pi endpoint).

Fix chain:
- [ ] Wire `selectedMode` from Zustand → handleSubmit → onSubmit → mutateAsync → FormData → backend
- [x] Pi agent deployed in docker-backend (verified: Pi SDK available in container)
- [ ] Wire Pi endpoint (`POST /api/pi/:projectId`) as deep-coding backend option
- [ ] Sandbox creation race: agent starts before sandbox is ready — `_ensure_sandbox()` adds latency
- [ ] Verify VNC preview connects and shows running app after agent creates files
- [ ] Test end-to-end: "build a React landing page" → files created → npm install → dev server → preview

**web.recoder.xyz — must support continuous development:**
- [ ] Pi agent as default chat backend (code done in api.chat.ts, needs deploy)
- [ ] Iterative edit->preview->fix loop working
- [ ] File tree shows current sandbox state (not stale local store)
- [ ] Terminal connected to sandbox (WS proxy fix deployed but not verified)
- [ ] Multi-turn editing: context carries across messages, Pi session persists

**A2A — needs web presence + docs:**
- [ ] Landing page or docs section at recoder.xyz explaining A2A
- [ ] Web UI for viewing/sending A2A tasks (recoder-29m shared task board)
- [ ] Deploy Redis-backed task persistence to production (in-memory store still active)
- [ ] Integration guide for external developers

**pm.recoder.xyz:**
- [x] Fix `Cannot find module '@logtail/next'` — pnpm install restored broken symlink
- [ ] Verify copilot read+write works after restart
- [ ] Unify auth with recoder.xyz

**agency.recoder.xyz:**
- [x] Debug "Failed to create and start task from stage" 500 errors — was PostgreSQL in recovery mode, not Giselle engine
- [ ] Fix GitHub auth account_not_linked
- [ ] Wire API keys edit/delete to real backend
- [ ] Unify auth with recoder.xyz

## Current Blockers (Priority Order)

1. ~~**PM crash loop**~~ — FIXED (pnpm install + pm2 restart)
2. ~~**Pi agent not deployed**~~ — DEPLOYED (Pi SDK verified in docker-backend container)
3. ~~**recoder-web with Pi routing**~~ — DEPLOYED (pi-exec.ts + api.chat.ts routing live)
4. ~~**Agent silently drops messages**~~ — ROOT CAUSE: PostgreSQL 17 was down (port 5432 not listening). Every auth check, sandbox resolution, agent run failed silently. Restarted PG cluster + PM2 backend. Code fix for Gemini cleaning + error display was already deployed.
5. ~~**Agency Giselle engine broken**~~ — FIXED (PostgreSQL recovery mode, force-restarted PG)
6. ~~**recoder-agents mode wiring**~~ — DEPLOYED (mode field wired chat-input→API→backend, deep-coding routes to Pi→OpenCode)
7. ~~**Sandbox preview 502**~~ — FIXED. File server in sandbox never started because `ss` not in slim image. Fixed `start_file_server()` to use `curl` for port check and direct `exec` for startup. Started file servers in all 10 running sandboxes. Preview verified E2E: blue Hello World page live at sandbox URL.

## bd Tickets

### Closed

- **recoder-7hh** — OpenCode bridge to sandbox (deployed + verified)
- **recoder-4t2** — Payload CMS TS drift (already fixed in 6904d132)

### Open

| Category | Tickets | Status |
|----------|---------|--------|
| Core Coding Loop | recoder-96g, recoder-i3v, recoder-sti, recoder-w0b | **96g VERIFIED E2E**: agent creates files + sandbox preview works (blue Hello World). **i3v multi-turn**: agent start 200 on follow-up, response detected. Intermittent 502s from memory pressure. sti/w0b untouched |
| Deep Coding Runtime | recoder-lma, recoder-y4q | **lma deployed + UI verified**: Deep Coding mode in UI with example prompts. y4q depends on lma |
| Agents/Canvas | recoder-xnh, recoder-e5a, recoder-8i9 | **xnh partially verified**. **e5a CLOSED** (file proxy HEAD fixed in b99f3a16). **8i9 FIXED** (canvas fallback on $0 credits — deployed) |
| Product Verification | recoder-kcq, recoder-74p, recoder-ijs | **kcq**: PM copilot API responds (405 GET, needs org context). 74p/ijs untouched |
| Infra/Host | recoder-025, recoder-0xz, recoder-d0k | Hetzner checkout drift, zrok legacy |
| Shared Planning | recoder-29m | Task board UI |

### Unfiled (need bd tickets)

- Ownership flip on container recreate -> 403 cascade
- ~~CORS on docker-backend error responses~~ — already fixed in globalErrorHandler (handler.ts:144-152)
- **Server memory pressure**: 15GB total, 766MB free, 3GB swap. 10 running Daytona sandboxes + all services cause intermittent 502s/timeouts. Need to reduce sandbox concurrency or increase RAM.

## What's Live & Working

- All 5 platforms return HTTP 200: agents, web, PM, Agency, recoder.xyz
- All Docker services healthy, all PM2 services online
- PostgreSQL 17 recovered from stuck recovery mode
- Redis AOF write error fixed (stop-writes-on-bgsave-error + BGREWRITEAOF)
- recoder-frontend Docker image rebuilt with error display fix (image b177716a22bd)
- recoder-backend restarted with Gemini-safe message cleaning (llm.py)
- Security incident fully remediated (XMRig miner, CVE-2025-66478)
- E2E verified: 18 PASS, 0 FAIL across all 5 platforms

## Pi Integration Strategy

Pi agents (`@mariozechner/pi-coding-agent`) are the unified coding runtime for all surfaces.

**What's built:**
- `pi-runtime-adapter.ts` — Pi SDK -> Daytona bridge (ReadOps, WriteOps, EditOps, BashOps)
- `POST /api/pi/:projectId` endpoint in docker-backend
- `pi-exec.ts` in recoder-web — Pi-first chat routing
- `api.chat.ts` routing: Pi -> OpenCode -> chat LLM (fallback chain)

**Remaining phases:**
- Phase 4: Deploy Pi runtime to production (rebuild docker-backend)
- Phase 5: Deploy recoder-web with Pi-first routing
- Phase 6: Wire Pi into recoder-agents Python backend
- Phase 7: Embed `@mariozechner/pi-web-ui` in recoder-web
- Phase 8: Integrate `pi-ai` unified LLM API across all surfaces
- Phase 9: Load `pi-skills` into A2A agent registry

## Secondary Issues (not blocking)

- Se2: `/api/container` uses `flexibleProjectOwnership` but `/api/files/:projectId` uses strict `verifyProjectOwnership`
- Se3: No circuit breaker on `POST /api/container` client retries
- Se4: No deploy-time check that `recoder-workspace:latest` exists on host startup
- `.env.production` has placeholders for OPENAI_API_KEY, DODO_PAY_*, PADDLE_*
- `USE_DAYTONA_CONTAINERS=true` not set despite Daytona being self-hosted

## Source Of Truth

- `bd` is the authoritative task/issue tracker.
- This file is the authoritative human-readable status summary.
- Historical rollout notes live in git history, not in duplicated root markdown.

## Working Rules

- If this file and bd disagree, trust `bd`.
- If this file and a chat transcript disagree, trust this file.
- If deeper history is needed, use git instead of reviving duplicate status blocks.
 ---                                                                                                                                        
  bd Tickets — Status Overview                                                                                                               
                                                                                                                                             
  Closed this session:                                                                                                                       
  - recoder-7hh — OpenCode bridge to sandbox (deployed + verified)                                                                           
  - recoder-4t2 — Payload CMS TS drift (already fixed in 6904d132)                                                                           
                                                                                                                                             
  Still open (bd):                                                                                                                           
                                                                           
  ┌─────────────────────┬────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────┐   
  │      Category       │                    Tickets                     │                            Status                             │
  ├─────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤   
  │ Core Coding Loop    │ recoder-96g, recoder-i3v, recoder-sti,         │ Code done for 96g/i3v, needs browser verify. sti/w0b          │
  │                     │ recoder-w0b                                    │ untouched                                                     │
  ├─────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤   
  │ Deep Coding Runtime │ recoder-lma, recoder-y4q                       │ lma backend verified but messages silently fail. y4q depends  │
  │                     │                                                │ on lma                                                        │   
  ├─────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
  │ Agents/Canvas       │ recoder-xnh, recoder-e5a, recoder-8i9          │ All untouched                                                 │   
  ├─────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤   
  │ Product             │ recoder-kcq, recoder-74p, recoder-ijs          │ All untouched                                                 │
  │ Verification        │                                                │                                                               │   
  ├─────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
  │ Infra/Host          │ recoder-025, recoder-0xz, recoder-d0k          │ Hetzner checkout drift, zrok legacy                           │   
  ├─────────────────────┼────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤   
  │ Shared Planning     │ recoder-29m                                    │ Task board UI                                                 │
  └─────────────────────┴────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────┘   
                                                                           
  Unfiled issues (need bd tickets):                                                                                                          
  - Ownership flip on container recreate → 403 cascade                     
  - CORS missing on docker-backend 403/500 error responses                                                                                   
                                                          
  Current Blockers (Priority Order)                                                                                                          
                                                                                                                                             
  1. PM crash loop (42,740 restarts) — Cannot find module '@logtail/next'                                                                    
  2. Pi agent not deployed — code done, needs docker-backend rebuild                                                                         
  3. recoder-web with Pi routing — needs rebuild + deploy                                                                                    
  4. Agent silently drops messages — Gemini format rejection + frontend doesn't show stream errors                                           
         5. Agency Giselle engine broken — 500 on task creation                                                                              
                                                                                                                                             
  What's Live & Working                                                                                                                      
                                                                                                                                             
  - Backend env restored (was crash-looping again due to .env drift — 3rd time)                                                              
  - All Docker services healthy, all PM2 services online
  - Security incident fully remediated (XMRig miner, CVE-2025-66478)                                                                         
  - 16 distinct fixes deployed to Hetzner this session                                                                                       
                                                                                                                            continue with A2A work, or investigate the OpenCode "Unexpected end of JSON" to get web.recoder.xyz coding working