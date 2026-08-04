# Desktop Cross-Platform Packaging Readiness (Windows / Linux)

Status: **STAGING + HONEST ASSESSMENT — not a shippable build.** (bd recoder-di8l)

The desktop app (`apps/desktop`) is a Wave/Electron fork whose only packaged,
booted, and shipped target today is **macOS arm64**. This document audits every
architecture/OS-sensitive bundled artifact, records the exact per-OS build
recipe, and states plainly what is **code-ready** vs **hardware-gated**.

The electron-builder config now carries **inert, env-gated** Windows and Linux
target blocks (`apps/desktop/app/electron-builder.config.cjs`). They are OFF by
default: with `RECODER_BUILD_TARGETS` unset the config is byte-identical to the
mac-only config, proven by `apps/desktop/app/tests/packaging-config.test.ts`.
Turning them on produces electron-builder config, **not** a runnable app — the
native engine artifacts do not yet exist for those platforms.

## How the staged targets are gated

```
RECODER_BUILD_TARGETS=""            → mac-only config (default, unchanged)
RECODER_BUILD_TARGETS="win"         → + config.win  (nsis + portable, x64)
RECODER_BUILD_TARGETS="linux"       → + config.linux (AppImage + deb, x64)
RECODER_BUILD_TARGETS="win,linux"   → both
```

Same env-gate shape as the existing `RECODER_MAC_ARCH`. x64 only — no
Windows-arm64 / Linux-arm64 native artifacts are built yet.

The fail-loud `beforePack` gate is now **OS-aware**: the Mach-O CPU-arch check
(`build/assert-extra-resources.cjs`) only runs for the `darwin` target, because
every path in `ARCH_SENSITIVE_EXTRA_RESOURCES` is a darwin `.node`/binary. Off
darwin the gate keeps the fail-loud **existence** check but **truthfully skips**
the CPU-arch check — reading a mac Mach-O header against a Windows/Linux target
would either falsely reject or falsely pass. Per-platform native validation must
happen on the target machine (see recipe below).

## Per-artifact audit

Arch on disk verified via `file(1)` / Mach-O + ELF headers. "Prebuild" = a
ready-made per-platform binary already fetchable; "cross" = buildable from a mac
host with a cross toolchain; "on-target" = must be built/booted on a real
Windows/Linux machine.

| Artifact | Kind | On disk today | win-x64 path | linux-x64 path | Verdict |
|---|---|---|---|---|---|
| `recoder-governance-napi.node` | Rust NAPI cdylib | arm64 Mach-O | `cargo build --release --target x86_64-pc-windows-msvc` (or `-gnu`) → rename to `.node` | `cargo zigbuild --target x86_64-unknown-linux-gnu` → rename | **Hardware-gated** — no prebuild; `scripts/build-native-addons.sh` builds host-only (no `--target`), must be extended + run per platform |
| `openfang_napi.node` | Rust NAPI cdylib | arm64 Mach-O | same as governance | same as governance | **Hardware-gated** — same story |
| `tensorzero_gateway_napi.node` | Rust NAPI cdylib | arm64 Mach-O | same as governance | same as governance | **Hardware-gated** — plus the SQLX_OFFLINE build landmine (root `.env` must stay dotenvy-parseable; `SQLX_OFFLINE=1`) |
| `lance_npm_bindings.node` | Rust NAPI cdylib | **absent** (optional) | not vendored | not vendored | **Absent everywhere** — already in `OPTIONAL_EXTRA_RESOURCES`; degrades to Qdrant/no-op; no cross-platform concern |
| beads `bd` | Go binary | arm64 Mach-O | `GOOS=windows GOARCH=amd64 go build` | `GOOS=linux GOARCH=amd64 go build` | **Code-ready** — Go cross-compiles cleanly (build cmd in `apps/desktop/server/engines/beads`); not in git (>100MB), built per platform in CI |
| tmux | C binary (`apps/desktop/engines/tmux/tmux`) | arm64 Mach-O | **no native Windows tmux** | build/install on-target (trivial) | **Hard blocker on native Windows** — conductor tmux-driver needs a WSL or ConPTY/dmux fallback there; Linux is easy |
| dmux launcher | `#!/usr/bin/env node` script | text (portable) | works as-is | works as-is | **Code-ready** — pure Node, platform-independent (its `dist/` is portable JS) |
| node-pty | N-API prebuilds | ships `win32-x64`, `win32-arm64`, `darwin-*` | **prebuild present** (`win32-x64/pty.node`) | **no linux prebuild** → `node-gyp rebuild` on-target (needs python + build-essential) | **win: code-ready · linux: on-target rebuild** |
| better-sqlite3 | `prebuild-install` native | arm64 bundle | prebuild-install fetches win-x64 for the Electron ABI (`--runtime=electron`) | prebuild-install fetches linux-x64 | **Code-ready** — via `electron-rebuild`/`prebuild-install`; verify Electron ABI match |
| duckdb | npm dep | no `.node` built; **no `backend/src` usage found** | n/a | n/a | **No concern** — unused/transitive; no native binding shipped |
| `recoder-server` | Go binary (CGO) | `recoder-server.arm64` | `task build:server:windows` (`platforms:[windows]`; `CC="zig cc -target x86_64-windows-gnu"`) → `recoder-server.x64.exe` | `task build:server:linux` (`platforms:[linux]`; `CC="zig cc -target x86_64-linux-gnu.2.28"`) | **On-target** — CGO_ENABLED=1 (sqlite); Taskfile restricts each build to its own OS despite the zig cross-linker |
| `wsh` | Go binary (CGO_ENABLED=0) | per-OS in `dist/bin` | `GOOS=windows` cross | `GOOS=linux` cross | **Code-ready** — pure Go, cross-compiles |
| Electron runtime | electron-builder download | mac | electron-builder pulls win-x64 runtime automatically | pulls linux-x64 runtime automatically | **Code-ready** — handled by electron-builder |
| Icons | `build/icon.ico`, `build/icon.png` | present | `icon.ico` ✓ | `icon.png` ✓ | **Code-ready** — both assets checked in |

## Build recipe per OS

Both recipes require the target OS (or a CI runner for it). Cross-packing a
runnable Windows/Linux app **from a mac host is not possible** because three
classes of artifact resist it: the Rust NAPI addons and the CGO `recoder-server`
need per-platform native toolchains, and tmux has no native Windows equivalent.

### Windows x64 (on a Windows machine / windows-latest runner)

1. Build the 3 Rust NAPI addons for `x86_64-pc-windows-msvc`, place each at the
   `target/release/*.node` path in `ARCH_SENSITIVE_EXTRA_RESOURCES`.
2. `cd apps/desktop/server/engines/beads && go build -o bin/bd.exe ./cmd/bd`
   (adjust the extraResources `to` for the `.exe`).
3. `task build:server:windows` → `dist/bin/recoder-server.x64.exe` (CGO + zig).
4. Provide a Windows PTY story: node-pty win32-x64 prebuild is present; verify it
   loads under the Electron ABI (`electron-rebuild` if not).
5. Decide the tmux story: native Windows has no tmux — either require WSL or wire
   a ConPTY/dmux fallback in the conductor before shipping.
6. `RECODER_BACKEND_NODE_MODULES=<win deploy node_modules> RECODER_BUILD_TARGETS=win pnpm exec electron-builder -c electron-builder.config.cjs -p never`
7. **Boot test on Windows**: launch the packaged app, confirm the embedded
   backend starts, engines report healthy (or truthfully degraded), a workspace
   and terminal open.

### Linux x64 (on a Linux machine / ubuntu-latest runner)

1. Build the 3 Rust NAPI addons for `x86_64-unknown-linux-gnu` (`cargo zigbuild`
   or native), place at the ARCH_SENSITIVE paths.
2. `cd apps/desktop/server/engines/beads && go build -o bin/bd ./cmd/bd`.
3. `task build:server:linux` → `dist/bin/recoder-server.x64` (CGO + zig).
4. `node-gyp rebuild` node-pty for linux-x64 under the Electron ABI (no prebuild
   ships); install tmux on-target or bundle a built one.
5. `RECODER_BACKEND_NODE_MODULES=<linux deploy node_modules> RECODER_BUILD_TARGETS=linux pnpm exec electron-builder -c electron-builder.config.cjs -p never`
6. **Boot test on Linux**: AppImage + `.deb` install, backend starts, engines
   healthy/degraded truthfully, workspace + terminal open.

## Honest verdict

- **Code-ready (this change):** the electron-builder win/linux target blocks, the
  env gate, the OS-aware `beforePack`, the icons, and the pure-Go/pure-Node
  artifacts (`bd`, `wsh`, `dmux`, better-sqlite3 via prebuild-install, node-pty
  on Windows). These can be turned on without further code.
- **Hardware-gated:** an actually runnable Windows or Linux app. It requires
  real Windows and Linux machines (or CI runners) to (a) build the 3 Rust NAPI
  addons and the CGO `recoder-server`/wsh natively, (b) rebuild node-pty on
  Linux, and (c) run the boot tests. None of this is verifiable on the current
  arm64-mac host.
- **Open design blocker (Windows):** tmux has no native Windows build. The
  conductor's terminal/tmux path needs a WSL requirement or a ConPTY-based
  fallback decided before a Windows build can be called usable.

No Windows or Linux artifact in this repo has been built or booted. This document
and the staged config are the readiness surface, not a claim of a working build.
