# shared (`@recoder/shared`)

> Code documentation for `/Users/arhansubasi/recoder.xyz/shared`.
> Verified by reading source on 2026-07-01. Accuracy over completeness — sections only describe code that was read.

## 1. Purpose

`@recoder/shared` is a **private, source-only TypeScript workspace package** (`shared/package.json:2-5`, `"private": true`, `main`/`types` point at `./src/index.ts`). It holds platform-agnostic code shared across multiple Recoder surfaces so that the same message types, streaming parsers, tool-display logic, billing-error classes, animation hooks, and the A2A interop layer are defined once and consumed identically by web, desktop, mobile, and the backend.

The package ships **TypeScript source, not a build** — consumers import `./src/*.ts` directly through the workspace. Verified consumers (via `"@recoder/shared"` in their `package.json`): `apps/desktop/cockpit`, `apps/mobile`, and `docker-backend`. The README still frames it as "AgentPress frontend (Next.js) and mobile (React Native)"; that framing is stale relative to the actual `exports`/consumers, which now also include the Preact cockpit, the backend, and an `opencode-client`. Within the platform it sits below the apps as a leaf utility/contract package — the heavyweight Agent OS contracts live in `packages/agent-os` etc., while `shared` carries the UI-adjacent and A2A wire glue.

## 2. Layout

Top-level (real structure under `shared/`):

| Path | Holds |
|------|-------|
| `src/index.ts` | Main barrel. Re-exports types, streaming, tools, utils, animations, constants, errors, opencode-client. **Note: does NOT re-export `a2a`** (server-only, see `src/index.ts:33`). |
| `src/types/` | Core shared types: `messages.ts` (UnifiedMessage etc.), `streaming.ts`, `sandbox.ts` (`SandboxStatus` union — Daytona state + health), `index.ts` barrel. |
| `src/streaming/` | Real-time stream handling: `utils.ts`, `tool-accumulator.ts`, `text-ordering.ts`, `message-handler.ts`, `use-agent-stream-core.ts`. |
| `src/tools/` | Tool-call display + parsing: `display-names.ts`, `icon-keys.ts` (string keys, not components), `formatter.ts`, `parser.ts`, `tool-call-utils.ts`, `content-preprocessor.ts`. |
| `src/utils/` | Generic helpers: `json.ts` (`safeJsonParse`), `grouping.ts` (`groupMessages`), `dirty-json-parser.ts`, `normalizers.ts`, `string.ts`, `unicode.ts`, `url-autolink.ts`, `credit-formatter.ts`. |
| `src/animations/` | Streaming text/animation hooks with a **split impl/binding pattern** (see Patterns). Includes `preact/` subdir for a Preact-bound entry. |
| `src/errors/` | `index.ts` — tier/billing error classes + parsing/formatting helpers (single file, ~607 lines). |
| `src/constants/` | `upload-limits.ts`. |
| `src/a2a/` | Agent-to-Agent interop: envelope types/schemas (Zod), bridge helpers, control plane, persistent services, Redis persistence, error contract, OpenClaw adapter, connector RFCs, snapshot fixtures. **Server-only.** |
| `src/opencode-client.ts` | HTTP client for an opencode backend service (REST over Bun/Hono). |
| `dist/` | **gitignored build output** — not the source of truth. |
| `node_modules/` | workspace deps. |
| `README.md`, `tsconfig.json`, `vitest.config.ts`, `package.json` | package metadata. |

## 3. Entry points

Start reading here:

- **`shared/package.json:7-29` (`exports` map)** — the authoritative list of public subpaths. Key entries: `.` → `src/index.ts`, `./types`, `./types/sandbox`, `./streaming`, `./tools`, `./utils`, `./animations`, `./animations/preact`, `./a2a`, `./a2a/schemas`, `./constants`, `./errors`, `./opencode-client`.
- **`src/index.ts`** — main barrel. The comment at `src/index.ts:33` documents the deliberate exclusion of `a2a` from the default export because it pulls in Redis/server deps.
- **`src/a2a/index.ts`** — A2A surface. Note the selective re-export logic at `src/a2a/index.ts:9-12` (`TaskState` collision between `control-plane.ts` and `schemas/task-envelope.ts` is resolved by excluding the schemas copy).
- **`src/a2a/schemas/index.ts`** — canonical control-plane schemas barrel (task envelope, audit event, recoder wire envelope, error taxonomy).
- **`src/a2a/types.ts:6-8`** — A2A protocol/version constants (`RECODER_A2A_PROTOCOL_VERSION = '0.3.0'`, envelope version `'2026-02-14'`, text prefix `recoder.a2a.envelope:`).
- **`src/errors/index.ts`** — entry for billing/tier error handling used by app UIs.
- **`src/opencode-client.ts:18`** — `OpencodeClientConfig` / `createRecoderOpencodeClient` factory.

## 4. Build / run / test

Real scripts from `shared/package.json:30-35`:

| Command | What it does |
|---------|--------------|
| `pnpm typecheck` | `tsc --noEmit` (tsconfig has `"noEmit": true` — there is **no build step**; consumers use source). |
| `pnpm test` | `vitest --run` (all `*.test.ts` and `__tests__/**`). |
| `pnpm test:contracts` | `vitest --run src/a2a/schemas/__tests__/` — A2A schema/connector contract tests. |
| `pnpm test:watch` | `vitest` in watch mode. |

- Test runner config: `vitest.config.ts` — `environment: 'node'`, includes `src/**/*.test.ts` and `src/**/__tests__/**/*.test.ts`, `testTimeout: 15000`.
- TS config: `tsconfig.json` — `target ES2022`, `moduleResolution: bundler`, `jsx: react-jsx`, `strict: true`, `noEmit: true`, types `["react","react-dom"]`, excludes `node_modules`/`dist`.
- Dependencies: runtime `zod ^3.25`, `zustand ^5.0`; **peerDependency** `react ^18 || ^19`.

There is no Makefile/Cargo/pyproject here — it is a pnpm workspace TS package only.

## 5. Key patterns & contracts

- **Source-only package.** `main`/`types`/all `exports` point at `.ts`/`.js` under `src/`. Nothing is published; consumers compile it as part of their own builds. Do not assume a built artifact exists.
- **Split impl + framework binding (animations).** Each hook has a `*.impl.ts` factory that takes hook primitives, plus a thin `*.ts` that binds them. Example: `use-smooth-text.ts:15` calls `createUseSmoothText({ useState, useEffect, useRef })` from `react`, while `animations/preact/use-smooth-text.ts` binds the same factory to `preact/hooks`. This lets a Preact app (the cockpit) consume the hooks **without** `preact/compat`. The `'use client'` directive is present (`use-smooth-text.ts:1`).
- **A2A is server-only and imported via subpath.** `@recoder/shared/a2a` is intentionally excluded from the root barrel because `redis-persistence.ts` and `control-plane.ts` carry server concerns (`src/a2a/redis-persistence.ts:1-12` imports the control plane + persistent services; `RedisKvClient` interface is the injected Redis seam). Import A2A only from `@recoder/shared/a2a` or `@recoder/shared/a2a/schemas`, never the default export.
- **A2A envelope contract.** Canonical wire types in `src/a2a/types.ts`: `RecoderAgentIdentity`, `RecoderAgentPlatform` union (recoder/cursor/windsurf/replit/codex/claude_code/recoder_app/... `src/a2a/types.ts:33-45`), `RecoderIntent`, and payload kinds (`text`/`json`/`command`/`artifact`). Zod schemas back these in `schemas/recoder-envelope.ts` (re-exported with `getRecoderA2AEnvelopeSchema` for strict vs lax selection). Bridge helpers (`codexToEnvelope`, `envelopeToClaudeCode`, `envelopeToA2ATextPart`, `createRecoderAgentCard`) normalize Codex/Claude Code/A2A messages into one envelope.
- **Control-plane schemas.** `schemas/task-envelope.ts` defines `TaskState`/`TaskStateEnum`, `TASK_STATES`, `TERMINAL_TASK_STATES`, `ALLOWED_STATE_TRANSITIONS`, `isValidTransition`, `transitionTaskEnvelope`, `createTaskEnvelope`. `schemas/audit-event.ts` and `schemas/error-taxonomy.ts` provide `createAuditEvent` and the `A2A_ERROR_CODE_REGISTRY` / `buildA2AError` / `A2AStructuredError` error taxonomy. There are snapshot fixtures (`snapshots/*.json`) and contract tests guarding these.
- **Tier/billing error contract (`src/errors/index.ts`).** Typed `Error` subclasses (`AgentRunLimitError`, `AgentCountLimitError`, `ProjectLimitError`, `BillingError`, `TriggerLimitError`, `ModelAccessDeniedError`, `CustomWorkerLimitError`, `ThreadLimitError`, `RequestTooLargeError`, `NoAccessTokenAvailableError`). `parseTierRestrictionError(error)` keys off HTTP **402** + an `error_code` (e.g. `AGENT_RUN_LIMIT_EXCEEDED`, `INSUFFICIENT_CREDITS`) to produce the right class; `extractTierLimitErrorState` / `formatTierLimitErrorForUI` turn them into UI title/subtitle. Each class uses `Object.setPrototypeOf(this, X.prototype)` for cross-bundle `instanceof` correctness.
- **Icon keys, not components.** `tools/icon-keys.ts` returns string keys (e.g. `'globe'`); each app maps keys → `lucide-react` vs `lucide-react-native` components. The package deliberately ships **no** icon components, hooks beyond animations, UI, API calls, or navigation (README "What's NOT in This Package").

## 6. Gotchas

- **`a2a/` has untracked compiled `.js`/`.d.ts` sitting next to `.ts` source.** Files like `src/a2a/index.js`, `bridge.js`, `types.d.ts`, `schemas/*.js` exist on disk but are **not git-tracked** (verified: `git ls-files` returns only the `.ts`; `index.js`/`bridge.js` are untracked). They appear to be stray build artifacts. The `a2a` export map (`package.json:16-25`) even resolves `require` to `./src/a2a/index.js` — so CJS consumers depend on these untracked `.js` files being regenerated locally. Treat the `.ts` as source of truth; a fresh checkout will not have the `.js` and CJS `require` of `@recoder/shared/a2a` may break until they are rebuilt.
- **`dist/` is gitignored** (`git check-ignore` confirms) and is NOT the source of truth — `main`/`types` point at `src/`. Ignore `dist/` when reading; do not edit it.
- **`a2a` is excluded from the root barrel on purpose.** Importing `@recoder/shared` will not give you A2A symbols. If you need them, import `@recoder/shared/a2a` directly, and be aware it can transitively pull Redis/server code (`redis-persistence.ts`), so it is unsafe to bundle into a pure-client target.
- **`TaskState` name collision.** Both `a2a/control-plane.ts` and `a2a/schemas/task-envelope.ts` export a `TaskState`. The `a2a/index.ts` barrel re-exports control-plane's and explicitly omits the schemas' to avoid the clash (`src/a2a/index.ts:9-12`). Use `@recoder/shared/a2a/schemas` if you specifically want the schema-side surface.
- **README is partly stale.** It describes the package as web+mobile only and lists a smaller structure; the real `exports`/consumers include the Preact cockpit (`animations/preact`), `docker-backend`, `errors`, `constants`, and `opencode-client`. Trust `package.json` `exports` over the README's "Package Structure" diagram.
- **No build = consumer toolchains must understand TS source.** Because everything resolves to `.ts`, any consumer that cannot transpile workspace TS (e.g. a plain Node CJS context) relies on the untracked `.js` artifacts noted above. This is a known fragility around the `a2a`/CJS path.
- **Vendored/third-party note:** nothing in `shared/src` is a vendored third-party subtree; it is all first-party Recoder code. The `a2a/adapters/openclaw/` directory is a first-party adapter (mapper + validation) for OpenClaw gateway events, not a vendored copy of OpenClaw.

---

*Verification done by reading: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/a2a/index.ts`, `src/a2a/schemas/index.ts`, `src/a2a/types.ts`, `src/a2a/redis-persistence.ts`, `src/errors/index.ts`, `src/animations/index.ts` + `preact/index.ts` + `use-smooth-text.ts`, `src/streaming/index.ts`, `src/types/sandbox.ts`, `src/opencode-client.ts`, and `git ls-files`/`git check-ignore` for tracking status. Not every utility file was opened individually; the `utils/`, `streaming/`, and `tools/` file lists come from directory listing.*
