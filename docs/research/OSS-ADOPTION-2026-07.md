# OSS Adoption Plan — 2026-07

> **Note (2026-07-31):** references below to the Preact **`apps/desktop/cockpit`** SPA
> and the "cockpit preact/react-hooks dup landmine" are **historical** — that SPA was
> **deleted** (recoder-flgn, 2026-07-31). The current desktop UI is the Wave `recoder-*`
> frontend (`apps/desktop/app/frontend/app/view/recoder/`); retarget any frontend
> integration sketch there. The dup-landmine risk no longer applies.

Synthesized from a 4-track candidate scan (agent managers, git tools, backend protocols, product infra).
Scoring: **(impact on Conductor/Cursor parity) × (integration cheapness) × (license safety)**.
Bias: wire/port a proven approach over big vendoring. Repo rule: anything vendored gets fully
rebranded to Recoder (legal attribution preserved — see `feedback_all_vendors_are_recoder`).

Gap key (bd queue): **G1** clone-GitHub-repo seam · **G2** project identity/grouping ·
**G3** checks/merge-readiness (CI status, PR metadata) · **G4** diff-review comments feeding the agent ·
**G5** desktop notifications when agent needs input (recoder-wupr) · **G6** first-run config import
(~/.claude, git identity) · **G7** palette transcript search · **G8** /download page + update/changelog infra.

Action verbs: **wire** = invoke/embed as-is (subprocess, npm dep) · **port** = lift specific code/schemas
into Recoder code · **adopt** = take as a structural dependency · **study** = read for design, re-implement
independently (mandatory for copyleft/no-license).

---

## Tier 1 — Top picks (ranked)

### 1. gh CLI — WIRE — G1 + G3
- **URL:** https://github.com/cli/cli · **License:** MIT · **Stars:** 45.4k
- **What:** One binary covering two whole gaps: `gh repo clone` (auth'd clone, creds from keyring) and
  `gh pr view --json mergeable,mergeStateStatus,statusCheckRollup,reviewDecision` — a single JSON payload
  that already merges GitHub's two status systems (commit statuses + check runs). `gh pr checks --watch --json`
  gives live CI polling.
- **Why #1:** Highest cheapness in the whole scan. Zero new auth flow (Claude Code users almost certainly
  have gh installed + authenticated), zero vendoring, terminal-first — matches the product thesis exactly.
- **Integration sketch:** Node backend conductor gains a `gh` subprocess seam
  (detect binary → `gh auth status` → degrade to plain `git clone` + hide checks column when absent).
  Clone flow: Workspaces hub "New from GitHub" → `gh repo clone owner/repo <ghq-style path>` → launch.
  Merge-readiness: per-workspace poll of `gh pr view --json ...` feeding a checks/mergeable column on the board.

### 2. Vibe Kanban — PORT — G3 + G4 + board UX
- **URL:** https://github.com/BloopAI/vibe-kanban · **License:** Apache-2.0 · **Stars:** ~27.5k
- **What:** The reference board UX for parallel agents (card = worktree = agent, 10+ CLIs). Has exactly what
  Recoder lacks: inline diff comments that are **sent back to the agent**, automated PR creation with
  AI descriptions + GitHub merge integration, browser preview, task templates. Bloop shut down Apr 2026;
  community-maintained — treat as a **source quarry, not a dependency**.
- **Integration sketch:** Do not adopt the app. Port three seams: (a) the comment→agent-prompt plumbing
  (how a diff comment becomes a follow-up instruction into the running session) into the conductor;
  (b) the PR-create/merge flow shapes into the same `gh` seam as #1; (c) board affordances (card states,
  per-card diff badge) as design reference for the Workspaces hub. Apache-2.0 → lifted code is fine,
  rebrand + keep NOTICE attribution.

### 3. Omnara — PORT — G5 + G6 + G7 (three gaps, one source)
- **URL:** https://github.com/omnara-ai/omnara · **License:** Apache-2.0 · **Stars:** ~2.7k
- **What:** Agent control plane whose two hard-won techniques are exactly Recoder's missing pieces:
  (a) input-wait detection heuristics over Claude Code terminal output ("notify ONLY when the agent needs
  input"), and (b) a parser for `~/.claude/projects` session files that reconstructs the full user/agent
  message stream without SDK support.
- **Integration sketch:** Port the session-file parser into the backend as the transcript indexer
  (feeds palette search **G7**) and as the first-run importer (**G6**: existing Claude sessions, config,
  MCP servers, plus git identity read from `git config`). Port the input-wait heuristics into the
  conductor's tmux watcher as the needs-input signal source (**G5**) — delivery handled by #6 below.
  Long-term the ACP seam (#9) replaces heuristics for ACP-capable agents; keep Omnara-style detection
  as the fallback for raw-tmux agents.

### 4. difit — PORT — G4 (the contract)
- **URL:** https://github.com/yoshiko-pg/difit · **License:** MIT · **Stars:** 3.0k
- **What:** Local GitHub-style diff review where inline comments export as **structured prompts designed
  to be handed back to a coding agent**. Also a clean model of diff sources (ref vs ref, staged, worktree).
- **Integration sketch:** Lift the comment→structured-prompt schema and the diff-source model into
  Recoder's workspace diff review; the serialized comment bundle is written into the agent's tmux session
  (or ACP prompt) as a follow-up turn. Cross-check `self-review`'s XML schema (MIT, 35★) when defining
  Recoder's wire format. This plus #5 is the full G4 stack: difit = contract, pierre = pixels,
  Vibe Kanban = end-to-end reference.

### 5. @pierre/diffs — ADOPT — G4 (the rendering)
- **URL:** https://github.com/pierrecomputer/pierre/tree/main/packages/diffs · **License:** Apache-2.0 · **Stars:** 5.5k (monorepo)
- **What:** Production-grade Shiki-based diff renderer built by the diff.reviews team explicitly as the
  diff layer for code-review products: split/unified, word-level highlights, virtualization for large diffs,
  and **merge-conflict rendering with pick-current/incoming/both UI**.
- **Why it wins over hand-rolling:** the conflict-resolution component maps directly onto the convergence
  thesis (N branches → one trusted merge), and the vanilla-JS component path avoids React/Preact versioning conflicts.
- **Integration sketch:** npm dep in `apps/desktop/app/frontend` (the Wave frontend); use vanilla-JS components (not the React ones);
  mount as the diff surface for workspace review and for the merge/converge step. Inline comment gutter
  hooks feed the difit-style schema (#4). **Note (2026-07-31):** the Preact cockpit SPA was deleted; all desktop UI
  is now Wave recoder-* views.

### 6. Electron Notification API (builtin) — WIRE — G5 delivery (implements recoder-wupr)
- **URL:** https://www.electronjs.org/docs/latest/api/notification (Electron, MIT); optional https://github.com/mikaelbr/node-notifier (MIT, 5.8k)
- **What:** Native OS notifications from the Electron main process; `handleActivation` survives object GC;
  `node-mac-notifier` adds macOS inline-reply if wanted later.
- **Integration sketch:** Trivial closer. Supervisor emits `agent-needs-input` (from Omnara-style heuristics
  #3, ACP permission-requests #9, or agent-os approval gates) → Electron main fires a Notification →
  click focuses the exact workspace. Zero deps for v1 (builtin only). Directly closes open issue
  **recoder-wupr**; badge the dock icon as a bonus. **Status (2026-07-31):** first-run agent-auth probe,
  git-init affordance, and mid-run needs-input notifications shipped.

### 7. electron-updater + Hazel — ADOPT + PORT — G8 (update + /download)
- **URLs:** https://github.com/electron-userland/electron-builder (MIT, 14.6k) · https://github.com/vercel/hazel (MIT, 3.0k)
- **What:** electron-updater = auto-update from GitHub Releases with zero server (`publish.provider=github`,
  differential download, staged rollout). Hazel = ~a-dozen-file Node proxy over GitHub Releases giving
  platform-detecting `/download` + `/update/:platform/:version` endpoints.
- **Verified gotchas:** macOS auto-update **requires** a zip target (dmg alone emits no `latest-mac.yml`)
  **and a Developer ID signature** — signing is the gating dependency (`electron-builder.notarize.cjs`
  already exists in-repo). Build arm64+x64 in ONE CI job (separate jobs clobber each other's
  `latest-mac.yml`, electron-builder #5592). Private monorepo → publish to a **public releases-only
  mirror repo** (standard OSS-desktop trick); decide this before wiring (it's also what makes the free
  `update.electronjs.org` option viable later).
- **Integration sketch:** (a) add zip target + `publish` config to the existing electron-builder setup,
  `autoUpdater.checkForUpdatesAndNotify()` in main, release CI `--publish onTag`; (b) vendor Hazel as
  Next.js API routes in the website (`app/`) powering the `/download` page — plain downloads work even
  while mac builds are unsigned. Rebrand per repo rule; keep MIT attribution.

### 8. changesets — ADOPT — G8 (changelog/release pipeline)
- **URL:** https://github.com/changesets/changesets · **License:** MIT · **Stars:** 12.2k
- **What:** pnpm-workspace-native versioning: `.changeset/*.md` intent files → aggregated CHANGELOGs,
  version bumps, tags, GitHub Releases.
- **Integration sketch:** Add the changesets bot + release GH workflow. The GitHub Releases it produces
  become the single source read by Hazel (#7), electron-updater (#7), the website changelog page, and a
  ~150-line in-app "What's new" popover (crib ChangeCast's architecture: fetch Releases JSON → cache →
  unread badge on version change). Skip Openchangelog (AGPL conflicts with the rebrand-everything rule).

### 9. Agent Client Protocol (ACP) + official adapters — ADOPT (incremental) — G5 signal + G7 structure + resume
- **URLs:** https://github.com/agentclientprotocol/agent-client-protocol (Apache-2.0, ~3.8k) ·
  claude-agent-acp (Apache-2.0, 2.3k) · zed-industries/codex-acp (~880, **license unasserted — verify before vendoring**)
- **What:** Community-governed (Zed/JetBrains/Block) JSON-RPC-over-stdio agent-session protocol:
  structured prompts, streamed session updates, **permission-request messages** (= the needs-input signal,
  typed instead of scraped), session/resume + session/close (2026-stabilized). Official adapters expose
  Claude Code and Codex as ACP agents with zero per-agent glue.
- **Integration sketch:** Strategic, not a quick win — do after 1-8. Backend conductor grows an ACP session
  driver beside the tmux driver: spawn `claude-agent-acp`/`codex-acp` per workspace via the TS SDK;
  map permission-requests → agent-os approvals + notifications (#6); session updates → RunEvents +
  transcript index (#3); session/resume → workspace reattach after desktop restart. tmux stays the
  escape hatch for non-ACP agents. Keep RunEvent as the canonical record (AG-UI event vocabulary is the
  study reference for the cockpit stream shape).

### 10. ghq convention (+ Gastown study) — PORT — G2 + G1 layout
- **URLs:** https://github.com/x-motemen/ghq (MIT, 3.7k) · https://github.com/steveyegge/gastown (MIT, 17.2k)
- **What:** ghq = deterministic clone layout `<root>/<host>/<owner>/<repo>` → stable project identity
  derivable from disk, free interop with existing ghq users. Gastown = Go multi-agent workspace manager
  **built on beads (bd)** — the same issue graph Recoder vendors as its memory layer; its rig (per-repo
  workspace group) / town (hub) / convoy (batched work) model is the direct blueprint for
  project-identity + grouping with crash-recoverable state in bd.
- **Integration sketch:** Port the *convention*, not the binaries: Recoder-managed clones (from #1's gh seam)
  land at `~/recoder/repos/<host>/<owner>/<repo>`; project identity = `{host, owner, repo}` triple; the
  Workspaces hub groups workspace cards under that project key (rig-equivalent). Study Gastown's
  bd-persisted rig state for durable grouping that survives desktop restarts (MIT + Go → conductor/Wave
  side can borrow code directly if a piece fits).

---

## Tier 2 — Strong, not top (study/port opportunistically)

| Candidate | License | Action | Notes |
|---|---|---|---|
| **Emdash** | Apache-2.0, 5.3k | port pieces | Closest stack match (Electron/TS/SQLite). Backup source for G3 (CI-checks + PR panel) if the gh-only seam feels thin; provider-CLI auto-detection pattern for G6. |
| **Crystal** | MIT, 3.1k (frozen) | quarry | Deprecated → MIT-frozen. Best source for multi-agent-compare UX (same prompt → N sessions, side-by-side) and Electron session persistence/resume patterns. |
| **Sculptor** | MIT, ~200 | port UX ideas | Forking (branch a new agent off any run timeline point) + Pairing Mode (sync workspace into local checkout) — the two design ideas to steal for the convergence story. Python/Mac runtime — patterns only. |
| **gh-dash** | MIT, 12.1k | port queries | Battle-tested GraphQL shapes fetching PR metadata + statusCheckRollup in one round trip — use if/when polling `gh` subprocess becomes too slow and the backend goes direct-GraphQL. |
| **Worktrunk** | MIT/Apache-2.0 dual, 6.0k | study/port | Worktree lifecycle state machine + hooks (create → run → merge-back → prune, stale/orphan handling) to harden the conductor's worktree layer. |
| **git-worktree-runner** | Apache-2.0, 1.7k | port checklist | The unglamorous bootstrap: copy .env/untracked config + install deps into fresh worktrees (known failure mode: agents launched into bare worktrees). Fold into workspace-create. |
| **avt** | Apache-2.0, 229 | port/wire | Rust ANSI/VT parser → clean plain-text screen state from tmux bytes. The quality upgrade for transcript search (#3) and readable run evidence; NAPI sidecar like the openfang fusion. Use avt/asciicast-rs, NOT the GPL-3 asciinema CLI/server. |
| **cmdk** | MIT, 12.8k | wire | Palette primitive for G7 (Linear/Raycast feel). Verify Radix Dialog and other dep compatibility in Wave frontend. kbar (MIT) is the fallback if integration fights. |
| **parallel-code** | MIT, 891 | study | Minimal end-to-end implementation of Recoder's exact loop; lift its agent-CLI invocation matrix / worktree naming where better than current conductor code. |
| **AG-UI** | MIT, 14.9k | study | Event vocabulary reference for conductor→cockpit streaming; map RunEvents onto it only if third-party client rendering becomes a goal. |
| **react-hotkeys-hook / react-joyride** | MIT | wire later | Shortcut registry + first-run tour; both hooks-based → same preact alias care. Polish phase, after G-gaps close. |
| **LiveStore** | Apache-2.0, 3.6k | study | Event-sourced local-first SQLite fits the evidence/replay thesis, but wants to own state management — evaluate for the cockpit local store only; design reference otherwise. |
| **Tessera / rekor-tiles** | Apache-2.0 | study | Tamper-evident Merkle log for the enterprise governance upsell (audit evidence can't be rewritten). Not parity-critical now. Negative finding: **immudb is BSL 1.1 — avoid**. |
| **Fumadocs** | MIT, 12.7k | adopt later | /docs + changelog rendering inside the Next.js site; blocked on website install-architecture (#22, Next 16.2.6 pin) — verify peer range first. |
| **update-electron-app** | MIT | study | Simpler updater IF a public releases-only repo exists; the repo-visibility decision in #7 determines whether this ever matters. |

## Tier 3 — License-quarantined (STUDY ONLY, never copy)

| Candidate | License | Why it still matters |
|---|---|---|
| **Claude Squad** | **AGPL-3.0** | Closest architecture twin (tmux + worktree per agent, Go). Read for session-lifecycle edge cases: attach/detach, pause/resume serialization, pane crash recovery, worktree GC. Re-implement independently; explicitly quarantine from copy-paste. |
| **cmux (manaflow)** | **NOASSERTION** (no license) | 25.1k-star expression of the "product is a terminal" thesis; mine notification UX (idle vs waiting vs done) and tab affordances. Also a competitor to track. |
| **Mergiraf** | **GPL-3.0** | AST-level merge driver = literally the convergence thesis. Safe ONLY as user-installed subprocess: detect binary → register via git config as optional merge driver in the converge step; never vendor/link/compile in; flag in docs. |
| **Openchangelog** | **AGPL-3.0** | Changelog site; AGPL + the rebrand-everything rule are incompatible → render changesets output via the website instead. |
| **asciinema CLI/server** | **GPL-3.0** | Adopt the asciicast v3 *format* (spec is freely implementable; via Apache-2.0 avt/asciicast-rs) as the run-recording artifact format; never embed the GPL binaries. |
| **wong2/diffx**, **Onborda** | no license | Study only. |

---

## Sequencing (impact-first)

1. **Week 1-2 (cheap wins):** #1 gh seam (G1+G3) · #6 notifications delivery (G5, closes recoder-wupr) · #10 ghq layout (G2).
2. **Week 2-4 (the review loop):** #5 pierre/diffs rendering + #4 difit comment contract + #2 Vibe Kanban plumbing study → diff-comments-feed-the-agent shipped (G4). This is the Conductor-parity centerpiece.
3. **Week 3-5 (distribution):** #8 changesets → #7 electron-updater + Hazel + /download (G8). Signing decision + public-releases-repo decision gate this track.
4. **Week 4-6 (depth):** #3 Omnara ports (G6+G7 + better G5 signal); cmdk palette on top of the transcript index.
5. **Later (strategic):** #9 ACP driver; avt transcript quality; Mergiraf optional merge driver; Tessera audit log.

## License posture summary

- **Adopt/port freely (MIT/Apache-2, rebrand + attribution):** gh, Vibe Kanban, Omnara, difit, @pierre/diffs, electron-updater, Hazel, changesets, ACP + claude-agent-acp, ghq, Gastown, Emdash, Crystal, Sculptor, gh-dash, Worktrunk, git-worktree-runner, avt, cmdk, parallel-code, AG-UI, Fumadocs, changesets.
- **Verify before touching:** codex-acp (license unasserted).
- **Copyleft — subprocess-only or study-only, never vendor:** Claude Squad (AGPL), Mergiraf (GPL), asciinema CLI/server (GPL), Openchangelog (AGPL).
- **No license — study only:** cmux, wong2/diffx, Onborda. **BSL — avoid:** immudb.
