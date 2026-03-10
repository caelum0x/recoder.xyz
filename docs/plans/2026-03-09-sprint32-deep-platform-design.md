# Sprint 32: Deep Platform Development — Design Document

**Date:** 2026-03-09
**Scope:** AI Capabilities, Agent Workflows, Analytics, Developer Experience, Mobile/Responsive
**Approach:** Sequential deep dives in dependency order
**Location:** recoder-agents (primary), backend, app, recoder-agency, packages/recoder-code

---

## Execution Order

1. AI Capabilities (foundation — workflows and analytics depend on this)
2. Agent Workflows (core differentiator — analytics needs workflow data)
3. Analytics & Insights (builds on AI + workflow infrastructure)
4. Developer Experience (documents all new APIs)
5. Mobile & Responsive (polish layer on everything above)

---

## Section 1: AI Capabilities

### 1A. Context Compression

When a thread approaches the model's context window limit, automatically compress older messages.

- New `context-compressor.ts` in `recoder-agents/src/lib/streaming/`
- Triggers at 80% context usage
- Preserves: system prompt, last N user/assistant turns verbatim, tool call results from current task
- Compresses: older conversation turns into structured summary (key decisions, code references, file paths)
- Backend endpoint: `POST /threads/{threadId}/compress`
- Frontend: toast notification + indicator changes from red back to blue

### 1B. Provider Fallback Routing

When a primary AI provider fails, automatically fall back to an equivalent model.

- New `provider-fallback.ts` in `backend/core/ai/`
- Fallback chains per tier:
  - Premium: Claude Sonnet 4 → GPT-5.1 → Gemini 2.5 Flash
  - Standard: DeepSeek V3 → Qwen3 Coder → Gemini 2.0 Flash
- 1 attempt on primary, then cascade through fallbacks
- Expose `model_used` + `fallback_reason` in streaming response
- Frontend: subtle badge "Answered by [model]" when fallback was used
- Users can disable fallback or customize chain in agent settings

### 1C. Cost Prediction

Before an agent run starts, estimate cost based on prompt size and expected output.

- New `cost-estimator.ts` in `recoder-agents/src/lib/api/`
- Uses model pricing (already in billing API) + input token count + historical output multiplier
- Shows estimate in agent start confirmation: "Estimated cost: ~$0.03"
- Backend: `GET /agents/{agentId}/cost-estimate?prompt_length=N&model=M`

---

## Section 2: Agent Workflows

### 2A. Workflow Schema

Restore deleted workflow tables (from migration 20250417) with refinements.

**Tables:**
- `workflows` — id, agent_id, name, description, definition (JSONB DAG), version, status (draft/active/archived)
- `workflow_nodes` — id, workflow_id, type, config (JSONB), position_x/y
- `workflow_edges` — id, workflow_id, source_node_id, target_node_id, condition (JSONB)
- `workflow_executions` — id, workflow_id, status (pending/running/paused/completed/failed/cancelled), started_at, completed_at, trigger_type, trigger_data
- `workflow_node_executions` — id, execution_id, node_id, status, input/output (JSONB), started_at, completed_at, error, cost_tokens
- `workflow_templates` — id, name, description, category, definition, is_featured

**Node types:** agent, tool, condition, loop, parallel, delay, approval, input, output

### 2B. Workflow Execution Engine

- New `workflow_engine.py` in `backend/core/workflows/`
- DAG topological sort → execute nodes in dependency order
- Parallel branches via asyncio tasks
- Approval nodes: pause execution, emit notification, resume on user action
- Per-node retry, per-node and per-workflow timeouts
- State persistence after each node (crash recovery)
- Platform events for execution lifecycle

### 2C. Visual Workflow Editor (React Flow)

- New route: workflows screen in agent config (replace current tool config)
- Components in `recoder-agents/src/components/workflows/`:
  - `WorkflowCanvas.tsx` — React Flow with custom nodes, minimap, controls
  - `WorkflowNodePalette.tsx` — draggable sidebar with node types
  - `WorkflowNodeConfig.tsx` — right panel for node parameters
  - `WorkflowEdgeConfig.tsx` — condition editor for conditional edges
  - `WorkflowToolbar.tsx` — save, run, version history, template save
  - `WorkflowExecutionView.tsx` — live execution with node status indicators
- Custom node rendering: icon, title, status badge, mini preview
- Animated edges during execution
- Auto-layout via dagre algorithm

### 2D. General-Purpose Approval Gates

Generalize Apify/A2A patterns into reusable framework.

- `ApprovalGate` model: id, workflow_execution_id, node_id, status, context (JSONB), ttl_seconds
- Endpoints: `POST /workflows/approvals/{id}/approve` and `/reject`
- Notification: pending approvals → NotificationBell
- `ApprovalRequestCard` component with approve/reject buttons
- Approvals dashboard: `/dashboard/approvals`
- Configurable TTL, defaults to 24h, auto-rejects on expiry

### 2E. Workflow Templates

8-10 starter templates:
- Daily Standup Report, PR Review Pipeline, Research & Report, Data Pipeline, Customer Support Triage, etc.
- Template gallery in workflow creation dialog
- "Save as Template" in workflow toolbar

---

## Section 3: Analytics & Insights

### 3A. Model Performance Metrics

- Extend analytics: add `response_latency_ms`, `time_to_first_token_ms`, `error_code` to run records
- New endpoint: `GET /agents/{agentId}/analytics/models`
- Frontend: "Model Performance" tab — comparison table, latency histogram, error rate trends, recommendation badges

### 3B. Workflow Execution Analytics

- `GET /workflows/{id}/analytics` — execution count, success rate, bottleneck nodes, failure hotspots
- `GET /workflows/analytics/overview` — aggregate across all workflows
- Frontend: execution timeline (gantt), bottleneck heatmap, failure funnel, cost per node

### 3C. Cost Dashboard & Budget Alerts

- New page: `/billing/cost-dashboard`
- Daily/weekly/monthly cost trend, cost by agent, cost by model, cost by workflow vs ad-hoc
- Projected monthly cost (linear extrapolation)
- Budget alerts: user sets threshold → notification at 80% and 100%
- `budget_alerts` table: user_id, threshold_amount, alert_type, notified_at

### 3D. Real-Time Execution Monitor

- "Active Runs" sidebar section with count
- Expandable list: agent name, model, elapsed time, tokens, estimated cost
- Piggyback on SSE heartbeat events
- Auto-remove completed runs after 5s

---

## Section 4: Developer Experience

### 4A. OpenAPI Specification

- Python backend: expose FastAPI native OpenAPI at `/openapi.json`, annotate routes with Pydantic models
- Docker-backend: add `swagger-jsdoc` + `swagger-ui-express`, JSDoc annotations, serve at `/api-docs`
- Versioned specs committed to `docs/api/openapi-{service}.json`

### 4B. Interactive API Explorer

- New page: `/developers` in recoder-agents
- Embed Scalar (open-source) pointing at OpenAPI specs
- Auth: paste API key for live requests
- Auto-generated code snippets (curl, Python, TypeScript, Go)

### 4C. SDK Documentation

- Guides in `docs/sdk/`: getting-started, agents, workflows, triggers, streaming, billing
- Serve from `/developers/docs` (MDX rendering)
- `recoder-code docs` command opens docs in browser

### 4D. CLI Enhancements

- Location: `packages/recoder-code/packages/cli/`
- New commands: `workflow list|run|status`, `analytics`, `cost`, `whoami`, `docs`
- Tab completion for zsh/bash
- Improved `--help` with examples

---

## Section 5: Mobile & Responsive

### 5A. Cross-App Safe Area & Viewport

- `app/app/layout.tsx`: add `viewportFit: 'cover'`
- `app/app/globals.css`: safe-area CSS variables
- `recoder-agency/apps/agency/app/layout.tsx`: same
- Audit all `fixed bottom-0` elements — add safe area padding

### 5B. Responsive Navigation

- `app/`: collapsible sidebar with hamburger, bottom tab bar on mobile
- `recoder-agency/`: stacking cards, hamburger menu for header
- Extract `useIsMobile` to `@recoder/ui`

### 5C. Service Worker & Offline Support

- `recoder-agents/public/sw.js`: cache-first static, network-first API, background sync
- Registration in layout.tsx with update prompt
- Offline indicator banner
- Cache prune: 7-day max, 50MB cap

### 5D. Touch-Friendly Workflow Viewer

- `WorkflowMobileView.tsx`: vertical card list instead of canvas
- Nodes as cards with expand/collapse
- Approval nodes: full-size touch targets (48px min)
- Conditional: `useIsMobile()` switches between canvas and mobile view

### 5E. Mobile App Banner & Deep Linking

- Port `MobileAppBanner` to `app/app/components/`
- iOS/Android detection + smart app banner
- `recoder://` deep link scheme
- Dismissible with 7-day cookie

---

## Dependencies

```
AI Capabilities (1) ──→ Agent Workflows (2) ──→ Analytics (3) ──→ DX (4) ──→ Mobile (5)
                                                      │
                                                      └── Workflow analytics needs workflow data

DX (4) documents APIs from sections 1-3
Mobile (5) needs workflow viewer from section 2
```

## Risk Mitigation

- Workflow engine is the highest-risk item. If it blocks, analytics and DX can proceed with agent-only scope.
- React Flow may need custom node types — budget time for component development.
- Service worker caching strategy needs careful testing to avoid stale content issues.
- OpenAPI annotation is mechanical but time-consuming — prioritize agent/workflow endpoints over legacy routes.
