# Recoder x Loom Product Roadmap

Status: 2026-08-15. Loom is Recoder's vendored Apache-2.0 agent multiplexer and
default local execution substrate. Recoder absorbs Loom capabilities behind the
Conductor; it does not embed Loom's complete TUI or expose every socket verb.

The canonical capability boundary is
[RECODER-CONNECTION-ARCHITECTURE.md](./RECODER-CONNECTION-ARCHITECTURE.md#loom-capability-boundary).

## 1. Current product use

Shipped source paths:

- one supervised, secret-stripped Loom daemon on a Recoder-owned protocol-20 socket;
- default workspace substrate, with explicit opt-out to the tmux substrate;
- Loom-native worktree create/remove and agent start;
- public pane-id handles accepted by Loom agent verbs;
- native status/read/prompt, session snapshots, and agent-status event subscription;
- substrate-aware steering: `agent.prompt` for submit and `pane.send_text` for text;
- Needs You/status read models, fanout/convergence services, re-fan, playbooks, and
  local governed remote-attach service seams;
- host Git diff/review/merge, with Recoder retaining durable workspace and audit truth.

This is not equivalent to full Loom coverage. Current production composition calls
ten of roughly 94 public methods. The typed client additionally exposes
`agent.query`, `agent.wait`, and `worktree.status`, but those are not core composition
dependencies.

## 2. Truthful status

| Product capability | Status | Remaining contract |
|---|---|---|
| Default Loom launch and teardown | Source-wired | Signed clean-machine artifact proof (`recoder-1ejn`). |
| Live status and user steer | Source-wired | Source-current Electron/restart proof; no tmux misrouting. |
| Interactive terminal attachment | Source-wired | Authenticated substrate-routed terminal renders Loom or tmux panes and keeps input on governed steering; retain installed/restart proof as release work. |
| Fanout -> compare -> governed converge | Source-wired; isolated failure path exercised | Native fan-out and separately launched ad-hoc groups share compare, N-up file versions, true A/B diffs, plan, and governed compose. Partial fan-out now has same-group replacement panes, superseded-attempt history, actionable Session/Review rows, and cockpit composition over only the active attempts. Isolated worktree diagnostics closed false `completed(0)`, false-zero tmux launch, and stranded-`running` defects; they are not cross-product acceptance evidence. Real-git source proof ships, while the successful authenticated multi-agent pass against a Recoder-owned target remains. |
| Instant converge-ready push | Source-wired | Terminal completion settles the workspace, publishes replayable `/sync` state, and invalidates stale mid-run Compare snapshots by settled-group revision before deriving readiness. |
| Needs You queue/status board | Source-wired | Keep contextual/terminal-plain; do not add an engine dashboard. |
| Swarm auto-unblock | Source-wired governed automation | Durable workspace-owned opt-in/confidence settings and the exact `swarm.unblock` allow/approval/deny rule are authoritative; caller arguments cannot widen them. Keep escalation as the default and prove representative live recovery. |
| Governed skills | Source-wired governed ecosystem | Signed+pinned registry, four-action first-party catalog, typed desktop invoke UI, bounded capability executor, durable operator publisher/manifest onboarding, runtime revocation, canonical worktree containment, a revisioned workspace policy editor, and content-hashed per-invocation policy/outcome evidence in the Trust ledger ship. |
| Remote/mobile attach | Source-wired second client | Authenticated HTTP mint/describe/monitor/stream/steer/revoke, durable TTL sessions, desktop deep-link handoff, signed-in mobile-first receiver, native Loom status/lifecycle SSE, and owner-wide revocation before canonical sign-out ship. Remaining work is provisioned host-to-host Loom transport (`recoder-n5pc`). |
| Loom plugin marketplace | Intentionally not inherited | Owner chose full Recoder rebrand and a separate governed skill model (`recoder-klhy`). |
| Loom layout/TUI/graphics/SSH installer | Not a Recoder surface | Adopt only a bounded capability that closes measured product pain. |

## 3. Delivery order

### Wave A: prove the core Loom desktop loop

1. Launch the packaged Loom daemon and one installed agent CLI from the signed DMG.
2. Close `recoder-wtlm`, then verify worktree, branch, pane-id handle, interactive
   terminal I/O, native state, and both steer modes through renderer/backend restarts.
3. Produce a real diff, exact-target approval, refusal path, and governed merge.
4. Capture the artifact/run evidence without provider or auth secrets.

This wave is the private-beta gate. It adds no Loom TUI, plugins, remote installer,
or second layout system.

### Wave B: harden parallel convergence

1. Keep sibling completion event-driven from authoritative Recoder settlement plus
   Loom native state; preserve settled-group Compare revision invalidation.
2. Keep fanout attempts isolated, show contested/mergeable files, and produce one
   governed output branch.
3. Recover pre-convergence failures by replacing only incomplete panes inside the
   original owned group; keep superseded attempts as history but exclude them from
   active compare/compose. Re-fan remains post-convergence iteration only.
4. Keep swarm auto-unblock workspace-opt-in, confidence-bounded, and subject to its
   exact durable allow/approval/deny rule; validate it in representative recovery.

### Wave C: governed extension model

1. Keep the shipped signed `recoder.skill.json` registry and operator-managed
   publisher/manifest trust ledger free of private signing keys and arbitrary argv.
2. Keep the shipped read/list/search/diff capability inputs bounded to an owned
   canonical worktree with no ambient secrets.
3. Keep the shipped policy-before-execution path, durable exact action/target/
   verdict/evidence ledger, and revisioned per-workspace policy profile as one authority.
4. Do not route inherited Loom `plugin.action.invoke` directly into the product.

### Wave D: remote continuity

1. Keep the shipped hosted identity -> workspace ownership binding authoritative.
2. Keep the shipped TTL session store durable through the canonical KvStore.
3. Keep the shipped mobile/web receiver on the authenticated, scope-filtered
   native status/lifecycle stream; its slow poll is recovery-only.
4. Keep ownership and policy revalidation on every call and owner-wide remote
   revocation before canonical sign-out.
5. Provision host-to-host Loom transport only when remote-runner deployment is
   brought back into scope; it must not fork the client governance model.

## 4. Adoption rule

A new Loom method enters Recoder only when all conditions hold:

1. It solves repeated terminal/review/merge pain observed in beta.
2. It has one clear owner and does not duplicate Wave or Conductor state.
3. Its input can be validated and governed at the backend boundary.
4. Its failure can be reported truthfully without breaking the core loop.
5. It has an installed-product verification path.

Likely candidates are `agent.wait`, `agent.query`, and `worktree.status` because they
can replace polling or enrich truthful read models. Layout, graphics, plugin, popup,
window-title, notification, and remote-install families are not roadmap defaults.

## 5. Product invariants

- Recoder owns workspace, run, policy, review, merge, and audit state.
- Loom owns live PTYs, panes, native agent state, and Loom-created worktrees.
- A Loom internal terminal id is never stored as an agent target; store the pane id.
- Loom failure never silently launches the workspace on tmux.
- React never opens the Loom socket directly.
- Host Git remains diff and merge truth.
- The full Loom plugin ecosystem remains excluded unless a new owner decision replaces
  the current governed-skills direction.
