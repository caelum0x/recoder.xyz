# Recoder product family

**Recoder is the umbrella brand** (the "OpenAI"). Everything below is a Recoder product —
one identity, one control plane (`recoder.xyz` / `backend/src`), many surfaces.

| Product | What it is | Origin | Language | Where |
|---|---|---|---|---|
| **Recoder Terminal** | Desktop terminal IDE — parallel agents in git worktrees | Wave fork | Go + TS | `apps/desktop` |
| **Recoder Cloud** — `recloud` | Deploy / self-host PaaS: branch → preview URL → staging | Dokploy fork | TypeScript | `telos/upstream/recloud` |
| **Recoder Sandbox** — `resandbox` | Sandbox / compute runtime; where builds run and games get bundled | E2B fork | Go + TS/Py | `telos/upstream/resandbox` |
| **Recoder Studio** | Native game runtime — Bevy/Godot player + Playproof + cook | new (Telos) | Rust/C# behind TS daemon | `telos/` (to build) |

## Rules

- **One brand, one control plane.** These are surfaces of Recoder, not separate companies.
  Canonical state (tasks, approvals, memory, billing, identity) stays in `backend/src/domains`.
  See `docs/15-overlap-with-recoder-xyz.md`.
- **Language wall: TS / Rust / Py only. No PHP.** (Why Coolify → Dokploy.)
- **Forks are built ON (Cursor-way), not vendored.** `recloud` and `resandbox` are real
  forks we rebrand and evolve into Recoder products — see each dir's `FORK.md`.
- **Game engines (Bevy/Godot/Unity/Unreal) are sandbox toolchains, not products** — used
  inside `resandbox` to compile/bundle, never forked. See `docs/10-engines.md`.
