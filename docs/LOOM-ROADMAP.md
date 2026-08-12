# Recoder × Loom — Feature Roadmap

> Status: 2026-08-12. **Loom** is Recoder's rebranded, wholesale-absorbed
> agent-multiplexer engine (originally **herdr**, Apache-2.0 — see `NOTICE`).
> It is integrated as a live substrate (`docs/LOOM-INTEGRATION.md`): socket client,
> substrate adapter, native agent-state, supervised daemon. This roadmap is the
> *new* product surface that absorption unlocks — graph-engineered (6-analyst pass),
> ranked by moat depth + first-timer leverage. Every item is grounded in shipped
> socket/adapter/native-state/converge primitives.

## 0. THE KILLER FEATURE — the fusion moat

### `recoder_converge_fanout` — one verb: fan a task to N agents, auto-converge to one governed branch
**Neither tool can do this alone: Loom fans out, Recoder converges.**

1. Per agent kind, `loom-substrate` launch: `worktree.create{base, branch:recoder/fan-<agent>-<short>}` → `agent.start{kind, pane_id}`.
2. Stamp every resulting Recoder Workspace with ONE shared `metadata.taskGroup` — **Recoder stays system-of-record; Loom only executes.**
3. Deliver identical task text to each pane via `agent.prompt{wait:{until:['done','blocked']}}` (`callAndWait`).
4. On all-Done, run the SHIPPED `planConvergence(taskGroup,{probe:true})` → `composeConvergence` (converge.ops.ts) to fold N sibling diffs into **one reviewable, evidence-backed branch** through the existing governed merge path.

**Why it wins:** the dev types one task and gets ONE trusted PR instead of N conflicting branches to hand-referee — the "divergent-branch hell" the thesis names as the beachhead. Loom keeps N panes alive but has no notion they're N attempts at ONE task; free orchestrators dump the diffs on your desk.

**Honesty invariants:** Loom natively knows claude/codex/cursor/opencode/pi/gemini; recoder_code/qwen/crush fall back to raw pane input and forfeit native status (report, never fake). Tasks past the 300s prompt-wait cap re-arm via `agent.wait`. **Effort L** · all deps shipped.

## 1. BUILD-NOW WAVE (ranked)

| # | Feature | Moat | Effort | Grounded in |
|---|---|---|---|---|
| 1 | **Live convergence cockpit** — subscribe `pane.agent_status_changed`; as each fanned pane goes Working→Blocked→Done, recompute a terminal-plain strip from `planConvergence(probe)` + `probeSynthesizability` → "K/N settled · C contested · A auto-mergeable · P need a pick"; `gatherFileVersions` backs the N-up column view | ✅ | M | subscribe + native status + probes |
| 2 | **Instant converge-ready signal** — drive the board `ClusterConvergePhase running→ready` off native per-pane `done`; the merge CTA lights the moment the LAST sibling flips Done | ✅ | M | subscribe(done) → convergePhase |
| 3 | **Swarm auto-unblock** — on native Blocked, `agent.read` the question, resolve from cross-runtime **memory** + a sibling pane that already passed the decision; **default = escalate via approval gate**, auto-answer opt-in per policy; every injected answer = an evidenced memory candidate | ✅ | L | agent.wait/read/prompt + memory + governance |
| 4 | **Live "Needs You" queue (push not poll)** — one long-lived `events.subscribe` → `mapHerdrStatus → nativeAttention → classifyAttention`, ranked by `effectiveRank`; moves on the state-machine edge, not the next tick; click jumps to the pane | — | M | subscribe + attention-priority |
| 5 | **Native status columns** — hydrate a kanban from ONE `session.snapshot` (all panes' status at once); `unknown` falls back to the tail path; Feature-4's stream moves cards live | — | M | session.snapshot + mapHerdrStatus |
| 6 | **Second-round re-fan (improve loop)** — when the composed branch fails verification, re-fan a narrowed task with `base = recoder/converge-<id>`, carrying `plan.assisted`/`ConvergenceProvenance` + memory; converge again | ✅ | M | worktree.create{base} + provenance |

## 2. BIGGER BETS

- **A. Governed skill/plugin model** — `recoder.skill.json`: a signed, capability-typed, **policy-gated** action model over the Loom socket that replaces the foregone 592-plugin ecosystem *without* its free-argv RCE surface. A `skill.action.invoke` verb builds a `PolicyInput` from the invocation context and runs `evaluatePolicy` FIRST (allow → run in the worktree; needs_approval → approval gate; deny/unsigned/unpinned → refuse). No ambient env, no inherited secrets. Captures the ecosystem UX + wires skills into convergence + memory (which Loom plugins structurally cannot reach). **XL.**
- **B. Multi-agent orchestration recipes** — saved Recoder *playbooks* that choreograph N Loom panes: dispatch → wait-until-blocked → cross-pollinate → gate on approval → converge, built on `agent.prompt{wait}`/`agent.wait`/events + the workflow engine. **L.**
- **C. Governed remote/mobile attach** — auth'd, policy-gated remote monitor+steer of your Loom-run agents (the daemon persists them across lid-close); `session.snapshot` + Recoder auth. Answers the thesis's distribution weakness with a governed version of what Loom's ecosystem did ungoverned. **L–XL.**

## Dependencies
- The `recoder_converge_fanout` verb + build-now wave use only shipped Loom-integration primitives.
- All identifiers here follow the **Loom** rename (Phase 5); the underlying engine remains Apache-2.0 herdr with attribution preserved in `NOTICE`.
