# Recoder vendored engine — Loom (originally herdr)

**Upstream:** herdr — https://github.com/herdrdev/herdr @ v0.8.0
**License:** Apache-2.0 (retained at `./LICENSE`; attribution in the repo-root `NOTICE`)
**Vendored:** 2026-08-12 — wholesale source absorption, same model as the Wave-fork
desktop shell (`apps/desktop`). Rebranded to **Loom** (owner decision 2026-08-12);
the Apache-2.0 attribution to herdr is preserved in `./LICENSE` and the repo-root
`NOTICE`.

## Why

herdr (now vendored + rebranded as the **Loom** engine) was our direct competitor:
an Apache-2.0, open-source, agent-aware terminal multiplexer ("the runtime your
coding agents live on") — tmux-for-agents with a socket API, git-worktree
integration, and per-agent state detection. Being Apache-2.0 and
permissively-dependent (MIT sub-deps only), it is fully absorbable into Recoder as
an engine. See `docs/COMPETITIVE-HERDR.md`.

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
libghostty-vt step. Binary: `loom` v0.8.0.

```bash
# zig 0.16 is REJECTED — get exactly 0.15.2:
curl -fsSL https://ziglang.org/download/0.15.2/zig-aarch64-macos-0.15.2.tar.xz | tar xJ
ZIG=$PWD/zig-aarch64-macos-0.15.2/zig cargo build --release --locked   # -> target/release/loom
```

## Integration status (Recoder engine)

- [x] Source vendored + license/NOTICE compliance.
- [x] Rust binary **builds** (`target/release/loom`, arm64, v0.8.0) with Rust 1.96.1 + zig 0.15.2. Restored 2 build-embedded files (`docs/next/api/loom-api.schema.json`,
      `website/latest.json`) that the initial lean vendor dropped.
- [x] **Phase 0** — NDJSON socket client + protocol types
      (`packages/agent-runtimes/src/adapters/loom/`), 13/13 tests. See docs/LOOM-INTEGRATION.md.
- [x] **Phase 1** — `loom-substrate.adapter.ts` (ConductorSubstrate: launch=worktree.create+
      agent.start, capture=agent.read, exitCode/alive=agent.get, diff=host-git, teardown=
      worktree.remove, continueRun=agent.prompt) + `loom-state.ts` native-attention bypass.
      138 tests; **real-binary smoke PASSED** (spawned `loom server`, ping protocol 20,
      native worktree create+remove). Recoder now drives the real engine.
- [x] **Phase 2 + 4** — `loom-path.ts` resolver (env → packaged → dev → PATH) +
      `loom-daemon.ts` supervisor (Recoder-owned socket, denylist-stripped env,
      real ping-20 health, process-group reap) + `'loom'` registered as the
      **default** `WorkspaceSubstrate`. 1000 tests; daemon smoke PASSED via the
      supervisor. `CONDUCTOR_LOOM_DISABLED=1` is the explicit tmux fallback.
- [x] **Phase 3** — DMG packaging: electron-builder `extraResources`
      (`../engines/loom/target/release/loom` → `backend/engines/loom/loom`) + added to
      `ARCH_SENSITIVE_EXTRA_RESOURCES` (Mach-O arm64 gate) + packaging-config test (11/11).
      The Phase-2 resolver lands on the packaged `<resources>/backend/engines/loom/loom`.
- [x] Phase 5 — **full Recoder rebrand** (owner decision 2026-08-12: rebrand, forgo the
      592-plugin ecosystem). Renamed binary/env/`loom-plugin.toml`/socket/XDG-dir across the
      vendored source and the Recoder integration; kept LICENSE + NOTICE + ported-file
      attribution headers (Apache-2 requires attribution to herdr even after rebrand).
- [x] **Wave terminal bridge** — public `pane.terminal.stream` frames flow through the
      typed Node socket client and session-authenticated backend websocket into the
      Wave `recoder-loom-terminal` block. Resize and scroll return to Loom; keyboard
      input returns through Conductor's governed substrate-aware steer path.

## Upstream sync status

- Imported baseline: HERDR v0.8.0.
- Current reviewed upstream release as of 2026-08-30: v0.8.2.
- Selectively absorbed from v0.8.2 on 2026-08-30:
  - configurable 120×40 headless geometry, including pre-view pane sizing and
    no-client/live-reload fallback behavior;
  - blocked-agent rejection for `agent.prompt` and Copilot focus-before-submit;
  - Qwen Code npm-wrapper process detection, screen-state manifest, and native
    `qwen --resume <session>` planning.
- Already present in the fork before this review: startup-readiness waiting,
  alternate-screen reads, window-title synchronization, pane/tab movement and
  resize controls, outer pane borders, right-click routing, and hidden-pane render
  suppression.
- The crate remains versioned `0.8.0` because this is a selective substrate sync,
  not a byte-for-byte import of all 133 commits/490 changed files in v0.8.2.
- Remaining review work: classify the rest of v0.8.1/v0.8.2 into runtime fixes to
  port, Wave-owned UI to exclude, marketplace features to exclude, and behavior
  superseded by Recoder governance.

Tracked in bd (`absorb`/`loom` labels).
