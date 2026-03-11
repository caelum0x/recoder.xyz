# Sprint 59: Agent Environment Variables, Thread Summarization, Rate Limit Dashboard, Agent Dependency Graph & Bulk Operations

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add secure environment variable management per agent, automatic thread summarization with key points extraction, visual rate limit monitoring dashboard, interactive agent dependency graph visualization, and bulk operations across agents/threads — completing the configuration security, conversation intelligence, API governance, architecture visibility, and operational efficiency features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Environment Variables (Tasks 1-4)

### Task 1: Env Variables Schema

Create `backend/supabase/migrations/20260311800000_agent_env_variables.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_env_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  is_secret BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, key)
);

CREATE TABLE IF NOT EXISTS env_variable_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'revealed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_env_vars_agent ON agent_env_variables(agent_id);
CREATE INDEX idx_env_vars_user ON agent_env_variables(user_id);
CREATE INDEX idx_env_audit_agent ON env_variable_audit(agent_id, created_at DESC);
CREATE INDEX idx_env_audit_user ON env_variable_audit(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Env Variables API

Create `backend/core/agents/agent_env_vars_api.py`:

Router with tag `"agent-env-vars"`:
- `POST /agents/{agent_id}/env` — set env variable. Body: `{ key, value, is_secret?, description? }`. Upserts. Records audit. Auth required.
- `GET /agents/{agent_id}/env` — list env variables. Secret values masked as `***`. Auth required.
- `GET /agents/{agent_id}/env/{key}/reveal` — reveal secret value (records audit). Auth required.
- `DELETE /agents/{agent_id}/env/{key}` — delete variable. Records audit. Auth required.
- `POST /agents/{agent_id}/env/bulk` — bulk set. Body: `{ variables: [{ key, value, is_secret?, description? }] }`. Auth required.
- `GET /agents/{agent_id}/env/audit` — audit log. Query: `limit`. Auth required.

Register in `backend/api.py`.

### Task 3: Env Variables Frontend

Create `recoder-agents/src/lib/api/agent-env-vars.ts` and `recoder-agents/src/hooks/agents/use-agent-env-vars.ts`.

Hooks: `useAgentEnvVars(agentId)`, `useSetEnvVar()`, `useRevealEnvVar()`, `useDeleteEnvVar()`, `useBulkSetEnvVars()`, `useEnvVarAudit(agentId)`.

### Task 4: Env Variables UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/env-vars-screen.tsx`:

Environment variables screen:
- Variable list: key name (monospace), masked/revealed value, secret badge, description, reveal/edit/delete actions
- "Add Variable" dialog: key input (uppercase validation), value textarea, is_secret toggle, description
- "Bulk Import" dialog: paste KEY=VALUE format, parses into variables
- Reveal button with eye icon (records audit event)
- Audit trail section: action badge (created/updated/deleted/revealed), key name, timestamp
- Import/Export .env format

Wire into agent config as "Environment" tab with Lock icon.

---

## Phase 2: Thread Summarization (Tasks 5-8)

### Task 5: Summaries Schema

Create `backend/supabase/migrations/20260311800001_thread_summaries.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_points TEXT[] DEFAULT '{}',
  action_items TEXT[] DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  summary_type TEXT DEFAULT 'auto' CHECK (summary_type IN ('auto', 'manual', 'periodic')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, summary_type)
);

CREATE INDEX idx_summaries_user ON thread_summaries(user_id, created_at DESC);
CREATE INDEX idx_summaries_thread ON thread_summaries(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Summaries API

Create `backend/core/threads/thread_summaries_api.py`:

Router with tag `"thread-summaries"`:
- `POST /threads/{thread_id}/summarize` — generate summary. Extracts key points from messages (simple extraction: first sentence of each assistant message, or sentences with keywords like "important", "key", "action", "todo"). Identifies action items (messages containing "TODO", "should", "need to", "action"). Auth required.
- `GET /threads/{thread_id}/summary` — get latest summary. Auth required.
- `GET /summaries/recent` — recent summaries across threads. Query: `limit`. Auth required.
- `DELETE /summaries/{summary_id}` — delete summary. Auth required.
- `GET /summaries/stats` — summary stats: total summaries, avg key points, avg action items. Auth required.

Register in `backend/api.py`.

### Task 7: Summaries Frontend

Create `recoder-agents/src/lib/api/thread-summaries.ts` and `recoder-agents/src/hooks/threads/use-thread-summaries.ts`.

Hooks: `useSummarizeThread()`, `useThreadSummary(threadId)`, `useRecentSummaries()`, `useDeleteSummary()`, `useSummaryStats()`.

### Task 8: Summaries UI

Create `recoder-agents/src/components/thread/thread-summary-panel.tsx`:

Thread summary panel (collapsible card in thread view):
- Summary text in readable format
- Key points: bullet list with highlights
- Action items: checklist-style (checkbox appearance, read-only)
- "Regenerate" button
- Message count, word count, generated date
- Summary stats badge in thread header

Create `recoder-agents/src/app/(dashboard)/summaries/page.tsx`:

Summaries page:
- Recent summaries list: thread name, summary preview, key point count, action item count, date
- Stats header: total summaries, avg key points, avg action items
- Click to expand full summary

Wire summary panel into thread view.

---

## Phase 3: Rate Limit Dashboard (Tasks 9-12)

### Task 9: Rate Limit Schema

Create `backend/supabase/migrations/20260311800002_rate_limit_tracking.sql`:

```sql
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  limit_type TEXT NOT NULL CHECK (limit_type IN ('per_minute', 'per_hour', 'per_day', 'concurrent', 'burst')),
  current_count INTEGER DEFAULT 0,
  max_allowed INTEGER DEFAULT 0,
  was_blocked BOOLEAN DEFAULT false,
  occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint_pattern TEXT NOT NULL,
  limit_type TEXT NOT NULL,
  max_allowed INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, endpoint_pattern, limit_type)
);

CREATE INDEX idx_rate_events_user ON rate_limit_events(user_id, occurred_at DESC);
CREATE INDEX idx_rate_events_endpoint ON rate_limit_events(endpoint, occurred_at DESC);
CREATE INDEX idx_rate_events_blocked ON rate_limit_events(was_blocked) WHERE was_blocked = true;
CREATE INDEX idx_rate_configs_user ON rate_limit_configs(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Rate Limit Dashboard API

Create `backend/core/monitoring/rate_limit_dashboard_api.py`:

Router with tag `"rate-limit-dashboard"`:
- `GET /rate-limits/events` — list rate limit events. Query: `endpoint`, `blocked_only`, `hours` (default 24), `limit`. Auth required.
- `GET /rate-limits/summary` — summary: total events, blocked count, most hit endpoints, block rate %. Auth required.
- `GET /rate-limits/timeline` — events per hour for charting. Query: `hours` (default 24). Auth required.
- `GET /rate-limits/configs` — list rate limit configs. Auth required.
- `PUT /rate-limits/configs` — update rate limit config. Body: `{ endpoint_pattern, limit_type, max_allowed, window_seconds }`. Upserts. Auth required.
- `POST /rate-limits/events/record` — record rate limit event (internal use). Body: `{ endpoint, limit_type, current_count, max_allowed, was_blocked }`. Auth required.

Register in `backend/api.py`.

### Task 11: Rate Limit Frontend

Create `recoder-agents/src/lib/api/rate-limit-dashboard.ts` and `recoder-agents/src/hooks/monitoring/use-rate-limit-dashboard.ts`.

Hooks: `useRateLimitEvents(filters)`, `useRateLimitSummary()`, `useRateLimitTimeline(hours?)`, `useRateLimitConfigs()`, `useUpdateRateLimitConfig()`.

### Task 12: Rate Limit Dashboard UI

Create `recoder-agents/src/app/(dashboard)/monitoring/rate-limits/page.tsx`:

Rate limit dashboard:
- Summary cards: Total Events (24h), Blocked Requests, Block Rate %, Most Hit Endpoint
- Timeline chart: stacked area chart of events per hour (blocked vs allowed) using Recharts
- Top endpoints table: endpoint, total hits, blocked count, block rate %, utilization bar
- Event log: timestamp, endpoint, limit type, count/max, blocked badge — filterable
- Config editor: endpoint pattern, limit type, max allowed, window seconds, active toggle
- "Add Rule" dialog for new rate limit configs

Wire into monitoring section.

---

## Phase 4: Agent Dependency Graph (Tasks 13-16)

### Task 13: Dependencies Schema

Create `backend/supabase/migrations/20260311800003_agent_dependencies.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  depends_on_agent_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'calls' CHECK (dependency_type IN ('calls', 'triggers', 'shares_data', 'requires', 'extends')),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, depends_on_agent_id, dependency_type)
);

CREATE INDEX idx_dependencies_agent ON agent_dependencies(agent_id);
CREATE INDEX idx_dependencies_target ON agent_dependencies(depends_on_agent_id);
CREATE INDEX idx_dependencies_user ON agent_dependencies(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Dependency Graph API

Create `backend/core/agents/agent_dependency_graph_api.py`:

Router with tag `"agent-dependency-graph"`:
- `POST /agents/{agent_id}/dependencies` — add dependency. Body: `{ depends_on_agent_id, dependency_type?, description? }`. Auth required.
- `GET /agents/{agent_id}/dependencies` — list direct dependencies. Auth required.
- `DELETE /agents/{agent_id}/dependencies/{dep_id}` — remove dependency. Auth required.
- `GET /agents/dependency-graph` — full dependency graph for all user agents. Returns nodes (agents) and edges (dependencies). Auth required.
- `GET /agents/{agent_id}/impact` — impact analysis: which agents are affected if this agent changes (reverse dependencies). Auth required.
- `GET /agents/dependency-stats` — stats: most depended-on agents, orphan agents (no deps), circular dependency detection. Auth required.

Register in `backend/api.py`.

### Task 15: Dependency Graph Frontend

Create `recoder-agents/src/lib/api/agent-dependency-graph.ts` and `recoder-agents/src/hooks/agents/use-agent-dependency-graph.ts`.

Hooks: `useAddDependency()`, `useAgentDependencies(agentId)`, `useRemoveDependency()`, `useDependencyGraph()`, `useImpactAnalysis(agentId)`, `useDependencyStats()`.

### Task 16: Dependency Graph UI

Create `recoder-agents/src/app/(dashboard)/agents/dependencies/page.tsx`:

Agent dependency graph page:
- Graph visualization: nodes (agent cards with name) connected by directed edges (dependency type colored: calls=blue, triggers=green, shares_data=amber, requires=red, extends=purple)
- Use CSS-based layout: agents arranged in columns by dependency depth, edges drawn with SVG lines
- Click node → highlight its dependencies and dependents
- Side panel: selected agent's direct dependencies and impact analysis
- Stats section: most depended-on agents (bar chart), orphan agents list, circular dependency warnings
- "Add Dependency" button with agent selector and type picker
- Legend for dependency type colors

Wire into agents section navigation.

---

## Phase 5: Bulk Operations (Tasks 17-20)

### Task 17: Bulk Operations Schema

Create `backend/supabase/migrations/20260311800004_bulk_operations.sql`:

```sql
CREATE TABLE IF NOT EXISTS bulk_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('agent_update', 'agent_delete', 'agent_export', 'thread_delete', 'thread_archive', 'thread_export', 'tag_assign', 'tag_remove')),
  target_ids TEXT[] NOT NULL DEFAULT '{}',
  target_count INTEGER DEFAULT 0,
  params JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
  processed_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bulk_ops_user ON bulk_operations(user_id, created_at DESC);
CREATE INDEX idx_bulk_ops_status ON bulk_operations(status) WHERE status IN ('pending', 'processing');

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Bulk Operations API

Create `backend/core/agents/bulk_operations_api.py`:

Router with tag `"bulk-operations"`:
- `POST /bulk/execute` — start bulk operation. Body: `{ operation_type, target_ids[], params? }`. Validates targets exist. Processes sequentially, tracking progress. Auth required.
- `GET /bulk/operations` — list operations. Query: `status`, `operation_type`, `limit`. Auth required.
- `GET /bulk/operations/{op_id}` — get operation detail with error log. Auth required.
- `POST /bulk/preview` — preview operation: validates targets, shows what will happen without executing. Body: `{ operation_type, target_ids[], params? }`. Auth required.
- `GET /bulk/stats` — bulk op stats: total ops, success rate, most used operation type. Auth required.

Register in `backend/api.py`.

### Task 19: Bulk Operations Frontend

Create `recoder-agents/src/lib/api/bulk-operations.ts` and `recoder-agents/src/hooks/use-bulk-operations.ts`.

Hooks: `useExecuteBulkOp()`, `useBulkOperations(filters)`, `useBulkOperationDetail(opId)`, `usePreviewBulkOp()`, `useBulkOpStats()`.

### Task 20: Bulk Operations UI

Create `recoder-agents/src/components/bulk-operations/bulk-operation-bar.tsx`:

Bulk operation floating bar (appears when items are selected):
- "X items selected" count
- Operation buttons: Delete, Archive, Export, Assign Tag, Remove Tag
- Each button opens confirmation dialog showing: operation preview, affected items list, warnings
- Progress indicator during execution
- Success/error summary on completion

Create `recoder-agents/src/app/(dashboard)/operations/page.tsx`:

Operations history page:
- Operation list: type badge, target count, status (progress bar if processing), processed/error counts, duration, timestamp
- Click to expand: target list, error details per failed item
- Stats header: total operations, success rate, most used operation
- Filter by status and type

Wire bulk operation bar into agents page and threads list as a selection-mode feature.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 59 completion status.

---
