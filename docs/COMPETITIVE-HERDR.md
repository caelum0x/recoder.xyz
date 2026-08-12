# Competitive & Absorption Analysis — herdr

> NOTE (2026-08-12): "herdr" throughout this document is the upstream
> company/product analysed here. That engine has since been vendored into Recoder
> and rebranded as the **Loom** engine (`apps/desktop/engines/loom`); the herdr
> name is retained in this file because it is a competitive analysis of the
> real upstream. See `RECODER-VENDOR.md` and repo-root `NOTICE`.

> Status: 2026-08-12. Source: 6-analyst graph-engineering pass over a read-only
> shallow clone at `.scratch/upstream/herdr` (gitignored), each subsystem compared
> to the Recoder equivalent with file:line evidence. **License verified
> authoritatively: Apache-2.0** (GitHub API + root `LICENSE` file — an early web
> result claiming AGPL was wrong). herdr: `github.com/herdrdev/herdr`, Rust,
> ~27.6k★, YC, actively developed.

## What herdr is

"The runtime your coding agents live on" — an agent-aware terminal multiplexer
(tmux-for-agents), one Rust binary, no Electron. A background server owns
panes/PTYs; clients (TUI, SSH, phone) are pure views. It **recognizes the agent
in each pane** (19 declarative TOML manifests), tracks idle/working/blocked, keeps
sessions alive across lid-close, and exposes a **socket API agents drive
themselves** (spawn panes, prompt siblings, `agent wait --until blocked`).

## Competitive read

**herdr is genuinely ahead (real Recoder gaps):**
- **Agent auto-recognition from the process tree** — walks the pane's foreground
  process group, unwraps runtime launchers (`node …/codex`, `bun …/omp`), skips
  `eval/-c/-m`, canonicalizes nix-store/symlinks (`src/detect/mod.rs:216-521`).
  Recoder never infers the agent — it's always explicitly selected
  (`packages/substrate/src/command/runtime-specs.ts:27-97`); no `/proc`/`argv0`
  code exists.
- **A maintainable per-agent state-detection engine** — declarative,
  priority-arbitrated, region-scoped AND/OR/NOT rules over 19 hot-reloadable
  manifests (`src/detect/manifest.rs`, `manifests/claude.toml`). Recoder's
  `classifyAttention` is a single generic ~15-regex blob over one 10-line tail,
  self-described as "ported (simplified) from dmux"
  (`backend/src/domains/conductor/attention/attention-classifier.ts:39-115`).
- **Working→idle temporal debounce** killing status flicker
  (`src/pane/agent_detection.rs:39-77`) — Recoder has none.
- **Agent-invokable synchronous wait** (`agent wait --until blocked`,
  `src/api/wait.rs`) with identity + prompt-stall guards.
- **Broader native-session resume** (16-agent resume-argv registry,
  `src/agent_resume.rs:116-213`) — Recoder resumes only claude/opencode and
  doesn't wire it into the reconciler orphan path.

**Recoder is decisively ahead (moats herdr has zero of):**
- **Convergence** — the governed N-runs→1-merge loop (`converge.ops.ts`, 1128
  lines). herdr dumps N panes and never converges.
- **Governance/policy gate + audit + quota** on workspace creation
  (`governed-writes.ts`).
- **Evidence / state-of-record ownership** — crash-safe persist-before-provision +
  a restart-survivable reconciler (`workspace-engine.ts`, `conductor-module.ts:706`).
- **Cross-runtime memory fabric** (beads) + MCP+governance-gated agent contract
  (vs herdr's `HERDR_ENV=1` CLI).
- **Better reattach infra** — durable `RunEventRing` + WS `?since=` resume cursor +
  backpressure shedding + client backoff beats herdr's in-memory repaint;
  tmux-delegation makes the backend freely restartable (so herdr's SCM_RIGHTS
  fd-handoff is a non-goal).
- **Truthfulness invariant** — Recoder returns `unknown` with no signal; herdr
  defaults known agents to Idle (`manifest.rs:528-541`). Keep Recoder's instinct.

**One-line positioning:** herdr is the free local substrate Recoder gives away;
Recoder monetizes the layer herdr has nothing of — governed, evidenced convergence
+ cross-runtime memory. Do **not** chase herdr on terminal polish.

## Absorb / port plan (ranked, clean-room TS unless noted)

| # | Subsystem | Concrete port | TS vs native | Effort |
|---|---|---|---|---|
| 1 | **State-detection manifest engine** | Externalize `classifyAttention` into per-agent JSON/TOML rule specs (`state` + `priority` + `region` selector + `contains`/`regex`/`line_regex` with recursive all/any/not); highest-priority-wins + `skip_state_update`. Keep `unknown` default (not herdr's Idle fallback). | **TS** into `attention-classifier.ts`; manifests are reference only | **L** |
| 2 | **Working→Idle debounce** | Port `PendingIdleConfirmation` (N-confirmation / ~700ms hold before publishing idle) as a per-workspace transition guard; kills board flicker | **TS** | **S** |
| 3 | **Agent-invokable synchronous wait** | `recoder_workspace_wait` MCP tool + `WaitService`: replay-then-probe over `SyncHub` seq cursor, re-derive status via `classifyAttention`, settle-set + identity guard + prompt-stall; `unknown` = keep waiting | **TS** in `packages/agent-mcp` + conductor | **M** |
| 4 | **Native agent-session resume breadth + reconciler wiring** | Generalize the 2-driver resume-argv coverage into an injection-safe registry (argv-as-data, length/control-char/abs-path checks, dedupe) for codex/pi/recoder-code; wire into reconciler so a crashed `running` workspace native-resumes instead of finalizing to `failed`. Agent owns its history — don't replay our buffer | **TS** in `packages/runtime` + reconciler; **not** the fd-handoff | **M** |
| 5 | **Attention priority ordering + seen/done split** | Rank `awaiting_approval > review_ready/done > working > agent_idle_prompt > unknown`; add `done` (finished while away) vs `idle-seen` so the board is a real "jump to the one that needs you" queue | **TS** | **S–M** |
| 6 | **Two git-hygiene safety fixes** | (a) Replace `git worktree add -B` (force-resets an existing branch ref → data-loss) with a `local_branch_exists` check → `add <path> <branch>` vs `add -b`; (b) gate post-restart `rmSync` on a `.git` gitdir-verification | **TS** in `tmux-substrate.adapter.ts` | **S** |
| 7 | **Process-tree WHICH-AGENT identification** | Foreground-group-leader preference, runtime-wrapper argv unwrapping (skip eval/-c/-m), symlink+nix-store canonicalization, known-package-path matching, alias table — so Recoder recognizes hand-launched agents in raw panes | **Design only — native** in openfang Rust / multica Go (needs `/proc`+toolhelp), exposed as an MCP/engine tool | **M–L** |

## Legal / do-not-copy

- **Apache-2.0**: every item is a **clean-room re-implementation of the design**,
  never a raw copy. Add an Apache-2.0 attribution note in each derived file header
  naming herdr as design/reference lineage. Full Recoder rebrand (Recoder names,
  `recoder:` prefixes, Recoder types).
- **Do NOT port:** the SCM_RIGHTS live-fd zero-downtime handoff (`handoff.rs`,
  inapplicable to tmux-delegated persistence — study-only); herdr's single-binary
  local-only no-control-plane architecture (regressive); the Idle-fallback default;
  herdr's worktree aggregate model (Recoder's `createWorkspace` is ahead); the full
  remote-hot-update manifest distribution machinery (take the engine, not the CDN).
- No AGPL/restricted content flagged; confirm `vendor/` licensing before any actual
  Rust vendoring.

## Highest-leverage first

**#1 the state-detection manifest engine, in TypeScript** — the one design where
Recoder is materially *shallower*, it directly attacks board status-flicker/false
positives, Recoder already has the input (dmux tail capture) and output type
(`AttentionState`), and #2/#3/#5 all build on it. Land it with the #2 debounce
attached; verify by extending `attention-classifier.test.ts` with manifest-driven
fixtures.
