# Phases 30-33: Full Platform Completion — Design

> **Approved:** 2026-03-09

**Goal:** Complete all incomplete features, enable disabled capabilities, replace stubs with real implementations, harden infrastructure for production persistence, and clean up deprecated code across all Recoder apps.

**Approach:** Combines Outside-In (user-facing first), Inside-Out (foundation first), and Interleaved Waves into four sequential phases that progressively move from intelligence features → agency operations → infrastructure hardening → polish.

---

## Phase 30: Platform Intelligence

**Scope:** backend (Python), recoder-pm, recoder-agents

### 1. Enable Backend Memory Feature

- Set `ENABLE_MEMORY=true` in production config
- Verify memory API endpoints (`/memory/*`) return real data instead of 503
- Ensure per-tier gating works (`is_memory_enabled(tier_name)`)
- Config-only change + verification — no code modifications needed

### 2. PM RICE Scoring UI + Manual Trigger

**New page:** `/insights/opportunity-scoring/`

- Table view: features sorted by RICE score with Reach/Impact/Confidence/Effort columns
- Manual "Recalculate" button calling existing `opportunity-scoring.ts` backend function
- Filter/sort by individual RICE components
- Wire into existing AI jobs infrastructure for status tracking
- Export to CSV

**Files to modify:**
- `recoder-pm/apps/app/app/(organization)/insights/` — new route
- `recoder-pm/packages/backend/opportunity-scoring.ts` — add manual trigger endpoint
- `recoder-pm/apps/api/` — new API route for manual trigger

### 3. PM Contradictions Action Workflow

- Add action buttons to contradiction items: **Acknowledge**, **Dismiss**, **Snooze** (with duration picker)
- New status field on contradictions records (active/dismissed/acknowledged/snoozed)
- Filter by status in the contradictions list page
- Source drill-down: parse `sources` JSON blob and render as linked feedback/ticket references with clickable URLs
- Snoozed items auto-reactivate after duration expires

**Files to modify:**
- `recoder-pm/apps/app/app/(organization)/insights/contradictions/` — UI updates
- `recoder-pm/packages/backend/contradiction-detector.ts` — status management
- Database: migration for status column

### 4. Backend MRR Trending Calculation

- Implement `mrr_change_percent` in `analytics_admin_api.py` (currently `None`)
- Compare current month MRR vs previous month from stored subscription data
- Replace placeholder user sets with actual user tracking where feasible

**Files to modify:**
- `backend/core/admin/analytics_admin_api.py` — lines around 2708 and 3347

### 5. Agents: Unblock `/thread/new` Route

- Remove redirect guard in `recoder-agents/src/middleware.ts` (lines 102-105)
- Verify the route renders correctly and connects to thread creation flow
- Test that new thread creation works end-to-end

**Files to modify:**
- `recoder-agents/src/middleware.ts`

---

## Phase 31: Agency Operations

**Scope:** recoder-agency, docker-backend

### 1. Client Portal Completion

**Brief submission enhancements:**
- File input on brief form → store via Supabase storage driver (existing `supabase-storage-driver.ts`)
- localStorage draft auto-save with "Resume draft?" prompt on return
- Success confirmation page with brief ID and expected response timeline
- Brief status field: submitted → reviewing → accepted → in_progress
- Email confirmation on submission via existing Resend integration

**Files to modify:**
- `recoder-agency/apps/agency/app/(client)/portal/briefs/new/page.tsx`
- New: brief confirmation page
- New: brief status display component

### 2. Quote-to-Project Workflow

- Quote line items editor: select service SKUs, set quantity and unit price
- Quote status lifecycle: draft → sent → accepted → converted
- "Convert to Project" action that creates a project record from accepted quote data
- Quote expiration tracking with visual countdown indicator
- Client-facing read-only quote view in portal

**Files to modify:**
- `recoder-agency/apps/agency/app/(admin)/quotes/` — extend existing scaffolding
- `recoder-agency/apps/agency/app/(client)/portal/` — add quote view
- `recoder-agency/apps/agency/db/schema.ts` — quote line items table if needed

### 3. Admin Template CRUD (Edit/Delete)

- Edit button on existing templates (DoD, playbooks, routing policies) → opens edit form
- Delete with confirmation dialog
- Form validation for JSON phase definitions (parse + display errors)
- Inline editing for template name/description fields

**Files to modify:**
- `recoder-agency/apps/agency/app/(admin)/templates/page.tsx`

### 4. A2A Task Lifecycle Persistence (Redis Adapter)

- Replace `Map<string, TaskEnvelope>` in `task-lifecycle.service.ts` with Redis-backed store
- Use existing Redis instance (already running for monitoring infrastructure)
- Task state survives process restarts
- TTL-based cleanup for completed tasks (configurable retention window)
- Audit log entries persisted to Redis list with capped size (LTRIM)

**Files to modify:**
- `docker-backend/src/a2a/task-lifecycle.service.ts`
- New: `docker-backend/src/a2a/redis-task-store.ts`

### 5. Workflow Executor: Real Agent Delegation

- Replace `stubExecutor` in `workflow-messaging.routes.ts` with actual dispatch
- Route execution requests to registered agents via `agent-registry.service.ts`
- Pass context through `context-bridge.service.ts`
- Return real execution results instead of `'[stub] agentId: prompt...'`
- Error handling: timeout, agent unavailable, delegation failure

**Files to modify:**
- `docker-backend/src/a2a/workflow-messaging.routes.ts`

---

## Phase 32: Production Hardening

**Scope:** shared, docker-backend, backend (Python)

### 1. Distributed A2A State (Redis-Backed)

Replace all `InMemory*` services in `shared/src/a2a/persistent-services.ts`:

- `RedisAgentRegistry` — agent registration, discovery, health tracking
- `RedisCollaborationService` — cross-process agent coordination
- `RedisAuditLogService` — audit entries with capped list rotation
- `RedisTaskStore` — task state with TTL expiry

All adapters implement existing interfaces — drop-in replacements. Factory function selects in-memory vs Redis based on `REDIS_URL` availability.

**Files to modify:**
- `shared/src/a2a/persistent-services.ts` — add Redis implementations
- New: `shared/src/a2a/redis-persistence.ts` (or extend existing file)

### 2. Queue Worker Reprocessing (PM)

Fix stubbed job types in `recoder-pm/packages/queue/workers.ts`:

- `FEEDBACK_SENTIMENT` — implement actual sentiment analysis (call LLM or rule-based)
- `FEEDBACK_ANALYSIS` — implement analysis logic (extract themes, categorize)
- `FEATURE_RICE` — call `opportunity-scoring.ts` directly
- `DIGEST_GENERATE` — integrate with digest generation logic

Remove dependency on Prisma middleware for these — workers must be self-sufficient.

Add manual requeue API endpoint for failed jobs. Wire retry button in AI jobs page.

**Files to modify:**
- `recoder-pm/packages/queue/workers.ts`
- `recoder-pm/apps/app/app/(organization)/settings/ai-jobs/components/retry-button.tsx`
- `recoder-pm/apps/api/` — requeue endpoint

### 3. Agent Team Panel: Rejection + Expiry

- New endpoint: `POST /api/a2a/approvals/:approvalId/reject`
- Wire reject button in `AgentTeamPanel.tsx` alongside existing approve action
- Timeout/expiry: approvals auto-reject after configurable TTL (default: 30 minutes)
- Audit trail entries for approve/reject/expire events persisted via audit service

**Files to modify:**
- `docker-backend/src/a2a/approval-gate.service.ts`
- `recoder-web/app/components/workbench/AgentTeamPanel.tsx`
- `recoder-web/app/lib/stores/agent-team.ts`

### 4. Backend Golden Dataset Loader

- Implement `load_golden_dataset_from_logs()` in `backend/evals/datasets.py`
- Query stored evaluation runs from database
- Filter by success criteria (high-scoring outputs, successful completions)
- Return formatted dataset entries for eval runner consumption
- Add CLI command: `python -m evals.datasets --golden --limit 100`

**Files to modify:**
- `backend/evals/datasets.py` — replace empty `[]` return

### 5. Billing Period Tracking

- Add `stripe_current_period_end` column to relevant billing schema/model
- Populate from webhook events (invoice.paid, subscription.updated)
- Expose in account state API response (replace `current_period_end: None`)

**Files to modify:**
- `backend/core/billing/endpoints/account_state.py`
- Database migration for new column

---

## Phase 33: Polish & Cleanup

**Scope:** All apps

### 1. Agency Deprecated Code Removal

- Delete `recoder-agency/apps/agency/app/(main)/stage/(deprecated)/` directory
- Delete `recoder-agency/apps/agency/app/(main)/tasks/deprecated/page.tsx`
- Remove associated imports, route references, and dead type definitions
- Verify no runtime references remain

### 2. PM Portal Settings Completion

- Fix components returning `null`: `portal-statuses-card`, `productboard-imports-card`, `canny-imports-card`
- Replace with proper empty states: "No statuses configured" with setup CTA button
- Add portal URL customization form (input + save)
- Add feature gate toggles (enable/disable portal sections)

**Files to modify:**
- `recoder-pm/apps/app/app/(organization)/settings/portal/` components

### 3. PM Template Versioning

- Version counter field on templates
- "Duplicate as new version" action button
- Version history list in sidebar/modal
- Diff view between versions (text diff of JSON definitions)

### 4. Agency Delivery Ops Dashboard Finish

- Wire restore drill history to real backend data (remove mock rendering)
- Replace proportional rate trend bars with actual charts (use existing chart library)
- Add CSV export for all dashboard data sections
- Add scheduled alert delivery option (cron-based email digest via Resend)

**Files to modify:**
- `recoder-agency/apps/agency/app/(admin)/delivery-ops/page.tsx`

### 5. Silent Failure Fixes

- Agency vector store ingest: log errors with `console.error` instead of returning `[]`
- Agent team SSE: add EventSource reconnection logic (exponential backoff)
- Agency task execution: replace `return null` with error boundary components
- PM queue workers: add structured error logging on job processing failures
- Agency API routes: replace silent catch-all with typed error responses

---

## What's NOT In Scope

- Billing provider key configuration (requires external Paddle/DodoPayments accounts)
- Cursor/Windsurf/Replit wire protocols (blocked on upstream API specifications)
- Google Search Console verification (requires manual domain ownership verification)
- Native app releases (blocked on Apple/Google certificates)
- Real-time WebSocket notifications (polling sufficient for v1)
