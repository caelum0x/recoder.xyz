# Sprint 49: Agent Testing Suite, Shared Prompt Library, Run Replay, Usage Quotas Dashboard & Agent Health Score

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated agent testing with test cases, shared prompt library across agents, run replay/playback system, visual usage quota dashboard with forecasting, and composite agent health scoring — completing the QA, reuse, debugging, governance, and observability features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Testing Suite (Tasks 1-4)

### Task 1: Test Case Schema

Create `backend/supabase/migrations/20260310800000_agent_test_cases.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input_message TEXT NOT NULL,
  expected_behavior TEXT,
  expected_contains TEXT[] DEFAULT '{}',
  expected_not_contains TEXT[] DEFAULT '{}',
  max_latency_ms INTEGER,
  max_cost NUMERIC(10,6),
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  suite_name TEXT DEFAULT 'default',
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total_cases INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID NOT NULL REFERENCES agent_test_runs(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES agent_test_cases(id) ON DELETE CASCADE,
  passed BOOLEAN,
  actual_output TEXT,
  latency_ms INTEGER,
  cost NUMERIC(10,6),
  tokens_used INTEGER,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_test_cases_agent ON agent_test_cases(agent_id);
CREATE INDEX idx_test_cases_user ON agent_test_cases(user_id);
CREATE INDEX idx_test_runs_agent ON agent_test_runs(agent_id, started_at DESC);
CREATE INDEX idx_test_runs_user ON agent_test_runs(user_id);
CREATE INDEX idx_test_results_run ON agent_test_results(test_run_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Test Suite API

Create `backend/core/agents/agent_testing_api.py`:

Router with tag `"agent-testing"`:
- `POST /agents/{agent_id}/test-cases` — create test case. Body: `{ name, input_message, expected_behavior?, expected_contains?, expected_not_contains?, max_latency_ms?, max_cost?, tags? }`. Auth required.
- `GET /agents/{agent_id}/test-cases` — list test cases. Auth required.
- `PATCH /agents/{agent_id}/test-cases/{case_id}` — update test case. Auth required.
- `DELETE /agents/{agent_id}/test-cases/{case_id}` — delete. Auth required.
- `POST /agents/{agent_id}/test-runs` — start a test run. Evaluates all active test cases. For each: checks expected_contains, expected_not_contains, max_latency, max_cost against actual values. Records results. Auth required.
- `GET /agents/{agent_id}/test-runs` — list test runs with pass/fail summary. Auth required.
- `GET /agents/{agent_id}/test-runs/{run_id}` — test run detail with all results. Auth required.

Register in `backend/api.py`.

### Task 3: Test Suite Frontend

Create `recoder-agents/src/lib/api/agent-testing.ts` and `recoder-agents/src/hooks/agents/use-agent-testing.ts`.

Hooks: `useTestCases(agentId)`, `useCreateTestCase()`, `useUpdateTestCase()`, `useDeleteTestCase()`, `useStartTestRun()`, `useTestRuns(agentId)`, `useTestRunDetail(agentId, runId)`.

### Task 4: Test Suite UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/testing-screen.tsx`:

Testing screen:
- Test cases list: name, input preview, expected behavior, tags, active toggle, edit/delete
- "Add Test Case" dialog: name, input message textarea, expected behavior, contains/not-contains tag inputs, latency/cost thresholds
- "Run All Tests" button → starts test run, shows progress
- Test run results: pass/fail badges per case, overall score, latency/cost for each
- Test run history with trend (pass rate over time)

Wire into agent config page as "Testing" tab with FlaskConical icon.

---

## Phase 2: Shared Prompt Library (Tasks 5-8)

### Task 5: Shared Prompt Schema

Create `backend/supabase/migrations/20260310800001_shared_prompts.sql`:

```sql
CREATE TABLE IF NOT EXISTS shared_prompt_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'system', 'tool', 'format', 'persona', 'safety', 'custom')),
  tags TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_snippet_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES shared_prompt_snippets(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shared_prompts_user ON shared_prompt_snippets(user_id);
CREATE INDEX idx_shared_prompts_category ON shared_prompt_snippets(category);
CREATE INDEX idx_shared_prompts_public ON shared_prompt_snippets(is_public) WHERE is_public = true;
CREATE INDEX idx_prompt_usage_snippet ON prompt_snippet_usage(snippet_id);
CREATE INDEX idx_prompt_usage_agent ON prompt_snippet_usage(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Shared Prompt API

Create `backend/core/prompts/shared_prompts_api.py` + `__init__.py`:

Router with tag `"shared-prompts"`:
- `POST /prompt-snippets` — create snippet. Body: `{ title, content, category?, tags?, is_public? }`. Auth required.
- `GET /prompt-snippets` — list snippets. Query: `category`, `search`, `public_only`. Auth required.
- `GET /prompt-snippets/{snippet_id}` — get detail. Auth required.
- `PATCH /prompt-snippets/{snippet_id}` — update. Auth required.
- `DELETE /prompt-snippets/{snippet_id}` — delete. Auth required.
- `POST /prompt-snippets/{snippet_id}/use` — record usage in agent. Body: `{ agent_id }`. Increments usage_count. Auth required.
- `GET /prompt-snippets/popular` — most used snippets. Auth required.

Register in `backend/api.py`.

### Task 7: Shared Prompt Frontend

Create `recoder-agents/src/lib/api/shared-prompts.ts` and `recoder-agents/src/hooks/prompts/use-shared-prompts.ts`.

Hooks: `usePromptSnippets(filters)`, `usePromptSnippet(id)`, `useCreateSnippet()`, `useUpdateSnippet()`, `useDeleteSnippet()`, `useRecordSnippetUsage()`, `usePopularSnippets()`.

### Task 8: Shared Prompt UI

Create `recoder-agents/src/app/(dashboard)/prompts/library/page.tsx`:

Prompt library page:
- Category tabs: All, System, Tool, Format, Persona, Safety, Custom
- Search bar
- Snippet cards: title, content preview (truncated), category badge, usage count, tags
- Click to expand: full content, copy button, "Use in Agent" button
- Create snippet dialog: title, content (markdown textarea), category, tags, public toggle
- Popular section showing most-used snippets

Create `recoder-agents/src/components/agents/config/prompt-snippet-picker.tsx`:

Snippet picker for agent instructions screen:
- Small button "Insert Snippet" in instructions editor
- Opens popover with snippet search + category filter
- Click snippet to insert content at cursor position

---

## Phase 3: Run Replay System (Tasks 9-12)

### Task 9: Run Replay Schema

Create `backend/supabase/migrations/20260310800002_run_replay.sql`:

```sql
CREATE TABLE IF NOT EXISTS run_replay_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('user_input', 'llm_call', 'tool_call', 'tool_result', 'assistant_output', 'error')),
  content JSONB NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT now(),
  UNIQUE (run_id, step_index)
);

CREATE INDEX idx_replay_run ON run_replay_snapshots(run_id, step_index);
CREATE INDEX idx_replay_user ON run_replay_snapshots(user_id);
CREATE INDEX idx_replay_agent ON run_replay_snapshots(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Run Replay API

Create `backend/core/agents/agent_replay_api.py`:

Router with tag `"agent-replay"`:
- `GET /agents/{agent_id}/runs/{run_id}/replay` — get full replay data: ordered steps with content, timing, costs. Auth required.
- `GET /agents/{agent_id}/runs/{run_id}/replay/summary` — replay summary: total steps, step type breakdown, total time, total cost, total tokens. Auth required.
- `POST /agents/{agent_id}/runs/{run_id}/replay/capture` — capture replay snapshot (called during run). Body: `{ step_index, step_type, content, tokens_in?, tokens_out?, latency_ms?, cost? }`. Auth required.

Register in `backend/api.py`.

### Task 11: Run Replay Frontend

Create `recoder-agents/src/lib/api/run-replay.ts` and `recoder-agents/src/hooks/agents/use-run-replay.ts`.

Hooks: `useRunReplay(agentId, runId)`, `useRunReplaySummary(agentId, runId)`.

### Task 12: Run Replay UI

Create `recoder-agents/src/components/thread/run-replay-viewer.tsx`:

Run replay viewer:
- Step timeline: vertical list of steps with type icon, content preview, timing
- Step types: user_input (User icon), llm_call (Brain), tool_call (Wrench), tool_result (CheckCircle), assistant_output (Bot), error (AlertCircle)
- Playback controls: Play/Pause, Step Forward, Step Back, Speed selector (1x, 2x, 4x)
- Current step highlight with auto-scroll
- Stats bar: step X of Y, elapsed time, tokens, cost
- Expandable step content (full JSON for tool calls/results)

Wire into runs page or thread view as "Replay" action on completed runs.

---

## Phase 4: Usage Quotas Dashboard (Tasks 13-16)

### Task 13: Quota Usage Tracking Schema

Create `backend/supabase/migrations/20260310800003_quota_usage_tracking.sql`:

```sql
CREATE TABLE IF NOT EXISTS quota_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  run_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  UNIQUE (user_id, agent_id, date)
);

CREATE INDEX idx_quota_usage_user ON quota_usage_daily(user_id, date DESC);
CREATE INDEX idx_quota_usage_agent ON quota_usage_daily(agent_id, date DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Quota Dashboard API

Create `backend/core/billing/quota_dashboard_api.py`:

Router with tag `"quota-dashboard"`:
- `GET /quota/usage/daily` — daily usage for last N days. Query: `days` (default 30), `agent_id`. Auth required.
- `GET /quota/usage/summary` — current period summary: runs used/limit, tokens used/limit, cost used/limit. Compares against agent_quotas table. Auth required.
- `GET /quota/forecast` — simple linear forecast: projected end-of-month usage based on current rate. Auth required.
- `GET /quota/top-consumers` — top agents by usage (runs, tokens, cost). Query: `metric`, `limit`. Auth required.

Register in `backend/api.py`.

### Task 15: Quota Dashboard Frontend

Create `recoder-agents/src/lib/api/quota-dashboard.ts` and `recoder-agents/src/hooks/billing/use-quota-dashboard.ts`.

Hooks: `useQuotaUsageDaily(days, agentId)`, `useQuotaUsageSummary()`, `useQuotaForecast()`, `useTopConsumers(metric)`.

### Task 16: Quota Dashboard UI

Create `recoder-agents/src/app/(dashboard)/billing/quotas/page.tsx`:

Visual quota dashboard:
- Usage gauges: circular progress for runs, tokens, cost vs limits (green/amber/red)
- Daily usage chart: stacked area chart (Recharts) showing runs, tokens, cost over 30 days
- Forecast section: projected end-of-month usage with warning if exceeding limits
- Top consumers table: agent name, runs, tokens, cost, % of total
- Period selector: This month, Last 30d, Last 7d

Wire into billing section navigation.

---

## Phase 5: Agent Health Score (Tasks 17-20)

### Task 17: Health Score Schema

Create `backend/supabase/migrations/20260310800004_agent_health_scores.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  reliability_score INTEGER CHECK (reliability_score BETWEEN 0 AND 100),
  performance_score INTEGER CHECK (performance_score BETWEEN 0 AND 100),
  cost_efficiency_score INTEGER CHECK (cost_efficiency_score BETWEEN 0 AND 100),
  user_satisfaction_score INTEGER CHECK (user_satisfaction_score BETWEEN 0 AND 100),
  factors JSONB DEFAULT '{}',
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, calculated_at)
);

CREATE INDEX idx_health_scores_agent ON agent_health_scores(agent_id, calculated_at DESC);
CREATE INDEX idx_health_scores_user ON agent_health_scores(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Health Score API

Create `backend/core/agents/agent_health_api.py`:

Router with tag `"agent-health"`:
- `GET /agents/{agent_id}/health` — get latest health score. Auth required.
- `POST /agents/{agent_id}/health/calculate` — calculate health score from recent data. Factors: reliability (success rate from agent_runs), performance (avg latency), cost_efficiency (cost per successful run), user_satisfaction (avg rating from response_ratings). Weighted composite: reliability 30%, performance 25%, cost_efficiency 25%, satisfaction 20%. Auth required.
- `GET /agents/{agent_id}/health/history` — health score trend. Query: `limit`. Auth required.
- `GET /agents/health/overview` — all agents with latest health scores. Auth required.

Register in `backend/api.py`.

### Task 19: Health Score Frontend

Create `recoder-agents/src/lib/api/agent-health.ts` and `recoder-agents/src/hooks/agents/use-agent-health.ts`.

Hooks: `useAgentHealth(agentId)`, `useCalculateHealth()`, `useHealthHistory(agentId)`, `useHealthOverview()`.

### Task 20: Health Score UI

Create `recoder-agents/src/components/agents/agent-health-badge.tsx`:

Compact health badge for agent cards:
- Circular score indicator (0-100) with color (red <40, amber <70, green >=70)
- Tooltip showing breakdown

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/health-screen.tsx`:

Health score screen:
- Large circular gauge: overall score with color
- 4 sub-score cards: Reliability, Performance, Cost Efficiency, User Satisfaction (each with gauge)
- Factors breakdown: what's contributing positively/negatively
- "Recalculate" button
- Health history line chart (score over time)
- Recommendations based on low scores

Wire into agent config page as "Health" tab with HeartPulse icon.
Wire health badge into agent cards in agents grid.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 49 completion status.

---
