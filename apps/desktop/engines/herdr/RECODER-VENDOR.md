# Recoder vendored engine — herdr

**Upstream:** https://github.com/herdrdev/herdr @ v0.8.0
**License:** Apache-2.0 (retained at `./LICENSE`; attribution in the repo-root `NOTICE`)
**Vendored:** 2026-08-12 — wholesale source absorption, same model as the Wave-fork
desktop shell (`apps/desktop`).

## Why

herdr is our direct competitor: an Apache-2.0, open-source, agent-aware terminal
multiplexer ("the runtime your coding agents live on") — tmux-for-agents with a
socket API, git-worktree integration, and per-agent state detection. Being
Apache-2.0 and permissively-dependent (MIT sub-deps only), it is fully absorbable
into Recoder as an engine. See `docs/COMPETITIVE-HERDR.md`.

## What was vendored

The buildable source tree. Excluded to keep the vendor lean: `docs/`, `website/`,
`workers/`, `.git/`, `target/` (marketing + build artifacts, ~10M).

Bundled permissive sub-deps retained under `vendor/`: `libghostty-vt` (MIT),
`portable-pty` (MIT). License audit: no GPL/AGPL/copyleft present.

## Build

Toolchain: Rust 1.96.1 (pinned by `rust-toolchain.toml`) **plus `zig` EXACTLY
0.15.2** — `build.rs` compiles the vendored `libghostty-vt` (Ghostty's VT parser, a
Zig project) via `zig build`, and its `requireZig` check **rejects 0.16+** (breaking
`std.Io` changes). brew ships 0.16.0 (too new); fetch the official 0.15.2 binary and
point `ZIG` at it. Without zig the Rust side compiles but the build fails at the
libghostty-vt step. Binary: `herdr` v0.8.0.

```bash
# zig 0.16 is REJECTED — get exactly 0.15.2:
curl -fsSL https://ziglang.org/download/0.15.2/zig-aarch64-macos-0.15.2.tar.xz | tar xJ
ZIG=$PWD/zig-aarch64-macos-0.15.2/zig cargo build --release --locked   # -> target/release/herdr
```

## Integration status (Recoder engine)

- [x] Source vendored + license/NOTICE compliance.
- [x] Rust binary **builds** (`target/release/herdr`, arm64, v0.8.0) with Rust 1.96.1
      + zig 0.15.2. Restored 2 build-embedded files (`docs/next/api/herdr-api.schema.json`,
      `website/latest.json`) that the initial lean vendor dropped.
- [x] **Phase 0** — NDJSON socket client + protocol types
      (`packages/agent-runtimes/src/adapters/herdr/`), 13/13 tests. See docs/HERDR-INTEGRATION.md.
- [x] **Phase 1** — `herdr-substrate.adapter.ts` (ConductorSubstrate: launch=worktree.create+
      agent.start, capture=agent.read, exitCode/alive=agent.get, diff=host-git, teardown=
      worktree.remove, continueRun=agent.prompt) + `herdr-state.ts` native-attention bypass.
      138 tests; **real-binary smoke PASSED** (spawned `herdr server`, ping protocol 20,
      native worktree create+remove). Recoder now drives the real engine.
- [x] **Phase 2 + 4** — `herdr-path.ts` resolver (env → packaged → dev → PATH) +
      `herdr-daemon.ts` supervisor (Recoder-owned socket, denylist-stripped env,
      real ping-20 health, process-group reap) + `'herdr'` registered as an
      **opt-in/non-default** `WorkspaceSubstrate` (tmux stays default). 1000 tests;
      daemon smoke PASSED via the supervisor. Activate with
      `CONDUCTOR_HERDR_ENABLED=1` + `substrate:'herdr'`.
- [x] **Phase 3** — DMG packaging: electron-builder `extraResources`
      (`../engines/herdr/target/release/herdr` → `backend/engines/herdr/herdr`) + added to
      `ARCH_SENSITIVE_EXTRA_RESOURCES` (Mach-O arm64 gate) + packaging-config test (11/11).
      The Phase-2 resolver lands on the packaged `<resources>/backend/engines/herdr/herdr`.
- [ ] Phase 5 — **full Recoder rebrand** (owner decision 2026-08-12: rebrand, forgo the
      592-plugin ecosystem). Rename binary/env/`herdr-plugin.toml` across the vendored
      source; keep LICENSE + NOTICE (Apache-2 requires attribution even after rebrand). Large.

Tracked in bd (`absorb`/`herdr` labels).
