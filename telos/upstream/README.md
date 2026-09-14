# upstream/ — fork-bases we build ON (Cursor-way)

Not read-only submodules. These are full-source bases we fork and turn into Recoder
Cloud/Studio, the way Cursor forked VS Code. Language rule: **TS / Rust / Py only. No PHP.**

| Base | Repo | Role | Language | License |
|---|---|---|---|---|
| **dokploy** | Dokploy/dokploy | Deploy / self-host PaaS → Recoder Cloud | TypeScript | Apache-2.0 |
| **e2b** | e2b-dev/E2B | Sandbox runtime (games get bundled here) | Go core + TS/Py SDK | Apache-2.0 |

## Decisions

- **Coolify → Dokploy.** Coolify is PHP/Laravel — off-limits (no PHP). Dokploy is the
  TypeScript Docker-based PaaS equivalent and matches the control plane (`backend/src`, Telos `apps/*`).
- **Daytona dropped.** `daytonaio/daytona` is unmaintained as of June 2026 (core went
  private); public repo is a README tombstone. E2B (Apache, active) is the sandbox base.
- **OpenHands dropped.** It's a competing Python *agent*, not infrastructure. Recoder's
  agents are Claude Code / Codex / Cursor in worktrees; we don't embed an agent loop.

## NOT here: game engines

Bevy / Godot / Unity / Unreal are **not** fork-bases. They are **toolchains used inside
the sandbox** to compile and bundle games (`cargo build`, `godot --headless --export`,
Unity `-batchmode`, Unreal commandlets). They get installed in golden images under
`infra/docker/images/` and invoked behind the daemon — never forked into this tree.
See `docs/10-engines.md` and `docs/08-native-not-mcp.md`.
