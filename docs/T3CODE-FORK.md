# t3code fork: planned subtree, patch queue, sync policy

Status: **design only — nothing imported yet.** This document is the
referenced patch-queue target from `docs/RECODER-T3CODE-COMPOSITION.md`
section 7 ("Repo mechanics and upstream sync"). Read that file first for the
*why* (the composition design: t3 owns sessions/transport/clients, Recoder
owns governance/merge/evidence, Wave owns windows/tabs/tiling) and the
piece-by-piece mapping of every t3code package to its Recoder role. This file
is the narrower *how*: what gets imported, pinned to what, how patches are
tracked, and how upstream drift gets pulled in without breaking Recoder's own
governance seams.

No `third_party/t3code` directory exists in this repo yet. No subtree `pull`
or `add` has been run. This is the plan the next-task #2 work (the
`third_party/t3code` subtree import + pnpm workspace wiring) will execute
against.

## 1. What gets imported

Upstream: `pingdotgg/t3code`, MIT (c) 2026 T3 Tools Inc, ~26k stars, pinned at
`d7202109` (2026-10-07, v0.0.45) for the first import. The import target is
`third_party/t3code` as a **git subtree** (not a submodule — a submodule
would leave a second, separately-cloned tree that CI and contributors have to
remember to init; a subtree lands the code directly in this repo's history,
same convention as the existing Wave fork and the vendored `herdr`/Loom
engine).

Imported whole (kept close to upstream so merges stay cheap):

- `apps/server` (the `t3` CLI / Effect-TS environment server — becomes the
  Recoder environment server, renamed `recoder`)
- `packages/contracts` + `packages/client-runtime` (the versioned RPC schema
  + reconnect/capability-negotiation client)
- `packages/effect-acp` (Agent Client Protocol client)
- `packages/effect-codex-app-server` (typed Codex app-server events)
- `packages/ssh`, `packages/tailscale` (remote environment provisioning)
- `apps/web` (thread sidebar, composer, diff/review, terminal — becomes the
  `recoder-session` Wave block and the served-by-CLI / hosted-at-Connect web
  surface)
- `apps/mobile` (becomes Recoder Remote, bundle `xyz.recoder.remote`)
- `infra/relay` (becomes Recoder Connect, moved onto the owner's own
  Cloudflare account)
- `native/libghostty-vt` (shared with Loom's existing pin — one pin, not two)
- Release tooling: `scripts/build-desktop-artifact`, `release.yml`, the CLI
  single-executable archive step, the license-notice generator,
  `release-smoke`

Not imported / not shipped:

- `apps/desktop` (t3's own Electron shell) — Recoder ships one desktop shell
  only (the Wave fork). Useful modules (updater channels, Linux secret
  storage, SSH UI, permissions, preview/pip, smoke tests) are mined and
  ported into Wave's `emain`, not imported wholesale.
- `apps/marketing` (Astro) — recoder.xyz (this Next site) stays; only the
  `curl install.sh` / docs *pattern* is copied, not the app.

## 2. Internal naming stays upstream-shaped

Internal package names stay `@t3tools/*`, Effect service names and wire
field names stay as upstream wrote them. This is deliberate, not an
oversight: it is the same policy already applied to the Wave fork (`wsh`,
`WAVETERM_*` stay as upstream named them). Renaming internals to
`@recoder/*` would turn every future `git subtree pull` into a manual
re-rename pass across the whole imported tree — expensive, error-prone, and
repeated every sync. Only the **user-facing** surface is rebranded (section
5 below); internals are rebranded exactly once, at the public API boundary,
in the adapter package described in section 3.

## 3. The patch queue

A thin adapter package, `packages/t3-bridge`, is the **only** place upstream
schema churn is allowed to land. It maps t3 contracts (`@t3tools/contracts`
wire types, Effect service shapes) to Recoder backend calls (the governance
gate, `ApprovalService`, the audit chain, conductor workspace state). Nothing
outside `t3-bridge` imports `@t3tools/*` directly except the two composition
seams in section 4.

Patch queue (tracked here; each entry gets a `bd` issue when work starts —
see `AGENTS.md` issue-tracking convention):

| # | Patch | Why it's a patch, not upstream | Status |
|---|---|---|---|
| 1 | Terminal seam: a `TerminalManager` backend on Loom's protocol-20 socket (bidirectional PTY; worktree launch, pane handle, status) | Upstream's own `node-pty` terminal manager stays as the Windows fallback; macOS/Linux route through Loom instead so Recoder keeps one raw-PTY substrate, not two | Not started |
| 2 | Governance seam: `orchestration-v2` `CommandPolicy` + `EffectWorker` call the Recoder backend over loopback before every write/merge/other side effect | t3 upstream has no concept of an external governance backend; this is Recoder's core value and must never be upstream-mergeable away | Not started (ACP tool-call path — the nearest existing analogue — now opens a durable approval + audit entry per `backend/src/domains/conductor/adapters/acp-permission-gate.adapter.ts`, wired 2026-10-14 lane 2) |
| 3 | Rebrand pass (section 5) applied as a patch on top of each sync, never hand-edited into the vendored tree permanently | Keeps the diff against upstream small and mechanical (scriptable find/replace), so a sync is "reapply the patch," not "re-review every renamed identifier" | Not started |
| 4 | Strip t3 telemetry/analytics endpoints, `t3.codes` URLs, Clerk publishable keys, winget/AUR/Homebrew identifiers | Recoder telemetry is off by default and ships its own identity provider (Better Auth, not Clerk); these must never silently reappear on a sync | Not started |
| 5 | License-notice generator: extend to also cover Wave (Apache-2.0, Command Line Inc) and herdr/Loom (Apache-2.0) in one `third-party-licenses.json`, not three | Upstream's generator only knows about its own deps | Not started |

## 4. The two composition seams (unchanged from the design doc)

1. **Terminal seam** — Loom (mac/linux) or `node-pty` (Windows) under a
   `TerminalManager` the t3 server drives.
2. **Governance seam** — t3's `CommandPolicy`/`EffectWorker` ask the Recoder
   backend for a verdict before any write, merge, or side effect; the backend
   never drives t3 session state back. Calls go one way only, so the two
   state machines cannot fight each other.

Both seams live in `packages/t3-bridge`, never inline in the vendored
`third_party/t3code` tree — so a sync never has to re-find and re-patch a
seam that moved.

## 5. Rebranding (applied as a scripted patch, not hand-edited upstream)

- User-facing: "T3 Code" → "Recoder", `t3` → `recoder` (the CLI binary),
  "T3 Connect" → "Recoder Connect", the mobile app → "Recoder Remote".
- Bundle IDs: `xyz.recoder.desktop`, `xyz.recoder.remote`.
- Env vars: `T3CODE_*` gain `RECODER_*` aliases (both read; `RECODER_*`
  preferred in new code, matching the existing `WAVETERM_*` precedent).
- Icons: glass/mono, icon-only, no emoji (standing design rule).
- Removed on import, every sync: `t3.codes` URLs, T3 telemetry/analytics
  endpoints, Clerk publishable keys, winget/AUR/Homebrew identifiers
  (Recoder re-registers its own package-manager listings later, separately).

## 6. Sync policy

- **Cadence:** monthly, not continuous. A `git subtree pull --prefix
  third_party/t3code <upstream-remote> main --squash` on a dedicated branch
  (`chore/t3code-sync-YYYY-MM`), never directly on `main` or the active
  feature branch.
- **Gate before merge:** contract tests against `packages/contracts` (the
  wire schema `t3-bridge` depends on) plus one smoke test — start the
  server, open a thread, run one Claude turn and one Codex turn in a sandbox
  repo. A sync that breaks either gate does not land; the patch queue
  (section 3) gets updated with whatever upstream change caused the break.
- **Patch reapplication order:** rebrand pass (patch #3) → telemetry/key
  strip (patch #4) → seam patches (#1, #2) re-verified against the new
  upstream shape → license generator (#5) re-run.
- **Version pin:** recorded in this file's "pinned at" line (section 1) and
  nowhere else — a sync updates that one line plus the patch-queue table,
  never silently.
- **No squashing away upstream history inside `third_party/t3code`** — the
  subtree import preserves upstream commit attribution per the MIT license;
  only the sync branch's own merge commit is squashed into one entry on
  `main`.

## 7. License and attribution (unchanged on sync)

- `third_party/t3code/LICENSE` (MIT, T3 Tools Inc) stays unmodified. MIT is
  compatible with Apache-2.0 (Wave, herdr/Loom).
- Repo-root `NOTICE` gains "Portions (c) T3 Tools Inc, MIT" alongside the
  existing Wave and herdr/Loom Apache-2.0 notices; Apache `NOTICE` text stays
  verbatim.
- Every bundle ships a generated `third-party-licenses.json` (the ported t3
  generator, extended per patch #5) and a Settings → Licenses screen on
  desktop, web, and mobile — this fails the build on a missing license,
  matching upstream's own behavior.

## 8. What this file is not

This is not a license to start the import. `third_party/t3code` does not
exist in this tree yet; next-task #2 (git subtree at `third_party/t3code`
pinned `d7202109`, wired into the pnpm workspace, tests green on arm64) is
the work that executes section 1-2 of this plan. This file exists so that
work has a patch queue and sync policy to build against instead of
improvising one mid-import.
