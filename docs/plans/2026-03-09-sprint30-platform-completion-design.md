# Sprint 30: Platform Completion — Design

> **Approved:** 2026-03-09

**Goal:** Build five production-quality features that complete the Recoder platform: public agent marketplace, team/org management, centralized knowledge manager, per-agent analytics, and agent versioning UI.

**Architecture:** All features build on existing infrastructure. No new services, no new databases. Frontend pages in `recoder-agents/` and `app/`. Backend APIs in `backend/` (FastAPI) and existing Next.js API routes. Shared auth DB for org membership.

---

## 1. Public Agent Marketplace

### Pages
- `/marketplace` — Public grid: category filters, search, sort (popular/newest/trending), pagination
- `/marketplace/[templateId]` — Detail: description, capabilities, tools, install count, creator, related
- `/marketplace/category/[slug]` — Category landings (automation, research, coding, writing, data, etc.)

### SEO
- Server-rendered pages (Next.js SSR/SSG)
- Per-page `<title>`, `<meta description>`, Open Graph, JSON-LD structured data
- Sitemap entries auto-generated from template list

### Install Flow
- **Authenticated:** One-click install → credential mapping modal → agent created → "Open Agent" CTA
- **Unauthenticated:** "Sign up to install" → signup with `?redirect=/marketplace/[id]&action=install` → post-signup auto-install

### Backend
- Template search API: full-text + tag filtering
- Category taxonomy (predefined categories with slugs)
- Trending algorithm: installs weighted by recency (7-day decay)
- Creator profiles: display name, avatar, template count
- Public endpoints (no auth required for browse/search/detail)

### Data Model
- `agent_template_categories` table: id, name, slug, description, iconName, sortOrder
- `agent_template_category_map` table: templateId, categoryId
- Add to existing templates: `categoryIds`, `installCount`, `trendingScore`, `isPublic`, `screenshots[]`

---

## 2. Team & Organization Management

### Data Model
- `organizations`: id, name, slug, ownerId, avatarUrl, plan, createdAt, updatedAt
- `organization_members`: orgId, userId, role (owner/admin/member/viewer), invitedBy, joinedAt
- `organization_invites`: orgId, email, role, token, expiresAt, status (pending/accepted/declined/expired)

### Roles & Permissions
- **Owner:** Full control, billing, delete org
- **Admin:** Manage members, manage all agents/projects, settings
- **Member:** Create/edit own agents, view shared agents, collaborate
- **Viewer:** Read-only access to shared resources

### Pages (Main App — recoder.xyz)
- `/settings/organization` — Create/manage org, avatar, name, slug
- `/settings/organization/members` — Member list, invite form (email + role), pending invites, role management
- `/settings/organization/billing` — Org-level billing placeholder (wires into existing billing infra)

### Pages (Agents App)
- Org switcher in sidebar: personal workspace / org workspaces
- Shared agents view: agents owned by org members with visibility controls
- Agent visibility: private (creator) / team (org) / public (marketplace)

### Cross-App
- Org context in session via shared auth DB
- AppSwitcher shows org name when in org context
- All apps read org membership from auth DB on session verification

### Invite Flow
- Admin enters email + role → invite created with crypto token → email sent via Resend
- Recipient clicks link → lands on `/invite/[token]` → accepts → added to org
- Existing users: instant join. New users: signup then auto-join.

---

## 3. Centralized Knowledge Manager

### Location
Replace `/dashboard/knowledge` placeholder in `recoder-agents/` with full file manager.

### UI Components
- **File browser:** Tree sidebar (folders) + main area (grid/list toggle)
- **Upload:** Drag-and-drop zone + file picker. Progress bars. Bulk upload.
- **File preview:** Text/code (syntax highlighted), PDF (embedded viewer), images, markdown rendered
- **Folder management:** Create/rename/delete/nest. Drag files between folders.
- **Search bar:** Full-text + semantic search across all KB entries. Filter by folder, type, agent.
- **Agent assignment panel:** Multi-select agents. Visual badges showing assignments. Bulk assign/unassign.
- **Embedding status:** Per-file badge (pending/complete/failed). Bulk re-embed. Storage stats.
- **Git clone:** Clone dialog with URL input, branch selection, progress indicator.

### Backend
All APIs exist:
- `POST /knowledge-base/upload` — file upload
- `GET/POST/PUT/DELETE /knowledge-base/folders` — folder CRUD
- `GET /knowledge-base/search` — full-text + semantic search
- `POST /knowledge-base/folders/{id}/clone-git-repo` — git clone
- `POST /knowledge-base/backfill-embeddings` — re-embed

New endpoints needed:
- `GET /knowledge-base/stats` — total files, embedded count, storage used, per-folder counts
- `PATCH /knowledge-base/entries/bulk-assign` — bulk agent assignment
- `PATCH /knowledge-base/entries/bulk-move` — bulk move between folders

---

## 4. Per-Agent Analytics Dashboard

### Location
New "Analytics" tab in agent configuration view in `recoder-agents/`.

### Metrics
- **Usage:** Total runs, tokens (in/out), cost, avg response time — time range selector (24h/7d/30d/90d/all)
- **Cost:** Per-model pie chart, daily cost trend line, projected monthly cost
- **Performance:** Success rate %, avg turns/conversation, error rate, timeout rate
- **Tool usage:** Most-used tools, tool success/failure rates, tool latency
- **Comparison:** Agent vs user average across all agents

### Data Model
- `agent_analytics_daily` table: agentId, date, totalRuns, successCount, errorCount, timeoutCount, totalTokensIn, totalTokensOut, totalCost, avgResponseMs, modelBreakdown (JSON), toolBreakdown (JSON)
- Populated by a daily rollup cron job (or on-demand aggregation with caching)

### Backend
- `GET /api/agents/[agentId]/analytics?range=7d` — aggregated metrics
- `GET /api/agents/[agentId]/analytics/daily?from=&to=` — daily breakdown
- `GET /api/agents/[agentId]/analytics/export?format=csv` — CSV export

### Charts
- Line chart: daily runs + cost trend (dual axis)
- Pie chart: model usage distribution
- Bar chart: tool usage frequency
- Stat cards: total runs, success rate, avg cost, avg tokens

---

## 5. Agent Versioning UI

### Location
New "Versions" tab in agent configuration view in `recoder-agents/`.

### Features
- **Version list:** Chronological, showing version #, timestamp, auto-generated change summary, optional label
- **Visual diff:** Side-by-side of any two versions. Syntax-highlighted prompt diff. Structured diff for tools/knowledge/workflow config.
- **Restore:** One-click restore with confirmation dialog. Non-destructive (creates new version with old content).
- **Auto-versioning:** New version on every save. No manual step.
- **Labels:** User-assignable labels ("production", "experimental", etc.)

### Data Model
- `agent_versions` table: id, agentId, versionNumber, config (JSON — full snapshot of agent config), changeSummary (text), label, createdBy, createdAt
- Auto-generated changeSummary by diffing config JSON (e.g., "Updated system prompt, added 2 tools, removed knowledge file X")

### Backend
- `GET /api/agents/[agentId]/versions` — list all versions (paginated)
- `GET /api/agents/[agentId]/versions/[versionId]` — single version detail
- `GET /api/agents/[agentId]/versions/[v1]/diff/[v2]` — structured diff between two versions
- `POST /api/agents/[agentId]/versions/[versionId]/restore` — restore (creates new version)
- `PATCH /api/agents/[agentId]/versions/[versionId]` — update label
- Auto-create version on agent config save (triggered by existing save endpoints)

### Diff Algorithm
- JSON deep-diff for structured config (tools, knowledge, workflows)
- Line-by-line diff for system prompt text (using a diff library like `diff` or `jsdiff`)
- Change summary auto-generated: count additions/removals/modifications per section

---

## Implementation Order

1. **Agent Versioning** — Foundation (other features benefit from version safety)
2. **Per-Agent Analytics** — Data model + aggregation (independent)
3. **Centralized Knowledge Manager** — Frontend build on existing APIs
4. **Team & Organization** — Data model + cross-app changes
5. **Public Marketplace** — Depends on team (for org-published templates) + versioning

---

## Testing Strategy

Each feature gets:
- Unit tests for new API endpoints
- Component tests for new UI pages
- Integration test for the core user flow (e.g., "create org → invite → accept → see shared agents")
