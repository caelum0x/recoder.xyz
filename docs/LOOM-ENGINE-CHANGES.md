# Loom Engine — Change Plan (Recoder-owned fork)

> Status: 2026-08-12. Source: 4-analyst graph over the vendored Loom engine Rust
> source (`apps/desktop/engines/loom`, Apache-2 fork of herdr — we own it). Ranked
> by Recoder-feature leverage. Build/verify every item with `cargo build && cargo
> test` in the loom crate (Rust 1.96.1 + zig 0.15.2). CI is off — local verify is
> the gate.

## SHIPPED STATUS (updated 2026-08-13)

| # | Item | State |
|---|------|-------|
| 1 | native `recoder_code`/`qwen_code`/`crush` agent kinds | ✅ SHIPPED — **without** bundled manifests. The plan called for 3 TOMLs, but we do NOT have live panes to capture evidence-based rules, and a manifest with invented rules ships a constant-idle lie. So the 3 kinds are LAUNCHABLE (enum/label/executable/lookup; agent.start accepts them) but kept OUT of `SCREEN_MANIFEST_AGENTS` (like Omp/Mastracode) — no fabricated status. Native STATUS detection (evidence manifests or hook authority for recoder_code) is a tracked follow-up. |
| 2 | `agent.query` filtered/sorted read + TS client | ✅ SHIPPED — reuses `apply_agent_view` via a shared `filter_and_sort_entries` helper; additive verb, no protocol bump. Backend consumer = follow-up. |
| 3a | rule-id on the live status path (`agent_rule_id`) | ✅ SHIPPED — additive optional field, gated so a full-lifecycle hook never mis-attributes. |
| 3b | `blocked_kind` taxonomy (`agent_blocked_kind`) | ✅ SHIPPED — DECLARED approval/input/trust on manifest blocked rules (23 unambiguous rules annotated), threaded like rule-id. **Consumed** by swarm-unblock routing (approval/trust always escalate, only input auto-answers). |
| 5 | `worktree.status` cross-platform read + TS client | ✅ SHIPPED — portable `git status --porcelain=v2 --branch` parse; truthful `has_upstream`; additive verb. planConvergence consumer = follow-up. |
| 6 | delta cursor `since_seq` | ✅ SHIPPED — the seq/bounded-ring infra already existed; exposed monotonic `seq` per event + optional `since_seq` replay that returns exactly seq>cursor then live, with an explicit `resume_gap` error (never a silent drop). `exit_code` kept ABSENT. TS client mirrors it. |
| 9 | engine plugin-spawn policy gate | ✅ SHIPPED — the ENGINE half of Bigger Bet A. Default-DENY, unbypassable, host-only opt-in (`LOOM_PLUGIN_SPAWN_ALLOW`); plugin data can never flip it. Closes **both** spawn surfaces: runtime `start_plugin_command` AND install-time `run_plugin_build_command` (the second path was caught by security review). Breaking by design — the governed skill model replaces plugins. |
| 4 | `workspace.agent_status_changed` aggregate event | ✅ SHIPPED — reuses the EXISTING `Workspace::aggregate_state` fold (the same one backing `WorkspaceInfo.agent_status`), so the event can never disagree with the snapshot; emitted once on the folded-status EDGE (deduped, not per-pane, not hot-path); unknown stays truthful; additive, no protocol bump. TS client parses it defensively. |
| 7 | Recoder skill + managed-pane env handshake | ⏳ optional — the shipped skill model already provides the governed path. |
| 8 | `agent.start` env passthrough (denylist) | ⏳ optional. |

**ENV GOTCHA (bd recoder-ny0w):** a manifest-override test leaks `codex.toml` into the REAL `~/.config/loom/agent-detection/`, poisoning ALL codex detect tests (Idle vs Blocked) even single-threaded. `rm -f ~/.config/loom/agent-detection/codex.toml` before suspecting code.

## THE keystone — #1: native agent kinds for `recoder_code`/`qwen_code`/`crush`
Today `agent.start{kind}` **rejects** these three at the socket boundary
(`src/app/agents.rs:151` → `UnsupportedKind`), which is the whole reason
`converge-fanout.service.ts` keeps them in `LOOM_FALLBACK_KINDS` (raw pane input,
`nativeStatus:false`). Everything else in the cockpit/Needs-You/native-columns
roadmap is degraded until this lands.

**Change** (`src/detect/mod.rs` + `manifest.rs` + 3 new TOMLs):
- enum variants `RecoderCode/QwenCode/Crush` (mod.rs:43-65); grow `ALL`→`[Self;24]`
  (mod.rs:68) + `SCREEN_MANIFEST_AGENTS`→`[Self;22]` (mod.rs:92).
- `agent_label` returns the exact wire kinds `recoder_code`/`qwen_code`/`crush`.
- `lookup_agent` aliases (`recoder-code`/`recoder`, `qwen`, `crush`).
- `interactive_agent_executable` → real CLI binaries (verify names).
- bundled manifests `manifests/{recoder_code,qwen_code,crush}.toml` in
  `BUNDLED_MANIFESTS` (manifest.rs:239) — **required** or status is a constant
  "idle" lie (`default_known_agent_idle_fallback`), which violates the honesty rule.
- fix the two exhaustive tests (`mod.rs:742`, `:751`) + the array-size literals.

Effort M. Free bonus: `identify_agent_in_job` also auto-recognizes user-launched
`crush`/`qwen` panes.

## Tier 2 — cheap reads that kill per-tick cost
- **#2 `agent.query`** (S) — server-side filtered/sorted agent read; the predicate
  engine already exists (`apply_agent_view`, `agent_view.rs:53`) but is only wired
  to the TUI verb. Expose it as a pure read → `token.taskGroup Eq X AND status In
  [Done,Blocked]` in one call, no N per-pane reads. Powers the cockpit + all-Done.
- **#3a rule-id on the live status path** (M) — the manifest computes
  `matched_rule.id` then discards it (`manifest.rs:402`); thread it onto
  `AgentInfo`/`PaneAgentStatusChangedEvent`. Exact blocker provenance for free.
- **#3b `BlockedKind` taxonomy** (L, needs #3a) — the rule IDs already encode
  approval vs input vs trust; surface `blocked_kind` so Recoder routes
  approval-blockers → governance and input-blockers → swarm auto-answer. The thing
  that makes swarm-unblock *decidable*.

## Tier 3 — push-stream efficiency + converge signal
- **#4 `workspace.agent_status_changed`** (M) — aggregate taskGroup-scoped status
  event (aggregate already computed) → "instant converge-ready" lights on one edge.
- **#5 `worktree.status`** (M) — cross-platform `{dirty, changed_files, ahead,
  behind}` (current impl is `#[cfg(test/windows)]` — never compiled on mac); feeds
  `planConvergence` auto-mergeable-vs-contested + re-fan base selection.
- **#6 delta cursor `since_seq` + settle metadata** (S+M) — incremental cockpit
  refresh; keep `exit_code` ABSENT (PTY agents have none — fabricating violates honesty).

## Tier 4 — governance / skill contract (strategic)
- **#7 Recoder-flavored skill + managed-pane env handshake** (S+M) — bundle
  `skills/recoder/SKILL.md`, profile-select via `LOOM_SKILL_PROFILE`; extend
  `integration::apply_pane_base_env` (env.rs:27) to inject `RECODER_MCP_SOCKET` + a
  per-pane capability token so fanned agents drive the *gated* route by construction.
- **#8 `agent.start` env passthrough** (M, denylist-checked) — per-fan-agent
  capability scoping.
- **#9 engine action policy gate** (L) — pre-spawn `allow/deny/needs_approval`
  callout in `start_plugin_command` → converts the free-argv plugin RCE surface into
  governed `skill.action.invoke` (Bigger Bet A).

## Landing order
1 → 2 → 3a → 3b → 4 → 5 → 6 → 7 → 8 → 9. Items 1/2/3a/4/5/6 are independently
landable; 3b needs 3a; 8-resume + 9-OSC need 1. **#1 is the single highest-value
unlock — ship it first**, and never without the manifests (a variant without a
manifest ships a truthful-looking constant "idle" lie).
