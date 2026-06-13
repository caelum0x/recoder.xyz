# Recoder Paid-User Remaining Work

Last updated: 2026-06-13

What is NOT done before paid users. Shipped history lives in git + closed `bd` issues.

## The launch gate

signup → choose plan → create Space → connect agent → connect GitHub repo →
create/claim task → produce artifact → open/attach PR → create protected preview →
approve → see billing limits + upgrade prompts on the same loop.

The user-facing surfaces exist and are locally tested. What remains is deployed
production verification plus the edge/deploy infra below.

## Priority order

1. **GitHub repo connection + PR artifacts** — deployed GitHub adapter/webhook
   verification against the production PR-artifact flow; deeper issue/linking polish.

2. **Main task timeline** — deployed UI/API verification of the
   `task → artifact → PR → preview → approval` path against real paid-user data.

3. **Live preview + edge rollout** (`recoder-zvss`) — live edge host routing,
   DNS/TLS, private preview hosts, rate limits, WAF hooks, production rollout
   evidence. *Infra access required.*

4. **Deploy hygiene** (`recoder-js56`) — reconcile local↔prod git divergence and
   produce production proof so full Hetzner deploys don't need scoped checkout/build
   handling. *Infra access required.*

5. **Production traffic + abuse controls** (`recoder-a9rp`, `recoder-rbc2`) —
   real-traffic threshold tuning + production alert review; external-abuse
   mitigation rules stay deferred until a real external signal appears.

## Deferred (do not block paid-user launch)

Hosted sandbox runner breadth · full browser-task lane · desktop/computer-use lane ·
marketplace · full Cloudflare-like edge product · Recoder Launch / GTM Radar ·
broad Agency OS features beyond review/approval/client-safe delivery.

## Operating rule

When roadmap docs conflict: plan.md → remaining.md (this gate) → prd.md →
product.md → todo. Use `bd ready --json` for the executable issue list.
