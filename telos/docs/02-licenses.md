# 02 — Licenses

Original code: Apache-2.0. **Language rule: TS / Rust / Py only. No PHP.**

## Fork-bases (we build ON these — see `upstream/`)

| Upstream | License | Language | Rule |
|---|---|---|---|
| **Dokploy** | Apache-2.0 | TypeScript | Fork-base for Recoder Cloud. Replaces Coolify (PHP, off-limits). |
| **E2B** | Apache-2.0 | Go + TS/Py | Fork-base for the sandbox runtime. |

## Dropped

| Upstream | Why |
|---|---|
| Coolify | PHP/Laravel — language off-limits. Use Dokploy. |
| Daytona | `daytonaio/daytona` unmaintained since June 2026 (core went private); public repo is a tombstone. Use E2B. |
| OpenHands | Competing Python agent, not infra. Recoder's agents are Claude Code / Codex / Cursor in worktrees. |

## Engine toolchains (USED inside the sandbox, NOT forked — see `docs/10-engines.md`)

| Tool | License | Rule |
|---|---|---|
| Godot | MIT | Installed in golden image; `--headless --export`. Never fork, never editor-MCP. |
| Bevy | MIT/Apache | Rust crate dep inside the sandbox; `cargo build`. |
| Unity / Unreal | proprietary | BYO seat, gold image, no redistribution of editor. CLI/commandlets only. |
| Firecracker | Apache-2.0 | sandbox isolation, later |

If unsure, put the code in a separate process and document the license in this file.
