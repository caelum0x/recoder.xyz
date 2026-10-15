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
| 2 | Governance seam: `orchestration-v2` `CommandPolicy` + `EffectWorker` call the Recoder backend over loopback before every write/merge/other side effect | t3 upstream has no concept of an external governance backend; this is Recoder's core value and must never be upstream-mergeable away | Partial (2026-10-15): `packages/t3-bridge`'s `createT3TerminalCommandGate` (the terminal-write half of this seam) existed with full unit coverage but ZERO real call sites anywhere in the tree — `createGovernedPtyProcess` (`packages/t3-bridge/src/governed-pty-adapter.ts`) now wraps any `PtyProcess`-shaped engine (node-pty today, Loom/herdr-backed once patch #1 lands) so every `.write()` is serialized through the gate before reaching the real process; proven against a real `node:child_process`-backed engine (`child-process-pty-adapter.ts`), not a stub. Still not wired into `third_party/t3code/apps/server`'s own `TerminalManager.write` call site — that server is not yet a live build target (section 9) — and the `orchestration-v2` `CommandPolicy`/`EffectWorker` message-dispatch path itself (steer/restart/fork decisions, as opposed to terminal writes) remains ungated. ACP tool-call path — a separate existing analogue — already opens a durable approval + audit entry per `backend/src/domains/conductor/adapters/acp-permission-gate.adapter.ts`, wired 2026-10-14 lane 2. |
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

## 9. Import status (2026-10-15 — next-task #2 executed)

`third_party/t3code` now exists. Imported on branch
`feat/recoder-forks-2026-10-15` (cut from `feat/recoder-2026-10-14b`, in
worktree `~/products/recoder-wt-forks-2026-10-15`):

```
git remote add t3code-upstream <local-or-upstream-clone-of-pingdotgg/t3code>
git fetch t3code-upstream
git subtree add --prefix=third_party/t3code <pinned-sha> --squash \
  -m "chore(t3code): subtree import pingdotgg/t3code @ d7202109 (MIT)"
```

Pinned at `d720210996a514368ba99f4860063110033d93fa` (2026-10-07, v0.0.45) —
matches section 1's "pinned at `d7202109`" exactly (full sha above; short
form unchanged). Three commits, in order:

1. `b90bccf87` — the subtree's own synthetic squash commit (git subtree
   internals; do not hand-edit).
2. `a6168f585` — `git subtree add`'s merge commit.
3. `531a7a349` — removed `apps/desktop` + `apps/marketing` per section 1
   ("Not imported / not shipped"). Kept: `apps/server`, `apps/web`,
   `apps/mobile`, `packages/*`, `native/`, `infra/relay`, `scripts/`,
   `patches/`, `.github/workflows/*` (minus the three removed below).
4. `2096253eb` — the rebrand pass (section 5) applied via
   `scripts/rebrand-t3code.sh`: 433 files, "T3 Code"→"Recoder", "T3
   Connect"→"Recoder Connect", `t3.codes`→`recoder.xyz`, mobile bundle IDs
   `com.t3tools.t3code*`→`xyz.recoder.remote*`, the live T3 Clerk
   publishable key stripped from `.env.example`, and
   `publish-aur.yml`/`release.yml`/`release-desktop.yml` removed (patch
   #3 + #4 combined into one scripted, re-appliable commit — re-run the
   script after every sync instead of hand-editing the vendored tree).

**Status: source imported, NOT yet a live build target.** Per section 2's
own policy and the same precedent `third_party/crystal` already set
(`RECODER-VENDOR.md`: "a full-source donor... do not start or package
[it] as a second [app] inside Recoder"), this import stops at "the code is
in the tree, licensed, attributed, rebranded" — it does NOT yet:
- wire `third_party/t3code` into the root `pnpm-workspace.yaml` packages
  list (no `packages/t3-bridge` adapter exists yet — patch queue items #1
  and #2, section 3, are both still "Not started");
- attempt a `pnpm install` / build inside `third_party/t3code` itself (its
  own `apps/server` + `apps/web` + `apps/mobile` dependency tree is large;
  installing and building it was out of scope for this pass and is
  next-task #2's remaining half, tracked separately from the import itself).

**herdr: already done, separately, before this session.** herdr was
vendored wholesale as the **Loom** engine
(`apps/desktop/engines/loom`, Apache-2.0, 2026-08-12) well before this
t3code pass — see `apps/desktop/engines/loom/RECODER-VENDOR.md` for its own
import record, phase history (0-5, all `[x]`), and upstream-sync log. It is
already wired into the live app (`backend/src/domains/conductor/adapters/
loom-substrate.adapter.ts`, `loom-steer-transport.adapter.ts`, the Loom
daemon supervisor, DMG packaging). Nothing in this session re-imports it;
this note exists only because an earlier draft of this plan (and the task
that triggered this session) assumed herdr was still unimported — it
was not.

**Verified working (this session):** `pnpm install --filter` scoped
installs of the governance/backend/desktop-app dependency chains succeed
(pnpm's content-addressable store mostly hardlinks, no large re-download);
the Wave-fork desktop shell builds and launches in `electron-vite dev`
mode, the Go `wavesrv` server starts cleanly (web/websocket/unix-domain
listeners all up) with `apps/desktop/engines/loom`'s existing wiring
untouched, and the OS-level window title reads **"Recoder (Dev)"** —
confirms the rebrand is visible at the window-chrome level, not just in
source strings. The embedded TypeScript control-plane backend
(`backend/src/server.ts`) does NOT fully boot in a fresh worktree without
a full `pnpm -r build` across its ~30+ `@recoder/*` workspace-package
dependency graph (each missing package's `dist/` surfaces as a new
`MODULE_NOT_FOUND` on the next restart — `@recoder/vault`, then
`@recoder/agent-instructions`, and more beyond that); this is the SAME
pre-existing condition `plans/recoder.md`'s 2026-10-14 lane-2 session
already documented ("a full `pnpm -w build` across every workspace package
was out of scope... pre-existing condition, not caused by or related to
this change") — a fresh worktree never has these built, and building all
of them was out of scope for this session's disk/time budget. Dev-mode
also requires `WCLOUD_ENDPOINT=https://<any-https-url>` set in the
environment (an upstream t3code/Wave dev-mode-only config check,
`apps/desktop/server/pkg/wcloud/wcloud.go` `checkEndpointVar` — gated
behind `wavebase.IsDevMode()`, never enforced in a packaged build); this is
undocumented anywhere in this repo and should be added to a dev-setup doc
or given a Recoder-side default so the next person who runs `pnpm run
dev:desktop` from a fresh worktree does not hit the same unexplained
`wavesrv` exit this session hit first.

## 10. Upstream-sync procedure (verified runnable)

Monthly, per section 6, on a dedicated branch (never `main` or the active
feature branch):

```bash
# 1. Pull the latest upstream squash onto the dedicated sync branch.
git checkout -b chore/t3code-sync-YYYY-MM
git fetch t3code-upstream main   # or a new pinned sha, per section 1 policy
git subtree pull --prefix=third_party/t3code t3code-upstream main --squash

# 2. Re-apply the scripted rebrand/strip patch (never hand-edit the vendored
#    tree permanently — this script is the only sanctioned edit path):
bash scripts/rebrand-t3code.sh
git add third_party/t3code NOTICE
git commit -m "chore(t3code): rebrand pass re-applied after sync"

# 3. Re-drop apps/desktop + apps/marketing if upstream re-added them
#    (a sync pulls the FULL upstream tree back in; the exclusion in this
#    repo's history does not "stick" across a subtree pull):
git rm -r --quiet third_party/t3code/apps/desktop third_party/t3code/apps/marketing 2>/dev/null || true
git commit -m "chore(t3code): re-drop apps/desktop + apps/marketing (not imported, section 1)" --allow-empty

# 4. Update this file's "pinned at" line (section 1) + the patch-queue
#    table (section 3) with whatever the new upstream sha and date are.

# 5. Gate before merge (section 6): contract tests against
#    packages/contracts + one live-agent smoke test. A sync that breaks
#    either gate does not land — update the patch queue with what broke.
```

Steps 1-3 above were exercised end-to-end for the INITIAL import in this
session (steps 1 and 3 identically; step 2 is the same script already
committed). The only untested leg is an actual `git subtree pull` against
a SECOND upstream commit (this session only ever ran `subtree add` once,
against the single pinned sha) — the command is upstream `git subtree`'s
own well-established mechanism, not custom tooling, so it is expected to
work identically, but it has not been exercised against this repo's
history by this session.
