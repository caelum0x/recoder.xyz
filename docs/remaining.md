# Recoder Paid-User Remaining Work

Last updated: 2026-06-13

Tracks only what is NOT done before paid users. Shipped baseline (the agent
capability/collaboration layer, Agent OS control plane, and the in-repo PR/
timeline/preview/approval scaffolding) lives in git history + closed `bd` issues.

## The launch gate

A paid-user loop a real user can complete without internal help:

signup → choose plan → create Space → connect agent → connect GitHub repo →
create/claim task → produce artifact → open/attach PR → create protected preview →
approve → see billing limits + upgrade prompts on the same loop.

The user-facing surfaces for every step exist and are locally tested. What remains
is **deployed production verification** plus the **edge/deploy infra** below.

## Priority order

1. **GitHub repo connection + PR artifacts** — remaining: deployed GitHub adapter/
   webhook verification against the production PR-artifact flow, and deeper issue/
   linking polish. (Shipped: workspace repo/PR panel on `/api/git/*`, branch mapping,
   PR create/attach, review/check state, issue→task linking as first-class artifacts.)

2. **Main task timeline** — remaining: deployed UI/API verification of the
   `task → artifact → PR → preview → approval` path against real paid-user data, not
   demo/per-page state. (Shipped: mission-control task detail + pipeline cards render
   attached issue/PR/preview/approval metadata from shared run history.)

3. **Live preview + edge rollout** (`recoder-zvss`) — remaining: live edge host
   routing, DNS/TLS, private preview hosts, rate limits, WAF hooks, production rollout
   evidence. (Shipped: protected preview deployment creation/refresh through the shared
   task preview route + in-repo edge scaffold.) *Infra access required.*

4. **Deploy hygiene** (`recoder-js56`) — remaining: reconcile local↔prod git divergence
   and produce production proof so full Hetzner deploys don't need scoped checkout/build
   handling. (Daytona control plane + runner are recovered and healthy; `docker-backend`
   is healthy in prod.) *Infra access required.*

5. **Production traffic + abuse controls** (`recoder-a9rp`, `recoder-rbc2`) — remaining:
   real-traffic threshold tuning + production alert review; genuine external-abuse
   mitigation rules stay deferred until a real external signal appears (the prior
   "Finland" signal was prod self-polling, root-caused and fixed, not external abuse).

## Deferred (do not block paid-user launch)

Hosted sandbox runner breadth · full browser-task lane · desktop/computer-use lane ·
marketplace · full Cloudflare-like edge product · Recoder Launch / GTM Radar ·
broad Agency OS features beyond review/approval/client-safe delivery.

## Operating rule

When roadmap docs conflict, use: plan.md (execution sequencing) → remaining.md (this
paid-user gate) → prd.md (requirements) → product.md (public narrative) → todo (backlog).
Use `bd ready --json` for the executable issue list.
