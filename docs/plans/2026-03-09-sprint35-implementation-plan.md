# Sprint 35: Agent Marketplace, Analytics & Versioning

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make agents publishable to a marketplace with ratings, build per-agent analytics dashboards, and add clone + version comparison features.

**Architecture:** Backend endpoints in FastAPI. Frontend in recoder-agents. Marketplace is public-facing (no auth to browse, auth to install/rate).

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui

---

## Phase 1: Agent Marketplace Publishing (Tasks 1-7)

### Task 1: Marketplace Database Schema

Create `backend/supabase/migrations/20260309500000_marketplace.sql`:

Tables:
- `marketplace_listings`: agent_id, publisher_id, title, description, category, tags[], icon_url, is_public, install_count, avg_rating, status (draft/published/under_review/rejected), published_at
- `marketplace_reviews`: listing_id, user_id, rating (1-5), comment, created_at. Unique on (listing_id, user_id)
- `marketplace_installs`: listing_id, user_id, installed_at. Unique on (listing_id, user_id)

RLS: listings readable by all authenticated users when public. Reviews/installs scoped to user.

### Task 2: Marketplace API — Publishing

Create `backend/core/marketplace/marketplace_api.py` + `__init__.py`:

Endpoints:
- `POST /marketplace/publish` — publish an agent (creates listing from agent config)
- `GET /marketplace/listings` — browse public listings with category/search/sort filters
- `GET /marketplace/listings/{listing_id}` — get listing detail with reviews
- `PATCH /marketplace/listings/{listing_id}` — update listing (owner only)
- `DELETE /marketplace/listings/{listing_id}` — unpublish (owner only)
- `POST /marketplace/listings/{listing_id}/install` — install agent (clones config to user's account)
- `POST /marketplace/listings/{listing_id}/review` — add/update review
- `GET /marketplace/listings/{listing_id}/reviews` — list reviews
- `GET /marketplace/my-listings` — user's published agents

### Task 3: Marketplace Frontend API + Hooks

Create `recoder-agents/src/lib/api/marketplace.ts` and `recoder-agents/src/hooks/marketplace/use-marketplace.ts`:

API client with all marketplace functions. Hooks: useMarketplaceListings, useMarketplaceListing, usePublishAgent, useInstallAgent, useReviewAgent, useMyListings.

### Task 4: Marketplace Browse Page

Create `recoder-agents/src/app/(dashboard)/marketplace/page.tsx`:

Full marketplace browser:
- Search bar + category filter (All, Productivity, Development, Research, Customer Support, Data, Creative)
- Sort: Popular, Newest, Highest Rated
- Grid of listing cards: icon, title, short description, category badge, install count, avg rating stars, publisher name
- Pagination (load more)

### Task 5: Marketplace Listing Detail Page

Create `recoder-agents/src/app/(dashboard)/marketplace/[listingId]/page.tsx`:

Listing detail:
- Hero: large icon, title, publisher, category, install count, rating
- Description (markdown rendered)
- "Install" button (clones agent to user's workspace)
- Tabs: Overview | Reviews | Configuration
- Reviews: star display, comment, reviewer name, date. "Write a review" form if installed.
- Configuration preview: shows tools, model, system prompt preview (truncated)

### Task 6: Publish Agent Dialog

Create `recoder-agents/src/components/agents/publish-agent-dialog.tsx`:

Dialog for publishing an agent to marketplace:
- Title (pre-filled from agent name)
- Description textarea (markdown supported)
- Category dropdown
- Tags input (comma-separated)
- Preview card showing how it will look
- "Publish" / "Save as Draft" buttons

### Task 7: Marketplace Sidebar Link + My Listings

Modify sidebar to add "Marketplace" link with Store icon.
Create `recoder-agents/src/app/(dashboard)/marketplace/my-listings/page.tsx` for managing published agents.

---

## Phase 2: Agent Analytics Dashboard (Tasks 8-13)

### Task 8: Agent Analytics Backend

Create `backend/supabase/migrations/20260309500001_agent_run_metrics.sql`:

Enhance agent_analytics_daily with new columns if needed, or create a view:
- runs_by_tool (jsonb): tool name → count
- avg_tokens_in, avg_tokens_out per day
- success_by_trigger_type (jsonb): trigger → success count

Create `backend/core/agents/agent_metrics_api.py`:

Endpoints:
- `GET /agents/{agent_id}/metrics` — comprehensive metrics: total runs, success rate, avg latency, cost breakdown, tool usage, token usage, runs over time
- `GET /agents/{agent_id}/metrics/tools` — tool usage breakdown
- `GET /agents/{agent_id}/metrics/cost-breakdown` — cost by model, by day

### Task 9: Agent Metrics Frontend API + Hooks

Create `recoder-agents/src/lib/api/agent-metrics.ts` and `recoder-agents/src/hooks/agents/use-agent-metrics.ts`.

### Task 10: Agent Analytics Overview Tab

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/metrics-overview-tab.tsx`:

Dashboard within agent config:
- Summary cards: Total Runs, Success Rate, Avg Latency, Total Cost
- Runs over time line chart (last 30 days)
- Success/failure pie chart
- Cost trend area chart

### Task 11: Agent Tool Usage Tab

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/tool-usage-tab.tsx`:

Tool analytics:
- Horizontal bar chart: most used tools
- Tool success rate table
- Avg execution time per tool
- Error hotspots: which tools fail most

### Task 12: Agent Cost Breakdown Tab

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/cost-breakdown-tab.tsx`:

Cost analytics:
- Cost by model (pie chart)
- Daily cost trend (area chart)
- Token usage (in vs out) bar chart
- Projected monthly cost based on current usage

### Task 13: Wire Analytics Tabs into Agent Config

Modify `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/analytics-screen.tsx`:

Add new tabs: Overview | Model Performance | Tool Usage | Cost Breakdown
Wire the 3 new tab components alongside existing Model Performance tab.

---

## Phase 3: Agent Cloning & Version Management (Tasks 14-18)

### Task 14: Agent Clone Backend

Add to existing agent API:
- `POST /agents/{agent_id}/clone` — creates a copy of the agent with "(Copy)" suffix. Copies: name, description, instructions, model, tools, triggers. Does NOT copy: analytics, threads, runs.

### Task 15: Agent Clone Frontend

Create `recoder-agents/src/components/agents/clone-agent-button.tsx`:

Button component that calls clone API and navigates to new agent config.
Add to agent card actions dropdown and agent config header.

### Task 16: Version Comparison Backend

Add endpoint:
- `GET /agents/{agent_id}/versions/compare?v1={id}&v2={id}` — returns diff of two versions: what changed in instructions, tools, model, triggers.

### Task 17: Version Comparison UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/version-compare-dialog.tsx`:

Dialog showing side-by-side comparison:
- Left: Version A, Right: Version B
- Diff view for instructions (added lines green, removed red)
- Changed tools highlighted
- Model change indicator
- "Restore this version" button

### Task 18: Version History Enhancement

Modify existing versions screen to add:
- "Compare" button between any two versions
- Version metadata: created_at, change summary
- "Restore" button per version
- Clone from version button

---

## Phase 4: Agent Templates & Starter Kits (Tasks 19-22)

### Task 19: Template Categories Page

Create `recoder-agents/src/app/(dashboard)/agents/templates/page.tsx`:

Full template browser (separate from marketplace — these are official starter templates):
- Category grid: Development, Research, Writing, Data Analysis, Customer Support, Automation
- Each category card: icon, name, template count, description
- Click navigates to category detail

### Task 20: Template Detail + One-Click Create

Create `recoder-agents/src/app/(dashboard)/agents/templates/[category]/page.tsx`:

Category template list:
- Grid of template cards
- Each: name, description, tools used, estimated cost/run
- "Use Template" button → creates agent from template, navigates to config

### Task 21: Template Preview Dialog

Create `recoder-agents/src/components/agents/template-preview-dialog.tsx`:

Preview before creating:
- Full system prompt preview
- Tools list
- Recommended model
- "Create from Template" and "Customize First" buttons

### Task 22: Update Status Docs

Update `tasks/todo.md` with Sprint 35 status.
