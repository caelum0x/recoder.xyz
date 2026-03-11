# Sprint 64: Agent A/B Test Reports, Thread Merge, Error Pattern Detection, Agent Playground Sandbox & Notification Digest

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add detailed A/B test reporting with statistical analysis, thread merge to combine conversation branches, automated error pattern detection with grouping, sandboxed agent playground for safe testing, and configurable notification digest emails — completing the experimentation analytics, conversation management, proactive debugging, safe testing, and notification UX features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent A/B Test Reports (Tasks 1-4)

### Task 1: A/B Test Reports Schema

Create `backend/supabase/migrations/20260312300000_ab_test_reports.sql`:

```sql
CREATE TABLE IF NOT EXISTS ab_test_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  test_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  report_name TEXT NOT NULL,
  variant_a JSONB NOT NULL DEFAULT '{}',
  variant_b JSONB NOT NULL DEFAULT '{}',
  metrics JSONB NOT NULL DEFAULT '{}',
  winner TEXT CHECK (winner IN ('a', 'b', 'inconclusive', NULL)),
  confidence_level NUMERIC(5,2),
  sample_size_a INTEGER DEFAULT 0,
  sample_size_b INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'archived')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ab_reports_user ON ab_test_reports(user_id, created_at DESC);
CREATE INDEX idx_ab_reports_agent ON ab_test_reports(agent_id);
CREATE INDEX idx_ab_reports_test ON ab_test_reports(test_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: A/B Test Reports API

Create `backend/core/agents/ab_test_reports_api.py`:

Router with tag `"ab-test-reports"`:
- `POST /ab-tests/reports` — create report. Body: `{ test_id, agent_id, report_name, variant_a, variant_b }`. Auth required.
- `GET /ab-tests/reports` — list reports. Query: `agent_id`, `status`, `limit`. Auth required.
- `GET /ab-tests/reports/{report_id}` — get detail with metrics. Auth required.
- `POST /ab-tests/reports/{report_id}/record` — record sample. Body: `{ variant, metrics }`. Updates aggregates. Auth required.
- `POST /ab-tests/reports/{report_id}/complete` — finalize, determine winner based on metrics comparison. Auth required.
- `GET /ab-tests/summary` — overall stats: total tests, win rate per variant, avg confidence. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create A/B test reports page with variant comparison cards, metrics table, winner badge, confidence indicator, sample size bars.

---

## Phase 2: Thread Merge (Tasks 5-8)

### Task 5: Thread Merge Schema

Create `backend/supabase/migrations/20260312300001_thread_merge.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_thread_id TEXT NOT NULL,
  target_thread_id TEXT NOT NULL,
  merge_strategy TEXT DEFAULT 'append' CHECK (merge_strategy IN ('append', 'interleave', 'summarize')),
  merged_message_count INTEGER DEFAULT 0,
  conflict_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'reverted')),
  merge_metadata JSONB DEFAULT '{}',
  merged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_merges_user ON thread_merges(user_id, created_at DESC);
CREATE INDEX idx_merges_source ON thread_merges(source_thread_id);
CREATE INDEX idx_merges_target ON thread_merges(target_thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Merge API

Create `backend/core/threads/thread_merge_api.py`:

Router with tag `"thread-merge"`:
- `POST /threads/merge/preview` — preview merge. Body: `{ source_thread_id, target_thread_id, merge_strategy }`. Returns message count, potential conflicts. Auth required.
- `POST /threads/merge` — execute merge. Body: `{ source_thread_id, target_thread_id, merge_strategy }`. Records merge. Auth required.
- `GET /threads/merges` — list merge history. Auth required.
- `GET /threads/merges/{merge_id}` — get merge detail. Auth required.
- `POST /threads/merges/{merge_id}/revert` — revert merge (marks reverted). Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create thread merge dialog with source/target thread selectors, strategy picker, preview with conflict count, merge/revert buttons.

---

## Phase 3: Error Pattern Detection (Tasks 9-12)

### Task 9: Error Patterns Schema

Create `backend/supabase/migrations/20260312300002_error_patterns.sql`:

```sql
CREATE TABLE IF NOT EXISTS detected_error_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pattern_name TEXT NOT NULL,
  error_signature TEXT NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  affected_agents TEXT[] DEFAULT '{}',
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved', 'ignored')),
  resolution TEXT,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  sample_errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_error_patterns_user ON detected_error_patterns(user_id, last_seen_at DESC);
CREATE INDEX idx_error_patterns_status ON detected_error_patterns(status) WHERE status = 'active';
CREATE INDEX idx_error_patterns_severity ON detected_error_patterns(severity);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Error Pattern Detection API

Create `backend/core/monitoring/error_patterns_api.py`:

Router with tag `"error-patterns"`:
- `POST /error-patterns/scan` — scan recent errors and group by signature (first line of error message). Creates/updates patterns. Auth required.
- `GET /error-patterns` — list patterns. Query: `status`, `severity`, `limit`. Auth required.
- `GET /error-patterns/{pattern_id}` — get detail with sample errors. Auth required.
- `PATCH /error-patterns/{pattern_id}` — update status, resolution. Auth required.
- `GET /error-patterns/stats` — active count, by severity, most frequent, trending (increasing occurrence). Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create error patterns page with severity distribution, pattern list with occurrence counts, scan button, detail with sample errors, status workflow.

---

## Phase 4: Agent Playground Sandbox (Tasks 13-16)

### Task 13: Sandbox Schema

Create `backend/supabase/migrations/20260312300003_agent_sandbox.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_sandbox_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  sandbox_config JSONB DEFAULT '{}',
  messages JSONB DEFAULT '[]',
  message_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '1 hour',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sandbox_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input_message TEXT NOT NULL,
  expected_behavior TEXT,
  last_result JSONB,
  pass_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sandbox_user ON agent_sandbox_sessions(user_id, created_at DESC);
CREATE INDEX idx_sandbox_agent ON agent_sandbox_sessions(agent_id);
CREATE INDEX idx_test_cases_user ON sandbox_test_cases(user_id);
CREATE INDEX idx_test_cases_agent ON sandbox_test_cases(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Sandbox API

Create `backend/core/agents/agent_sandbox_api.py`:

Router with tag `"agent-sandbox"`:
- `POST /agents/{agent_id}/sandbox` — create sandbox session. Body: `{ sandbox_config? }`. Auth required.
- `POST /agents/{agent_id}/sandbox/{session_id}/message` — send message in sandbox. Body: `{ message }`. Appends to messages. Auth required.
- `GET /agents/{agent_id}/sandbox/{session_id}` — get session with messages. Auth required.
- `DELETE /agents/{agent_id}/sandbox/{session_id}` — end session. Auth required.
- `POST /agents/{agent_id}/test-cases` — create test case. Body: `{ name, input_message, expected_behavior? }`. Auth required.
- `GET /agents/{agent_id}/test-cases` — list test cases. Auth required.
- `POST /agents/{agent_id}/test-cases/{case_id}/run` — run test case in sandbox. Auth required.
- `DELETE /agents/{agent_id}/test-cases/{case_id}` — delete. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create sandbox page with chat-like interface, config panel, test case manager with pass/fail tracking.

---

## Phase 5: Notification Digest (Tasks 17-20)

### Task 17: Digest Schema

Create `backend/supabase/migrations/20260312300004_notification_digest.sql`:

```sql
CREATE TABLE IF NOT EXISTS notification_digest_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('off', 'hourly', 'daily', 'weekly')),
  include_types TEXT[] DEFAULT '{}',
  delivery_hour INTEGER DEFAULT 9 CHECK (delivery_hour BETWEEN 0 AND 23),
  delivery_day INTEGER DEFAULT 1 CHECK (delivery_day BETWEEN 0 AND 6),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS notification_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  digest_type TEXT NOT NULL,
  notification_count INTEGER DEFAULT 0,
  content JSONB DEFAULT '{}',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_digest_config_user ON notification_digest_config(user_id);
CREATE INDEX idx_digests_user ON notification_digests(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Digest API

Create `backend/core/notifications/notification_digest_api.py` + `__init__.py`:

Router with tag `"notification-digest"`:
- `GET /notifications/digest/config` — get digest config. Auth required.
- `PUT /notifications/digest/config` — set config. Body: `{ frequency, include_types?, delivery_hour?, delivery_day? }`. Upserts. Auth required.
- `POST /notifications/digest/generate` — generate digest for current period. Collects unread notifications, groups by type, creates digest record. Auth required.
- `GET /notifications/digest/history` — list past digests. Query: `limit`. Auth required.
- `GET /notifications/digest/{digest_id}` — get digest detail. Auth required.
- `POST /notifications/digest/preview` — preview next digest without sending. Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create notification digest settings page with frequency selector, type filters, delivery time config, digest history, preview.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 64 completion status.

---
