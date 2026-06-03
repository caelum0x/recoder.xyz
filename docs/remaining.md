# Recoder Paid-User Remaining Work

Last updated: 2026-06-03

This doc tracks only what is NOT done before paid users. (Shipped baseline + the agent capability/collaboration layer live in git history.)

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

1. GitHub repo connection and PR artifacts.
   Add repo connection, branch mapping, PR creation/attachment, review state, check state, and issue/task linking as first-class run artifacts.
   - 2026-06-03 update: workspace settings now expose a repo/PR panel backed by `/api/git/*` so a user can connect a repo by clone URL, inspect origin/branch state, select a workspace task, reuse its branch context when opening a PR, and inspect PR reviews/checks. Remaining work is the broader issue/linking polish and end-to-end product path, not the absence of any user-facing repo/PR surface.

2. Main task timeline.
   Make the product path visibly show task -> artifact -> PR -> preview -> approval from shared run history, not demo-only or per-page state.
   - 2026-06-03 update: mission-control task detail now surfaces attached GitHub PR metadata, preview deployment state, approval linkage, and human-readable PR/preview timeline entries from shared task context. Remaining work is the broader end-to-end product path, not the absence of those shared run-context fields.

3. Live preview and edge rollout.
   Activate preview host routing, TLS/DNS, private preview access, rate limits, WAF hooks, and production rollout for the in-repo edge scaffold. This maps to ready issue `recoder-zvss`.
   - 2026-05-31 update: the retired browser coding host now redirects to the dashboard. The remaining preview/edge work should attach evidence to Spaces/shared run history, not revive the retired app.

4. Deploy hygiene.
   Resolve the local<->prod git divergence that still makes full Hetzner deploys risky from this branch. This maps to issue `recoder-js56`.
   - 2026-05-31 update: the Daytona control plane and runner are recovered on Hetzner. `daytona-api`, proxy, db, redis, dex, minio, registry, and runner are healthy; a disposable sandbox create reached `started` and was destroyed.
   - 2026-05-31 update: `docker-backend` is healthy in production and the retired browser coding container/image has been removed. The remaining work is deploy hygiene/reconciliation, not missing Daytona infra.

5. Production traffic and abuse controls.
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
5. `docs/todo` as backlog/reference material.
