# Recoder Paid-User Remaining Work

Last updated: 2026-05-14

## Current Shipped Baseline

The current product direction is no longer generic session or token resale. Recoder now sells the control plane around Spaces, connected agents, approvals, artifact retention, and preview deploy capacity.

Shipped through `recoder-7xqf`:

- Spaces are the primary signed-in conversion path.
- Connecting an agent is the first activation milestone.
- Dashboard and Spaces surfaces show the task -> artifact -> PR -> preview -> approval loop.
- Subscription entitlements are normalized around workspaces, connected agents, approvals, retention, and preview deploys.
- Legacy session and token quota fields still exist for compatibility, but auth, billing, CLI quota/proxy, user quota, usage tracking, analytics, and plan config now derive those fields from the same commercial entitlement model.
- Preview deploy artifacts and private preview access are represented as run/task evidence instead of separate deploy-only state.
- `recoder-edge` exists as a scaffold for preview routing and security policy, but live edge rollout is not complete.

## What Remains Before Paid Users

The next launch gate is a paid-user loop that a real user can complete without internal help:

1. Sign up.
2. Choose a plan.
3. Create the first Space.
4. Connect at least one agent.
5. Connect a GitHub repo.
6. Create or claim a task.
7. Produce an artifact.
8. Open or attach a PR.
9. Create a protected preview.
10. Approve the result.
11. See billing limits and upgrade prompts tied to the same loop.

## Priority Order

1. Funnel analytics and KPI visibility.
   Track homepage -> signup -> choose plan -> create Space -> connect agent -> first task -> first artifact -> first approval. This maps to ready issue `recoder-krxl`.

2. GitHub repo connection and PR artifacts.
   Add repo connection, branch mapping, PR creation/attachment, review state, check state, and issue/task linking as first-class run artifacts.

3. Main task timeline.
   Make the product path visibly show task -> artifact -> PR -> preview -> approval from shared run history, not demo-only or per-page state.

4. PM and Agency shared ingress.
   Move PM and Agency A2A ingress normalization onto the shared contract so approvals, handoffs, and client review loops cannot drift into local state. This maps to ready issue `recoder-9s5j`.

5. Live preview and edge rollout.
   Activate preview host routing, TLS/DNS, private preview access, rate limits, WAF hooks, and production rollout for the in-repo edge scaffold. This maps to ready issue `recoder-zvss`.

6. Deploy unblock.
   Resolve the Daytona backend source gap that blocks full Hetzner deploys from this branch. This maps to ready issue `recoder-okcz`.
   - 2026-05-31 update: the Daytona control plane and runner are recovered on Hetzner. `daytona-api`, proxy, db, redis, dex, minio, registry, and runner are healthy; a disposable sandbox create reached `started` and was destroyed. This item now means branch/deploy reconciliation, not missing Daytona infra.

7. Production traffic and abuse controls.
   Add Cloudflare/CrowdSec/open-appsec style mitigation rules after real traffic signals are instrumented. This maps to ready issues `recoder-a9rp` and `recoder-rbc2`.
   - 2026-05-31 (recoder-rbc2, analysis done): Investigated the suspected "Finland" abuse signal via Cloudflare analytics. It was NOT external abuse — it was the prod box (Hetzner Helsinki, IPv6 2a01:4f9:c013:9cb6::1) self-polling `/api/platform/activity` and getting 403'd by Bot Fight Mode. No mitigation rule added (a FI block would self-block production). The 403 root cause was fixed instead (internal loopback calls + INTERNAL_SERVICE_KEY). Real abuse-mitigation rules remain deferred until a genuine external signal appears.

## Deferred

These are still valid product directions, but they should not block the paid-user launch loop:

- Hosted sandbox runner breadth.
- Full browser-task lane.
- Desktop/computer-use lane.
- Marketplace.
- Full Cloudflare-like edge product.
- Recoder Launch and GTM Radar.
- Broad Agency OS features beyond review, approval, and client-safe delivery artifacts.

## Operating Rule

When roadmap documents conflict, use this order:

1. `docs/plan.md` for current execution sequencing.
2. `docs/remaining.md` for the current paid-user launch gate.
3. `docs/prd.md` for product requirements.
4. `docs/product.md` for public narrative.
5. `docs/big-plan.md` and `docs/todo` as backlog/reference material.
