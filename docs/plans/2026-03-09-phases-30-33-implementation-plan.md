# Phases 30-33: Full Platform Completion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all incomplete features, enable disabled capabilities, replace stubs with real implementations, and harden infrastructure across all Recoder apps in 20 tasks across 4 phases.

**Architecture:** Each phase is independently deployable. Phase 30 enables intelligence features (config + new UI). Phase 31 completes agency operations and wires A2A persistence. Phase 32 hardens infrastructure. Phase 33 cleans up deprecated code and polishes UX.

**Tech Stack:** Next.js (agents, agency, PM, app), FastAPI (Python backend), Express (docker-backend), Redis (persistence), Prisma/Drizzle (ORM), React Query, Tailwind CSS, BullMQ (queues)

---

## Phase 30: Platform Intelligence

---

### Task 1: Enable Backend Memory Feature

**Files:**
- Modify: `backend/core/utils/config.py:294` — change default
- Verify: `backend/core/memory/api.py` — endpoints should stop returning 503
- Verify: `backend/core/billing/shared/config.py:448-456` — tier gating

**Step 1: Change memory default to enabled**

In `backend/core/utils/config.py`, line 294:

```python
# Before:
ENABLE_MEMORY: bool = False

# After:
ENABLE_MEMORY: bool = True
```

**Step 2: Verify tier-based memory limits are correct**

Read `backend/core/billing/shared/config.py` lines 56-306. Current config:
- `none`: enabled=False, max=0, limit=0
- `free`: enabled=True, max=10, limit=2
- `tier_2_20`: enabled=True, max=100, limit=15
- `tier_6_50`: enabled=True, max=500, limit=25
- `tier_25_200`: enabled=True, max=2000, limit=40

Verify these are reasonable. No changes needed if satisfactory.

**Step 3: Run memory API smoke test**

```bash
cd backend && python -c "
from core.utils.config import config
print(f'ENABLE_MEMORY: {config.ENABLE_MEMORY}')
assert config.ENABLE_MEMORY == True, 'Memory should be enabled'
print('PASS')
"
```

**Step 4: Commit**

```bash
git add backend/core/utils/config.py
git commit -m "feat: enable memory feature by default in backend config"
```

---

### Task 2: PM RICE Scoring UI + Manual Trigger

**Files:**
- Create: `recoder-pm/apps/app/app/(organization)/insights/opportunity-scoring/page.tsx`
- Create: `recoder-pm/apps/app/app/(organization)/insights/opportunity-scoring/components/rice-table.tsx`
- Create: `recoder-pm/apps/app/app/(organization)/insights/opportunity-scoring/components/run-scoring-button.tsx`
- Modify: `recoder-pm/apps/app/app/(organization)/insights/page.tsx` — add link/section
- Create: `recoder-pm/apps/api/app/ai-jobs/opportunity-scoring/route.ts` — manual trigger endpoint

**Step 1: Create the RICE scoring page**

```tsx
// recoder-pm/apps/app/app/(organization)/insights/opportunity-scoring/page.tsx
import { database } from "@repo/backend/database";
import { currentOrganizationId } from "@repo/backend/auth";
import { RiceTable } from "./components/rice-table";
import { RunScoringButton } from "./components/run-scoring-button";

export default async function OpportunityScoringPage() {
  const organizationId = await currentOrganizationId();

  const scores = await database.aiFeatureRice.findMany({
    where: { organizationId },
    include: {
      feature: {
        select: { id: true, title: true, status: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Calculate composite RICE score: (Reach * Impact * Confidence) / Effort
  const scoredFeatures = scores.map((s) => ({
    id: s.id,
    featureId: s.featureId,
    featureTitle: s.feature.title,
    featureStatus: s.feature.status,
    reach: s.reach,
    reachReason: s.reachReason,
    impact: s.impact,
    impactReason: s.impactReason,
    confidence: s.confidence,
    confidenceReason: s.confidenceReason,
    effort: s.effort,
    effortReason: s.effortReason,
    composite: s.effort > 0
      ? Math.round((s.reach * s.impact * s.confidence) / s.effort)
      : 0,
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Opportunity Scoring (RICE)</h1>
          <p className="text-sm text-muted-foreground">
            Prioritize features by Reach, Impact, Confidence, and Effort
          </p>
        </div>
        <RunScoringButton />
      </div>
      <RiceTable features={scoredFeatures} />
    </div>
  );
}
```

**Step 2: Create the RICE table component**

```tsx
// recoder-pm/apps/app/app/(organization)/insights/opportunity-scoring/components/rice-table.tsx
"use client";

import { useState } from "react";

interface ScoredFeature {
  id: string;
  featureId: string;
  featureTitle: string;
  featureStatus: string;
  reach: number;
  reachReason: string;
  impact: number;
  impactReason: string;
  confidence: number;
  confidenceReason: string;
  effort: number;
  effortReason: string;
  composite: number;
  updatedAt: string;
}

type SortKey = "composite" | "reach" | "impact" | "confidence" | "effort" | "featureTitle";

export function RiceTable({ features }: { features: ScoredFeature[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...features].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const headerClass = "cursor-pointer select-none px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground";

  if (features.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        No RICE scores yet. Click &quot;Recalculate&quot; to generate scores for your features.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className={headerClass} onClick={() => toggleSort("featureTitle")}>
              Feature {sortKey === "featureTitle" ? (sortAsc ? "↑" : "↓") : ""}
            </th>
            <th className={headerClass} onClick={() => toggleSort("reach")}>
              Reach {sortKey === "reach" ? (sortAsc ? "↑" : "↓") : ""}
            </th>
            <th className={headerClass} onClick={() => toggleSort("impact")}>
              Impact {sortKey === "impact" ? (sortAsc ? "↑" : "↓") : ""}
            </th>
            <th className={headerClass} onClick={() => toggleSort("confidence")}>
              Confidence {sortKey === "confidence" ? (sortAsc ? "↑" : "↓") : ""}
            </th>
            <th className={headerClass} onClick={() => toggleSort("effort")}>
              Effort {sortKey === "effort" ? (sortAsc ? "↑" : "↓") : ""}
            </th>
            <th className={headerClass} onClick={() => toggleSort("composite")}>
              Score {sortKey === "composite" ? (sortAsc ? "↑" : "↓") : ""}
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Updated
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((f) => (
            <>
              <tr
                key={f.id}
                className="hover:bg-muted/30 cursor-pointer"
                onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
              >
                <td className="px-3 py-2 font-medium">{f.featureTitle}</td>
                <td className="px-3 py-2">{f.reach}</td>
                <td className="px-3 py-2">{f.impact}</td>
                <td className="px-3 py-2">{f.confidence}%</td>
                <td className="px-3 py-2">{f.effort}</td>
                <td className="px-3 py-2 font-semibold">{f.composite}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">
                  {new Date(f.updatedAt).toLocaleDateString()}
                </td>
              </tr>
              {expandedId === f.id && (
                <tr key={`${f.id}-details`}>
                  <td colSpan={7} className="bg-muted/20 px-4 py-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span className="font-medium">Reach:</span> {f.reachReason}</div>
                      <div><span className="font-medium">Impact:</span> {f.impactReason}</div>
                      <div><span className="font-medium">Confidence:</span> {f.confidenceReason}</div>
                      <div><span className="font-medium">Effort:</span> {f.effortReason}</div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 3: Create the manual trigger button**

```tsx
// recoder-pm/apps/app/app/(organization)/insights/opportunity-scoring/components/run-scoring-button.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunScoringButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-jobs/opportunity-scoring", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to trigger scoring");
      // Wait briefly for job to start, then refresh
      setTimeout(() => {
        router.refresh();
        setLoading(false);
      }, 2000);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {loading ? "Calculating..." : "Recalculate Scores"}
    </button>
  );
}
```

**Step 4: Create the API trigger endpoint**

```ts
// recoder-pm/apps/api/app/ai-jobs/opportunity-scoring/route.ts
import { NextResponse } from "next/server";
import { database } from "@repo/backend/database";
import { currentOrganizationId } from "@repo/backend/auth";

export async function POST() {
  const organizationId = await currentOrganizationId();
  if (!organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await database.aiJob.create({
    data: {
      organizationId,
      type: "OPPORTUNITY_SCORING",
      status: "QUEUED",
    },
  });

  return NextResponse.json({ jobId: job.id, status: "QUEUED" });
}
```

**Step 5: Add link to insights dashboard**

In `recoder-pm/apps/app/app/(organization)/insights/page.tsx`, add an `<OpportunityScoringSection />` import and render it in the dashboard sections list. The section should show top 5 scored features with a "View All" link to `/insights/opportunity-scoring`.

**Step 6: Commit**

```bash
git add recoder-pm/apps/app/app/(organization)/insights/opportunity-scoring/ \
       recoder-pm/apps/api/app/ai-jobs/opportunity-scoring/ \
       recoder-pm/apps/app/app/(organization)/insights/page.tsx
git commit -m "feat(pm): add RICE scoring UI with manual trigger and sortable table"
```

---

### Task 3: PM Contradictions Action Workflow

**Files:**
- Modify: `recoder-pm/packages/backend/prisma/schema.prisma` — add status field to Contradiction
- Create: DB migration for status column
- Modify: `recoder-pm/apps/app/app/(organization)/insights/contradictions/page.tsx` — add action buttons + filter
- Create: `recoder-pm/apps/app/app/(organization)/insights/contradictions/components/contradiction-actions.tsx`
- Create: `recoder-pm/apps/app/app/(organization)/insights/contradictions/actions.ts` — server actions

**Step 1: Add status field to Contradiction schema**

In `recoder-pm/packages/backend/prisma/schema.prisma`, add to the Contradiction model:

```prisma
model Contradiction {
  // ... existing fields ...
  status         String             @default("active") @db.VarChar(50)
  snoozedUntil   DateTime?          @db.Timestamptz(6)
  resolvedAt     DateTime?          @db.Timestamptz(6)
  // ... existing relations ...
}
```

**Step 2: Generate and apply migration**

```bash
cd recoder-pm && npx prisma migrate dev --name add_contradiction_status
```

**Step 3: Create server actions for contradiction management**

```ts
// recoder-pm/apps/app/app/(organization)/insights/contradictions/actions.ts
"use server";

import { database } from "@repo/backend/database";
import { currentOrganizationId } from "@repo/backend/auth";
import { revalidatePath } from "next/cache";

export async function acknowledgeContradiction(id: string) {
  const organizationId = await currentOrganizationId();
  await database.contradiction.updateMany({
    where: { id, organizationId },
    data: { status: "acknowledged", resolvedAt: new Date() },
  });
  revalidatePath("/insights/contradictions");
}

export async function dismissContradiction(id: string) {
  const organizationId = await currentOrganizationId();
  await database.contradiction.updateMany({
    where: { id, organizationId },
    data: { status: "dismissed", resolvedAt: new Date() },
  });
  revalidatePath("/insights/contradictions");
}

export async function snoozeContradiction(id: string, days: number) {
  const organizationId = await currentOrganizationId();
  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + days);
  await database.contradiction.updateMany({
    where: { id, organizationId },
    data: { status: "snoozed", snoozedUntil },
  });
  revalidatePath("/insights/contradictions");
}

export async function reactivateContradiction(id: string) {
  const organizationId = await currentOrganizationId();
  await database.contradiction.updateMany({
    where: { id, organizationId },
    data: { status: "active", snoozedUntil: null, resolvedAt: null },
  });
  revalidatePath("/insights/contradictions");
}
```

**Step 4: Create action buttons component**

```tsx
// recoder-pm/apps/app/app/(organization)/insights/contradictions/components/contradiction-actions.tsx
"use client";

import { useState } from "react";
import {
  acknowledgeContradiction,
  dismissContradiction,
  snoozeContradiction,
} from "../actions";

export function ContradictionActions({ id }: { id: string }) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleAction(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => handleAction(() => acknowledgeContradiction(id))}
        className="rounded px-2 py-1 text-xs bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
      >
        Acknowledge
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => handleAction(() => dismissContradiction(id))}
        className="rounded px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
      >
        Dismiss
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setShowSnooze(!showSnooze)}
        className="rounded px-2 py-1 text-xs bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:opacity-50"
      >
        Snooze
      </button>
      {showSnooze && (
        <div className="flex gap-1">
          {[1, 3, 7, 14].map((days) => (
            <button
              key={days}
              type="button"
              disabled={pending}
              onClick={() => handleAction(() => snoozeContradiction(id, days))}
              className="rounded px-2 py-1 text-xs bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
            >
              {days}d
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 5: Update contradictions page with status filter and actions**

In the contradictions page, add a status filter (searchParam) and render `<ContradictionActions>` per item. Add source drill-down by parsing the `sources` JSON and rendering counts as links. Filter out snoozed items where `snoozedUntil > now` unless status filter is "snoozed".

**Step 6: Commit**

```bash
git add recoder-pm/packages/backend/prisma/ \
       recoder-pm/apps/app/app/(organization)/insights/contradictions/
git commit -m "feat(pm): add contradiction action workflow with acknowledge/dismiss/snooze"
```

---

### Task 4: Backend MRR Trending Calculation

**Files:**
- Modify: `backend/core/admin/analytics_admin_api.py:2708` — implement MRR change

**Step 1: Implement MRR month-over-month calculation**

At line ~2708 in `analytics_admin_api.py`, replace `mrr_change_percent=None` with actual calculation. Before the return statement, add:

```python
# Calculate MRR change from previous month
mrr_change_percent = None
try:
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)
    prev_month_end = month_start - timedelta(days=1)
    prev_mrr_rows = await execute_read(
        "SELECT mrr FROM arr_daily_snapshot WHERE snapshot_date >= :start AND snapshot_date <= :end ORDER BY snapshot_date DESC LIMIT 1",
        {"start": prev_month_start.strftime('%Y-%m-%d'), "end": prev_month_end.strftime('%Y-%m-%d')}
    )
    if prev_mrr_rows and prev_mrr_rows[0].get('mrr'):
        prev_mrr = float(prev_mrr_rows[0]['mrr'])
        if prev_mrr > 0:
            mrr_change_percent = round(((total_mrr - prev_mrr) / prev_mrr) * 100, 2)
except Exception as e:
    logger.warning(f"Failed to calculate MRR change: {e}")
```

Then use `mrr_change_percent=mrr_change_percent` in the return statement.

NOTE: If the `arr_daily_snapshot` table doesn't exist, create the calculation from Stripe subscription data directly. Check what tables are available for historical MRR data first.

**Step 2: Commit**

```bash
git add backend/core/admin/analytics_admin_api.py
git commit -m "feat(backend): implement MRR month-over-month change percentage"
```

---

### Task 5: Agents — Unblock `/thread/new` Route

**Files:**
- Modify: `recoder-agents/src/middleware.ts:102-105` — remove redirect guard

**Step 1: Remove the WIP route block**

In `recoder-agents/src/middleware.ts`, delete lines 102-105:

```typescript
// DELETE THESE LINES:
// Block access to WIP /thread/new route - redirect to dashboard
if (pathname.includes('/thread/new')) {
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```

**Step 2: Verify the route page exists and is functional**

The page exists at `recoder-agents/src/app/(dashboard)/projects/[projectId]/thread/new/page.tsx` (48 lines). It pre-creates a thread on mount and renders `<ThreadComponent>` with `isNew` prop. Verify imports are valid.

**Step 3: Build check**

```bash
cd recoder-agents && npx next build 2>&1 | head -50
```

**Step 4: Commit**

```bash
git add recoder-agents/src/middleware.ts
git commit -m "feat(agents): unblock /thread/new route for direct thread creation"
```

---

## Phase 31: Agency Operations

---

### Task 6: Agency Client Portal — Brief Submission Enhancement

**Files:**
- Modify: `recoder-agency/apps/agency/app/(client)/portal/briefs/new/page.tsx`
- Create: `recoder-agency/apps/agency/app/(client)/portal/briefs/new/actions.ts` — if not exists
- Create: `recoder-agency/apps/agency/app/(client)/portal/briefs/confirmation/page.tsx`

**Step 1: Enhance brief form with file upload and auto-save**

Modify the existing brief form to add:
- File input field using `<input type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.txt" />`
- localStorage draft persistence on input change (debounced 1s)
- On mount, check localStorage for draft and prompt "Resume draft?"
- On successful submission, clear localStorage draft

```tsx
// Add to the brief form component:
const DRAFT_KEY = 'agency-brief-draft';

useEffect(() => {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved) {
    const draft = JSON.parse(saved);
    // Populate form fields from draft
    setShowDraftPrompt(true);
  }
}, []);

function saveDraft(data: Record<string, string>) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

// On successful submit:
localStorage.removeItem(DRAFT_KEY);
```

**Step 2: Add status field to brief submission**

In the server action (`actions.ts`), after inserting the brief, set `status: 'submitted'`. Update the brief table to include a `status` column if not present (check schema first).

**Step 3: Create confirmation page**

```tsx
// recoder-agency/apps/agency/app/(client)/portal/briefs/confirmation/page.tsx
export default function BriefConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ briefId?: string }>;
}) {
  const params = React.use(searchParams);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mb-4 text-4xl">✓</div>
      <h1 className="text-2xl font-semibold mb-2">Brief Submitted</h1>
      <p className="text-muted-foreground mb-4">
        Your brief {params.briefId ? `(#${params.briefId})` : ""} has been
        received. We&apos;ll review it and get back to you within 2 business
        days.
      </p>
      <a
        href="/portal/projects"
        className="text-primary hover:underline"
      >
        ← Back to Projects
      </a>
    </div>
  );
}
```

**Step 4: Redirect to confirmation after submit**

In the form submission handler, after successful insert, redirect to `/portal/briefs/confirmation?briefId={id}`.

**Step 5: Commit**

```bash
git add recoder-agency/apps/agency/app/(client)/portal/briefs/
git commit -m "feat(agency): enhance brief submission with file upload, draft save, and confirmation"
```

---

### Task 7: Agency Quote-to-Project Workflow

**Files:**
- Modify: `recoder-agency/apps/agency/app/(admin)/quotes/[quoteId]/page.tsx` — add line items + convert action
- Create: `recoder-agency/apps/agency/app/(admin)/quotes/[quoteId]/components/line-items-editor.tsx`
- Create: `recoder-agency/apps/agency/app/(admin)/quotes/[quoteId]/components/convert-to-project-button.tsx`
- Modify: `recoder-agency/apps/agency/app/(admin)/quotes/actions.ts` — add convert action

**Step 1: Create line items editor component**

The quote schema has `priceCents` as a single field. For line items, store them in the `metadata` JSONB field as `{ lineItems: [{ skuId, description, qty, unitPriceCents }] }`.

```tsx
// recoder-agency/apps/agency/app/(admin)/quotes/[quoteId]/components/line-items-editor.tsx
"use client";

import { useState } from "react";

interface LineItem {
  id: string;
  description: string;
  qty: number;
  unitPriceCents: number;
}

export function LineItemsEditor({
  initialItems,
  onUpdate,
}: {
  initialItems: LineItem[];
  onUpdate: (items: LineItem[]) => void;
}) {
  const [items, setItems] = useState<LineItem[]>(initialItems);

  function addItem() {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      description: "",
      qty: 1,
      unitPriceCents: 0,
    };
    const updated = [...items, newItem];
    setItems(updated);
    onUpdate(updated);
  }

  function removeItem(id: string) {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    onUpdate(updated);
  }

  function updateItem(id: string, field: keyof LineItem, value: string | number) {
    const updated = items.map((i) =>
      i.id === id ? { ...i, [field]: value } : i
    );
    setItems(updated);
    onUpdate(updated);
  }

  const total = items.reduce((sum, i) => sum + i.qty * i.unitPriceCents, 0);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Line Items</h3>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            className="flex-1 rounded border px-2 py-1 text-sm"
            placeholder="Description"
            value={item.description}
            onChange={(e) => updateItem(item.id, "description", e.target.value)}
          />
          <input
            className="w-16 rounded border px-2 py-1 text-sm text-right"
            type="number"
            min={1}
            value={item.qty}
            onChange={(e) => updateItem(item.id, "qty", parseInt(e.target.value) || 1)}
          />
          <input
            className="w-24 rounded border px-2 py-1 text-sm text-right"
            type="number"
            min={0}
            step={100}
            placeholder="¢"
            value={item.unitPriceCents}
            onChange={(e) => updateItem(item.id, "unitPriceCents", parseInt(e.target.value) || 0)}
          />
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="text-red-500 hover:text-red-700 text-sm"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex justify-between items-center">
        <button type="button" onClick={addItem} className="text-sm text-primary hover:underline">
          + Add Item
        </button>
        <span className="text-sm font-medium">
          Total: ${(total / 100).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
```

**Step 2: Add "Convert to Project" server action**

In `recoder-agency/apps/agency/app/(admin)/quotes/actions.ts`, add:

```ts
export async function convertQuoteToProject(quoteId: number) {
  const db = await getDb();
  const quote = await db.select().from(quotes).where(eq(quotes.dbId, quoteId)).limit(1);
  if (!quote[0] || quote[0].status !== "accepted") {
    throw new Error("Only accepted quotes can be converted");
  }

  const q = quote[0];
  const [project] = await db.insert(projects).values({
    id: crypto.randomUUID(),
    teamDbId: q.teamDbId,
    clientDbId: q.clientDbId,
    name: q.title,
    status: "active",
    budgetCents: q.priceCents,
    currency: q.currency,
  }).returning();

  // Link quote to project
  await db.update(quotes)
    .set({ projectDbId: project.dbId, status: "converted" })
    .where(eq(quotes.dbId, quoteId));

  revalidatePath("/quotes");
  revalidatePath("/projects");
  redirect(`/projects/${project.dbId}`);
}
```

**Step 3: Wire components into quote detail page**

Update `[quoteId]/page.tsx` to render `LineItemsEditor` and `ConvertToProjectButton` (only shown when status is "accepted").

**Step 4: Commit**

```bash
git add recoder-agency/apps/agency/app/(admin)/quotes/
git commit -m "feat(agency): add quote line items editor and convert-to-project workflow"
```

---

### Task 8: Agency Admin Template CRUD (Edit/Delete)

**Files:**
- Modify: `recoder-agency/apps/agency/app/(admin)/templates/page.tsx` — add edit/delete actions

**Step 1: Add edit and delete server actions**

Add to the existing page or a new `actions.ts` file:

```ts
async function updateTemplate(id: number, data: { name?: string; description?: string; rules?: string }) {
  const db = await getDb();
  await db.update(dodTemplates).set(data).where(eq(dodTemplates.dbId, id));
  revalidatePath("/templates");
}

async function deleteTemplate(id: number) {
  const db = await getDb();
  await db.delete(dodTemplates).where(eq(dodTemplates.dbId, id));
  revalidatePath("/templates");
}
```

Add similar functions for playbooks, routing policies, and service SKUs.

**Step 2: Add edit/delete buttons to each template card**

In the template rendering sections (lines 466-572 for DoD, 575-737 for playbooks, etc.), add:
- "Edit" button that opens an inline form with pre-populated values
- "Delete" button with `window.confirm()` guard
- Both call respective server actions

**Step 3: Add JSON validation for phase definitions**

Before saving playbook phases, parse and validate:

```ts
function validatePhaseJson(input: string): { valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return { valid: false, error: "Must be a JSON array" };
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e instanceof Error ? e.message : "Invalid JSON") };
  }
}
```

**Step 4: Commit**

```bash
git add recoder-agency/apps/agency/app/(admin)/templates/
git commit -m "feat(agency): add edit and delete actions for admin templates, playbooks, and SKUs"
```

---

### Task 9: A2A Task Lifecycle — Redis Persistence

**Files:**
- Modify: `docker-backend/src/a2a/task-lifecycle.service.ts` — add Redis store option
- Create: `docker-backend/src/a2a/redis-task-store.ts`

**Step 1: Create Redis-backed TaskStore**

```ts
// docker-backend/src/a2a/redis-task-store.ts
import Redis from 'ioredis';
import type { TaskEnvelope } from '../../shared/src/a2a/types';

const TASK_HASH_KEY = 'recoder:a2a:tasks';
const TASK_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days for completed tasks

interface TaskStore {
  get(taskId: string): TaskEnvelope | undefined;
  set(taskId: string, envelope: TaskEnvelope): void;
  delete(taskId: string): boolean;
  has(taskId: string): boolean;
  list(filter?: Record<string, unknown>): TaskEnvelope[];
}

export class RedisTaskStore implements TaskStore {
  private redis: Redis;
  private cache = new Map<string, TaskEnvelope>();

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
    this.hydrate();
  }

  private async hydrate(): Promise<void> {
    try {
      const all = await this.redis.hgetall(TASK_HASH_KEY);
      for (const [key, val] of Object.entries(all)) {
        try {
          this.cache.set(key, JSON.parse(val));
        } catch { /* skip malformed */ }
      }
    } catch (e) {
      console.warn('[RedisTaskStore] Hydration failed, starting empty:', e);
    }
  }

  get(taskId: string): TaskEnvelope | undefined {
    return this.cache.get(taskId);
  }

  set(taskId: string, envelope: TaskEnvelope): void {
    this.cache.set(taskId, envelope);
    const json = JSON.stringify(envelope);
    this.redis.hset(TASK_HASH_KEY, taskId, json).catch((e) =>
      console.error('[RedisTaskStore] Write failed:', e)
    );
  }

  delete(taskId: string): boolean {
    const existed = this.cache.delete(taskId);
    this.redis.hdel(TASK_HASH_KEY, taskId).catch((e) =>
      console.error('[RedisTaskStore] Delete failed:', e)
    );
    return existed;
  }

  has(taskId: string): boolean {
    return this.cache.has(taskId);
  }

  list(filter?: Record<string, unknown>): TaskEnvelope[] {
    let tasks = Array.from(this.cache.values());
    if (filter) {
      if (filter.workspace_id) tasks = tasks.filter((t) => t.workspace_id === filter.workspace_id);
      if (filter.thread_id) tasks = tasks.filter((t) => t.thread_id === filter.thread_id);
      if (filter.state) tasks = tasks.filter((t) => t.state === filter.state);
    }
    return tasks;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
```

**Step 2: Wire Redis store into TaskLifecycleService**

In `task-lifecycle.service.ts`, modify the singleton factory (lines 860-870):

```ts
export function getTaskLifecycleService(): TaskLifecycleService {
  if (!_defaultService) {
    const redisUrl = process.env.REDIS_URL;
    const store = redisUrl
      ? new RedisTaskStore(redisUrl)
      : new InMemoryTaskStore();
    _defaultService = new TaskLifecycleService(store);
    if (redisUrl) {
      console.log('[TaskLifecycle] Using Redis-backed task store');
    }
  }
  return _defaultService;
}
```

Update the constructor to accept an optional store parameter.

**Step 3: Commit**

```bash
git add docker-backend/src/a2a/redis-task-store.ts \
       docker-backend/src/a2a/task-lifecycle.service.ts
git commit -m "feat(a2a): add Redis-backed task store for persistent task lifecycle"
```

---

### Task 10: Workflow Executor — Real Agent Delegation

**Files:**
- Modify: `docker-backend/src/a2a/workflow-messaging.routes.ts:22-27` — replace stubExecutor

**Step 1: Replace stub with real executor**

Replace the `stubExecutor` (lines 22-27) with:

```ts
import { getAgentRegistryService } from './agent-registry.service';
import { getTaskLifecycleService } from './task-lifecycle.service';

async function executeAgentTask(agentId: string, prompt: string, workspaceId?: string): Promise<string> {
  const registry = getAgentRegistryService();
  const agent = registry.get(agentId);

  if (!agent) {
    throw new Error(`Agent "${agentId}" not found in registry`);
  }

  const health = registry.getHealth(agentId);
  if (!health?.online) {
    throw new Error(`Agent "${agentId}" is offline`);
  }

  const taskService = getTaskLifecycleService();
  const task = taskService.createTask({
    prompt,
    workspace_id: workspaceId || 'default',
    thread_id: `workflow-${Date.now()}`,
    assignee_agent_id: agentId,
    requester_agent_id: 'workflow-engine',
  });

  // For REST-based agents, POST the task payload
  if (agent.card?.protocol === 'rest' && agent.card?.endpoint) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${agent.card.endpoint}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, prompt, workspaceId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        taskService.failTask(task.id, {
          code: 'AGENT_ERROR',
          message: `Agent returned ${response.status}`,
        });
        throw new Error(`Agent "${agentId}" returned ${response.status}`);
      }

      const result = await response.json();
      taskService.completeTask(task.id, { output: result });
      return JSON.stringify(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      taskService.failTask(task.id, { code: 'DELEGATION_ERROR', message: msg });
      throw e;
    }
  }

  // For agents without endpoints, return task ID for async polling
  return JSON.stringify({ taskId: task.id, status: 'submitted', agentId });
}
```

**Step 2: Update workflow execute route to use real executor**

In the `POST /workflows/:workflowId/execute` handler, replace `stubExecutor(...)` with `executeAgentTask(...)`.

**Step 3: Commit**

```bash
git add docker-backend/src/a2a/workflow-messaging.routes.ts
git commit -m "feat(a2a): replace workflow stub executor with real agent delegation"
```

---

## Phase 32: Production Hardening

---

### Task 11: Distributed A2A State (Redis-Backed Shared Services)

**Files:**
- Modify: `shared/src/a2a/persistent-services.ts` — existing file already has InMemory implementations
- Modify: `shared/src/a2a/redis-persistence.ts` — already has `RedisBackedPersistenceAdapter` and factory

**Step 1: Verify existing Redis infrastructure**

The file `shared/src/a2a/redis-persistence.ts` (111 lines) already has:
- `RedisKvClient` interface
- `RedisBackedPersistenceAdapter` with hybrid local+Redis write-through
- `createProductionA2AControlPlaneFromRedis()` factory

Verify this factory is actually called somewhere. If not, wire it in.

**Step 2: Wire Redis control plane into docker-backend startup**

In `docker-backend/src/server.ts`, find where A2A services are initialized. Add:

```ts
import { createProductionA2AControlPlaneFromRedis } from '../../shared/src/a2a/redis-persistence';

// In A2A initialization section:
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  const controlPlane = await createProductionA2AControlPlaneFromRedis(redisUrl);
  console.log('[A2A] Redis-backed control plane initialized');
  // Replace in-memory singletons with Redis-backed ones
}
```

**Step 3: Add flush-on-shutdown hook**

```ts
process.on('SIGTERM', async () => {
  if (controlPlane?.adapter?.flush) {
    await controlPlane.adapter.flush();
    console.log('[A2A] Redis state flushed on shutdown');
  }
});
```

**Step 4: Commit**

```bash
git add shared/src/a2a/ docker-backend/src/server.ts
git commit -m "feat(a2a): wire Redis-backed control plane into docker-backend startup"
```

---

### Task 12: PM Queue Worker Reprocessing

**Files:**
- Modify: `recoder-pm/packages/queue/workers.ts` — implement stubbed job types

**Step 1: Implement FEEDBACK_SENTIMENT processing**

Replace the stub `break` with actual processing:

```ts
case AI_JOB_NAMES.FEEDBACK_SENTIMENT: {
  const feedback = await database.feedback.findUnique({
    where: { id: entityId },
    select: { id: true, title: true, description: true },
  });
  if (!feedback) break;

  const text = [feedback.title, contentToText(feedback.description)].filter(Boolean).join(' ');
  const model = await getOrganizationTextModel(organizationId);
  const result = await generateObject({
    model,
    prompt: `Analyze the sentiment of this user feedback. Return positive, negative, or neutral.\n\nFeedback: ${text}`,
    schema: z.object({
      sentiment: z.enum(["positive", "negative", "neutral"]),
      score: z.number().min(-1).max(1),
    }),
  });

  await database.feedback.update({
    where: { id: entityId },
    data: {
      aiSentiment: result.object.sentiment,
      aiSentimentScore: result.object.score,
    },
  });
  break;
}
```

**Step 2: Implement FEEDBACK_ANALYSIS processing**

Similar pattern — extract themes and categories from feedback text using LLM.

**Step 3: Implement FEATURE_RICE processing**

```ts
case AI_JOB_NAMES.FEATURE_RICE: {
  // Import and call the existing scoring function for a single feature
  const { runOpportunityScoring } = await import("@repo/backend/opportunity-scoring");
  await runOpportunityScoring();
  break;
}
```

**Step 4: Implement DIGEST_GENERATE processing**

```ts
case AI_JOB_NAMES.DIGEST_GENERATE: {
  // Call the digest generation from the API app
  const res = await fetch(`${process.env.INTERNAL_API_URL || 'http://localhost:3004'}/api/ai-jobs/digest/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId }),
  });
  if (!res.ok) throw new Error(`Digest generation failed: ${res.status}`);
  break;
}
```

**Step 5: Commit**

```bash
git add recoder-pm/packages/queue/workers.ts
git commit -m "feat(pm): implement queue worker processing for sentiment, analysis, RICE, and digest jobs"
```

---

### Task 13: Agent Team Panel — Rejection + Expiry

**Files:**
- Modify: `docker-backend/src/a2a/approval-gate.service.ts` — reject() already exists (lines 123-144)! Just need route
- Modify: `recoder-web/app/components/workbench/AgentTeamPanel.tsx` — add reject button
- Modify: `recoder-web/app/lib/stores/agent-team.ts` — add rejectAction()

**Step 1: Add reject route in gateway**

The `approval-gate.service.ts` already has `reject(approvalId, resolvedBy)` at line 123. Find where `grant` is routed (in `gateway.router.ts` or similar) and add the reject route:

```ts
router.post('/approvals/:approvalId/reject', async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { resolvedBy } = req.body;
    const gate = getApprovalGateService();
    gate.reject(approvalId, resolvedBy || 'user');
    sendSuccess(res, { approvalId, status: 'rejected' });
  } catch (e) {
    sendError(res, 400, e instanceof Error ? e.message : 'Reject failed');
  }
});
```

**Step 2: Add rejectAction to agent-team store**

In `recoder-web/app/lib/stores/agent-team.ts`, add after `approveAction`:

```ts
export async function rejectAction(approvalId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/a2a/approvals/${approvalId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolvedBy: 'user' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

**Step 3: Add reject button to AgentTeamPanel**

In the task rows that have approval actions, add a red "Reject" button next to "Approve":

```tsx
<button
  type="button"
  onClick={() => rejectAction(task.approvalId)}
  className="rounded px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200"
>
  Reject
</button>
```

**Step 4: Add SSE reconnection with exponential backoff**

In `recoder-web/app/lib/hooks/useAgentTeamSSE.ts`, replace the empty `onerror` handler:

```ts
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

es.onerror = () => {
  es.close();
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  setTimeout(() => {
    // Re-trigger effect by updating a reconnect counter
    // This will be handled by the useEffect cleanup + re-run
  }, delay);
};
```

**Step 5: Commit**

```bash
git add docker-backend/src/a2a/ \
       recoder-web/app/components/workbench/AgentTeamPanel.tsx \
       recoder-web/app/lib/stores/agent-team.ts \
       recoder-web/app/lib/hooks/useAgentTeamSSE.ts
git commit -m "feat(a2a): add approval rejection endpoint, UI button, and SSE reconnection"
```

---

### Task 14: Backend Golden Dataset Loader

**Files:**
- Modify: `backend/evals/datasets.py:217-250` — implement `create_golden_dataset_from_logs()`

**Step 1: Implement the golden dataset loader**

Replace the empty function body:

```python
def create_golden_dataset_from_logs(
    min_score: float = 0.8,
    limit: int = 100,
    lookback_days: int = 30,
) -> list[dict]:
    """Load high-scoring eval results from the database as golden test cases."""
    try:
        from core.utils.config import config
        import asyncio
        from datetime import datetime, timedelta

        cutoff = datetime.utcnow() - timedelta(days=lookback_days)

        # Query eval_results table for successful, high-scoring runs
        query = """
            SELECT er.input_text, er.expected_output, er.actual_output, er.score, er.tags
            FROM eval_results er
            WHERE er.score >= :min_score
              AND er.created_at >= :cutoff
              AND er.status = 'success'
            ORDER BY er.score DESC
            LIMIT :limit
        """

        from core.database import execute_read
        rows = asyncio.get_event_loop().run_until_complete(
            execute_read(query, {
                "min_score": min_score,
                "cutoff": cutoff.isoformat(),
                "limit": limit,
            })
        )

        cases = []
        for row in rows:
            cases.append({
                "input": row.get("input_text", ""),
                "expected": row.get("actual_output", row.get("expected_output", "")),
                "tags": row.get("tags", []) or ["golden"],
                "score": row.get("score", 0),
            })

        logger.info(f"Loaded {len(cases)} golden test cases from logs")
        return cases

    except Exception as e:
        logger.warning(f"Failed to load golden dataset from logs: {e}")
        return []
```

NOTE: Verify the actual table name — it might be `eval_results`, `evaluation_runs`, or similar. Check the database schema first. If no such table exists, create a simple one or adapt to use the existing threads/messages tables for scored conversations.

**Step 2: Commit**

```bash
git add backend/evals/datasets.py
git commit -m "feat(evals): implement golden dataset loader from production eval logs"
```

---

### Task 15: Billing Period Tracking

**Files:**
- Modify: `backend/core/billing/endpoints/account_state.py` — populate current_period_end

**Step 1: Populate billing period from Stripe data**

Find the line where `current_period_end: None` is returned. Replace with:

```python
# Fetch current period end from active subscription
current_period_end = None
try:
    if active_subscription and hasattr(active_subscription, 'current_period_end'):
        current_period_end = active_subscription.current_period_end
    elif stripe_customer_id:
        subs = await stripe.Subscription.list_async(
            customer=stripe_customer_id, status="active", limit=1
        )
        if subs.data:
            current_period_end = subs.data[0].current_period_end
except Exception as e:
    logger.warning(f"Failed to fetch billing period: {e}")
```

Then use `current_period_end=current_period_end` in the response.

**Step 2: Commit**

```bash
git add backend/core/billing/endpoints/account_state.py
git commit -m "feat(billing): populate current_period_end from Stripe subscription data"
```

---

## Phase 33: Polish & Cleanup

---

### Task 16: Agency Deprecated Code Removal

**Files:**
- Delete: `recoder-agency/apps/agency/app/(main)/stage/(depreacted)/` (entire directory — note the typo "depreacted")
- Delete: `recoder-agency/apps/agency/app/(main)/tasks/deprecated/` (entire directory)

**Step 1: Verify no runtime imports reference these files**

```bash
cd recoder-agency && grep -r "depreacted\|deprecated/" apps/agency/app/ --include="*.tsx" --include="*.ts" -l
```

If any files import from these directories, update those imports first.

**Step 2: Delete deprecated directories**

```bash
rm -rf recoder-agency/apps/agency/app/\(main\)/stage/\(depreacted\)/
rm -rf recoder-agency/apps/agency/app/\(main\)/tasks/deprecated/
```

**Step 3: Build check**

```bash
cd recoder-agency && pnpm build-sdk && pnpm -F agency build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add -A recoder-agency/apps/agency/app/
git commit -m "chore(agency): remove deprecated stage and tasks code"
```

---

### Task 17: PM Portal Settings Completion

**Files:**
- Modify: `recoder-pm/apps/app/app/(organization)/settings/portal/` components

**Step 1: Fix null-returning components**

For each component that returns `null` when data is empty, replace with a proper empty state:

```tsx
// Example pattern for portal-statuses-card.tsx:
if (!statuses || statuses.length === 0) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status Mappings</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No status mappings configured yet.
        </p>
        <Button variant="outline" size="sm" className="mt-3">
          Configure Statuses
        </Button>
      </CardContent>
    </Card>
  );
}
```

Apply the same pattern to `productboard-imports-card.tsx` and `canny-imports-card.tsx`.

**Step 2: Commit**

```bash
git add recoder-pm/apps/app/app/(organization)/settings/portal/
git commit -m "fix(pm): replace null returns in portal settings with proper empty states"
```

---

### Task 18: PM Template Versioning

**Files:**
- Modify: PM template management pages (find in insights or settings)

**Step 1: Add version field to template operations**

This depends on where templates live in the PM schema. Check if there's a `version` field. If not, add one via migration:

```prisma
model Template {
  // existing fields...
  version     Int      @default(1)
  parentId    String?  @db.VarChar(191)
}
```

**Step 2: Add "Duplicate as new version" action**

```ts
async function duplicateAsNewVersion(templateId: string) {
  const original = await database.template.findUnique({ where: { id: templateId } });
  if (!original) throw new Error("Template not found");

  const maxVersion = await database.template.aggregate({
    where: { parentId: original.parentId || original.id },
    _max: { version: true },
  });

  await database.template.create({
    data: {
      ...original,
      id: undefined, // auto-generate
      version: (maxVersion._max.version || original.version) + 1,
      parentId: original.parentId || original.id,
      createdAt: undefined,
      updatedAt: undefined,
    },
  });
  revalidatePath("/settings/templates");
}
```

**Step 3: Commit**

```bash
git add recoder-pm/
git commit -m "feat(pm): add template versioning with duplicate-as-new-version"
```

---

### Task 19: Agency Delivery Ops Dashboard Finish

**Files:**
- Modify: `recoder-agency/apps/agency/app/(admin)/delivery-ops/page.tsx`

**Step 1: Replace mock rate trend rendering with real data**

Find the mock proportional rendering section and replace with actual data visualization. Use the existing data from `fetchDeliveryOpsData()` to render percentages:

```tsx
// Replace mock bar widths with calculated percentages
const total = data.reworkCount + data.onTimeCount + data.lateCount;
const reworkPct = total > 0 ? Math.round((data.reworkCount / total) * 100) : 0;
const onTimePct = total > 0 ? Math.round((data.onTimeCount / total) * 100) : 0;
const latePct = total > 0 ? Math.round((data.lateCount / total) * 100) : 0;

// Render as percentage bars
<div className="flex h-4 w-full overflow-hidden rounded-full">
  <div className="bg-green-500" style={{ width: `${onTimePct}%` }} />
  <div className="bg-yellow-500" style={{ width: `${latePct}%` }} />
  <div className="bg-red-500" style={{ width: `${reworkPct}%` }} />
</div>
```

**Step 2: Wire restore drill history to real data**

Find the restore drill section and replace mock data with actual DB query for restore drill records.

**Step 3: Commit**

```bash
git add recoder-agency/apps/agency/app/(admin)/delivery-ops/
git commit -m "fix(agency): replace mock rendering in delivery ops with real data calculations"
```

---

### Task 20: Silent Failure Fixes Across Apps

**Files:**
- Modify: Agency vector store ingest (returns `[]` on error)
- Modify: `recoder-web/app/lib/hooks/useAgentTeamSSE.ts` (empty error handlers)
- Modify: Agency task execution pages (return null on error)
- Modify: PM queue workers (add error logging)

**Step 1: Fix agency vector store silent failure**

Find the ingest function that returns `[]` on error and add logging:

```ts
// Before:
} catch {
  return [];
}

// After:
} catch (error) {
  console.error('[VectorStore] Ingest target fetch failed:', error instanceof Error ? error.message : error);
  return [];
}
```

**Step 2: Fix agency task execution null returns**

Replace `return null` in task rendering with error boundary or fallback UI:

```tsx
// Before:
if (!task) return null;

// After:
if (!task) {
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
      Task data could not be loaded. It may have been deleted or is still processing.
    </div>
  );
}
```

**Step 3: Add error logging to PM queue workers**

In `workers.ts`, enhance the catch block:

```ts
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[QueueWorker] Job ${job.name} (${job.id}) failed:`, errorMessage);
  await markAiJobFailed(aiJobId, errorMessage);
  throw error; // Re-throw for BullMQ retry logic
}
```

**Step 4: Commit**

```bash
git add recoder-agency/ recoder-web/ recoder-pm/
git commit -m "fix: replace silent failures with proper error logging across agency, web, and PM"
```

---

## Execution Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| 30 | 1-5 | Intelligence: memory, RICE, contradictions, MRR, thread/new |
| 31 | 6-10 | Agency ops: portal, quotes, templates, Redis tasks, real executor |
| 32 | 11-15 | Hardening: distributed A2A, queue workers, rejections, evals, billing |
| 33 | 16-20 | Polish: deprecated removal, empty states, versioning, dashboard, silent fixes |

**Estimated commits:** 20 (one per task)
**Dependencies:** Tasks within each phase are independent. Phases should be executed in order (30 → 31 → 32 → 33) since Phase 32 builds on Phase 31's Redis work.
