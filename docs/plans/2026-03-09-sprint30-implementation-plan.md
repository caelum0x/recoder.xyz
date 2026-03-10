# Sprint 30: Platform Completion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build five production-quality features: agent versioning, per-agent analytics, centralized knowledge manager, team/org management, and public marketplace.

**Architecture:** Backend = Python FastAPI (`backend/core/`), Frontend = Next.js (`recoder-agents/`), Main App = Next.js + Prisma (`app/`). No new services.

**Tech Stack:** Python/FastAPI, Next.js 14, Prisma, PostgreSQL, React, Tailwind CSS, Recharts (charts)

---

### Task 1: Agent Versioning — Backend

**Files:**
- Create: `backend/core/agents/versioning_api.py`
- Create: `backend/supabase/migrations/20260309200000_agent_versions.sql`
- Modify: `backend/core/agents/api.py` (wire versioning into agent save)
- Modify: `backend/main.py` (register new router)

**What to build:**

1. **Migration** `20260309200000_agent_versions.sql`:
```sql
CREATE TABLE IF NOT EXISTS agent_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    config JSONB NOT NULL,
    change_summary TEXT,
    label TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, version_number)
);
CREATE INDEX idx_agent_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX idx_agent_versions_created_at ON agent_versions(created_at DESC);
```

2. **API Router** `versioning_api.py`:
- `GET /agents/{agent_id}/versions` — list all versions (paginated, newest first)
- `GET /agents/{agent_id}/versions/{version_id}` — single version detail
- `GET /agents/{agent_id}/versions/{v1_id}/diff/{v2_id}` — structured diff
- `POST /agents/{agent_id}/versions/{version_id}/restore` — restore (creates new version)
- `PATCH /agents/{agent_id}/versions/{version_id}` — update label
- Internal function `create_version(agent_id, config, user_id)` — auto-called on save

3. **Diff logic:** JSON deep-diff for structured config. Count additions/removals/modifications per section. Generate human-readable change_summary.

4. **Wire into agent save:** In `api.py`, after any agent config update, call `create_version()` with the new config snapshot.

**Follow existing patterns from** `backend/core/knowledge_base/api.py`:
- Use `APIRouter(prefix=..., tags=[...])`
- Use `Table("agent_versions")` for DB access
- Use `require_auth()` for authentication
- Use Pydantic models for request/response validation

---

### Task 2: Agent Versioning — Frontend

**Files:**
- Create: `recoder-agents/src/components/agents/config/agent-versions-tab.tsx`
- Create: `recoder-agents/src/lib/api/agent-versions.ts`
- Modify: Agent config page to add Versions tab

**What to build:**

1. **API client** `agent-versions.ts`:
```typescript
export async function getAgentVersions(agentId: string, page?: number): Promise<AgentVersion[]>
export async function getVersionDiff(agentId: string, v1: string, v2: string): Promise<VersionDiff>
export async function restoreVersion(agentId: string, versionId: string): Promise<void>
export async function updateVersionLabel(agentId: string, versionId: string, label: string): Promise<void>
```

2. **Versions tab component** `agent-versions-tab.tsx`:
- Version list with: version #, timestamp (relative), change summary, optional label badge
- Click version → expand to show full config snapshot
- "Compare" button → side-by-side diff view with syntax highlighting
- "Restore" button → confirmation dialog → restore → toast success
- "Label" button → inline edit for label text
- Diff view: split pane, red/green highlighting for prompt changes, structured list for tool/knowledge changes

3. **Add tab** to agent config page (find the existing tabs component and add "Versions" alongside Instructions, Tools, etc.)

---

### Task 3: Per-Agent Analytics — Backend

**Files:**
- Create: `backend/core/agents/analytics_api.py`
- Create: `backend/supabase/migrations/20260309200100_agent_analytics.sql`
- Modify: `backend/main.py` (register router)

**What to build:**

1. **Migration** `20260309200100_agent_analytics.sql`:
```sql
CREATE TABLE IF NOT EXISTS agent_analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    date DATE NOT NULL,
    total_runs INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    timeout_count INTEGER DEFAULT 0,
    total_tokens_in BIGINT DEFAULT 0,
    total_tokens_out BIGINT DEFAULT 0,
    total_cost NUMERIC(10,4) DEFAULT 0,
    avg_response_ms INTEGER DEFAULT 0,
    avg_turns NUMERIC(5,2) DEFAULT 0,
    model_breakdown JSONB DEFAULT '{}',
    tool_breakdown JSONB DEFAULT '{}',
    UNIQUE(agent_id, date)
);
CREATE INDEX idx_analytics_agent_date ON agent_analytics_daily(agent_id, date DESC);
```

2. **API Router** `analytics_api.py`:
- `GET /agents/{agent_id}/analytics?range=7d` — aggregated metrics for time range
- `GET /agents/{agent_id}/analytics/daily?from=&to=` — daily breakdown for charts
- `GET /agents/{agent_id}/analytics/export?format=csv` — CSV export
- Internal `record_analytics_event(agent_id, run_data)` — called after each agent run completes

3. **Aggregation:** Query `agent_runs` / `threads` / `messages` tables to compute daily rollups. Use existing thread/run data. On first request for an agent, backfill from historical data.

---

### Task 4: Per-Agent Analytics — Frontend

**Files:**
- Create: `recoder-agents/src/components/agents/config/agent-analytics-tab.tsx`
- Create: `recoder-agents/src/lib/api/agent-analytics.ts`
- Modify: Agent config page to add Analytics tab

**What to build:**

1. **API client** with typed functions for each endpoint.

2. **Analytics tab** with:
- Time range selector (24h / 7d / 30d / 90d / All)
- Stat cards row: Total Runs, Success Rate %, Avg Cost, Total Tokens
- Line chart: Daily runs + cost trend (dual Y-axis) — use Recharts
- Pie chart: Model usage distribution
- Bar chart: Tool usage frequency with success/failure breakdown
- Table: Recent runs with status, duration, tokens, cost
- Export CSV button
- Empty state when no data

---

### Task 5: Centralized Knowledge Manager — Frontend

**Files:**
- Rewrite: `recoder-agents/src/app/(dashboard)/knowledge/page.tsx` (replace placeholder)
- Create: `recoder-agents/src/components/knowledge/knowledge-manager.tsx`
- Create: `recoder-agents/src/components/knowledge/file-browser.tsx`
- Create: `recoder-agents/src/components/knowledge/folder-tree.tsx`
- Create: `recoder-agents/src/components/knowledge/file-preview.tsx`
- Create: `recoder-agents/src/components/knowledge/upload-zone.tsx`
- Create: `recoder-agents/src/components/knowledge/agent-assignment-panel.tsx`
- Create: `recoder-agents/src/components/knowledge/embedding-status.tsx`
- Create: `recoder-agents/src/lib/api/knowledge.ts`

**What to build:**

1. **API client** wrapping existing backend endpoints:
- List folders, list entries, upload file, delete, move, search, clone git repo, backfill embeddings
- New: stats endpoint, bulk assign, bulk move

2. **Knowledge Manager** (main page component):
- Left sidebar: folder tree with create/rename/delete
- Main area: file grid (thumbnails) or list view (toggle)
- Top bar: search input, view toggle, upload button, bulk actions
- Drag-and-drop upload zone (overlay on drag)

3. **File Browser** with sort (name/date/size/type), multi-select, context menus (move/delete/assign/download)

4. **Folder Tree** with nested folders, expand/collapse, drag files into folders, create new folder inline

5. **File Preview** modal: text/code with syntax highlighting (use existing code highlighting), PDF embedded, images displayed, markdown rendered

6. **Agent Assignment Panel**: slide-out panel showing all agents with checkboxes, current assignments highlighted, bulk assign/unassign

7. **Embedding Status**: per-file badge (green=complete, yellow=pending, red=failed), stats bar showing total/embedded/pending counts, "Re-embed All" button

8. **Git Clone Dialog**: URL input, branch selector (fetched after URL entered), progress bar during clone

---

### Task 6: Knowledge Manager — Backend Extensions

**Files:**
- Modify: `backend/core/knowledge_base/api.py`

**What to build:**

1. `GET /knowledge-base/stats` — total files, embedded count, storage used, per-folder counts
2. `PATCH /knowledge-base/entries/bulk-assign` — bulk agent assignment (body: `{entryIds: [], agentIds: []}`)
3. `PATCH /knowledge-base/entries/bulk-move` — bulk move between folders (body: `{entryIds: [], targetFolderId: string}`)

---

### Task 7: Team & Organization — Database & Backend

**Files:**
- Create: `app/prisma/migrations/20260309200200_organizations/migration.sql`
- Modify: `app/prisma/schema.prisma` (add organization models)
- Create: `app/app/api/organizations/route.ts` (CRUD)
- Create: `app/app/api/organizations/[orgId]/members/route.ts`
- Create: `app/app/api/organizations/[orgId]/invites/route.ts`
- Create: `app/app/api/organizations/invite/[token]/route.ts` (accept invite)
- Modify: `app/lib/email.ts` (add org invite email template)

**What to build:**

1. **Prisma schema additions:**
```prisma
model organizations {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  ownerId     String
  avatarUrl   String?
  plan        String   @default("free")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  owner       users    @relation("org_owner", fields: [ownerId], references: [id])
  members     organization_members[]
  invites     organization_invites[]
}

model organization_members {
  id        String   @id @default(uuid())
  orgId     String
  userId    String
  role      String   @default("member") // owner, admin, member, viewer
  invitedBy String?
  joinedAt  DateTime @default(now())
  org       organizations @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user      users         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([orgId, userId])
}

model organization_invites {
  id        String   @id @default(uuid())
  orgId     String
  email     String
  role      String   @default("member")
  token     String   @unique
  expiresAt DateTime
  status    String   @default("pending") // pending, accepted, declined, expired
  createdAt DateTime @default(now())
  org       organizations @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@index([token])
  @@index([email, orgId])
}
```

2. **API routes** following existing patterns from `app/app/api/user/account/route.ts`:
- `POST /api/organizations` — create org (user becomes owner)
- `GET /api/organizations` — list user's orgs
- `GET /api/organizations/[orgId]` — org details
- `PUT /api/organizations/[orgId]` — update org
- `DELETE /api/organizations/[orgId]` — delete (owner only)
- `GET /api/organizations/[orgId]/members` — list members
- `DELETE /api/organizations/[orgId]/members/[userId]` — remove member
- `PATCH /api/organizations/[orgId]/members/[userId]` — change role
- `POST /api/organizations/[orgId]/invites` — send invite
- `DELETE /api/organizations/[orgId]/invites/[inviteId]` — cancel invite
- `POST /api/organizations/invite/[token]` — accept invite

3. **Invite email** template in email.ts: branded HTML with org name, inviter name, role, accept link

---

### Task 8: Team & Organization — Frontend (Main App)

**Files:**
- Create: `app/app/[locale]/settings/organization/page.tsx`
- Create: `app/app/[locale]/settings/organization/members/page.tsx`
- Modify: Settings navigation to include Organization section

**What to build:**

1. **Organization settings page** (`/settings/organization`):
- Create org form (if no org): name, slug (auto-generated from name), avatar upload
- Edit org: name, slug, avatar, danger zone (delete)
- Shows current plan and member count

2. **Members page** (`/settings/organization/members`):
- Member list: avatar, name, email, role badge, joined date
- Role dropdown to change role (owner/admin only)
- Remove member button with confirmation
- Invite section: email input + role select + send button
- Pending invites list with cancel button
- Empty state for no members

3. **Settings nav update**: Add "Organization" section with icon to settings hub page

---

### Task 9: Team & Organization — Cross-App (Agents)

**Files:**
- Create: `recoder-agents/src/components/sidebar/org-switcher.tsx`
- Modify: `recoder-agents/src/components/sidebar/sidebar-left.tsx` (add org switcher)
- Create: `recoder-agents/src/lib/api/organizations.ts`
- Modify: Agent list/dashboard to show org context

**What to build:**

1. **Org switcher** in sidebar: dropdown showing "Personal" + user's orgs, active org highlighted, switching updates context for all queries

2. **Org API client**: fetch user's orgs from main app API (cross-domain with credentials)

3. **Agent visibility controls**: on agent config, add visibility select: Private / Team / Public
- Private: only creator sees it
- Team: all org members see it
- Public: appears in marketplace

4. **Shared agents view**: when in org context, dashboard shows agents from all org members with correct visibility

---

### Task 10: Public Marketplace — Backend

**Files:**
- Create: `backend/core/marketplace/api.py`
- Create: `backend/supabase/migrations/20260309200300_marketplace_categories.sql`
- Modify: `backend/main.py` (register router)

**What to build:**

1. **Migration:**
```sql
CREATE TABLE IF NOT EXISTS marketplace_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon_name TEXT,
    sort_order INTEGER DEFAULT 0
);

INSERT INTO marketplace_categories (name, slug, description, icon_name, sort_order) VALUES
('Automation', 'automation', 'Automate repetitive tasks and workflows', 'Zap', 1),
('Research', 'research', 'Research and information gathering agents', 'Search', 2),
('Coding', 'coding', 'Code generation, review, and development', 'Code', 3),
('Writing', 'writing', 'Content creation and editing', 'PenTool', 4),
('Data', 'data', 'Data analysis and processing', 'BarChart', 5),
('Communication', 'communication', 'Email, messaging, and outreach', 'MessageSquare', 6),
('Design', 'design', 'Design and creative workflows', 'Palette', 7),
('DevOps', 'devops', 'Infrastructure and deployment', 'Server', 8);

ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS category_ids UUID[] DEFAULT '{}';
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS install_count INTEGER DEFAULT 0;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS trending_score NUMERIC(10,4) DEFAULT 0;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS screenshots TEXT[] DEFAULT '{}';
```

2. **Public API Router** `marketplace/api.py`:
- `GET /marketplace/templates` — public, paginated, filterable (category, search, sort: popular/newest/trending)
- `GET /marketplace/templates/{template_id}` — public detail with creator info, related templates
- `GET /marketplace/categories` — list all categories
- `POST /marketplace/templates/{template_id}/install` — authenticated, creates agent from template
- `GET /marketplace/trending` — top 10 trending (7-day weighted installs)

3. **Trending algorithm:** `trending_score = sum(installs * decay_factor)` where `decay_factor = 0.95 ^ days_ago`. Recalculated on install.

---

### Task 11: Public Marketplace — Frontend

**Files:**
- Create: `recoder-agents/src/app/marketplace/page.tsx` (public, no auth required)
- Create: `recoder-agents/src/app/marketplace/[templateId]/page.tsx`
- Create: `recoder-agents/src/app/marketplace/category/[slug]/page.tsx`
- Create: `recoder-agents/src/components/marketplace/template-card.tsx`
- Create: `recoder-agents/src/components/marketplace/template-detail.tsx`
- Create: `recoder-agents/src/components/marketplace/category-sidebar.tsx`
- Create: `recoder-agents/src/components/marketplace/install-dialog.tsx`
- Create: `recoder-agents/src/components/marketplace/search-bar.tsx`
- Create: `recoder-agents/src/lib/api/marketplace.ts`

**What to build:**

1. **Marketplace page** (SSR for SEO):
- Category sidebar (left)
- Search bar + sort dropdown (top)
- Template grid: cards with name, description, category badge, install count, creator avatar
- Pagination (load more or numbered pages)
- No auth required to browse

2. **Template detail page** (SSR):
- Hero: name, description, creator, install count, category
- Capabilities section: what the agent can do
- Tools section: required tools/integrations
- Screenshots gallery (if any)
- Related templates carousel
- Install button (auth required — shows sign-up CTA if not logged in)
- SEO: title, description, OG image, JSON-LD

3. **Category page** (SSR):
- Category header with description
- Filtered template grid (same component as main page)

4. **Install dialog**: credential mapping (if template needs API keys), confirmation, success with "Open Agent" CTA

5. **SEO**: generate metadata in `generateMetadata()` for each page. Add marketplace routes to sitemap.

6. **Post-signup install**: handle `?redirect=/marketplace/[id]&action=install` query param after signup
