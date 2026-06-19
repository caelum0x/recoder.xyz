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
   verification against the production PR-artifact flow; `pnpm --dir docker-backend
   run agent-os:verify-paid-loop` now provides the repeatable API-level
   PR/preview/delivery-link evidence path; deeper issue/linking polish.

2. **Main task timeline** — deployed UI/API verification of the
   `task → instruction bundle → runtime evidence → artifact → PR → preview →
   approval → history/outbox` path against real paid-user data. The Agent OS UI
   now renders the API summary evidence cards locally; production proof is still
   required.

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

> Correction (2026-06-19): "Hosted sandbox runner breadth" here covers only the
> *expansion* of the sandbox lane, not its baseline. The base Daytona sandbox
> stack (8 containers) was STOPPED and its images REMOVED on 2026-06-19 to free
> disk at zero traffic — it is now dormant/re-provision-on-demand, not running.
> It is NOT deleted from the roadmap, but it must be re-stood-up before the
> paid-user runtime works. Treat re-provisioning the base Daytona runner as
> launch-blocking, separate from the deferred breadth above.

## Operating rule

When roadmap docs conflict: plan.md → remaining.md (this gate) → prd.md →
product.md → todo. Use `bd ready --json` for the executable issue list.
