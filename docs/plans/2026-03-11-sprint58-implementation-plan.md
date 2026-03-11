# Sprint 58: Agent Webhooks Manager, Thread Reactions, System Health Dashboard, Agent Cloning Wizard & Quick Actions Command Palette

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user-managed webhook endpoints for agent events, emoji reactions on thread messages, a unified system health dashboard with service status monitoring, a guided agent cloning wizard with config customization, and a keyboard-driven quick actions command palette — completing the integration automation, social collaboration, operational visibility, agent productivity, and power-user UX features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Webhooks Manager (Tasks 1-4)

### Task 1: Webhooks Schema

Create `backend/supabase/migrations/20260311700000_agent_webhooks.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 5000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES agent_webhooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  response_status INTEGER,
  response_body TEXT,
  attempt INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhooks_user ON agent_webhooks(user_id);
CREATE INDEX idx_webhooks_agent ON agent_webhooks(agent_id);
CREATE INDEX idx_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX idx_deliveries_user ON webhook_deliveries(user_id, created_at DESC);
CREATE INDEX idx_deliveries_status ON webhook_deliveries(status) WHERE status IN ('pending', 'retrying');

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Webhooks API

Create `backend/core/integrations/agent_webhooks_api.py`:

Router with tag `"agent-webhooks"`:
- `POST /webhooks` — create webhook. Body: `{ agent_id?, name, url, secret?, events[], retry_count?, timeout_ms? }`. Events: `run.started`, `run.completed`, `run.failed`, `run.error`, `thread.created`, `thread.message`, `agent.updated`, `agent.deployed`. Auth required.
- `GET /webhooks` — list webhooks. Query: `agent_id`. Auth required.
- `PATCH /webhooks/{webhook_id}` — update webhook. Auth required.
- `DELETE /webhooks/{webhook_id}` — delete webhook. Auth required.
- `POST /webhooks/{webhook_id}/test` — send test delivery. Creates delivery record with test payload. Auth required.
- `GET /webhooks/{webhook_id}/deliveries` — list deliveries. Query: `status`, `limit`, `offset`. Auth required.
- `POST /webhooks/deliveries/{delivery_id}/retry` — retry failed delivery. Auth required.

Create `backend/core/integrations/__init__.py` if it doesn't exist.

Register in `backend/api.py`.

### Task 3: Webhooks Frontend

Create `recoder-agents/src/lib/api/agent-webhooks.ts` and `recoder-agents/src/hooks/integrations/use-agent-webhooks.ts`.

Hooks: `useWebhooks(agentId?)`, `useCreateWebhook()`, `useUpdateWebhook()`, `useDeleteWebhook()`, `useTestWebhook()`, `useWebhookDeliveries(webhookId, filters)`, `useRetryDelivery()`.

### Task 4: Webhooks UI

Create `recoder-agents/src/app/(dashboard)/settings/webhooks/page.tsx`:

Webhooks management page:
- Webhook list: name, URL (truncated), events badges, agent scope, active toggle, delivery success rate, last delivery time, edit/delete/test actions
- "New Webhook" dialog: name, URL input, secret (auto-generate option), event checkboxes (8 events grouped: Run events, Thread events, Agent events), agent selector (optional = all agents), retry count (1-5), timeout (1000-30000ms)
- "Test" button sends test delivery and shows result inline
- Delivery log panel (expandable per webhook): event type, payload preview, status badge (green=delivered, red=failed, amber=retrying), response status, attempt count, timestamp, retry button for failed
- Filter deliveries by status

Wire into settings section.

---

## Phase 2: Thread Reactions (Tasks 5-8)

### Task 5: Reactions Schema

Create `backend/supabase/migrations/20260311700001_thread_reactions.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index, emoji)
);

CREATE INDEX idx_reactions_thread ON thread_message_reactions(thread_id, message_index);
CREATE INDEX idx_reactions_user ON thread_message_reactions(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Reactions API

Create `backend/core/threads/thread_reactions_api.py`:

Router with tag `"thread-reactions"`:
- `POST /threads/{thread_id}/messages/{message_index}/reactions` — add reaction. Body: `{ emoji }`. Auth required.
- `DELETE /threads/{thread_id}/messages/{message_index}/reactions/{emoji}` — remove reaction. Auth required.
- `GET /threads/{thread_id}/messages/{message_index}/reactions` — list reactions grouped by emoji with count and user_ids. Auth required.
- `GET /threads/{thread_id}/reactions` — all reactions for thread. Auth required.
- `GET /reactions/frequent` — user's most used emojis. Query: `limit` (default 10). Auth required.

Register in `backend/api.py`.

### Task 7: Reactions Frontend

Create `recoder-agents/src/lib/api/thread-reactions.ts` and `recoder-agents/src/hooks/threads/use-thread-reactions.ts`.

Hooks: `useMessageReactions(threadId, messageIndex)`, `useThreadReactions(threadId)`, `useAddReaction()`, `useRemoveReaction()`, `useFrequentEmojis()`.

### Task 8: Reactions UI

Create `recoder-agents/src/components/thread/message-reactions.tsx`:

Message reactions component:
- Reaction bar below messages: emoji pills showing emoji + count, highlighted if current user reacted
- Click existing reaction to toggle (add/remove)
- "+" button to add reaction: popover with emoji grid (16 common emojis: 👍 👎 ❤️ 😂 🎉 🤔 👀 🔥 ✅ ❌ 💡 🚀 ⚡ 🙏 💯 🤖)
- Frequent emojis row at top of picker
- Tooltip on reaction pill: shows who reacted

Wire into thread message rendering.

---

## Phase 3: System Health Dashboard (Tasks 9-12)

### Task 9: Health Checks Schema

Create `backend/supabase/migrations/20260311700002_system_health.sql`:

```sql
CREATE TABLE IF NOT EXISTS system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_name TEXT NOT NULL,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')),
  response_time_ms INTEGER,
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_health_checks_user ON system_health_checks(user_id, service_name);
CREATE INDEX idx_health_history_user ON system_health_history(user_id, checked_at DESC);
CREATE INDEX idx_health_history_service ON system_health_history(service_name, checked_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Health Dashboard API

Create `backend/core/monitoring/system_health_api.py`:

Router with tag `"system-health"`:
- `POST /health/check` — run health check for all services. Checks: database (simple SELECT 1), backend API (self-check), agent runtime (connectivity). Returns status per service. Auth required.
- `GET /health/status` — get latest health status for all services. Auth required.
- `GET /health/history` — health history for charting. Query: `service_name`, `hours` (default 24). Auth required.
- `GET /health/uptime` — uptime percentage per service (last 30 days). Auth required.

Register in `backend/api.py`.

### Task 11: Health Dashboard Frontend

Create `recoder-agents/src/lib/api/system-health.ts` and `recoder-agents/src/hooks/monitoring/use-system-health.ts`.

Hooks: `useRunHealthCheck()`, `useHealthStatus()`, `useHealthHistory(serviceName?, hours?)`, `useServiceUptime()`.

### Task 12: Health Dashboard UI

Create `recoder-agents/src/app/(dashboard)/monitoring/health/page.tsx`:

System health dashboard:
- Overall status banner: green (all healthy), amber (degraded), red (any down)
- Service cards (3): Database, Backend API, Agent Runtime — each showing status icon (check/warning/x), response time, last checked time, uptime % badge
- "Run Health Check" button with loading spinner
- Response time chart: line chart per service over last 24h (Recharts)
- Uptime bars: horizontal bars per service showing 30-day uptime %
- Health history log: timestamp, service, status badge, response time — filterable by service
- Auto-refresh every 60s option

Wire into monitoring section.

---

## Phase 4: Agent Cloning Wizard (Tasks 13-16)

### Task 13: Clone History Schema

Create `backend/supabase/migrations/20260311700003_agent_clone_history.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_clone_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_agent_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  clone_options JSONB DEFAULT '{}',
  cloned_sections TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clone_history_user ON agent_clone_history(user_id, created_at DESC);
CREATE INDEX idx_clone_history_source ON agent_clone_history(source_agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Clone Wizard API

Create `backend/core/agents/agent_clone_wizard_api.py`:

Router with tag `"agent-clone-wizard"`:
- `POST /agents/{agent_id}/clone-preview` — preview what will be cloned. Returns sections: instructions, tools, workflows, routing_rules, tags, deployment_config. Each with item count and size. Auth required.
- `POST /agents/{agent_id}/clone` — execute clone. Body: `{ new_name, sections[] (which sections to include), overrides? (JSONB for customizations) }`. Creates new agent config, copies selected sections, records history. Auth required.
- `GET /agents/clone-history` — list clone history. Query: `limit`. Auth required.
- `GET /agents/{agent_id}/clone-suggestions` — suggest name and configuration tweaks based on source agent. Auth required.

Register in `backend/api.py`.

### Task 15: Clone Wizard Frontend

Create `recoder-agents/src/lib/api/agent-clone-wizard.ts` and `recoder-agents/src/hooks/agents/use-agent-clone-wizard.ts`.

Hooks: `useClonePreview(agentId)`, `useCloneAgent()`, `useCloneHistory()`, `useCloneSuggestions(agentId)`.

### Task 16: Clone Wizard UI

Create `recoder-agents/src/components/agents/clone-wizard-dialog.tsx`:

Multi-step clone wizard dialog:
- Step 1 — Source Preview: shows source agent name, sections available with item counts, checkboxes to select which sections to clone (all checked by default)
- Step 2 — Customize: new agent name input (pre-filled with suggestion), optional description override, toggle for each selected section showing brief config preview
- Step 3 — Review & Clone: summary of what will be created, section list with check/x icons, "Clone Agent" button
- Success state: shows new agent link, option to go to new agent config
- Clone history section below wizard: recent clones with source→target, sections copied, timestamp

Wire clone button into agent card context menu and agent config page header.

---

## Phase 5: Quick Actions Command Palette (Tasks 17-20)

### Task 17: Command History Schema

Create `backend/supabase/migrations/20260311700004_command_palette.sql`:

```sql
CREATE TABLE IF NOT EXISTS command_palette_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  command TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('navigation', 'action', 'agent', 'thread', 'search', 'setting')),
  metadata JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_palette_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  command TEXT NOT NULL,
  command_type TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, command)
);

CREATE INDEX idx_command_history_user ON command_palette_history(user_id, executed_at DESC);
CREATE INDEX idx_command_pins_user ON command_palette_pins(user_id, sort_order);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Command Palette API

Create `backend/core/preferences/command_palette_api.py`:

Router with tag `"command-palette"`:
- `POST /commands/history` — record command execution. Body: `{ command, command_type, metadata? }`. Auth required.
- `GET /commands/history` — recent commands. Query: `limit` (default 20), `command_type`. Auth required.
- `GET /commands/frequent` — most frequent commands. Query: `limit` (default 10). Auth required.
- `POST /commands/pins` — pin command. Body: `{ command, command_type, label }`. Auth required.
- `GET /commands/pins` — list pinned commands. Auth required.
- `DELETE /commands/pins/{pin_id}` — unpin. Auth required.

Register in `backend/api.py`.

### Task 19: Command Palette Frontend

Create `recoder-agents/src/lib/api/command-palette.ts` and `recoder-agents/src/hooks/use-command-palette.ts`.

Hooks: `useRecordCommand()`, `useCommandHistory(type?)`, `useFrequentCommands()`, `usePinCommand()`, `useCommandPins()`, `useUnpinCommand()`.

### Task 20: Command Palette UI

Create `recoder-agents/src/components/command-palette/command-palette.tsx`:

Command palette (Cmd+K / Ctrl+K trigger):
- Search input with autofocus
- Command sections:
  - Pinned commands (star icon, always shown first)
  - Recent commands (clock icon)
  - Navigation: Go to Dashboard, Agents, Settings, Monitoring, Billing, Knowledge Base, Reports
  - Actions: New Thread, New Agent, Export Data, Run Health Check, Toggle Dark Mode
  - Agent Quick Start: list of user's agents → click to start thread
- Each command row: icon, label, optional description, keyboard shortcut badge if applicable
- Fuzzy search filtering across all commands
- Arrow key navigation + Enter to execute
- Escape to close
- Track command execution for history/frequency

Wire command palette into app layout (global listener for Cmd+K). Add to layout wrapper so it's available on all pages.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 58 completion status.

---
