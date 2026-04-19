# Recoder Platform Status

Last updated: 2026-04-19

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
| Hub | `recoder.xyz` | Auth and Launch Web IDE bridge working. |
| Web IDE | `web.recoder.xyz` | Launch, coding, preview, and follow-up edit working in production with clean latest browser pass. |
| Agents | `agents.recoder.xyz` | Main authenticated paths working; local startup-race cleanup is ahead of prod. Live sweep still shows duplicated thread/agent-runs `404` calls plus intermittent `/v1/commands/history` and `/v1/agents` `503`s. |
| PM | `pm.recoder.xyz` | Authenticated PM surface verified clean again. |
| Agency | `agency.recoder.xyz` | Authenticated launch/workspaces/playground/tasks/settings verified; one React console warning remains. |
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
- one residual warning remains:
  - minified React error `#418` in browser console

### Agents

- main authenticated activity path restored
- websocket/API path regressions from earlier round were reduced enough for current public use
- latest authenticated Agents sweep verified:
  - home/auth path works
  - `/v1/threads` `200`
  - `/v1/system/status` `200`
  - `/v1/agents` `200`
  - agent start `200`
  - zero 5xx responses
- remaining Agents warnings:
  - no visible chat response within 10s on the tested message
  - duplicated `404` traffic still appears for:
    - `/v1/thread/:id/agent-runs`
    - `/v1/threads/:id`
    - `/v1/threads/:id/messages`
  - Board/Canvas route test still hits an overlay-intercepted click path

## Remaining Blockers

### 1. Agents cleanup

Remaining non-blocking but real issues:

- duplicated legacy `404` calls for some thread detail / agent-runs routes in live prod (local fix prepared)
- Board/Canvas interaction still has an overlay-click issue in authenticated browser automation
- chat response rendering speed/visibility still needs one cleaner pass
- intermittent startup `503`s on:
  - `/v1/commands/history`
  - `/v1/agents`

### 2. Agency cleanup

Remaining non-blocking issue:

- one React console warning (`Minified React error #418`) during authenticated sweep

### 3. Persistence cleanup

In progress:

- `recoder-web` project reads now prefer the snapshot-backed hub APIs
- `recoder-web` chat restore now prefers canonical project snapshots over stale chat-history snapshots when a project exists
- `recoder-web` chat-history saves now best-effort mirror `fileSnapshot` writes to the hub project snapshot API
- still unfinished:
  - final live verification of the new snapshot-backed read/write path
  - removing the remaining chat-history/fileSnapshot coupling in Web restore/save flows
  - keeping one clear source of truth for project files and metadata end to end

## Desired Architecture

- Browser talks only to `recoder-web`
- `recoder-web` talks only to `docker-backend`
- `docker-backend` uses Daytona only for sandbox lifecycle, exec, file ops, and preview
- no browser-critical dependency on direct `docker.recoder.xyz`
- sandboxes are disposable execution state, not persistence
- new React projects default to Vite

## Priority Order

1. Clean up Agents residual authenticated route/UI warnings
2. Clean up Agency residual console warning
3. Finish snapshot/persistence cleanup

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
