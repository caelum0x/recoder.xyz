# Recoder vendored connector — cloudroom

**Upstream:** Cloudroom core — https://github.com/davidondrej/cloudroom-core @ v0.1.63 (`39151fa3ad5b30586691981c20f1fdb3342bdf4e`)

**License:** Apache-2.0 (retained at `./LICENSE`)

**Artifact:** macOS arm64 Mach-O executable, built locally from unmodified upstream source
with `cargo build --locked --release` (Rust 1.94.0)

**SHA-256:** `4c665c99ac78bdd31c459825af53b2f679f30dd980d7d7ddbe3e274534468fd7`

Cloudroom core is a self-hostable Rust runtime that runs coding-agent CLIs
(Claude Code, Codex, Pi, OpenCode, Hermes, Cursor, Devin) and keeps their chat
history, exposing a localhost-only, token-authed HTTP API
([docs](https://github.com/davidondrej/cloudroom-core/tree/main/docs)). Each
agent runs as its own unprivileged Linux user with no `sudo`.

Recoder already runs agents in parallel isolated git worktrees locally and
ships cloud execution via Daytona/E2B sandboxes (`telos/upstream/resandbox`,
a vendored E2B fork) — but those are stateless, freshly-provisioned sandboxes.
Cloudroom core's distinct capability is **mid-task session continuity**: its
desktop companion ([cloudroom-gui](https://github.com/davidondrej/cloudroom-gui),
evaluated and NOT vendored — redundant with Recoder's own Wave-derived
frontend, see `apps/desktop/CLAUDE.md`) can move a running agent session from
a local machine to a cloud-hosted `cloudroom` instance without losing context.
That's a real gap versus the existing Daytona/E2B path and the reason this
engine is vendored.

**Status: vendored and built, not yet wired as a live client** — same
maturity stage as `apps/desktop/server/engines/ziti` and
`apps/desktop/server/engines/recoder-xds` (see `docs/RECODER-ARCHITECTURE.md`
engine table). No RunEvent/MCP adapter has been added; the governed
cloud-domain write seam (`backend/src/domains/cloud/cloud-module.ts`) was
deliberately left untouched — wiring a new write-capable adapter into that
governed mesh-fabric seam needs its own task spec and approval gate, not a
drive-by addition. Deferred to the cloud/teams tier.

Refresh by cloning the pinned tag, running `cargo build --locked --release`,
verifying the upstream LICENSE is unchanged, copying the binary here, then
updating the version/commit/checksum above.
