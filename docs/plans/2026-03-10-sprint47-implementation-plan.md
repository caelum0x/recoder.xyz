# Sprint 47: Agent Performance Benchmarks, Workspace Comments, Trigger Templates, KB Graph View & Real-Time Run Monitor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent performance benchmarking with model comparison, workspace-level comments on agent configs, pre-built trigger templates, knowledge base relationship graph visualization, and real-time agent run monitoring dashboard — completing the analytics, collaboration, automation, and observability feature set.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Performance Benchmarks (Tasks 1-4)

### Task 1: Performance Benchmark Schema

Create `backend/supabase/migrations/20260310600000_agent_benchmarks.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  benchmark_name TEXT NOT NULL,
  model TEXT,
  avg_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  avg_tokens_in INTEGER,
  avg_tokens_out INTEGER,
  avg_cost NUMERIC(10,6),
  success_rate NUMERIC(5,2),
  total_runs INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_benchmarks_agent ON agent_benchmarks(agent_id, created_at DESC);
CREATE INDEX idx_benchmarks_user ON agent_benchmarks(user_id);
CREATE INDEX idx_benchmarks_model ON agent_benchmarks(model);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Benchmark API

Create `backend/core/agents/agent_benchmark_api.py`:

Router with tag `"agent-benchmarks"`:
- `GET /agents/{agent_id}/benchmarks` — list benchmarks for agent. Query: `model`, `limit`, `offset`. Auth required.
- `POST /agents/{agent_id}/benchmarks/generate` — generate benchmark from recent runs. Aggregates from agent_runs table: avg/p95 latency, token usage, cost, success rate. Query: `period` (7d, 14d, 30d). Auth required.
- `GET /agents/{agent_id}/benchmarks/compare` — compare benchmarks across models. Returns per-model averages. Auth required.
- `GET /benchmarks/leaderboard` — top agents by success rate or cost efficiency. Query: `metric` (success_rate, cost_efficiency, speed), `limit`. Auth required.

Register in `backend/api.py`.

### Task 3: Benchmark Frontend

Create `recoder-agents/src/lib/api/agent-benchmarks.ts` and `recoder-agents/src/hooks/agents/use-agent-benchmarks.ts`.

Hooks: `useAgentBenchmarks(agentId, filters)`, `useGenerateBenchmark()`, `useBenchmarkComparison(agentId)`, `useBenchmarkLeaderboard(metric)`.

### Task 4: Benchmark UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/benchmarks-screen.tsx`:

Benchmark tab within agent config:
- Summary cards: Avg Latency, Success Rate, Avg Cost/Run, Total Runs
- "Generate Benchmark" button with period selector (7d, 14d, 30d)
- Model comparison bar chart (Recharts): latency, cost, success rate per model
- Benchmark history table: date range, model, metrics, trend arrows
- Cost efficiency score (success_rate / avg_cost)

Wire into agent config page as "Benchmarks" tab with BarChart3 icon.

---

## Phase 2: Workspace Agent Comments (Tasks 5-8)

### Task 5: Comment Schema

Create `backend/supabase/migrations/20260310600001_agent_comments.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  parent_id UUID REFERENCES agent_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  section TEXT DEFAULT 'general' CHECK (section IN ('general', 'instructions', 'tools', 'knowledge', 'triggers', 'performance')),
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_comments_agent ON agent_comments(agent_id, created_at DESC);
CREATE INDEX idx_agent_comments_user ON agent_comments(user_id);
CREATE INDEX idx_agent_comments_parent ON agent_comments(parent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Comment API

Create `backend/core/agents/agent_comments_api.py`:

Router with tag `"agent-comments"`:
- `POST /agents/{agent_id}/comments` — create comment. Body: `{ content, section?, parent_id? }`. Auth required.
- `GET /agents/{agent_id}/comments` — list comments. Query: `section`, `resolved`. Auth required.
- `PATCH /agents/{agent_id}/comments/{comment_id}` — update content or resolve. Auth required.
- `DELETE /agents/{agent_id}/comments/{comment_id}` — delete. Auth required.
- `GET /agents/{agent_id}/comments/count` — count by section (for badges). Auth required.

Register in `backend/api.py`.

### Task 7: Comment Frontend

Create `recoder-agents/src/lib/api/agent-comments.ts` and `recoder-agents/src/hooks/agents/use-agent-comments.ts`.

Hooks: `useAgentComments(agentId, filters)`, `useCreateComment()`, `useUpdateComment()`, `useDeleteComment()`, `useCommentCounts(agentId)`.

### Task 8: Comment UI

Create `recoder-agents/src/components/agents/config/comment-panel.tsx`:

Floating comment panel (slide-in from right):
- Section filter tabs: All, Instructions, Tools, Knowledge, Triggers, Performance
- Comment list: avatar placeholder, content, timestamp, resolve checkbox, reply button
- Threaded replies (indented under parent)
- New comment form: textarea + section selector + submit
- Unresolved count badge per section
- Toggle resolved visibility

Wire a "Comments" button (MessageSquare icon) into agent config page header that opens the panel.

---

## Phase 3: Trigger Templates (Tasks 9-12)

### Task 9: Trigger Template Schema

Create `backend/supabase/migrations/20260310600002_trigger_templates.sql`:

```sql
CREATE TABLE IF NOT EXISTS trigger_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('monitoring', 'reporting', 'data_sync', 'maintenance', 'alerts', 'custom')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('schedule', 'event', 'condition')),
  config_template JSONB NOT NULL,
  icon TEXT DEFAULT 'zap',
  is_builtin BOOLEAN DEFAULT true,
  user_id UUID,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trigger_templates_category ON trigger_templates(category);
CREATE INDEX idx_trigger_templates_user ON trigger_templates(user_id);

-- Access control enforced at application layer
```

### Task 10: Trigger Template API

Create `backend/core/triggers/trigger_templates_api.py` + `__init__.py`:

Router with tag `"trigger-templates"`:
- `GET /trigger-templates` — list templates. Query: `category`, `trigger_type`. Auth required.
- `GET /trigger-templates/{template_id}` — get template detail. Auth required.
- `POST /trigger-templates` — create custom template. Body: `{ name, description, category, trigger_type, config_template, icon }`. Auth required.
- `POST /trigger-templates/{template_id}/apply` — apply template to agent. Body: `{ agent_id, overrides? }`. Creates schedule/trigger from template config. Auth required.
- `POST /trigger-templates/seed` — seed built-in templates (admin/first-run). Auth required.

Built-in templates to seed:
1. "Hourly Health Check" — schedule, cron: `0 * * * *`, input: "Run health check and report status"
2. "Daily Summary Report" — schedule, cron: `0 9 * * *`, input: "Generate daily summary report"
3. "Weekly Analytics Digest" — schedule, cron: `0 10 * * 1`, input: "Generate weekly analytics digest"
4. "Error Alert Monitor" — condition, checks error_count > threshold
5. "Cost Budget Alert" — condition, checks daily cost > budget
6. "Data Sync Hourly" — schedule, cron: `0 * * * *`, input: "Sync data from configured sources"

Register in `backend/api.py`.

### Task 11: Trigger Template Frontend

Create `recoder-agents/src/lib/api/trigger-templates.ts` and `recoder-agents/src/hooks/triggers/use-trigger-templates.ts`.

Hooks: `useTriggerTemplates(filters)`, `useTriggerTemplate(id)`, `useApplyTemplate()`, `useCreateTemplate()`.

### Task 12: Trigger Template UI

Create `recoder-agents/src/components/agents/triggers/trigger-template-gallery.tsx`:

Template gallery (shown in trigger creation flow):
- Category tabs: All, Monitoring, Reporting, Data Sync, Maintenance, Alerts
- Template cards: icon, name, description, category badge, "Use Template" button
- Click "Use Template" → pre-fills trigger creation form with template config
- "Create Custom Template" option to save current trigger config as template

Wire into existing trigger creation UI or add as a section in the triggers screen.

---

## Phase 4: Knowledge Base Graph View (Tasks 13-16)

### Task 13: KB Relationship Schema

Create `backend/supabase/migrations/20260310600003_kb_relationships.sql`:

```sql
CREATE TABLE IF NOT EXISTS kb_entry_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_entry_id UUID NOT NULL,
  target_entry_id UUID NOT NULL,
  relationship_type TEXT DEFAULT 'related' CHECK (relationship_type IN ('related', 'depends_on', 'references', 'contradicts', 'extends')),
  strength NUMERIC(3,2) DEFAULT 0.5,
  auto_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source_entry_id, target_entry_id)
);

CREATE INDEX idx_kb_rels_source ON kb_entry_relationships(source_entry_id);
CREATE INDEX idx_kb_rels_target ON kb_entry_relationships(target_entry_id);
CREATE INDEX idx_kb_rels_user ON kb_entry_relationships(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: KB Relationship API

Create `backend/core/knowledge_base/kb_relationships_api.py`:

Router with tag `"kb-relationships"`:
- `POST /kb/relationships` — create relationship. Body: `{ source_entry_id, target_entry_id, relationship_type?, strength? }`. Auth required.
- `GET /kb/relationships` — list relationships. Query: `entry_id` (get all for specific entry), `relationship_type`. Auth required.
- `DELETE /kb/relationships/{relationship_id}` — delete. Auth required.
- `GET /kb/graph` — get full graph (nodes = entries, edges = relationships). Returns `{ nodes[], edges[] }`. Auth required.
- `GET /kb/relationships/suggestions` — suggest relationships based on title/content similarity (simple text matching). Query: `entry_id`, `limit`. Auth required.

Register in `backend/api.py`.

### Task 15: KB Relationship Frontend

Create `recoder-agents/src/lib/api/kb-relationships.ts` and `recoder-agents/src/hooks/knowledge/use-kb-relationships.ts`.

Hooks: `useKbRelationships(entryId?)`, `useCreateRelationship()`, `useDeleteRelationship()`, `useKbGraph()`, `useRelationshipSuggestions(entryId)`.

### Task 16: KB Graph View UI

Create `recoder-agents/src/components/knowledge-base/kb-graph-view.tsx`:

Graph visualization of KB entries:
- Simple force-directed layout using SVG (no heavy lib dependency)
- Nodes: circles with entry title, colored by content_type
- Edges: lines with relationship type labels, thickness by strength
- Click node: show entry details panel
- Click edge: show relationship details, delete option
- "Add Relationship" mode: click two nodes to connect
- Zoom/pan controls
- Legend: relationship type colors

Wire into knowledge page as a toggle between list view and graph view.

---

## Phase 5: Real-Time Run Monitor (Tasks 17-20)

### Task 17: Run Monitor Schema

Create `backend/supabase/migrations/20260310600004_run_monitor.sql`:

```sql
CREATE TABLE IF NOT EXISTS run_monitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  step_count INTEGER DEFAULT 0,
  current_tool TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_so_far NUMERIC(10,6) DEFAULT 0,
  elapsed_ms INTEGER DEFAULT 0,
  error TEXT,
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_run_monitor_user ON run_monitor_snapshots(user_id, captured_at DESC);
CREATE INDEX idx_run_monitor_run ON run_monitor_snapshots(run_id, captured_at DESC);
CREATE INDEX idx_run_monitor_agent ON run_monitor_snapshots(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Run Monitor API

Create `backend/core/monitoring/run_monitor_api.py` + `__init__.py`:

Router with tag `"run-monitor"`:
- `GET /monitor/runs/active` — list currently active runs (status = 'running'). Auth required.
- `GET /monitor/runs/{run_id}/timeline` — get timeline of snapshots for a run. Auth required.
- `GET /monitor/stats` — real-time stats: active runs count, avg latency today, errors today, total cost today. Auth required.
- `POST /monitor/runs/{run_id}/snapshot` — record snapshot (called by agent runtime). Body: status, step_count, current_tool, tokens, cost, elapsed. Auth required.

Register in `backend/api.py`.

### Task 19: Run Monitor Frontend

Create `recoder-agents/src/lib/api/run-monitor.ts` and `recoder-agents/src/hooks/monitoring/use-run-monitor.ts`.

Hooks: `useActiveRuns()`, `useRunTimeline(runId)`, `useMonitorStats()`. Active runs hook should poll every 5 seconds.

### Task 20: Run Monitor Dashboard

Create `recoder-agents/src/app/(dashboard)/monitoring/page.tsx`:

Real-time monitoring dashboard:
- Live stats bar: Active Runs (pulsing dot), Avg Latency, Errors Today, Cost Today
- Active runs table: agent name, run status, current tool, elapsed time, tokens, cost, progress indicator
- Click run to expand: step timeline, tool calls, token usage over time
- Auto-refresh every 5 seconds
- Empty state when no active runs

Add "Monitoring" link in sidebar with Activity icon.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 47 completion status.

---
