# Agents Startup Runtime Checklist

Last updated: 2026-04-20

## Purpose

Use this after deploying `fix/agent-blockers-create-loop-codemirror-sandbox-autowake` to verify the remaining Agents startup issues:

- `recoder-6l4` duplicated thread detail / agent-runs failures
- `recoder-q6u` successful agent start with no visible chat response

## Important Note

The local/frontend mitigations already landed on the branch are not reflected in production until they are deployed.
Do not treat repeated production sweeps against the old deployment as proof that the latest branch fixes failed.

## Branch Commits To Verify

The main startup-state mitigation commits are:

- `3e6fdc65` Gate Agents startup fetches behind settled auth
- `e3d33809` Reduce optimistic thread 404 churn
- `354769f1` Show pending assistant state during stream startup
- `7512ea98` Reduce duplicate optimistic thread refetches
- `bbcb1e33` Gate sidebar thread tag lookups
- `d25f841f` Centralize pending-thread startup gating
- `d2a9bcb7` Gate hidden thread startup queries
- `de9c3dc5` Avoid project fetches for pending threads
- `cee74ca2` Make new conversation loader visibly assistant-like
- `ad554fa6` Improve authenticated Canvas verification path

## Primary Verification Script

Run:

```bash
node scripts/e2e-agents-auth.mjs
```

Artifacts written locally:

- `agents-auth-home.png`
- `agents-auth-typed.png`
- `agents-auth-response.png`
- `agents-auth-board.png`

## Success Criteria

### For `recoder-6l4`

The sweep should show:

- no repeated `404` spray on `/v1/thread/:id/agent-runs`
- no repeated `404` spray on `/v1/threads/:id`
- no `503` on `/v1/threads/:id/messages`
- no broad `503` fanout on `/v1/threads/:id/tags`
- ideally zero `503` on `/v1/threads/archived`

### For `recoder-q6u`

The sweep should show one of:

- `Response: Agent response appeared in chat`
- `Response: Error message rendered in chat`

It should no longer show:

- `No visible response or error in chat after 10s`

### Secondary Startup Health

These endpoints should stay clean during the startup flow:

- `/v1/agents`
- `/v1/project/:id/sandbox/status`
- `/v1/projects/:id`
- `/v1/prompts`
- `/v1/memory/thread/:id/settings`

## Manual Spot Checks

### 1. New thread startup

Open `https://agents.recoder.xyz/`, send a prompt, and confirm:

- the user message appears immediately
- an assistant-visible startup state appears immediately
- the first assistant/tool output replaces the startup state

### 2. Network tab filters

Filter for:

- `/v1/thread/`
- `/v1/threads/`
- `/v1/projects/`
- `/v1/project/`
- `/v1/prompts`
- `/v1/agents`

Check whether failures happen:

- before the thread leaves `_pending`
- after the thread detail already returns `200`

That distinction tells you whether this is still a startup orchestration problem or a backend stability problem after adoption.

### 3. Board / Canvas path

If the home surface still does not expose a Board/Canvas button, verify the authenticated direct route:

```text
/projects/<projectId>/thread/<threadId>?modeStarter=canvas
```

Expected:

- canvas starter visible, or
- a clear product reason why this route is intentionally not user-facing

## Remaining Backend Chokepoints To Trace

If failures remain after deployment, focus on these backend handlers:

### Thread detail

File:

- `backend/core/threads/api.py`

Handlers:

- `GET /threads/{thread_id}`
- `GET /threads/{thread_id}/messages`
- `GET /projects/{project_id}`

Shared risk:

- pending thread/project not yet materialized in DB
- auth or account access checks after partial creation

### Agent runs

File:

- `backend/core/agents/api.py`

Handlers:

- `GET /thread/{thread_id}/agent-runs`
- `GET /agent-run/{agent_run_id}/stream`

Shared risk:

- stream cache vs DB race
- agent run exists in runtime cache but thread/project has not settled

### Thread tags and archived list

Files:

- `backend/core/threads/thread_tags_api.py`
- `backend/core/threads/thread_bulk_api.py`

Handlers:

- `GET /threads/{thread_id}/tags`
- `GET /threads/archived`

Shared risk:

- auxiliary sidebar/popover callers still firing too early
- backend instability under concurrent list/detail startup load

### Memory settings

File:

- `backend/core/memory/api.py`

Handler pattern:

- `GET /memory/thread/{thread_id}/settings`

Shared risk:

- thread-scoped feature query still racing startup

## Frontend Areas Already Gated

The main branch-side startup gating now exists in:

- `recoder-agents/src/hooks/threads/page/use-thread-data.ts`
- `recoder-agents/src/components/thread/ThreadComponent.tsx`
- `recoder-agents/src/components/thread/layout/thread-layout.tsx`
- `recoder-agents/src/components/thread/thread-site-header.tsx`
- `recoder-agents/src/components/sidebar/share-modal.tsx`
- `recoder-agents/src/components/sidebar/archived-threads.tsx`
- `recoder-agents/src/components/thread/thread-tag-manager.tsx`
- `recoder-agents/src/components/sidebar/sidebar-thread-list.tsx`
- `recoder-agents/src/hooks/threads/use-thread-collaborators.ts`
- `recoder-agents/src/hooks/threads/use-thread-bulk.ts`
- `recoder-agents/src/hooks/memory/use-memory.ts`

If post-deploy failures still hit the same endpoints, bias toward backend/runtime tracing instead of adding more frontend gates blindly.
