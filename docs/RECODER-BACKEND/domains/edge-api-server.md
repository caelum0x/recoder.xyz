# Domain: Edge & API Server

**Folder prefix:** `backend/src/http/` + `backend/src/domains/edge/`
**Role:** The public seam host — the untrusted-until-proven edge. Owns the express + express-ws
bootstrap, the middleware chain, the declarative route-mount table, WS upgrades (`/terminal`,
`/api/conductor/workspaces/:id/stream`), rate-limit, CORS, the error-envelope middleware, OpenAPI, request
validation, graceful lifecycle, and the `/internal/*` `INTERNAL_SERVICE_KEY` gate.
**Owns none of the other domains' logic** — it mounts their routers and derives a per-mount
`GuardPolicy` by convention (`/internal/*` ⇒ internal-key + interop; `/api/*` ⇒ session + interop;
everything else ⇒ **public**, `interop:false`), with a per-provider `guardOverrides` seam.

> **SHIPPED (not uniform).** The interop chain (`authorize → risk → policy → audit`) is **not** applied
> uniformly on every mount. Public mounts skip it, and the domain routers **self-guard** — each surface
> applies its own single auth (`middleware.authenticate` on reads, `authenticateMutating` on writes,
> signature-auth on billing webhooks, `INTERNAL_SERVICE_KEY` on `/internal/*`), i.e. one-auth-per-surface,
> not one edge gate for all.

---

## 1. Overview

Today all of this lives inline in a single 542 KB `backend/src/server.ts` (express init at the top,
`rateLimit(...)`, `cors(...)`, `requestIdMiddleware`, the `INTERNAL_SERVICE_KEY` block, ~47 `app.use`
mounts, WS upgrade handling with `node-pty`). The Edge domain **extracts that plumbing behind a
composer** so `server.ts` becomes thin (`parse env → bootstrap.start()`), and every other domain
plugs in through one narrow contract (`RouteProvider`) instead of importing express and calling
`app.use` itself.

Two physical locations, one logical domain:

- **`backend/src/http/`** — the mechanical HTTP/WS server core: the express app builder, the ordered
  middleware chain, the WS upgrade dispatch + socket bridges, OpenAPI, and graceful lifecycle. This is
  framework wiring with no domain knowledge.
- **`backend/src/domains/edge/`** — the domain composer: `createEdgeModule(deps)`, the declarative
  route-mount table (path → domain router + guard policy), the `RouteProvider`/`WsBackend` ports the
  other 13 domains implement, the `EdgeConfig` slice, and edge `health()`.

**Design invariant:** the edge is *stateless*. It owns **no DB tables**. It never makes a policy
decision itself — it *invokes* the shared `InteropChain` (`@recoder/interop`) and `GovernanceGate`
(`@recoder/governance`) and translates their verdicts into the standard `Result`/error envelope.
Everything untrusted (body, query, headers, WS frames, page content) is validated at this boundary
with zod before any domain sees it.

---

## 2. File Tree

```
backend/src/http/
  app.ts                              # createHttpApp(deps) → { app, server, wsUpgrade } (express+express-ws)
  lifecycle.ts                        # graceful start/listen + drain/stop on SIGTERM/SIGINT
  openapi.ts                          # build OpenAPI 3.1 doc from route table; serve /api/openapi.json + docs UI
  middleware/
    chain.ts                          # ordered middleware composer (the ONE canonical request pipeline)
    request-context.ts                # request-id + trace-context propagation + structured req/res logging + metrics
    cors.ts                           # origin allowlist (reuses cors-utils); preflight; credentialed cross-subdomain
    rate-limit.ts                     # http token-bucket tiers + WS per-connection limiter binding
    auth.ts                           # resolveSession (@recoder/auth): authenticateRequest + optionalAuth
    internal-key.ts                   # /internal/* INTERNAL_SERVICE_KEY constant-time gate
    interop-gate.ts                   # authorize→risk→policy→audit edge chain (@recoder/interop) as middleware
    validate.ts                       # zod boundary validators: validateBody/Query/Params (@recoder/agent-schemas)
    error.ts                          # error-envelope terminal middleware + 404 handler + asyncHandler
    __tests__/
      internal-key.test.ts            # integration: gate rejects missing/short/placeholder/wrong key
      interop-gate.test.ts            # integration: deny verdict → AUTHZ envelope, audit always recorded
      error.test.ts                   # integration: thrown/rejected handlers → stable envelope, no leak
  ws/
    upgrade-router.ts                 # HTTP upgrade dispatch by path + auth-on-upgrade + origin check
    terminal.socket.ts               # /terminal WS ↔ substrate pty/exec port (conductor terminal stream)
    stream.socket.ts                  # /api/conductor/workspaces/:id/stream WS ↔ RunEvent fan-out (doc-`/sync`/collaboration cut)
    __tests__/
      upgrade-router.test.ts          # unauthenticated upgrade rejected; bad origin closed; path routing

backend/src/domains/edge/
  index.ts                            # createEdgeModule(deps): EdgeModule — the ONE public interface
  edge-module.ts                      # composer: builds app, applies chain, mounts route table + WS, health
  route-table.ts                      # declarative mount table: [{ base, provider, guard, internal }]
  config.ts                           # EdgeConfig slice of AppConfig (origins, limits, ws, timeouts)
  health.ts                           # EdgeModule.health(): server up + per-mount registration status
  types.ts                            # EdgeModule, MountSpec, GuardPolicy, EdgeHealth types
  ports/
    route-provider.port.ts            # RouteProvider — every domain implements this to expose HTTP/MCP edges
    ws-backend.port.ts                # WsBackend — /terminal + workspace-stream backends implement this
  __tests__/
    route-table.test.ts               # every mount has a guard; no duplicate/overlapping base paths
    edge-module.test.ts               # boot mounts all providers; degraded provider → mount skipped + health down
```

**File count:** 26 (21 implementation/config/port + 5 tests).

---

## 3. Per-file Responsibilities

| Path | lang | kind | Responsibility | Key exports |
|------|------|------|----------------|-------------|
| `http/app.ts` | ts | service | Build the express base app, attach `express-ws` to a raw `http.Server` (preserving the existing v4/v5 type-cast dance), install the middleware chain, return the app + server + upgrade handle. No route knowledge. | `createHttpApp(deps: HttpDeps): { app; server; wsUpgrade }`, `type HttpDeps` |
| `http/lifecycle.ts` | ts | service | Graceful lifecycle: `listen()` with readiness resolve, connection tracking, `stop()` that stops accepting, drains in-flight (bounded timeout), closes WS + server, then resolves. Wired to `bootstrap` SIGTERM/SIGINT. | `startHttpServer(server, cfg): Promise<void>`, `stopHttpServer(server, opts): Promise<void>` |
| `http/openapi.ts` | ts | service | Assemble an OpenAPI 3.1 document by walking the route table + each provider's declared operation specs (zod→JSON-Schema); serve `/api/openapi.json` and a minimal docs page. Degrade-safe: missing spec ⇒ path listed without schema, never crashes. | `buildOpenApiDoc(table): OpenApiDoc`, `mountOpenApi(app, table)` |
| `http/middleware/chain.ts` | ts | middleware | The single canonical ordered pipeline so all 14 domains share one request lifecycle: `request-context → cors → body(limits) → rate-limit → auth → [internal-key on /internal] → interop-gate → route → error`. Exposes helpers to compose per-mount guards. | `buildGlobalChain(deps): RequestHandler[]`, `buildGuard(policy): RequestHandler[]` |
| `http/middleware/request-context.ts` | ts | middleware | Assign/propagate `x-request-id` + W3C `traceparent`, bind a child `@recoder/logger` (`{ domain:'edge', requestId }`) onto `req`, emit structured start/finish logs, record latency/status to metrics. Replaces inline `requestIdMiddleware` + `metricsMiddleware`. | `requestContext(deps): RequestHandler`, `type RequestCtx` |
| `http/middleware/cors.ts` | ts | middleware | Origin allowlist from `EdgeConfig.origins` (reuses existing `cors-utils` `ALLOWED_ORIGINS`/`getCorsHeadersForOrigin`), credentialed cross-subdomain (`.recoder.xyz`), preflight, explicit method/header allowlists. No `*` with credentials. | `corsMiddleware(cfg): RequestHandler` |
| `http/middleware/rate-limit.ts` | ts | middleware | HTTP tiers (global API, container/heavy, auth-sensitive) via `express-rate-limit`, keyed by session/user then IP; binds the existing `ws-rate-limiter` for WS. Returns standard `429` envelope. | `httpRateLimiters(cfg): { api; heavy; auth }`, `wsRateLimit(cfg)` |
| `http/middleware/auth.ts` | ts | middleware | Resolve `Session` from the edge cookie/bearer via `@recoder/auth` `createAuth()`; attach typed `req.session`. `authenticateRequest` (401 on miss) + `optionalAuth` (pass-through). Never trusts client-supplied identity. | `authenticateRequest(auth): RequestHandler`, `optionalAuth(auth): RequestHandler`, `resolveSession(auth, req)` |
| `http/middleware/internal-key.ts` | ts | middleware | Gate `/internal/*` on `INTERNAL_SERVICE_KEY` with constant-time compare; synthesize an internal service `Session`. Enforces the fail-fast validation already in `server.ts` (≥32 chars, no dev/placeholder default in prod) at construction. | `internalKeyGate(cfg): RequestHandler`, `resolveInternalServiceSession(req, key)` |
| `http/middleware/interop-gate.ts` | ts | middleware | Run the `@recoder/interop` chain `authorize → risk → policy → audit` for every edge + MCP call; deny ⇒ `AUTHZ_PROJECT_ACCESS_DENIED` envelope; audit is **always** recorded (even on allow) through the governance gate. Reads `guard.riskClass`/`writeScope` from the mount spec. | `interopGate(chain, gov): (guard) => RequestHandler` |
| `http/middleware/validate.ts` | ts | middleware | Zod boundary validation for body/query/params using `@recoder/agent-schemas`; on failure returns a `VALIDATION` envelope with field paths (no stack). The only sanctioned inbound-validation entry point. | `validateBody(schema)`, `validateQuery(schema)`, `validateParams(schema)` |
| `http/middleware/error.ts` | ts | middleware | Terminal error middleware: map thrown/`Result.err`/`createError` into `sendError`; unknown errors ⇒ `SERVICE_UNAVAILABLE` + server-side log with context, user-safe message only. Plus 404 handler and `asyncHandler` re-export from `backend/src/errors`. | `errorEnvelope(deps): ErrorRequestHandler`, `notFound(): RequestHandler` |
| `http/ws/upgrade-router.ts` | ts | service | Single `server.on('upgrade')` dispatcher: origin check, auth-on-upgrade (session or internal key), route by path to a registered `WsBackend`, apply WS rate limit, reject with proper close codes. Replaces ad-hoc upgrade logic in `server.ts`. | `createUpgradeRouter(deps): { register(path, backend); handleUpgrade(req, socket, head) }` |
| `http/ws/terminal.socket.ts` | ts | service | `/terminal` backend: bridge a WS to the substrate pty/exec port (`@recoder/substrate`) for the conductor terminal — resize, data, exit; per-frame rate limit; auth'd to the workspace via interop. Does NOT own pty (delegates to conductor/engines). | `createTerminalWsBackend(deps): WsBackend` |
| `http/ws/stream.socket.ts` | ts | service | `/api/conductor/workspaces/:id/stream` backend: stream `RunEvent`s (`@recoder/agent-events`) to the cockpit/website (task/run/approval/verification state); backpressure-aware, replay-from-cursor, heartbeat. (The old doc-`/sync`/collaboration relay was cut.) | `createWorkspaceStreamWsBackend(deps): WsBackend` |
| `domains/edge/index.ts` | ts | service | Pure factory + the ONE public interface. Follows the `agent-os/service-container` pattern — no top-level singletons. | `createEdgeModule(deps: EdgeDeps): EdgeModule`, `type EdgeModule` |
| `domains/edge/edge-module.ts` | ts | service | The composer: calls `createHttpApp`, applies the global chain, iterates the route table mounting each `RouteProvider` under its base + guard, registers WS backends, exposes `listen/stop/health`. Skips a provider whose module reports `down` and records it in health (degrade-safe, never fakes). | `EdgeModuleImpl` |
| `domains/edge/route-table.ts` | ts | config | The declarative source of truth for the API surface: an array of `MountSpec` mapping `/api/agent-os`, `/api/a2a`, `/api/mcp`, `/internal/*`, `/health`, `/api/v1`, etc. to a provider key + guard policy. No express here — pure data consumed by the composer + OpenAPI. | `ROUTE_TABLE: MountSpec[]`, `resolveProviders(reg): MountSpec[]` |
| `domains/edge/config.ts` | ts | config | The typed `EdgeConfig` slice of `AppConfig` (origins, body limits, rate-limit tiers, ws heartbeat/timeouts, internal-key presence). Received at construction; domain code never reads `process.env`. | `EdgeConfig`, `edgeConfigSchema` (zod), `sliceEdgeConfig(app)` |
| `domains/edge/health.ts` | ts | service | `health()`: server listening state + per-mount registration status (mounted / skipped-degraded / missing) + WS backend up/down; aggregated into `/health` + `/api/agent-os/health`. Truthful, labels `degraded:true`. | `edgeHealth(state): EdgeHealth` |
| `domains/edge/types.ts` | ts | type | Shared edge types. | `EdgeModule`, `MountSpec`, `GuardPolicy`, `EdgeHealth`, `EdgeDeps` |
| `domains/edge/ports/route-provider.port.ts` | ts | port | The contract every domain implements to expose edges without importing express directly: returns an express `Router`, optional MCP tool registrations, and OpenAPI operation specs, plus a `health()` probe the composer consults before mounting. | `RouteProvider` interface, `RouteProviderMeta` |
| `domains/edge/ports/ws-backend.port.ts` | ts | port | The contract a WS stream backend implements (`onConnection(socket, ctx)`, `path`, `authScope`). `/terminal` + the workspace stream (and future domains) provide these; the upgrade router dispatches to them. | `WsBackend` interface, `WsConnectionCtx` |
| `http/middleware/__tests__/internal-key.test.ts` | ts | test | `/internal` rejects absent/short/placeholder/dev-default/wrong keys (401/500 at boot); accepts valid key and synthesizes internal session. | — |
| `http/middleware/__tests__/interop-gate.test.ts` | ts | test | Deny verdict ⇒ `AUTHZ_PROJECT_ACCESS_DENIED` envelope; allow + deny both produce an audit record; gate failure fails closed. | — |
| `http/middleware/__tests__/error.test.ts` | ts | test | Thrown sync error, rejected async handler, and explicit `createError` all yield the stable envelope shape with no stack/secret leakage; 404 handler shape. | — |
| `http/ws/__tests__/upgrade-router.test.ts` | ts | test | Unauthenticated upgrade closed `4401`; disallowed origin closed; correct path routes to the right backend; unknown path closed `4404`. | — |
| `domains/edge/__tests__/route-table.test.ts` | ts | test | Every `MountSpec` has a `guard`; internal mounts flagged `internal:true`; no duplicate/overlapping base paths; every writeful mount carries a governance write scope. | — |
| `domains/edge/__tests__/edge-module.test.ts` | ts | test | Boot mounts all healthy providers; a provider reporting `down` is skipped and surfaced in `health()` as degraded; `/health` reflects reality. | — |

---

## 4. Database Schema

**The Edge domain owns NO tables.** It is stateless request plumbing.

- **Rate limiting** is in-memory (`express-rate-limit` default store) per process; if a distributed
  store is later needed it is consumed as a port from `persistence`/`coordination`, not owned here.
- **Request/edge audit** is written through the **governance gate** (`record_audit` → the Rust Merkle
  chain), owned by the `governance` domain — the edge only *calls* `interopGate`, it stores nothing.
- **Sessions & API keys** (`sk_` keys) are owned by the `identity` domain (Postgres); the edge *reads*
  a resolved `Session` through the `@recoder/auth` port.

No migrations under `backend/migrations/` belong to this domain.

---

## 5. Edges (HTTP + WS)

### Routes the Edge domain OWNS directly

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/health` | public | Aggregate health (edge + all modules), truthful `degraded` flags |
| GET | `/api/openapi.json` | public | Generated OpenAPI 3.1 document |
| GET | `/api/docs` | public | Minimal docs UI |
| GET | `/api/edge/routes` | internal | Route-table introspection (mounted/skipped/missing) for ops |

### The route-mount TABLE (edge mounts other domains' routers — it owns none of their logic)

| Base | Provider (domain) | Guard | Notes |
|------|-------------------|-------|-------|
| `/api/agent-os/*` | agent-os | session + interop | canonical control-plane state |
| `/api/a2a/*` | interop | a2a signed-envelope + interop | wire interop / connectors |
| `/api/mcp/*` | engines (MCP host) | session/tool-perm + interop | MCP tool/resource registry |
| `/internal/agent-os/*` | agent-os | internal-key | worker→backend |
| `/internal/*` | (various) | internal-key | service-to-service only |
| `/api/v1/*` | identity (public API keys) | api-key + rate-limit | external programmatic API |
| `/api/conductor/*` | conductor | session + interop | workspaces/runs |
| `/api/billing/*` | billing | session + interop | plans/usage |
| `/api/governance/*` | governance | session + interop | policy/approvals/audit verify |
| ... | one `MountSpec` per domain | per-guard | added declaratively, never inline `app.use` |

### WebSocket upgrades (single dispatcher in `ws/upgrade-router.ts`)

| Path | Backend | Auth | Purpose |
|------|---------|------|---------|
| `/terminal` | `terminal.socket.ts` → substrate pty/exec | session + workspace scope | conductor terminal I/O |
| `/api/conductor/workspaces/:id/stream` | `stream.socket.ts` → RunEvent bus | session | cockpit/website live per-workspace control-plane stream *(doc-`/sync`/collaboration cut)* |

Non-public HTTP edges and MCP tool calls pass the interop chain `authorize → risk → policy → audit`
(public mounts are `interop:false`); domain routers additionally self-guard with one auth per surface
(session / mutating-session / signature / internal-key). `/internal/*` is `INTERNAL_SERVICE_KEY`-gated.

---

## 6. Interfaces (ports)

### Exposed to other domains

- **`RouteProvider`** (`ports/route-provider.port.ts`) — the seam the other 13 domains wire to.
  ```ts
  interface RouteProvider {
    key: string;                              // domain key, e.g. 'agent-os'
    routes(): express.Router;                 // the domain's mounted router
    mcp?(): McpToolRegistration[];            // optional MCP tools (conform to @recoder/agent-mcp)
    openapi?(): OpenApiOperationSpec[];        // optional operation specs for the doc
    health(): { status: 'up' | 'down' };      // consulted BEFORE mounting (degrade-safe)
  }
  ```
- **`WsBackend`** (`ports/ws-backend.port.ts`) — the seam for stream backends.
  ```ts
  interface WsBackend {
    path: string;                              // '/terminal' | '/api/conductor/workspaces/:id/stream'
    authScope: 'session' | 'internal';
    onConnection(socket: WebSocket, ctx: WsConnectionCtx): void | Promise<void>;
  }
  ```
- **`EdgeModule`** (`index.ts`) — `{ app, server, listen(), stop(), health() }` returned to `bootstrap`.

### Consumed from other domains (load-bearing seams)

- `Session` + `createAuth()` — `@recoder/auth` (identity).
- `InteropChain` — `@recoder/interop` (interop): `authorize → risk → policy → audit`.
- `GovernanceGate.decide()` / `record_audit` — `@recoder/governance` (governance).
- `RunEvent` bus — `@recoder/agent-events` (agent-os/conductor) for the workspace stream.
- pty/exec port — `@recoder/substrate` (conductor/terminal) for `/terminal`.
- `AppConfig` slice — `bootstrap/config`.
- `Logger` — `@recoder/logger`; `Result`/`ErrorCode` + `sendSuccess`/`sendError`/`createError`/
  `asyncHandler` — `backend/src/errors` (existing).

---

## 7. Reuse Notes (build ON these, don't reinvent)

**REUSE existing backend code (move behind the composer, don't rewrite):**
- The express + `express-ws` init, the `http.Server`-first pattern and the v4/v5 type-cast at
  `server.ts:1700-1705` → `http/app.ts`.
- `rateLimit(...)` tiers (`apiLimiter`, `containerLimiter`, `server.ts:1750+`) → `middleware/rate-limit.ts`.
- `cors(...)` + `cors-utils` (`ALLOWED_ORIGINS`, `getCorsHeadersForOrigin`) → `middleware/cors.ts`.
- `requestIdMiddleware` + `metricsMiddleware` → `middleware/request-context.ts`.
- The `INTERNAL_SERVICE_KEY` fail-fast validation block (`server.ts:315-334`) and
  `resolveInternalServiceSession` → `middleware/internal-key.ts`.
- `security/ws-rate-limiter` (`getWsRateLimiter`) → bound in `middleware/rate-limit.ts` + WS upgrade.
- `backend/src/errors/{sendSuccess,sendError,createError,asyncHandler,ErrorCode}` → reused verbatim by
  `middleware/error.ts` + `validate.ts` (no `FORBIDDEN`/`EXTERNAL_SERVICE_ERROR`; use
  `SERVICE_UNAVAILABLE` / `AUTHZ_PROJECT_ACCESS_DENIED`).
- The ~47 inline `app.use('/api/...', router)` mounts and `.routes.ts` factories already extracted
  (a2a, network, conductor, agent-os, ziti, retrieval, billing-polar, tensorzero) → become
  `RouteProvider`s consumed by `route-table.ts` instead of hand-mounted in `server.ts`.

**REUSE `packages/*` contracts:** `@recoder/auth`, `@recoder/interop`, `@recoder/governance`,
`@recoder/agent-events`, `@recoder/agent-mcp`, `@recoder/agent-schemas`, `@recoder/substrate`,
`@recoder/logger`, `@recoder/utils`.

**WRITE NEW (thin):** `RouteProvider`/`WsBackend` ports, the declarative `route-table.ts`, the
`edge-module.ts` composer, the `interop-gate.ts` middleware wrapper, the `upgrade-router.ts`
dispatcher, `openapi.ts` generation, and `lifecycle.ts` graceful drain. These are ~600 lines total of
glue that replace ~5 000 lines of inline `server.ts` plumbing.

**CUT (do not restore):** the inline `sandbox`/`collaboration`/`lsp`/`public-api` dangling imports at
the top of `server.ts` are re-introduced only as proper `RouteProvider`s from their owning domains
(identity/billing/conductor), never re-mounted ad hoc.

---

## 8. Implementation Order

1. **Ports first** — `ports/route-provider.port.ts`, `ports/ws-backend.port.ts`, `types.ts`,
   `config.ts` (zod slice). These are the seam the other 13 designers wire to; land them first.
2. **Error + validation boundary** — `middleware/error.ts`, `middleware/validate.ts` (reuse
   `backend/src/errors`). Add `error.test.ts` (RED→GREEN). Everything downstream depends on the
   envelope being stable.
3. **Context + CORS + rate-limit** — `middleware/request-context.ts`, `cors.ts`, `rate-limit.ts`
   (port the existing inline logic behavior-preserving).
4. **Auth + internal gate** — `middleware/auth.ts`, `middleware/internal-key.ts` +
   `internal-key.test.ts`.
5. **Interop gate** — `middleware/interop-gate.ts` + `interop-gate.test.ts` (deny→AUTHZ, always-audit).
6. **Chain composer** — `middleware/chain.ts` fixes the canonical order.
7. **App + lifecycle** — `http/app.ts`, `http/lifecycle.ts` (express-ws attach, graceful drain).
8. **WS** — `ws/upgrade-router.ts` + `ws/terminal.socket.ts` + `ws/stream.socket.ts` +
   `upgrade-router.test.ts`.
9. **Route table + composer** — `route-table.ts`, `edge-module.ts`, `index.ts`, `health.ts` +
   `route-table.test.ts` + `edge-module.test.ts`.
10. **OpenAPI** — `http/openapi.ts` (last; reads the finished table).
11. **Bootstrap wiring** — `createEdgeModule(deps)` invoked from `bootstrap/container.ts`; `server.ts`
    shrinks to `parse env → bootstrap.start()`.

**Verification:** `pnpm check-types`, `pnpm test` (edge vitest suites), `pnpm test:contracts:agent-os`
(route/guard contract), and the existing `scripts/sso-logout-matrix.sh` +
`verify-cli-device-flow-e2e.sh` to prove auth/cookie edges still pass end-to-end.
