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
- [ ] Rust binary built + packaged into the desktop DMG (like the openfang sidecar).
- [ ] `herdr-substrate.adapter.ts` — drive herdr's JSON socket API (`agent.*`,
      `pane.*`, `worktree.*`, `events.*`) to implement Recoder's `EngineSubstrate`
      port as a third substrate beside tmux and acp.
- [ ] Full Recoder rebrand of the vendored source.

Tracked in bd (`absorb`/`herdr` labels).
