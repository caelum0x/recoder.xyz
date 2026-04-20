# Daytona Simplification Plan

Last updated: 2026-04-16

## Goal

Make `recoder-web` behave like `bolt.new` / `lovable.dev` with:

- Daytona as the only coding + live preview runtime
- Hetzner Postgres as the only persistent database
- zrok only for public/share links
- the app server as a thin control plane, not a second runtime layer

## Current Problems

The hard parts are mostly in our integration layer, not Daytona itself.

### Runtime complexity

- `recoder-web/server.js` proxies `/preview/*` and `/api/sandbox-preview/*` through `docker-backend`
- `docker-backend/src/preview.ts` adds extra recovery, probing, repair, and rewrite logic
- `docker-backend/src/zrok-preview.ts` is mixed into the preview lifecycle even though it should be optional

### Persistence drift

- `recoder-web/app/lib/.server/db/chat-history-db.ts` stores `fileSnapshot` inside `chat_sessions.metadata`
- `recoder-web/app/routes/api.projects.$projectId.ts` can reconstruct projects from chat history and even infer starter files from assistant messages
- `recoder-web/app/lib/persistence/useChatHistory.ts` captures sandbox state late and tries to restore it back into runtime state
- `app/app/api/projects/route.ts` currently proxies project reads to `recoder-web` chat history instead of owning project state directly

### Sandbox drift

- long-lived Daytona sandboxes are being reused after dependency drift
- stale `node_modules` can outlive the source snapshot
- preview health was previously treated as "port responds" instead of "app is healthy"

### Framework drift

- legacy CRA (`react-scripts`) projects are still entering the main runtime lane
- new React projects should not default to CRA

### Database drift

- live `recoder-web/.env` still points at Neon
- the intended persistent database is Hetzner Postgres

## Target Architecture

### 1. Source of Truth

There must be exactly one canonical project state.

Recommended model:

- Create a dedicated `project_snapshots` table in Hetzner Postgres
- Store full project files in JSONB first for simplicity
- Move `fileSnapshot` out of `chat_sessions.metadata`
- Keep chat history and project state separate

Suggested schema:

```sql
create table project_snapshots (
  project_id text primary key,
  user_id text,
  files jsonb not null,
  framework text,
  starter_id text,
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);
```

Rules:

- every successful file mutation updates `project_snapshots.files`
- sandbox contents are never the canonical copy
- chat saves may reference `project_id`, but do not own project files

### 2. Sandbox Model

Daytona sandbox = execution state only.

Rules:

- create sandbox from clean Daytona image
- hydrate sandbox from `project_snapshots.files`
- run install
- run dev server
- if sandbox drifts, destroy and recreate it from snapshot

Operational policy:

- prefer recreate over repairing broken `node_modules`
- only keep sandboxes warm for latency
- do not treat sandboxes as durable state

### 3. Preview Model

Internal preview should use Daytona preview directly.

Rules:

- keep one thin proxy layer for same-origin iframe compatibility if needed
- remove extra preview heuristics from the critical path unless they guard correctness
- use zrok only for public share URLs, not internal preview

Internal preview path:

- browser -> `web.recoder.xyz/preview/:projectId`
- control plane resolves active sandbox + port
- proxy directly to Daytona preview URL + token

Public/share path:

- explicit publish/share action
- zrok URL created on demand
- zrok state is not required for internal preview or coding

### 4. Framework Policy

- Default new React projects to Vite
- Treat CRA as legacy compatibility only
- No new CRA starter should enter the default lane

Legacy CRA policy:

- either migrate on load to Vite
- or isolate in a compatibility lane with stricter checks

Compatibility lane rules:

- deterministic install only
- explicit dependency integrity validation
- disposable sandboxs

## Concrete Repo Changes

### A. Persistence Ownership

#### Keep

- `app/app/api/projects/*` as the public project control-plane API
- `docker-backend/src/server.ts` container/sandbox execution APIs

#### Replace

- `app/app/api/projects/route.ts`
- `app/app/api/projects/[projectId]/route.ts`

Current behavior:

- proxies to `RECODER_WEB_URL/api/chat-history`
- treats chat history as project storage

Target behavior:

- read/write dedicated `project_snapshots` in Hetzner Postgres
- return project files from that table, not from chat history

#### Remove from critical path

- `recoder-web/app/routes/api.projects.$projectId.ts` fallback reconstruction from chat messages
- `inferStarterIdFromMessages()`
- `extractRecoveredFilesFromMessages()`
- `recoverFileSnapshotFromChat()`

These are emergency recovery hacks, not a stable storage model.

### B. Chat History Simplification

#### Keep

- `recoder-web/app/routes/api.chat-history.ts`
- `recoder-web/app/lib/.server/db/chat-history-db.ts`

#### Change

- stop storing canonical `fileSnapshot` in `chat_sessions.metadata`
- keep only lightweight references:
  - `projectId`
  - `artifactId`
  - `messageCount`
  - `source`

#### Remove from critical path

- `recoder-web/app/lib/persistence/useChatHistory.ts` snapshot capture as primary persistence
- `captureSandboxFileSnapshot()` as normal save behavior
- `restoreFilesToDocker()` as a canonical recovery path

Keep those only as temporary migration helpers if needed.

### C. Sandbox Hydration Path

#### Keep

- `docker-backend/src/daytona-client.ts`
- `docker-backend/src/daytona-file-ops.ts`
- `docker-backend/src/server.ts` sandbox creation path

#### Change

Hydration should become:

1. read project files from `project_snapshots`
2. write files into Daytona via `daytonaWriteFiles`
3. run deterministic install
4. start dev server

#### Remove from critical path

- hydrating from `recoder-web` chat/session APIs
- reconstructing projects from assistant XML artifacts

### D. Preview Simplification

#### Keep

- `docker-backend/src/preview.ts`
- `recoder-web/server.js`

#### Simplify

- keep `recoder-web/server.js` only as a same-origin relay if iframe constraints require it
- keep `docker-backend/src/preview.ts` focused on:
  - resolve sandbox
  - ensure running
  - ensure dev server port
  - proxy response

#### Move out

- zrok management from the internal preview lifecycle

`docker-backend/src/zrok-preview.ts` should only be used by:

- publish/share endpoints
- explicit public preview generation

### E. Database Unification

#### Keep

- Hetzner Postgres as the only persistent DB

#### Change immediately

- replace live `recoder-web/.env` `DATABASE_URL` away from Neon
- point `recoder-web`, `app`, and any project/chat persistence to the same Hetzner Postgres cluster

#### Migration

1. export active chat/session/project rows from Neon
2. import into Hetzner Postgres
3. flip env vars
4. run read-only validation
5. remove Neon from runtime config

## Endpoint Plan

### Endpoints to keep

- `POST /api/container` in `docker-backend/src/server.ts`
- file APIs in `docker-backend/src/server.ts`
  - `/api/file/:projectId`
  - `/api/files/:projectId`
  - `/api/exec/:projectId`
- preview APIs in `docker-backend/src/preview.ts`
  - `/api/preview/:projectId/url`
  - `/preview/:projectId`
- `GET/POST /api/projects/*` in `app/app/api/projects/*`
- `POST /api/chat` in `recoder-web/app/routes/api.chat.ts`

### Endpoints to change

- `app/app/api/projects/route.ts`
- `app/app/api/projects/[projectId]/route.ts`

These should stop proxying to chat history and instead use Hetzner Postgres project storage directly.

### Endpoints to de-emphasize or remove from critical path

- `recoder-web/app/routes/api.get-sandbox-files.ts`
- `recoder-web/app/routes/api.chat-history.ts` as project persistence
- `docker-backend/src/zrok-preview.ts` for internal preview

## Migration Phases

### Phase 1: Database unification

- point `recoder-web` to Hetzner Postgres
- introduce `project_snapshots`
- backfill existing `fileSnapshot` data from `chat_sessions.metadata`

### Phase 2: Source-of-truth switch

- make project reads come from `project_snapshots`
- make file mutation writes update `project_snapshots`
- stop reading project files from chat sessions

### Phase 3: Sandbox disposal model

- create/hydrate Daytona sandboxs from `project_snapshots`
- remove in-place stale sandbox healing from the default path
- add "destroy and recreate sandbox" as the normal recovery action

### Phase 4: Preview slimming

- keep same-origin preview relay only if strictly needed
- remove zrok from internal preview path
- keep zrok only for explicit publish/share

### Phase 5: Framework cleanup

- default all new React starters to Vite
- migrate or isolate legacy CRA

## Immediate Actions

1. Change `recoder-web` runtime `DATABASE_URL` from Neon to Hetzner Postgres.
2. Add `project_snapshots` table and read/write helpers.
3. Update `app/app/api/projects/*` to use that table directly.
4. Stop using `chat_sessions.metadata.fileSnapshot` as canonical state.
5. Make Daytona sandbox recreation the default recovery path.

## Success Criteria

- One database: Hetzner Postgres
- One project source of truth: `project_snapshots`
- One runtime: Daytona
- One internal preview path: Daytona preview relay
- Optional public-share path: zrok
- No project recovery from chat transcripts
- No reliance on stale sandbox state as canonical data
