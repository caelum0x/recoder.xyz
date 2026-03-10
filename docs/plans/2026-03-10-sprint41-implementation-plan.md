# Sprint 41: Thread Templates, Saved Prompts, Team Management & Agent Pipelines

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add conversation templates, saved prompt library, team management page, agent chaining/pipelines, and thread pinning — completing the core collaboration and productivity feature set.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Supabase with RLS. Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Saved Prompts Library (Tasks 1-4)

### Task 1: Saved Prompts Database Schema

Create `backend/supabase/migrations/20260310000000_saved_prompts.sql`:

```sql
CREATE TABLE IF NOT EXISTS saved_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_saved_prompts_user ON saved_prompts(user_id);
CREATE INDEX idx_saved_prompts_user_pinned ON saved_prompts(user_id, is_pinned);

ALTER TABLE saved_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own prompts"
  ON saved_prompts FOR ALL
  USING (user_id = auth.uid());
```

### Task 2: Saved Prompts API Backend

Create `backend/core/prompts/saved_prompts_api.py` + `__init__.py`:

Router with tag `"saved-prompts"`, prefix `/prompts`:
- `POST /prompts` — create a saved prompt. Body: `{ title, content, category?, tags? }`.
- `GET /prompts` — list all user's saved prompts. Optional query: `category`, `search` (searches title+content). Sorted by `is_pinned DESC, updated_at DESC`.
- `GET /prompts/{prompt_id}` — get single prompt. Increment `usage_count`.
- `PATCH /prompts/{prompt_id}` — update prompt (title, content, category, tags, is_pinned).
- `DELETE /prompts/{prompt_id}` — delete prompt.
- `POST /prompts/{prompt_id}/use` — mark as used (increment usage_count, update updated_at).

All endpoints auth-gated with `Depends(verify_and_get_user_id_from_jwt)`.

Register in `backend/api.py`.

### Task 3: Saved Prompts Frontend API + Hooks

Create `recoder-agents/src/lib/api/saved-prompts.ts`:

API client functions: `createPrompt`, `getPrompts`, `getPrompt`, `updatePrompt`, `deletePrompt`, `usePrompt` (marks as used).

Create `recoder-agents/src/hooks/platform/use-saved-prompts.ts`:

Hooks: `useSavedPrompts(category?, search?)`, `useSavedPrompt(id)`, `useCreatePrompt()`, `useUpdatePrompt()`, `useDeletePrompt()`, `useMarkPromptUsed()`.

### Task 4: Saved Prompts Page + Chat Integration

Create `recoder-agents/src/app/(dashboard)/prompts/page.tsx`:

Saved prompts library page:
- Header with "New Prompt" button
- Category filter tabs: All, General, Coding, Research, Writing, Analysis
- Search bar
- Grid of prompt cards: title, content preview (truncated), category badge, usage count, pinned indicator, edit/delete actions
- Click card to copy content to clipboard + toast
- Pin/unpin toggle
- Create/edit dialog with title, content (textarea), category dropdown, tags input

Add sidebar link: BookOpen icon, "Prompts" label, link to `/prompts`.

Wire into chat input: Read existing `chat-input.tsx` and add a small "Saved Prompts" button (BookOpen icon) that opens a dropdown/popover of the user's pinned prompts. Clicking one inserts the prompt content into the input field.

---

## Phase 2: Thread Templates (Tasks 5-7)

### Task 5: Thread Templates Backend

Create `backend/core/threads/thread_templates_api.py`:

Router with tag `"thread-templates"`, prefix `/thread-templates`:
- `POST /thread-templates` — create template from current thread. Body: `{ name, description, agent_id?, initial_messages: [{ role, content }], category? }`.
- `GET /thread-templates` — list user's templates.
- `GET /thread-templates/{template_id}` — get template detail.
- `DELETE /thread-templates/{template_id}` — delete template.
- `POST /thread-templates/{template_id}/create-thread` — create a new thread from template (copies initial messages, assigns agent).

All auth-gated. Store in a new `thread_templates` table:

Create `backend/supabase/migrations/20260310000001_thread_templates.sql`:
```sql
CREATE TABLE IF NOT EXISTS thread_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  agent_id TEXT,
  initial_messages JSONB DEFAULT '[]',
  category TEXT DEFAULT 'general',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_templates_user ON thread_templates(user_id);
ALTER TABLE thread_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own templates"
  ON thread_templates FOR ALL
  USING (user_id = auth.uid());
```

Register router in `backend/api.py`.

### Task 6: Thread Templates Frontend

Create `recoder-agents/src/lib/api/thread-templates.ts` and `recoder-agents/src/hooks/threads/use-thread-templates.ts`.

Create `recoder-agents/src/app/(dashboard)/templates/threads/page.tsx`:

Thread templates page:
- Grid of template cards: name, description, agent badge, message count, usage count
- "New Template" dialog: name, description, agent selector, initial messages editor (add/remove messages with role toggle)
- "Use Template" button that creates thread and navigates to it
- Category filter

### Task 7: Save Thread as Template

Create `recoder-agents/src/components/thread/save-as-template-dialog.tsx`:

Dialog triggered from thread header actions:
- Pre-fills name from thread title
- Description textarea
- Select which messages to include (checkboxes on first N messages)
- Category dropdown
- "Save as Template" button

Wire into the thread header action menu in `thread-site-header.tsx`.

---

## Phase 3: Team Management (Tasks 8-11)

### Task 8: Team Management Backend

Create `backend/core/teams/team_api.py` + `__init__.py`:

Router with tag `"teams"`, prefix `/teams`:
- `GET /teams` — list user's teams (team_id, name, role, member_count).
- `POST /teams` — create team. Body: `{ name, description? }`.
- `GET /teams/{team_id}` — team detail with members list.
- `PATCH /teams/{team_id}` — update team name/description (admin only).
- `DELETE /teams/{team_id}` — delete team (owner only).
- `POST /teams/{team_id}/invite` — invite member by email. Body: `{ email, role }`.
- `DELETE /teams/{team_id}/members/{user_id}` — remove member.
- `PATCH /teams/{team_id}/members/{user_id}` — change member role.

Create `backend/supabase/migrations/20260310000002_teams.sql`:
```sql
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_members_team ON team_members(team_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team visible to members" ON teams FOR SELECT
  USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Team owner can modify" ON teams FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "Members can view team" ON team_members FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage members" ON team_members FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));
```

Register router in `backend/api.py`.

### Task 9: Team Management Frontend API + Hooks

Create `recoder-agents/src/lib/api/teams.ts` and `recoder-agents/src/hooks/platform/use-teams.ts`.

Hooks: `useTeams()`, `useTeam(id)`, `useCreateTeam()`, `useUpdateTeam()`, `useDeleteTeam()`, `useInviteMember()`, `useRemoveMember()`, `useUpdateMemberRole()`.

### Task 10: Team Management Page

Create `recoder-agents/src/app/(dashboard)/settings/team/page.tsx`:

Team settings page (under settings layout):
- Team list (if user has multiple teams)
- Active team detail: name, description (editable), member count
- Members table: avatar/email, role badge, joined date, actions (change role, remove)
- "Invite Member" button → dialog with email input + role selector
- Pending invitations section
- Danger zone: "Leave Team" / "Delete Team" buttons with confirmation

Add "Team" link to the settings sidebar layout.

### Task 11: Team Switcher Enhancement

Modify `recoder-agents/src/components/sidebar/nav-user-with-teams.tsx`:
- Add "Manage Teams" link that goes to `/settings/team`
- Add "Create Team" button in the team dropdown
- Show member count next to team name

---

## Phase 4: Agent Pipelines (Tasks 12-15)

### Task 12: Agent Pipeline Backend

Create `backend/core/agents/agent_pipeline_api.py`:

Router with tag `"agent-pipelines"`:
- `POST /pipelines` — create pipeline. Body: `{ name, description, steps: [{ agent_id, input_mapping?, condition? }] }`.
- `GET /pipelines` — list user's pipelines.
- `GET /pipelines/{pipeline_id}` — get pipeline detail.
- `PATCH /pipelines/{pipeline_id}` — update pipeline.
- `DELETE /pipelines/{pipeline_id}` — delete pipeline.
- `POST /pipelines/{pipeline_id}/execute` — execute pipeline sequentially. Creates a thread per step, passes output of step N as input to step N+1.
- `GET /pipelines/{pipeline_id}/runs` — list pipeline execution history.

Create `backend/supabase/migrations/20260310000003_agent_pipelines.sql`:
```sql
CREATE TABLE IF NOT EXISTS agent_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES agent_pipelines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER NOT NULL,
  step_results JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX idx_pipelines_user ON agent_pipelines(user_id);
CREATE INDEX idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id);
CREATE INDEX idx_pipeline_runs_user ON pipeline_runs(user_id);

ALTER TABLE agent_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own pipelines"
  ON agent_pipelines FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can view own runs"
  ON pipeline_runs FOR ALL USING (user_id = auth.uid());
```

Register router in `backend/api.py`.

### Task 13: Pipeline Frontend API + Hooks

Create `recoder-agents/src/lib/api/pipelines.ts` and `recoder-agents/src/hooks/agents/use-pipelines.ts`.

### Task 14: Pipeline Builder Page

Create `recoder-agents/src/app/(dashboard)/pipelines/page.tsx`:

Pipeline management page:
- Pipeline list: name, step count, last run status, created date
- "New Pipeline" button → opens builder
- Each pipeline card: edit, run, delete actions

Create `recoder-agents/src/app/(dashboard)/pipelines/[pipelineId]/page.tsx`:

Pipeline builder/editor:
- Vertical step list (sortable via drag-and-drop)
- Each step: agent selector dropdown, optional input mapping textarea, condition field
- Add step button at bottom
- Pipeline name + description at top
- "Save" and "Run Pipeline" buttons in header
- Run history panel (collapsible) showing past executions with status per step

### Task 15: Pipeline Execution View

Create `recoder-agents/src/components/pipelines/pipeline-execution-view.tsx`:

Shows live pipeline execution:
- Vertical timeline of steps
- Current step highlighted with loading spinner
- Completed steps show green check + output preview
- Failed steps show red X + error message
- Overall progress bar at top
- "Cancel" button for running pipelines

Wire pipeline link into sidebar: `GitBranch` icon, "Pipelines" label.

---

## Phase 5: Thread Pinning & Organization (Tasks 16-19)

### Task 16: Thread Pinning Backend

Add to existing threads API:
- `POST /threads/{thread_id}/pin` — pin a thread. Stores in `user_pinned_threads` table.
- `DELETE /threads/{thread_id}/pin` — unpin.
- `GET /threads/pinned` — list pinned threads.

Create `backend/supabase/migrations/20260310000004_pinned_threads.sql`:
```sql
CREATE TABLE IF NOT EXISTS user_pinned_threads (
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  pinned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);

ALTER TABLE user_pinned_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own pins"
  ON user_pinned_threads FOR ALL
  USING (user_id = auth.uid());
```

### Task 17: Thread Pinning Frontend

Create `recoder-agents/src/hooks/threads/use-pinned-threads.ts`:

Hooks: `usePinnedThreads()`, `useTogglePin()`.

Modify thread list in sidebar (`sidebar-thread-list.tsx`):
- Show pinned threads at top with Pin icon separator
- Add pin/unpin action to thread context menu

### Task 18: Thread Folders/Groups

Create `recoder-agents/src/components/sidebar/thread-groups.tsx`:

Thread grouping component:
- Group threads by: Recent (Today, Yesterday, This Week, Older) — default
- Or by agent (grouped by which agent they belong to)
- Toggle between grouping modes via small dropdown
- Collapsible group headers with count badge
- Applied to the sidebar thread list

### Task 19: Update Status Docs

Update `tasks/todo.md` with Sprint 41 completion status.

---
