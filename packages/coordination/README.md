# @recoder/coordination

Recoder's coordination engine — a pure-TypeScript control-plane library that
coordinates the user's own coding-agent fleet (Claude Code, Codex, Cursor,
Windsurf, Replit, local daemons, A2A externals) working the same repo/space
concurrently.

It makes four classes of failure **structurally impossible or loudly detected**:

| Failure | Mechanism |
| --- | --- |
| Collisions (overlapping writes) | **Work-locks** — path/glob-scoped, TTL-bounded, fence-tokened write claims |
| Duplicate work | **Dependency-aware dispatch** — exactly-once idempotent claim, DAG-gated |
| Lost handoffs | **A2A handoff bus** — typed, deduplicated, depth + cycle bounded |
| Shared-state incoherence | **Coherence reconciler** — emits `WorkSignal`s on drift, self-heals safe drift |

## Design principles

- **Pure core, impure edges.** The engine returns `Effect[]`; the
  `effect-runner` is the only place IO runs. All IO is behind ports.
- **Immutability.** Every state mutation returns a new object.
- **Idempotency + dedup everywhere.** Claims, handoffs, and lock acquisitions
  are keyed so a retry never double-acts.
- **Fail safe, surface truth.** Drift is never hidden.
- **No canonical state leaves the contracts.** Adapters are replaceable surfaces
  around Recoder state, never owners of it.

It fuses three owned sources — agent-os `WorkLock`/`WorkSignal`/`TaskRouting`,
the docker-backend A2A bus/squad/delegation services, and ported multica claim
semantics — into one deterministic engine. See
[`docs/subsystems/coordination.md`](../../docs/subsystems/coordination.md) for
the full architecture spec.

## Status

**Foundation** (this slice): config, domain contracts, ports, errors, result,
util. The capability modules (`engine`, `locks`, `dispatch`, `handoff`,
`coherence`) and adapters (`persistence`, `transport`) build on top of these.

## Build & test

```bash
pnpm --filter @recoder/coordination check-types
pnpm --filter @recoder/coordination build
pnpm --filter @recoder/coordination test
```
