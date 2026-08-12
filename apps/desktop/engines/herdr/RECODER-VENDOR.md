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

Toolchain pinned by `rust-toolchain.toml` (Rust 1.96.1). Binary: `herdr` v0.8.0.

```bash
cargo build --release --locked   # -> target/release/herdr
```

## Integration status (Recoder engine)

- [x] Source vendored + license/NOTICE compliance.
- [ ] Rust binary built + packaged into the desktop DMG (like the openfang sidecar).
- [ ] `herdr-substrate.adapter.ts` — drive herdr's JSON socket API (`agent.*`,
      `pane.*`, `worktree.*`, `events.*`) to implement Recoder's `EngineSubstrate`
      port as a third substrate beside tmux and acp.
- [ ] Full Recoder rebrand of the vendored source.

Tracked in bd (`absorb`/`herdr` labels).
