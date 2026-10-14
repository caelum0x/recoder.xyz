# @recoder/t3-bridge

The adapter named by `docs/T3CODE-FORK.md` section 3: maps `third_party/t3code`
(pingdotgg/t3code, MIT) session/terminal wire contracts to Recoder's
governance `CommandGate` + `@recoder/agent-os` `ApprovalService`. This is the
ONLY package allowed to import `@t3tools/*` directly outside the two
composition seams the fork doc names.

## What's here

- `src/terminal-command-gate.adapter.ts` — `createT3TerminalCommandGate`, the
  governance seam (patch-queue item #2: "orchestration-v2 `CommandPolicy` +
  `EffectWorker` call the Recoder backend over loopback before every
  write/merge/other side effect"). A t3 terminal write (wire-shaped exactly
  like `@t3tools/contracts`'s `TerminalWriteInput`) is gated through
  `@recoder/governance`'s `CommandGate` before delivery — same fail-closed
  contract, same durable audit log, same `ApprovalService`-backed approval
  surface as `backend/src/domains/governance/adapters/command-gate.adapter.ts`
  (the Loom raw-PTY steer gate this mirrors).
- The `@t3tools/contracts` import is `import type` only — erased at build —
  so `effect` and the vendored t3code tree never reach a consumer's runtime
  dependency graph; they're devDependencies here only (needed to generate
  this package's own `.d.ts`).

## Build

```bash
pnpm install --filter @recoder/t3-bridge...
pnpm --filter @recoder/t3-bridge run build
```

## Test

```bash
pnpm --filter @recoder/t3-bridge run test        # node:test — 6 bridge unit tests
```

`tests/t3-contracts-compatibility.test.ts` is the one test file that imports
the REAL vendored `@t3tools/contracts` at runtime (not just as a type): it
decodes a payload with t3's own `effect/Schema` `TerminalWriteInput` schema —
exactly as `third_party/t3code/apps/server` would decode an incoming RPC
call — and proves that decoded value reaches `CommandGate` → `needs_approval`
→ `ApprovalService` and is denied-by-default for a destructive command.
`third_party/t3code/apps/server` itself is NOT a live build target yet (see
`docs/T3CODE-FORK.md` section 9), so this is the honest substitute: it proves
the bridge against the real contract schema without requiring the full t3
Effect-TS server process to boot.

## Why `third_party/t3code/packages/{contracts,shared}` are root pnpm-workspace members

`pnpm-workspace.yaml` lists only these two pure-schema t3code packages
explicitly (not a glob over `third_party/t3code/**`) — deliberately NOT
`apps/server`, `apps/web`, `apps/mobile`, `packages/ssh`, `packages/tailscale`,
`packages/effect-acp`, `packages/effect-codex-app-server`,
`packages/client-runtime`. Those pull t3code's own huge Effect/Expo/Electron
dependency tree and are out of scope until a future session wires the actual
terminal/ACP seams. `third_party/t3code/pnpm-workspace.yaml` (its own nested
workspace manifest, used for the subtree's own `git subtree pull` upstream
syncs) is untouched.

Because `@t3tools/contracts`/`@t3tools/shared` declare `"effect": "catalog:"`
and this repo's root `package.json` has `"pnpm.overrides": { "effect":
">=3.20.0" }` (a security-floor pin shared by every package in the monorepo,
e.g. `@recoder/opencode-plugin`'s `effect: ^3.21.0`), three SCOPED overrides
were added instead of touching that global floor:

```json
"@t3tools/contracts>effect": "4.0.1",
"@t3tools/shared>effect": "4.0.1",
"@recoder/t3-bridge>effect": "4.0.1"
```

This pins `effect@4.0.1` (t3code's own pin, `third_party/t3code/pnpm-
workspace.yaml`'s catalog) for exactly these three edges, leaving every other
package's `effect: >=3.20.0` floor untouched. `pnpm-workspace.yaml`'s root
catalog also gained `effect`, `@effect/platform-node`, `@effect/vitest`,
`@noble/curves`, `@noble/hashes`, `jose`, `vite-plus`, `yaml` — the exact
subset `contracts`/`shared` need, pinned to t3code's own versions.

`packages/t3-bridge/tsconfig.json` sets `allowImportingTsExtensions: true` +
`noEmit: true` — required because `@t3tools/contracts`'s package.json
`exports` map points `types`/`import` straight at SOURCE `.ts` files (not a
prebuilt `dist/`), and t3code's own source uses explicit `.ts` import
extensions (its own `tsconfig.base.json` convention). Without this flag,
`tsc` errors on every relative import inside the vendored source the moment
it's pulled in as a type dependency.

## A real tsx bug this session worked around (`agent-runtimes/loom` → `loom-client`)

Making the embedded backend boot in dev (`pnpm run dev` / `tsx watch
src/server.ts`) surfaced a genuine `tsx@4.23.1` (latest as of this session)
resolution bug, unrelated to t3code: for a package.json `exports` map with a
NAMED SUBPATH (e.g. `"./loom": {"types": "...", "import": "...", "require":
"..."}`) PLUS a matching `tsconfig.json` `"paths"` entry pointing at the same
subpath's `.d.ts` file (a pre-existing, repo-wide pattern used because
`backend/tsconfig.json` has no `moduleResolution` override, so `tsc`'s
default `node10`/classic resolver can't see `exports` subpaths at all —
`@recoder/agent-instructions/agent-os-compiler` and several `@recoder/
connectors/*` subpaths use the identical "paths"-alias-to-.d.ts workaround),
`tsx`'s RUNTIME resolver (not `tsc`) ALSO reads that same `tsconfig.json`
`"paths"` entry and loads the `.d.ts` file in place of the real `.js`/`.mjs`
— producing an empty module at runtime (every named export `undefined`,
`TypeError: ... is not a constructor` on first use). Verified reproducible
in isolation (`require.resolve('@recoder/agent-runtimes/loom')` under tsx
resolved to `dist/loom.d.ts`, not `dist/loom.js`/`.mjs`, while a renamed key
with NO matching `tsconfig.json` "paths" entry resolved correctly) and
confirmed NOT present under plain `node` or `node --experimental-strip-
types` (only tsx's loader hook has it).

Fix applied (`packages/agent-runtimes/package.json` + the ~18 backend
callers + `backend/tsconfig.json`): renamed the subpath `"./loom"` →
`"./loom-client"` (no tsconfig "paths" entry exists for the new name, so tsx
correctly falls through to the package's real `exports` map) and ADDED
`packages/agent-runtimes/loom-client/package.json` (a classic nested-
directory `main`/`module`/`types` shim pointing into `../dist/loom.*`) so
`tsc`'s `node10` resolver can see the subpath WITHOUT needing a `"paths"`
entry at all, closing the loop without reintroducing the bug. This is a
narrow, mechanical, reversible workaround for a third-party tool bug — not an
architectural change — and it is what let the embedded backend reach
`recoder-backend listening` in dev for the first time in this repo's history
(prior sessions' `plans/recoder.md` entries describe the backend as not
booting past `MODULE_NOT_FOUND` cascades in a fresh worktree).

## Bootstrap: embedded backend boot in a fresh worktree (verified this session)

```bash
# 1. Build the @recoder/* dependency graph the backend needs (fixes several
#    pre-existing, t3-unrelated build errors this session also resolved:
#    missing @types/better-sqlite3 in mem0, missing dom lib in agent-browser's
#    tsconfig, missing esbuild externals in sandbox-daytona, a missing
#    @smithy/types dep + an AWS SDK middleware-overload mismatch in pi-ai, a
#    missing @recoder/auth dependency + two real type errors in backend).
pnpm install --filter "recoder-backend..." --filter "recoder-main-app..." --filter "@recoder/conductor-ui..."
pnpm -r --filter "recoder-backend..." --filter "recoder-main-app..." --filter "@recoder/conductor-ui..." --if-present --no-bail run build

# 2. Build the desktop app's Go server binaries (not committed):
bash scripts/build-recoder-desktop-server.sh

# 3. Install the desktop app's own deps (Electron native rebuild included):
pnpm install --filter "recoder-terminal..."

# 4. Launch in dev (WCLOUD_ENDPOINT is a dev-mode-only upstream Wave check —
#    any https URL satisfies it; real value not required in dev):
cd apps/desktop/app
WCLOUD_ENDPOINT=https://example.com pnpm run dev
```

Verified this session: `recoder-backend listening` + `edge listening` fire in
the Electron main process's embedded backend-supervisor; the renderer shows
real content (the "Welcome to Recoder" onboarding dialog, workspace/terminal/
files/web/apps/settings sidebar) — NOT just a blank window / DevTools-only
fallback. On a COLD boot the backend can take >5s (multiple engine daemons
retry with backoff: `ops-recorder`, `colbert`, Loom's `loom.sock` — all
degrade-safe, non-fatal), and the renderer's own `initPromise` has a
hardcoded 5000ms timeout that opens DevTools and leaves the window
`visibility: hidden` if the backend isn't ready in time; a second launch
(warm filesystem/pnpm-store cache) booted inside that window. This timeout
relationship is a real, reproducible dev-mode race — not fixed by this
session (out of scope: it is Wave-fork `emain` init code, not part of the
t3-bridge/governance seam) — documented here so the next session doesn't
have to re-discover it: launch the app, and if the first screenshot shows
only DevTools with `body.init.is-transparent{visibility:hidden}`, kill and
relaunch once.
