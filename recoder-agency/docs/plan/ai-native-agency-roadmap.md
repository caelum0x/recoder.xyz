# Recoder Agency: AI-Native Agency Roadmap

Last updated: 2026-02-11

Execution tracking note:
- Canonical cross-repo production tracker is `/Users/arhansubasi/recoder.xyz/plan.md`.
- This file remains roadmap/reference for agency scope and milestones.

## Strategic Positioning

Problem: Traditional agencies scale with headcount and manual operations.

Opportunity: Build an AI-native agency platform that delivers finished client work with software-like margins.

## Product Portfolio (recoder.xyz)

| Product | What | Status | Priority |
|---|---|---|---|
| Recoder | AI web IDE (build/deploy) | Built | Maintain + integrate |
| Recoder Agency | AI-native agency platform | Active build | P0 |
| OpenClaw (fork) | Channel gateway + conversational agent | Extract + integrate | P0 |
| Recoder Skill | Claude Code skill for Recoder API | Shipped | Maintain |
| Recoder PM | AI product management | Planned | P2 |

## North Star

- Finished work delivery, not draft-only output.
- Lower cycle time from brief to approved deliverable.
- Higher gross margin via automation and guardrails.

Primary KPIs:
- `client_acceptance_first_pass`
- `delivery_cycle_time`
- `forced_transition_rate`
- `rework_rate` (`client_review -> in_progress`)
- `gross_margin_per_project`

---

## What Is Shipped

Platform and workflow:
- Delivery state machine and transition guardrails.
- Transition history with source/forced metadata and admin filters/pagination.
- Force transition with required reason.
- Retry panel suggestions for invalid/failing transitions.

Ops and metrics:
- Delivery Ops page with stuck projects, forced transitions, rework spikes.
- Exception Queue panel (invalid, forced, retry-needed) with deep links.
- Weekly KPI materialized view and dashboard KPI cards.
- KPI freshness signal and comparison windows.

Client review hardening:
- Optimistic approve/reject flows with rollback/error handling.
- Bulk approve/reject actions.
- Strict audit reason requirement for reject paths.

Security and reliability:
- RBAC hardening for admin mutation paths.
- Project status audit guard trigger.
- Release readiness assertions and restore drill logging.
- Cron endpoint rate limiting for `/api/agency/cron/*`.
- CSP header (tightened to specific domains).
- Zod-based env validation with production-fatal secret checks.
- Health endpoint with DB probe, timestamp, version.
- Sentry environment tagging (server, edge, client).

CI and release gates:
- Deploy Gate includes required agency smoke jobs.
- Seeded transition smoke included in required gate.
- Post-gate `/api/health` probe.
- Trivy container scan workflow with CycloneDX SBOM artifact.
- Staging-to-production promotion workflow with manual environment approval gate.

Runbooks:
- Delivery staging, rollout checklist, rollback snippets.
- Incident response, production troubleshooting, monitoring/alerts, disaster recovery.
- Release promotion runbook.

---

## Immediate Blockers To Fully Operationalize (Config Only — No Code)

1. GitHub environment and secret setup:
   - Create `production-promotion` environment with required reviewers:
     `gh api repos/caelum0x/recoder.xyz/environments/production-promotion -X PUT -f 'reviewers[][type]=User' -f 'reviewers[][id]=<YOUR_USER_ID>'`
   - Add `PRODUCTION_DEPLOY_WEBHOOK_URL` repo secret (your Vercel/Railway deploy hook URL).
   - Add `ALERT_WEBHOOK_URL` repo secret (Slack incoming webhook or PagerDuty integration URL).

2. Polar.sh configuration:
   - Set `POLAR_ACCESS_TOKEN`, `POLAR_PRO_PRODUCT_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_ORGANIZATION_ID` in production env.
   - Configure webhook endpoint in Polar dashboard: `https://<your-domain>/webhooks/polar`

3. Recoder-Web integration:
   - Set `RECODER_WEB_URL` and `RECODER_WEB_API_KEY` for auto-build trigger.
   - Configure webhook callback in recoder-web: `https://<your-domain>/api/webhooks/recoder-web`

4. Secrets hygiene and rotation:
   - Replace any placeholder/test credentials in runtime envs.
   - Rotate auth/OAuth/payment/email secrets in secret manager.

5. Staging evidence run (single clean pass):
   - `ops:staging:cleanup-weekly-metrics-fixture`
   - `ops:staging:seed-weekly-metrics-fixture`
   - `ops:staging:log-restore-drill`
   - `ops:staging:assert-release-readiness`

---

## Architecture: The AI-Native Agency

```
Client (WhatsApp / Slack / Telegram / Discord / Portal)
                        |
                Channel Gateway  (extracted from OpenClaw fork)
                   - channel connectors
                   - session + identity management
                   - message routing
                        |
                  Agency Agent  (conversation + business logic)
                   - brief intake from natural language
                   - project status queries
                   - deliverable approval via chat
                   - change order handling
                   - client digest via messaging channels
                        |
            +-----------+-----------+
            |           |           |
        Giselle     Recoder-Web   Polar.sh
      (workflows)  (build/deploy) (billing)
```

### What OpenClaw Gives Us (fork, not rewrite)

| Capability | Agency Use Case | Build-from-scratch cost |
|---|---|---|
| Channel connectors (WA/Slack/TG/Discord) | Clients reach the agency on any channel | 6-8 weeks |
| Cross-channel identity linking | Same client, same session across platforms | 4-6 weeks |
| Session memory + RAG | Agent remembers past briefs, preferences, feedback | 3-4 weeks |
| Multi-turn conversation engine | "Actually, change that color" without losing context | 2-3 weeks |
| Group chat handling | Client team @mentions the agent in Slack channel | 2-3 weeks |
| Tool execution mid-conversation | Agent triggers recoder-web build while chatting | 2-3 weeks |
| **Total** | | **~20-27 weeks saved** |

### What Needs Rework in the Fork

| OpenClaw Assumption | Agency Reality | Required Change |
|---|---|---|
| Single-user on laptop | Multi-tenant SaaS | Add tenant isolation |
| SQLite + filesystem | Postgres + Supabase | Swap storage layer |
| One agent per gateway | One agent per client/project | Multi-agent routing |
| No business context | Briefs, budgets, deadlines | Connect to agency DB |
| No billing | Polar.sh subscriptions + usage | Integrate Polar.sh |

### License

OpenClaw is MIT licensed. No CLA, no patent restrictions. Fork, modify, and commercialize freely. Must include license text in distributions.

---

## Next Execution Queue

### Phase A: Production Readiness Completion (P0) — **Code Done, Config Remaining**

All code is in place. Remaining items are operational configuration:

1. ~~Promotion gate activation~~ — `promote-staging-to-production.yml` coded.
   - **Config needed:** Create `production-promotion` GitHub environment with required reviewers. Add `PRODUCTION_DEPLOY_WEBHOOK_URL` repo secret. Then dry-run with `dry_run: true`.

2. ~~Observability closure~~ — `ops-alert-routing.yml` coded. `alert-sender.ts` supports email + Slack webhook + channel fan-out. `alertSubscriptions` DB table ready.
   - **Config needed:** Add `ALERT_WEBHOOK_URL` (and optional `ALERT_WEBHOOK_BEARER`) repo secret pointing to Slack incoming webhook or PagerDuty integration URL.

3. ~~Secrets and auth cleanup~~ — Env validation in place, canonical names used.
   - **Config needed:** Rotate secrets in production secret manager. Remove any placeholder values.

Exit signal:
- Deploy Gate green, promotion dry run green, alerting verified, release checklist fully green.

### Phase B: Channel Gateway (P0) — **Done**

Built from scratch as `apps/channel-gateway/` instead of forking OpenClaw. All capabilities achieved via simpler, purpose-built implementation:

1. ~~Fork OpenClaw into monorepo.~~ **Superseded** — built `apps/channel-gateway/` from scratch (simpler than extraction; OpenClaw at `/openclaw/` available for future reference).
2. ~~Extract channel connectors.~~ **Done** — WhatsApp (Meta Cloud API), Slack (Events API + interactive), Telegram (Bot API), Discord (Ed25519 interactions + gateway bot).
3. ~~Replace SQLite with Postgres.~~ **N/A** — never used SQLite. Channel gateway is stateless; `channel_conversations` + `channel_messages` tables in agency Postgres.
4. ~~Replace filesystem credentials with vault.~~ **N/A** — env vars from the start, no filesystem credentials.
5. ~~Add tenant context to session routing.~~ **Done** — `channel_identities` table links (provider, providerUserId) → (clientDbId, teamDbId). Dispatch includes tenant context.
6. ~~Build webhook endpoints in agency.~~ **Done.**
7. ~~Wire channel triggers into Giselle trigger registry.~~ **Done.**
8. ~~Wire channel actions into Giselle action registry.~~ **Done.**

Additional completed work:
- Channel gateway API routes (`/api/channel-gateway/messages`, `/api/channel-gateway/actions`).
- DB tables: `channel_identities`, `channel_gateway_events`, `channel_conversations`, `channel_messages` (migrations 0109-0111).
- WhatsApp/Slack trigger + action providers in protocol, trigger-registry, action-registry.
- ActionData discriminated union expanded for WhatsApp/Slack in protocol.
- execute-action.ts + resolve-trigger.ts updated for WhatsApp/Slack.
- Workflow designer UI exhaustive switch fixes for new providers.
- Conversation persistence, intent detection, agent orchestrator wired end-to-end.

Future enhancement opportunities (from OpenClaw reference):
- Cross-channel identity linking algorithms (same person across WhatsApp + Slack)
- RAG on conversation history for context retrieval
- Per-sender/per-group/per-thread session scoping
- Additional channel plugins (Matrix, Teams, Signal)

Exit signal:
- Client sends WhatsApp message, agency agent responds with project status.

### Phase C: Agency Agent (P0) — **Done**

1. ~~Natural language brief intake:~~ **Done.**
   - `agent-orchestrator.ts` `handleCreateBrief()` — creates project from intent, triggers async AI quote generation.

2. ~~Project status via chat:~~ **Done.**
   - `handleStatusCheck()` — returns project status, deliverable counts, pending reviews, pending quotes.

3. ~~Deliverable review via chat:~~ **Done.**
   - `handleApproveDeliverable()` / `handleRejectDeliverable()` — approves/rejects with project state transitions.
   - `handleRequestRevision()` — AI feedback analysis via `feedback-analyzer` workflow, creates change orders.
   - `handleApproveQuote()` — approves pending quotes, transitions project to in_progress.

4. ~~Client digest via channels:~~ **Done.**
   - `client-digest.ts` now sends weekly summary via `notifyClient()` (WhatsApp/Slack/Telegram/Discord) in addition to email.

Additional completed work:
- `executeIntent()` orchestrator wired into channel gateway message handler (replaces guidance-text fallback).
- `handleGeneralQuestion()` — AI-powered contextual responses using conversation history and project context.
- Exhaustive intent type handling with `never` check for type safety.
- Fire-and-forget async quote generation pattern.
- Audited project transitions via `applyProjectTransitionWithAudit`.

Exit signal:
- Full brief-to-delivery cycle completed via WhatsApp without portal login.

### Phase D: AI Worker Automation (P1) — **Done**

1. ~~Auto-quote generation from brief (currently manual).~~ **Done** — `triggerQuoteGeneration()` in orchestrator fires `generateQuoteFromBrief()` async on brief creation.
2. ~~Auto-build via Recoder-Web when quote accepted.~~ **Done** — `handleApproveQuote()` calls `triggerAutoBuild()` (fire-and-forget) which invokes `triggerBuildFromQuote()` → recoder-web `/api/public/projects/prompt`.
3. ~~Auto-QA gate with AI review before client delivery.~~ **Done** — Recoder-web webhook handler runs `evaluateDeliverableQaGate()` on build completion. QA pass → `pending_review` + `client_review` transition. QA fail → stays `draft`, logged to `deliverable_qa_gate_runs`.
4. ~~Auto-revision from client feedback (change order → re-run workflow).~~ **Done** — `handleRequestRevision()` calls `analyzeFeedbackAndCreateChangeOrder()` which creates AI-analyzed change orders.

Exit signal:
- Brief-to-deliverable with zero human intervention on standard projects.

### Phase E: Billing Integration — Polar.sh (P1) — **Done**

1. ~~Polar.sh subscription management for agency clients.~~ **Done** — checkout, cancel (revoke), customer portal redirect, webhook handling (subscription.active/canceled, order.paid).
2. ~~Usage-based billing tied to project cost ledger.~~ **Done** — `triggerMilestoneInvoice()` auto-creates Polar checkout when billable milestone deliverable is approved. Invoice amount split evenly across billable milestones from quote price.
3. ~~Invoice generation and payment tracking via Polar.sh API.~~ **Done** — invoice creation, send via Polar checkout, order.paid webhook updates invoice status.
4. ~~Margin analytics updated with Polar.sh revenue data.~~ **Done** — `order.paid` webhook marks invoices paid → `project_unit_economics` materialized view picks up `paid_revenue_cents` → margin KPI cards and unit economics dashboard reflect Polar revenue.

Additional completed work:
- Stripe SDK fully removed, Polar SDK `@polar-sh/sdk` integrated.
- `services/external/polar/config.ts` + `index.ts` (lazy singleton client).
- Polar webhook handler with Standard Webhooks HMAC-SHA256 verification.
- DB migration 0112: `stripe_customer_id`→`polar_customer_id`, `stripe_invoice_id`→`polar_order_id`, old Stripe tables dropped, `polar_subscription_histories` created.
- Subscription history recording simplified for Polar model.
- Giselle integration header updated (`polar-customer-id`).
- Env validation updated (Stripe vars removed, Polar vars added).

Exit signal:
- Client billed automatically via Polar.sh on deliverable approval.

### Phase F: Margin and Scale Optimization (P1) — **Core Done**

1. ~~Delivery playbooks library.~~ **Done** — `deliveryPlaybooks` table with phases (JSON), `upsertDeliveryPlaybook()` and `createProjectFromPlaybook()` in `playbook-actions.ts`. Projects auto-created with deliverables matching playbook phases, inherited budgets and SLAs.
2. ~~Model/provider cost routing policies.~~ **Done** — `modelRoutingPolicies` table with preferred/fallback models, cost ceilings per generation, project-scoped and team-wide policies. `resolveModelRoutingPolicyForWorkspace()` resolves best policy. `getEffectiveModelRoutingByProject()` and `getTeamModelCostBreakdown()` provide cost analytics. Cost ceiling tracked via `generationCostLogs.routingPolicyDbId`.
3. ~~Capacity/WIP board and routing alerts.~~ **Done** — `teamCapacitySettings` with max concurrent projects/member. `getTeamCapacitySnapshot()` returns active counts, per-member loads, over-limit flags. Capacity check wired into `handleCreateBrief()` — warns client when team is at capacity. Cost guardrail check on project completion reports budget usage. `delivery-ops.ts` provides stuck/breached/rework alerts via `checkAndFireAlerts()`.

Exit signal:
- Forced transitions and rework trend down week-over-week, margin KPI stable/improving.

---

## Definition of Production-Grade (Agency)

The app is production-grade when all of the following are true:
- Required deploy gate jobs are mandatory in branch protection.
- Promotion workflow is operational with manual approval and webhook deploy.
- Release readiness assertions pass on staging with fresh restore evidence.
- Core smokes are green nightly and on demand.
- Secrets are rotated and managed via secure secret manager only.
- Runbooks are actionable and tested in drills.

Release decision artifact:
- `docs/plan/release-readiness-scorecard.md`
