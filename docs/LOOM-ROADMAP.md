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
| Interactive terminal attachment | Missing | Current output is polled `agent.read` capture into RunEvents; add a bounded bidirectional adapter (`recoder-wtlm`). |
| Fanout -> compare -> governed converge | Source-wired | Live representative-repository proof and failure recovery. |
| Instant converge-ready push | Partial | Drive readiness from the final sibling status event without poll-only lag. |
| Needs You queue/status board | Source-wired | Keep contextual/terminal-plain; do not add an engine dashboard. |
| Swarm auto-unblock | Unsafe for broad enablement | Replace synthetic permissive profile with deny-capable workspace-agent policy (`recoder-trk0`, `recoder-vbg2`). |
| Governed skills | Dormant/partial | Concrete executor, pinned registry, publisher keys, and canonical worktree containment (`recoder-ne6o`, `recoder-ubyg`). |
| Remote/mobile attach | Local backend seam only | Authenticated remote transport and durable shared session store (`recoder-n5pc`). |
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

1. Make sibling completion event-driven and derive converge-ready from authoritative
   Recoder workspace attribution plus Loom native state.
2. Keep fanout attempts isolated, show contested/mergeable files, and produce one
   governed output branch.
3. Re-fan only after verification failure with provenance from the previous attempt.
4. Enable swarm auto-unblock only after `recoder-trk0`/`recoder-vbg2` is deny-capable.

### Wave C: governed extension model

1. Finish the signed `recoder.skill.json` registry and explicit publisher trust.
2. Resolve user input to an owned canonical worktree and execute through a bounded
   executor with no ambient backend secrets.
3. Run policy before execution; persist exact action/target/verdict/evidence.
4. Do not route inherited Loom `plugin.action.invoke` directly into the product.

### Wave D: remote continuity

1. Define hosted identity -> workspace ownership for remote sessions.
2. Replace the process-local session store with durable shared state.
3. Add authenticated transport for snapshot/monitor/steer with exact-target policy.
4. Revalidate ownership and policy on every call; revoke on sign-out/session expiry.

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
