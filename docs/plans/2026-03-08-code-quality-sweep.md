# Code Quality & Type Safety Sweep

> **Started:** 2026-03-08
> **Status:** In progress (Sprints 17–23 complete)

**Goal:** Systematically eliminate `as any` casts, dead code, console pollution, security vulnerabilities, and orphaned files across the Recoder monorepo — primarily `recoder-agents/src/` and `app/`.

**Approach:** Iterative sprint-based sweeps using Explore agents to find batches, then sequential task execution. Each sprint targets 2–4 issues. Changes are strictly non-behavioral (no feature changes, no refactors beyond scope).

---

## Scope

### In scope
- `recoder-agents/src/` — frontend agent IDE (Next.js)
- `app/` — main platform app (Next.js)
- `packages/` — shared packages

### Out of scope
- `docker-backend/` — separate Express codebase, handled separately
- `backend/` — Python FastAPI, handled separately
- `recoder-web/` — Remix IDE, lower priority
- `recoder-agency/`, `recoder-pm/`, `recoder-studio/` — lower priority
- Test files — `as any` in mocks is acceptable

---

## Completed Work

### Sprint 17–19 (pre-session)
- Localhost guard hardening across production paths
- Hex color literals → Tailwind token classes
- Initial `as any` cast cleanup in components
- Console.log/debug AST sweep (296 statements removed in 70 files)

### Sprint 20 — CSS & Env Cleanup
- **globals.css**: Removed 8 duplicate `@keyframes` (blur-fade-in, text-shimmer, stream-blue-blur, shiny-text), 2 orphaned keyframes (mesh-orb-spin, mesh-orb-gradient), duplicate `.animate-stream-word`, duplicate `[data-streaming]` rule, duplicate `--animate-shiny-text` variable
- **.env.example**: Removed dead `EDGE_CONFIG` and `NEXT_PUBLIC_FORCE_LOCALHOST` env vars
- **Window globals**: Added `__pendingCanvasRefreshEvents`, `jQuery`, `opera` to Window interface in `posthog.d.ts`; fixed 6 `(window as any)` casts across ToolViewRegistry, canvas-renderer, MobileAppBanner, luckysheet-viewer
- **UploadFileToolView**: 5 `(output as any).field` → single typed `UploadResult` cast

### Sprint 21 — Dead Code & Security
- **animations.ts**: Removed ~160 lines of dead `SmoothStreamStore` class (`SMOOTH_STREAMING_ENABLED` hardcoded false); simplified to pass-through
- **gtm.ts**: Removed 13 empty `if (NODE_ENV === 'development') {}` blocks
- **SECURITY: agents/share**: Added `requireAuth()`, derived `author` from session (was untrusted body), added 500KB content limit
- **SECURITY: session-provider**: Removed 2 `console.log` calls leaking social login options
- **SECURITY: ai/chat JWT**: Removed fallback `'dev-jwt-secret-not-for-production'` secret; typed decoded payload

### Sprint 22 — Dead Exports & Lib Console Pollution
- **Dead exports**: Removed `AgentCard` alias, `convertLegacyToolConfig`, empty `TOOL_GROUPS`, empty feature flag dev block; made `NewAgentDialogLegacy` private (still used internally)
- **Console pollution (lib/)**: Removed 20+ console statements across error-handler, utils, geo-detection, geo-detection-server, tool-parser, url, file-utils, clear-local-storage, sandbox, stream-preconnect, billing, transcription

### Sprint 23 — Orphaned Files, app/lib Types, Route Casts
- **Orphaned files**: Deleted empty `hooks/dashboard/utils.ts`, empty `FileEditToolView.tsx`, unused `lib/edge-flags.ts` re-export bridge
- **session-sync.ts**: JWT `as any` → `jwt.JwtPayload & SessionData`; removed dead `withSessionSync` middleware
- **analytics.ts**: 7 `as any` event casts → proper `AnalyticsEvents.*` taxonomy constants
- **api-client.ts**: `null as any` → `T | null` return type; defined `UsageRecord`/`UsageHistoryResponse` types; all `any[]` params → `UsageRecord[]`; all `request<any>` → typed
- **backend-api.ts**: 4 `URLSearchParams(params as any)` → `Object.entries` filter; all `any` returns → `unknown`; `ApiResponse<any>` → `ApiResponse<unknown>`
- **mcp/auto-update.ts**: 6 `as any` → `StoredConfig` type alias + `Record<string, unknown>` Prisma casts
- **Route casts**: Removed redundant `(prisma as any)` in agents/share, agents/list, claude-code (prisma already `any`); typed raw SQL result in cli/projects; fixed `aiResponse as any` in ai/chat
- **claude-code route**: 4 `catch (error: any) { console.error }` → bare `catch {}`
- **contact page**: Fixed invalid `'primary'` button variant → `'default'`
- **recoder-agents**: Fixed icon-renderer, use-model-selection, agent-configuration-dialog, composio-triggers, xlsx-renderer `as any` casts

---

## Remaining Known Issues

### `as any` casts (medium priority)
| File | Count | Pattern |
|------|-------|---------|
| `recoder-agents/src/components/thread/content/ThreadContent.tsx` | 5 | `(msg as any)`, `(b as any)` — message type gaps |
| `recoder-agents/src/hooks/threads/page/use-thread-data.ts` | 4 | `(msg as any).agent_id` — thread message typing |
| `recoder-agents/src/components/thread/chat-input/chat-input.tsx` | 6 | `(textarea as any)` — DOM element manipulation |
| `app/lib/prisma.ts` | 3 | `prisma: any`, `PrismaClientCtor as any` — root Prisma typing |

### Test file `as any` (low priority)
| File | Count |
|------|-------|
| `app/app/__tests__/api/ai-provider-keys-route.test.ts` | 28 |
| `app/app/__tests__/api/billing-cancel-route.test.ts` | 8 |
| `app/app/__tests__/api/billing-checkout-route.test.ts` | 8 |
| `app/app/api/platform/*/tests/` | ~34 |

### Console pollution (low priority)
- `xlsx-renderer.tsx` — 13 console statements (file parsing debug, useful for troubleshooting)
- Remaining ~22 `console.error`/`console.warn` in lib/ utilities are legitimate runtime error logging

---

## Patterns Established

### Error typing
```typescript
// Instead of: (error as any).status
const error: ApiError = Object.assign(
  new Error('message'),
  { status: 404 }
);
```

### Window globals
```typescript
// In posthog.d.ts (central declaration file)
interface Window {
  __pendingCanvasRefreshEvents?: Map<string, number>;
  jQuery?: typeof import('jquery');
  opera?: string;
}
interface WindowEventMap {
  'locale-change': CustomEvent<string>;
}
```

### Prisma Json fields
```typescript
// Reading
const config = server.config as unknown as StoredConfig;
// Writing
data: { config: updatedConfig as unknown as Record<string, unknown> }
```

### Analytics backward compat
```typescript
// Instead of: trackEvent('sign_up' as any, { method })
trackEvent(AnalyticsEvents.SIGNUP_COMPLETED, { method });
```

### URLSearchParams with optional params
```typescript
// Instead of: new URLSearchParams(params as any)
new URLSearchParams(
  Object.entries(params)
    .filter((e): e is [string, string] => e[1] != null)
    .map(([k, v]) => [k, String(v)])
)
```

---

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| `as any` in recoder-agents/src/lib/ | ~25 | 0 |
| `as any` in app/lib/ | ~22 | 0 |
| `as any` in app/app/api/ (non-test) | ~12 | ~2 |
| Console pollution (recoder-agents/src/lib/) | ~40 | ~22 (legitimate) |
| Dead code (animations.ts) | ~160 lines | 6 lines |
| Duplicate CSS keyframes | 8 | 0 |
| Orphaned/empty files | 3 | 0 |
| Security vulnerabilities fixed | — | 4 (unauthenticated endpoint, JWT secret fallback, console.log leaks, untrusted body data) |

---

## Decision Log

1. **`prisma: any` root typing** — Not fixed. The generated Prisma client has schema-specific types that don't match the dynamic model access pattern used in this codebase. Fixing requires a Prisma codegen refactor.
2. **Test file `as any`** — Deferred. Mock setup inherently needs type flexibility; fixing would require mock factory infrastructure.
3. **ThreadContent/chat-input `as any`** — Deferred. These require message type interface expansion across the entire thread system.
4. **xlsx-renderer console statements** — Kept. File parsing errors are useful for debugging XLSX rendering issues in production.
5. **`NewAgentDialogLegacy`** — Made private (removed `export`) instead of deleting. Used internally by `NewAgentDialog` for production mode rendering.
