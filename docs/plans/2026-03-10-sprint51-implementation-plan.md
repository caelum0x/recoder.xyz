# Sprint 51: Agent Changelog, Thread Analytics, Credential Vault Audit, Sandbox Resource Monitor & Global Search

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automatic agent changelog tracking, per-thread analytics with token/cost breakdown, credential vault access auditing, sandbox resource utilization monitoring, and global cross-resource search — completing the change management, analytics depth, security auditing, infrastructure visibility, and discoverability features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Changelog (Tasks 1-4)

### Task 1: Changelog Schema

Create `backend/supabase/migrations/20260311000000_agent_changelog.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('instructions_updated', 'model_changed', 'tool_added', 'tool_removed', 'tool_configured', 'name_changed', 'env_var_added', 'env_var_removed', 'schedule_added', 'schedule_removed', 'kb_entry_added', 'kb_entry_removed', 'settings_changed')),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  description TEXT,
  version_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_changelog_agent ON agent_changelog(agent_id, created_at DESC);
CREATE INDEX idx_changelog_user ON agent_changelog(user_id);
CREATE INDEX idx_changelog_type ON agent_changelog(change_type);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Changelog API

Create `backend/core/agents/agent_changelog_api.py`:

Router with tag `"agent-changelog"`:
- `GET /agents/{agent_id}/changelog` — list changes. Query: `change_type`, `limit` (default 50), `offset`. Auth required.
- `POST /agents/{agent_id}/changelog` — record a change (typically called internally). Body: `{ change_type, field_name?, old_value?, new_value?, description?, version_number? }`. Auth required.
- `GET /agents/{agent_id}/changelog/summary` — change frequency by type for last 30 days. Auth required.
- `GET /agents/{agent_id}/changelog/diff/{change_id}` — get specific change detail with formatted diff. Auth required.

Register in `backend/api.py`.

### Task 3: Changelog Frontend

Create `recoder-agents/src/lib/api/agent-changelog.ts` and `recoder-agents/src/hooks/agents/use-agent-changelog.ts`.

Hooks: `useAgentChangelog(agentId, filters)`, `useChangelogSummary(agentId)`, `useChangeDetail(agentId, changeId)`.

### Task 4: Changelog UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/changelog-screen.tsx`:

Changelog screen:
- Change timeline: vertical list with type icon, description, field name, timestamp
- Type icons: instructions=FileText, model=Cpu, tool_added=Plus, tool_removed=Minus, name=Type, env_var=Terminal, schedule=Clock, kb=BookOpen, settings=Settings
- Click to expand: shows old_value → new_value diff
- Filter by change type dropdown
- Summary section: change frequency chart (bar chart by type, last 30 days)
- Link to version if version_number present

Wire into agent config page as "Changelog" tab with History icon.

---

## Phase 2: Thread Analytics (Tasks 5-8)

### Task 5: Thread Analytics Schema

Create `backend/supabase/migrations/20260311000001_thread_analytics.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL UNIQUE,
  agent_id TEXT,
  message_count INTEGER DEFAULT 0,
  user_message_count INTEGER DEFAULT 0,
  assistant_message_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  total_tokens_in INTEGER DEFAULT 0,
  total_tokens_out INTEGER DEFAULT 0,
  total_cost NUMERIC(10,6) DEFAULT 0,
  avg_response_time_ms INTEGER,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  calculated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_analytics_user ON thread_analytics(user_id);
CREATE INDEX idx_thread_analytics_agent ON thread_analytics(agent_id);
CREATE INDEX idx_thread_analytics_thread ON thread_analytics(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Analytics API

Create `backend/core/threads/thread_analytics_api.py`:

Router with tag `"thread-analytics"`:
- `GET /threads/{thread_id}/analytics` — get analytics for thread. Auth required.
- `POST /threads/{thread_id}/analytics/calculate` — calculate/recalculate from messages table. Counts messages by type, sums tokens/cost from metadata, calculates duration. Upsert. Auth required.
- `GET /threads/analytics/overview` — aggregate across all threads: total threads, avg messages/thread, total tokens, total cost, most active agents. Auth required.
- `GET /threads/analytics/top` — top threads by cost, tokens, or message count. Query: `metric`, `limit`. Auth required.

Register in `backend/api.py`.

### Task 7: Thread Analytics Frontend

Create `recoder-agents/src/lib/api/thread-analytics.ts` and `recoder-agents/src/hooks/threads/use-thread-analytics.ts`.

Hooks: `useThreadAnalytics(threadId)`, `useCalculateThreadAnalytics()`, `useThreadsOverview()`, `useTopThreads(metric)`.

### Task 8: Thread Analytics UI

Create `recoder-agents/src/components/thread/thread-analytics-panel.tsx`:

Thread analytics (collapsible panel in thread view):
- Stats cards: Messages, Tokens In/Out, Cost, Duration, Tool Calls
- Message breakdown: pie chart (user vs assistant vs tool)
- Token usage bar (in vs out)
- "Calculate" button to refresh analytics

Create `recoder-agents/src/app/(dashboard)/analytics/threads/page.tsx`:

Thread analytics overview page:
- Summary cards: Total Threads, Avg Messages, Total Tokens, Total Cost
- Top threads table by cost/tokens/messages (selectable metric)
- Agent breakdown: which agents have the most thread activity

---

## Phase 3: Credential Vault Audit (Tasks 9-12)

### Task 9: Credential Audit Schema

Create `backend/supabase/migrations/20260311000002_credential_audit.sql`:

```sql
CREATE TABLE IF NOT EXISTS credential_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_key TEXT NOT NULL,
  agent_id TEXT,
  access_type TEXT NOT NULL CHECK (access_type IN ('read', 'create', 'update', 'delete', 'use_in_run')),
  ip_address TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cred_audit_user ON credential_access_log(user_id, created_at DESC);
CREATE INDEX idx_cred_audit_key ON credential_access_log(credential_key);
CREATE INDEX idx_cred_audit_agent ON credential_access_log(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Credential Audit API

Create `backend/core/credentials/credential_audit_api.py`:

Router with tag `"credential-audit"`:
- `GET /credentials/audit-log` — list access log. Query: `credential_key`, `agent_id`, `access_type`, `limit`, `offset`. Auth required.
- `GET /credentials/audit-log/summary` — access summary: total accesses, most accessed keys, most active agents, failed access count. Auth required.
- `POST /credentials/audit-log` — record access (called internally). Body: `{ credential_key, agent_id?, access_type, ip_address?, success? }`. Auth required.
- `GET /credentials/audit-log/anomalies` — unusual access patterns: keys accessed at unusual hours, high frequency access, failed attempts. Auth required.

Register in `backend/api.py`.

### Task 11: Credential Audit Frontend

Create `recoder-agents/src/lib/api/credential-audit.ts` and `recoder-agents/src/hooks/settings/use-credential-audit.ts`.

Hooks: `useCredentialAuditLog(filters)`, `useCredentialAuditSummary()`, `useCredentialAnomalies()`.

### Task 12: Credential Audit UI

Create `recoder-agents/src/components/settings/credential-audit-log.tsx`:

Credential access audit panel:
- Summary: total accesses, unique keys, failed attempts (red), anomalies (amber)
- Access log table: timestamp, key (masked), agent, access type badge, success/fail, IP
- Filter by key, agent, access type
- Anomaly alerts: highlighted rows for unusual patterns

Wire into settings security page or credentials page.

---

## Phase 4: Sandbox Resource Monitor (Tasks 13-16)

### Task 13: Resource Monitor Schema

Create `backend/supabase/migrations/20260311000003_sandbox_resources.sql`:

```sql
CREATE TABLE IF NOT EXISTS sandbox_resource_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sandbox_id TEXT NOT NULL,
  agent_id TEXT,
  cpu_percent NUMERIC(5,2),
  memory_mb INTEGER,
  disk_mb INTEGER,
  network_in_kb INTEGER,
  network_out_kb INTEGER,
  process_count INTEGER,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'idle', 'stopped', 'error')),
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sandbox_resources_user ON sandbox_resource_snapshots(user_id, captured_at DESC);
CREATE INDEX idx_sandbox_resources_sandbox ON sandbox_resource_snapshots(sandbox_id, captured_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Resource Monitor API

Create `backend/core/monitoring/sandbox_monitor_api.py`:

Router with tag `"sandbox-monitor"`:
- `GET /sandbox/resources` — list active sandboxes with latest resource snapshot. Auth required.
- `GET /sandbox/{sandbox_id}/resources/history` — resource history for sandbox. Query: `hours` (default 24). Auth required.
- `POST /sandbox/{sandbox_id}/resources/snapshot` — record snapshot (called by sandbox runtime). Auth required.
- `GET /sandbox/resources/summary` — aggregate: total sandboxes, total memory, total CPU, avg utilization. Auth required.

Register in `backend/api.py`.

### Task 15: Resource Monitor Frontend

Create `recoder-agents/src/lib/api/sandbox-monitor.ts` and `recoder-agents/src/hooks/monitoring/use-sandbox-monitor.ts`.

Hooks: `useActiveSandboxes()`, `useSandboxResourceHistory(sandboxId, hours)`, `useSandboxResourceSummary()`.

### Task 16: Resource Monitor UI

Create `recoder-agents/src/app/(dashboard)/monitoring/resources/page.tsx`:

Sandbox resource monitor:
- Summary cards: Active Sandboxes, Total Memory, Avg CPU, Network I/O
- Sandbox list: sandbox ID, agent name, CPU gauge, memory gauge, status badge
- Click to expand: resource history line charts (CPU, Memory, Network over time via Recharts)
- Auto-refresh every 10 seconds

Wire into monitoring section.

---

## Phase 5: Global Search (Tasks 17-20)

### Task 17: Search Index Schema

Create `backend/supabase/migrations/20260311000004_global_search.sql`:

```sql
CREATE TABLE IF NOT EXISTS search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('agent', 'thread', 'prompt', 'knowledge_entry', 'template', 'webhook', 'schedule', 'test_case')),
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_preview TEXT,
  tags TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (resource_type, resource_id)
);

CREATE INDEX idx_search_user ON search_index(user_id);
CREATE INDEX idx_search_type ON search_index(resource_type);
CREATE INDEX idx_search_title_trgm ON search_index USING gin (title gin_trgm_ops);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Global Search API

Create `backend/core/search/global_search_api.py` + `__init__.py`:

Router with tag `"global-search"`:
- `GET /search` — search across all resources. Query: `q` (search term), `resource_type` (optional filter), `limit` (default 20). Uses ILIKE for simplicity. Auth required.
- `POST /search/reindex` — rebuild search index from source tables (agents, threads, prompts, knowledge, etc.). Auth required.
- `GET /search/suggestions` — autocomplete suggestions based on title prefix. Query: `q`, `limit` (default 5). Auth required.

Register in `backend/api.py`.

### Task 19: Global Search Frontend

Create `recoder-agents/src/lib/api/global-search.ts` and `recoder-agents/src/hooks/use-global-search.ts`.

Hooks: `useGlobalSearch(query, resourceType)`, `useSearchSuggestions(query)`, `useReindex()`.

### Task 20: Global Search UI

Create `recoder-agents/src/components/search/global-search-command.tsx`:

Command palette style search (Cmd+K):
- Search input with debounced query
- Resource type filter tabs: All, Agents, Threads, Prompts, Knowledge, Templates
- Results list: resource type icon, title, content preview, click to navigate
- Keyboard navigation: up/down arrows, Enter to select
- Recent searches (localStorage)
- Empty state with suggestions

Wire into app layout or header as Cmd+K shortcut.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 51 completion status.

---
