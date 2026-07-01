# Recoder — Plan Model & Entitlement Decisions

> The resolved product decisions behind the Free/Pro/Team/Enterprise tiers and the
> entitlement gate. Grounded in [`PRD.md`](./PRD.md) (FR-1/FR-2/FR-7),
> [`PRODUCTS.md`](./PRODUCTS.md), and the live site plans (`site/app/page.tsx`
> `PLAN_PEEK`). The **durable source of truth is the billing port (Polar)**; this file
> records the *policy the code encodes* as the deny-safe floor.

## Tiers

| Tier | Price | What it is |
|------|-------|-----------|
| Free | $0 | The local desktop console — BYOK, your Mac, your keys |
| Pro | (coming) | Higher limits + retention |
| Team | (coming) | Seats + shared approvals |
| Enterprise | Custom | SSO, audit, self-host |

## Decision 1 — Local agents are UNLIMITED on every tier

PRD FR-1/FR-2: a solo developer runs **2–8 agents in parallel on their Mac, their
keys**. Recoder never caps *local* concurrency — it's your machine and your provider
spend. The cockpit shows a live **"N agents"** status count, never a local cap and
never a block on creating a workspace.

Metering applies to **hosted/remote** execution (Daytona), where Recoder pays:

- **`remote_substrate` is Pro+** — Free cannot flip a workspace remote. Enforced
  server-side by the conductor entitlement gate (`docker-backend/src/conductor/entitlement-gate.ts`),
  **fail-safe to local tmux** when billing is unconfigured or the plan gates it.
- Hosted-concurrency limits (`parallel_agents` in
  `packages/distribution/src/channels/billing/plan-capabilities.ts`) describe the
  *hosted* ceiling a paid tier gets — **not** a local cap.

Code: cockpit `parallelAgentLimit()` returns `Infinity` on every tier (local is
uncapped); the indicator is a live count.

## Decision 2 — Seats meter org membership, not concurrency (Team+)

FR-7 + site plans: you pay Recoder for *orchestration / **seats** / approvals*. Seats
are the **Team** concept ("seats + shared approvals").

- **Free / Pro: 1 seat** (individual plans).
- **Team: a real seat pool** (default 25 — the `team_seats` capability).
- **Enterprise: unlimited.**

Helpers: `seatsForPlan(plan)` / `canAddSeat(occupied, plan)` (distribution) and
`seatLimit(plan)` (cockpit). **Deny-safe**: unknown plan → 1 seat; never over-grants.

## Invariants

- The entitlement gate **fails safe to deny** (PRD FR-7): unconfigured billing → the
  Free floor; a planner/UI bug can never lift a tier above its floor.
- Free always works **BYOK**; a paid tier gates a *real* capability (remote substrate,
  seats) — never the local experience.
- The local desktop experience is **never degraded** by billing state.
