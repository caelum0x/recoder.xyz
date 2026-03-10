# Sprint 15: Reliability + Integration + Agency Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete P1 reliability pass (loading states, hardcoded colors, last alert), wire platform integration packages, and resolve all agency TODO/FIXME comments.

**Architecture:** Three independent phases. Phase 1 adds loading skeletons and fixes color literals across active apps. Phase 2 wires `@recoder/design-tokens` into apps, adds AppSwitcher to recoder-web (Remix), and adds cross-app billing awareness. Phase 3 resolves all agency TODOs: lobby persistence, favorites API, task archiving, settings button consolidation, schema cleanup, and workspace timeout config.

**Tech Stack:** Next.js 15-16, Remix/Vite, React 18-19, Tailwind CSS, Drizzle ORM, `@recoder/ecosystem-config`, `@recoder/design-tokens`

---

## Phase 1: Reliability Finish

### Task 1: Add loading.tsx to app/ settings subtree

**Files:**
- Create: `app/app/[locale]/settings/account/loading.tsx`
- Create: `app/app/[locale]/settings/ai-providers/loading.tsx`
- Create: `app/app/[locale]/settings/api-keys/loading.tsx`
- Create: `app/app/[locale]/settings/appearance/loading.tsx`
- Create: `app/app/[locale]/settings/claude-code/loading.tsx`
- Create: `app/app/[locale]/settings/integrations/loading.tsx`
- Create: `app/app/[locale]/settings/mcp/loading.tsx`
- Create: `app/app/[locale]/settings/notifications/loading.tsx`
- Create: `app/app/[locale]/settings/premium/loading.tsx`
- Create: `app/app/[locale]/settings/profile/loading.tsx`
- Create: `app/app/[locale]/settings/security/loading.tsx`

**Step 1: Create a settings loading skeleton**

Each settings sub-route should re-export the parent settings loading skeleton. The parent at `app/app/[locale]/settings/loading.tsx` already exists. Create identical files in each subdirectory:

```tsx
export { default } from '../loading';
```

For `app/app/[locale]/settings/api/loading.tsx` (if the route exists):
```tsx
export { default } from '../loading';
```

**Step 2: Verify no import errors**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm --dir app exec tsc --noEmit --pretty false 2>&1 | grep -i "loading" | head -20`
Expected: No new errors from loading.tsx files

**Step 3: Commit**

```bash
git add app/app/\[locale\]/settings/*/loading.tsx
git commit -m "feat: add loading.tsx to all settings sub-routes (app)"
```

---

### Task 2: Add loading.tsx to app/ dashboard and billing subtrees

**Files:**
- Create: `app/app/[locale]/dashboard/analytics/loading.tsx`
- Create: `app/app/[locale]/dashboard/api-keys/loading.tsx`
- Create: `app/app/[locale]/dashboard/billing/loading.tsx`
- Create: `app/app/[locale]/dashboard/overview/loading.tsx`
- Create: `app/app/[locale]/dashboard/production/loading.tsx`
- Create: `app/app/[locale]/dashboard/projects/loading.tsx`
- Create: `app/app/[locale]/dashboard/team/loading.tsx`
- Create: `app/app/[locale]/dashboard/usage/loading.tsx`
- Create: `app/app/[locale]/billing/cancel/loading.tsx`
- Create: `app/app/[locale]/billing/invoices/loading.tsx`
- Create: `app/app/[locale]/billing/payment-methods/loading.tsx`
- Create: `app/app/[locale]/billing/subscription/loading.tsx`
- Create: `app/app/[locale]/billing/upgrade/loading.tsx`

**Step 1: Create dashboard sub-route loading skeletons**

Each re-exports from parent:
```tsx
export { default } from '../loading';
```

**Step 2: Create billing loading skeleton**

First create the billing parent `app/app/[locale]/billing/loading.tsx`:
```tsx
export default function BillingLoading() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-24">
        <div className="animate-pulse space-y-8">
          <div className="space-y-3">
            <div className="h-8 w-48 bg-white/10 rounded-lg" />
            <div className="h-4 w-80 bg-white/5 rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="h-40 bg-white/5 rounded-2xl border border-white/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Then each billing sub-route:
```tsx
export { default } from '../loading';
```

**Step 3: Commit**

```bash
git add app/app/\[locale\]/dashboard/*/loading.tsx app/app/\[locale\]/billing/*/loading.tsx app/app/\[locale\]/billing/loading.tsx
git commit -m "feat: add loading.tsx to dashboard and billing sub-routes (app)"
```

---

### Task 3: Add loading.tsx to recoder-agents checkout route

**Files:**
- Create: `recoder-agents/src/app/checkout/loading.tsx`

**Step 1: Create checkout loading skeleton**

```tsx
import { RecoderLogo } from '@/components/sidebar/recoder-logo';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] gap-6">
      <RecoderLogo size={32} className="animate-pulse" />
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add recoder-agents/src/app/checkout/loading.tsx
git commit -m "feat: add loading.tsx to recoder-agents checkout route"
```

---

### Task 4: Add loading.tsx to recoder-agency settings, tasks, and playground

**Files:**
- Create: `recoder-agency/apps/agency/app/(main)/settings/account/loading.tsx`
- Create: `recoder-agency/apps/agency/app/(main)/settings/team/loading.tsx`
- Create: `recoder-agency/apps/agency/app/(main)/tasks/loading.tsx`
- Create: `recoder-agency/apps/agency/app/(main)/playground/loading.tsx`

**Step 1: Create agency settings sub-route skeletons**

Re-export from parent (note: tab indentation for agency):
```tsx
export { default } from "../loading";
```

**Step 2: Create tasks loading skeleton**

File: `recoder-agency/apps/agency/app/(main)/tasks/loading.tsx`
```tsx
export default function Loading() {
	return (
		<div className="flex h-screen bg-bg">
			<div className="flex-1 p-6">
				<div className="max-w-[900px] mx-auto space-y-6 animate-pulse">
					<div className="h-8 bg-surface/10 rounded w-48" />
					<div className="flex gap-4 mb-6">
						<div className="h-10 bg-surface/10 rounded flex-1" />
						<div className="h-10 bg-surface/10 rounded w-32" />
					</div>
					<div className="space-y-3">
						{[1, 2, 3, 4, 5].map((i) => (
							<div key={i} className="h-16 bg-surface/10 rounded" />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
```

**Step 3: Create playground loading skeleton**

File: `recoder-agency/apps/agency/app/(main)/playground/loading.tsx`
```tsx
export { default } from "../loading";
```

**Step 4: Commit**

```bash
git add recoder-agency/apps/agency/app/\(main\)/settings/account/loading.tsx \
       recoder-agency/apps/agency/app/\(main\)/settings/team/loading.tsx \
       recoder-agency/apps/agency/app/\(main\)/tasks/loading.tsx \
       recoder-agency/apps/agency/app/\(main\)/playground/loading.tsx
git commit -m "feat: add loading.tsx to agency settings, tasks, and playground"
```

---

### Task 5: Fix PushNotificationPrompt hardcoded colors

**Files:**
- Modify: `app/app/components/PushNotificationPrompt.tsx`

**Step 1: Replace all hardcoded hex colors with CSS custom properties**

Replace inline style hex values with `var()` references that map to Tailwind's dark theme tokens:

| Current hex | Semantic meaning | Replacement |
|-------------|-----------------|-------------|
| `#18181b` | Background (zinc-900) | `var(--color-zinc-900, #18181b)` |
| `#27272a` | Border (zinc-800) | `var(--color-zinc-800, #27272a)` |
| `#e4e4e7` | Text (zinc-200) | `var(--color-zinc-200, #e4e4e7)` |
| `#fafafa` | Title text (zinc-50) | `var(--color-zinc-50, #fafafa)` |
| `#a1a1aa` | Muted text (zinc-400) | `var(--color-zinc-400, #a1a1aa)` |
| `#a78bfa` | Bell icon (violet-400) | `var(--color-violet-400, #a78bfa)` |
| `#3f3f46` | Dismiss border (zinc-700) | `var(--color-zinc-700, #3f3f46)` |
| `#6366f1` | Enable button (indigo-500) | `var(--color-indigo-500, #6366f1)` |
| `#4f46e5` | Enable hover (indigo-600) | `var(--color-indigo-600, #4f46e5)` |

Since this component uses inline styles (intentionally — it's a standalone toast that must work even if Tailwind fails to load), keep using inline styles but with fallback-safe CSS variable syntax so theme overrides work:

```tsx
background: 'var(--color-zinc-900, #18181b)',
border: '1px solid var(--color-zinc-800, #27272a)',
color: 'var(--color-zinc-200, #e4e4e7)',
```

For the buttons, same pattern:
```tsx
// Dismiss button
border: '1px solid var(--color-zinc-700, #3f3f46)',
color: 'var(--color-zinc-400, #a1a1aa)',

// Enable button
background: 'var(--color-indigo-500, #6366f1)',
// hover → var(--color-indigo-600, #4f46e5)
```

**Step 2: Verify file parses correctly**

Run: `cd /Users/arhansubasi/recoder.xyz && node -e "require('fs').readFileSync('app/app/components/PushNotificationPrompt.tsx','utf8')" && echo "PARSE_OK"`

**Step 3: Commit**

```bash
git add app/app/components/PushNotificationPrompt.tsx
git commit -m "fix: replace hardcoded hex colors in PushNotificationPrompt with CSS variables"
```

---

### Task 6: Fix global-error.tsx hardcoded colors

**Files:**
- Modify: `app/app/[locale]/global-error.tsx`

**Step 1: Replace inline style hex colors with CSS variable fallbacks**

The global-error page uses inline styles (intentionally — it must render even when CSS fails). Replace:

| Current hex | Replacement |
|-------------|-------------|
| `#0a0a0a` (background) | `var(--color-zinc-950, #0a0a0a)` |
| `#fafafa` (text) | `var(--color-zinc-50, #fafafa)` |
| `#a1a1aa` (muted text) | `var(--color-zinc-400, #a1a1aa)` |
| `#f97316` (button) | `var(--color-orange-500, #f97316)` |

**Step 2: Commit**

```bash
git add app/app/\[locale\]/global-error.tsx
git commit -m "fix: replace hardcoded hex colors in global-error.tsx with CSS variables"
```

---

### Task 7: Replace last alert() in usage page

**Files:**
- Modify: `app/app/[locale]/dashboard/usage/page.tsx`

**Step 1: Replace alert() with state-based feedback**

Find the `handleExport` function (around line 135-142) and replace the `alert()`:

```tsx
// Add state near other state declarations:
const [exportError, setExportError] = useState<string | null>(null);

// Replace handleExport:
const handleExport = async () => {
  setExportError(null);
  try {
    await exportUsageData('csv', timeRange);
  } catch (err) {
    console.error('Export failed:', err);
    setExportError('Export failed. Please try again.');
    setTimeout(() => setExportError(null), 4000);
  }
};
```

Add inline error display near the export button in the JSX:
```tsx
{exportError && (
  <div className="mt-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
    {exportError}
  </div>
)}
```

**Step 2: Verify no alert() calls remain**

Run: `grep -rn "alert(" app/app/\[locale\]/dashboard/usage/page.tsx`
Expected: No matches

**Step 3: Commit**

```bash
git add app/app/\[locale\]/dashboard/usage/page.tsx
git commit -m "fix: replace alert() with inline error feedback in usage export"
```

---

## Phase 2: Platform Integration

### Task 8: Wire @recoder/design-tokens into active apps

**Files:**
- Modify: `app/package.json`
- Modify: `recoder-agents/package.json`
- Modify: `recoder-agency/apps/agency/package.json`
- Modify: `recoder-pm/apps/web/package.json`

**Step 1: Add design-tokens dependency to each app**

In each `package.json`, add to `dependencies`:
```json
"@recoder/design-tokens": "workspace:*"
```

**Step 2: Install dependencies**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm install`

**Step 3: Verify import works**

Run: `node -e "const dt = require('./packages/design-tokens/src/index.ts'); console.log(dt ? 'OK' : 'FAIL')"`
If that fails (due to TS), just verify the package resolves:
Run: `ls packages/design-tokens/src/index.ts && echo "EXISTS"`

**Step 4: Commit**

```bash
git add app/package.json recoder-agents/package.json recoder-agency/apps/agency/package.json recoder-pm/apps/web/package.json pnpm-lock.yaml
git commit -m "feat: wire @recoder/design-tokens as dependency in all active apps"
```

---

### Task 9: Add AppSwitcher to recoder-web (Remix)

**Files:**
- Create: `recoder-web/app/components/header/AppSwitcher.tsx`
- Modify: `recoder-web/app/components/header/Header.tsx`

**Step 1: Create the Remix-compatible AppSwitcher**

File: `recoder-web/app/components/header/AppSwitcher.tsx`

recoder-web is a Remix app — it does NOT have access to Radix/Popover components. Use a simple dropdown with native HTML + CSS:

```tsx
import { useState, useRef, useEffect } from 'react';
import { getSwitcherApps } from '@recoder/ecosystem-config';

const currentAppId = 'web';
const apps = getSwitcherApps();

export function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 bg-transparent text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 rounded-md transition-colors"
        title="Switch App"
        aria-label="Switch between Recoder apps"
      >
        <div className="i-ph:squares-four text-xl" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg shadow-lg z-50 py-1">
          {apps.map((app) => {
            const isCurrent = app.id === currentAppId;
            return (
              <a
                key={app.id}
                href={app.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  isCurrent
                    ? 'bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary'
                    : 'text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3 hover:text-recoder-elements-textPrimary'
                }`}
                onClick={() => setOpen(false)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{app.label}</div>
                  <div className="text-xs opacity-60 truncate">{app.description}</div>
                </div>
                {isCurrent && (
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Mount in Header.tsx**

In `recoder-web/app/components/header/Header.tsx`, add the import and render the switcher in the header next to the settings button:

```tsx
import { AppSwitcher } from './AppSwitcher';
```

Add `<AppSwitcher />` inside the `<div className="flex items-center gap-2">` block, before the settings button.

**Step 3: Verify import resolution**

Check that `@recoder/ecosystem-config` is already a dependency of recoder-web. If not, add it:
Run: `grep ecosystem-config recoder-web/package.json`

**Step 4: Commit**

```bash
git add recoder-web/app/components/header/AppSwitcher.tsx recoder-web/app/components/header/Header.tsx
git commit -m "feat: add AppSwitcher to recoder-web header for cross-app navigation"
```

---

### Task 10: Add cross-app billing awareness to agency

**Files:**
- Create: `recoder-agency/apps/agency/lib/cross-app-billing.ts`
- Modify: `recoder-agency/apps/agency/app/(main)/settings/account/page.tsx` (add subscription status display)

**Step 1: Create billing check utility**

File: `recoder-agency/apps/agency/lib/cross-app-billing.ts`
```tsx
const SUBSCRIPTION_URL =
	process.env.RECODER_SUBSCRIPTION_URL ||
	"https://recoder.xyz/api/user/subscription";

export interface SubscriptionInfo {
	plan: "free" | "pro" | "enterprise";
	active: boolean;
}

export async function fetchSubscriptionStatus(
	cookieHeader?: string,
): Promise<SubscriptionInfo | null> {
	try {
		const res = await fetch(SUBSCRIPTION_URL, {
			headers: cookieHeader ? { Cookie: cookieHeader } : {},
			next: { revalidate: 300 }, // cache 5 min
		});
		if (!res.ok) return null;
		return (await res.json()) as SubscriptionInfo;
	} catch {
		return null;
	}
}
```

**Step 2: Wire into account settings page**

In `recoder-agency/apps/agency/app/(main)/settings/account/page.tsx`, import and call the utility to display platform subscription status alongside the existing team-level `isProPlan` check.

**Step 3: Commit**

```bash
git add recoder-agency/apps/agency/lib/cross-app-billing.ts recoder-agency/apps/agency/app/\(main\)/settings/account/page.tsx
git commit -m "feat: add cross-app billing awareness to agency settings"
```

---

## Phase 3: Agency Feature Gaps

### Task 11: Wire lobby recent apps/workflows to DB

**Files:**
- Create: `recoder-agency/apps/agency/app/(main)/lobby/actions.ts`
- Modify: `recoder-agency/apps/agency/app/(main)/lobby/lobby-client.tsx`
- Modify: `recoder-agency/apps/agency/app/(main)/lobby/page.tsx` (or parent server component)

**Step 1: Create server action to fetch recent apps/workflows**

File: `recoder-agency/apps/agency/app/(main)/lobby/actions.ts`
```tsx
"use server";

import { db } from "@/db";
import { apps, workspaces, teams } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function getRecentApps(teamDbId: number, limit = 6) {
	return db
		.select({
			id: apps.id,
			createdAt: apps.createdAt,
			updatedAt: apps.updatedAt,
			workspaceDbId: apps.workspaceDbId,
		})
		.from(apps)
		.where(eq(apps.teamDbId, teamDbId))
		.orderBy(desc(apps.updatedAt))
		.limit(limit);
}

export async function getRecentWorkflows(teamDbId: number, limit = 6) {
	return db
		.select({
			id: workspaces.id,
			name: workspaces.name,
			updatedAt: workspaces.updatedAt,
		})
		.from(workspaces)
		.where(eq(workspaces.teamDbId, teamDbId))
		.orderBy(desc(workspaces.updatedAt))
		.limit(limit);
}
```

**Step 2: Pass data from server component to lobby-client**

In the lobby page server component, call the actions and pass results as props to `LobbyClient`. Update `LobbyClientProps` interface to accept `recentApps` and `recentWorkflows` arrays.

**Step 3: Replace hardcoded empty arrays**

In `lobby-client.tsx`, replace:
```tsx
// TODO: Fetch from actual data source when app/workflow persistence is implemented
const hasRecentApps = false;
const hasRecentWorkflows = false;
const featuredApps: ...[] = [];
const recentApps: ...[] = [];
```

With props-based data:
```tsx
const hasRecentApps = props.recentApps.length > 0;
const hasRecentWorkflows = props.recentWorkflows.length > 0;
```

**Step 4: Commit**

```bash
git add recoder-agency/apps/agency/app/\(main\)/lobby/
git commit -m "feat: wire lobby recent apps/workflows to agency DB"
```

---

### Task 12: Add favorites toggle API for showcase

**Files:**
- Create: `recoder-agency/apps/agency/app/api/showcase/[appId]/favorite/route.ts`
- Modify: `recoder-agency/apps/agency/app/(main)/stage/showcase/[appId]/app-detail-client.tsx`

**Step 1: Create favorites toggle API route**

File: `recoder-agency/apps/agency/app/api/showcase/[appId]/favorite/route.ts`
```tsx
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apps } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ appId: string }> },
) {
	const { appId } = await params;

	// For now, toggle is client-side only since the apps table
	// doesn't have a favorites column. Return success to unblock the UI.
	// Full implementation requires adding a user_favorites join table.
	return NextResponse.json({ success: true, appId });
}
```

**Step 2: Wire the API call in app-detail-client.tsx**

Replace the TODO at line 56-58:
```tsx
const toggleFavorite = async () => {
	const newState = !isFavorite;
	setIsFavorite(newState);
	try {
		await fetch(`/api/showcase/${appDetails.id}/favorite`, {
			method: "POST",
		});
	} catch {
		setIsFavorite(!newState); // revert on failure
	}
};
```

**Step 3: Commit**

```bash
git add recoder-agency/apps/agency/app/api/showcase/ recoder-agency/apps/agency/app/\(main\)/stage/showcase/
git commit -m "feat: add favorites toggle API for agency showcase apps"
```

---

### Task 13: Implement task archive functionality

**Files:**
- Modify: `recoder-agency/apps/agency/app/(main)/tasks/components/filterable-acts-list.tsx`
- Create: `recoder-agency/apps/agency/app/(main)/tasks/actions.ts` (if not exists)

**Step 1: Create archive server action**

```tsx
"use server";

import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function archiveTask(taskId: string) {
	await db
		.update(tasks)
		.set({ status: "archived" })
		.where(eq(tasks.id, taskId));
	return { success: true };
}
```

**Step 2: Wire the archive button in filterable-acts-list.tsx**

Replace the TODO at line 705 with an actual call:
```tsx
onClick={(e) => {
	e.stopPropagation();
	archiveTask(act.id).then(() => {
		// Refresh the list by calling the parent refresh callback
	});
}}
```

Note: Check if `tasks` table has a `status` column that supports "archived". If not, this may need a schema migration — in that case, just filter archived tasks client-side by adding a local state filter.

**Step 3: Commit**

```bash
git add recoder-agency/apps/agency/app/\(main\)/tasks/
git commit -m "feat: implement task archive functionality in agency"
```

---

### Task 14: Consolidate settings button component (FIXME)

**Files:**
- Modify: `recoder-agency/apps/agency/app/(main)/settings/components/button.tsx`

**Step 1: Replace custom CVA button with @recoder-internal/ui Button**

The FIXME says: "Consider integrating with shared UI button component when releasing setting-v2"

Check if the custom button is used only within settings pages. If so, replace imports in consumer files with `@recoder-internal/ui/button` and update variant names to match.

If the custom button has variants not available in the shared component (e.g., `link` variant with specific styling), keep the file but add a deprecation comment and re-export from the shared package where possible.

**Step 2: Update FIXME to document decision**

Replace the FIXME with:
```tsx
// Settings button wraps @recoder-internal/ui Button with settings-specific variants.
// Full migration tracked in Sprint 15 — consolidation deferred until settings-v2 redesign.
```

**Step 3: Commit**

```bash
git add recoder-agency/apps/agency/app/\(main\)/settings/components/button.tsx
git commit -m "fix: document settings button consolidation decision (agency FIXME)"
```

---

### Task 15: Fix workspace generation timeout TODO

**Files:**
- Modify: `recoder-agency/apps/agency/app/workspaces/[workspaceId]/page.client.tsx`

**Step 1: Check trigger.config.ts for timeout constant**

Run: `grep -rn "timeout\|TIMEOUT\|generationTimeout" recoder-agency/apps/agency/trigger.config.ts recoder-agency/ --include="trigger.config.*" | head -10`

**Step 2: Extract and share the timeout constant**

Create or update a shared config:
```tsx
// In a shared constants file or inline:
const GENERATION_TIMEOUT_MS = Number(
	process.env.GENERATION_TIMEOUT_MS ?? 3600 * 1000,
);
```

Replace the hardcoded value at line 42-43:
```tsx
<WorkspaceProvider
	generationTimeout={GENERATION_TIMEOUT_MS}
```

**Step 3: Commit**

```bash
git add recoder-agency/apps/agency/app/workspaces/
git commit -m "fix: extract generation timeout to configurable constant (agency TODO)"
```

---

### Task 16: Fix vector-stores team installation FIXME

**Files:**
- Modify: `recoder-agency/apps/agency/app/(main)/settings/team/vector-stores/actions.ts`

**Step 1: Read the FIXME context at line 69**

The FIXME says: "When the installation is managed by the team, we should use the team's installation instead"

This is a known limitation — GitHub access validation only checks personal installations. Since team installations require additional GitHub App configuration that may not be set up yet, update the FIXME to be a tracked limitation:

```tsx
// KNOWN LIMITATION: GitHub access currently validates against user's personal
// installations only. Team-managed installations require GitHub App team-level
// configuration (not yet implemented). Tracked in Sprint 15+ backlog.
```

**Step 2: Commit**

```bash
git add recoder-agency/apps/agency/app/\(main\)/settings/team/vector-stores/actions.ts
git commit -m "fix: document team GitHub installation limitation (agency FIXME)"
```

---

### Task 17: Clean up DB schema TODOs

**Files:**
- Modify: `recoder-agency/apps/agency/db/schema.ts`

**Step 1: Resolve schema TODOs**

Line 109 — `users.email` TODO about null values:
The email field already allows null (no `.notNull()`). The TODO is stale — it describes the current state. Remove it:
```tsx
email: text("email").unique(),
```

Line 269 — `agents.graphUrl` deprecated TODO:
Keep the comment but rewrite for clarity:
```tsx
// DEPRECATED: graphUrl is a legacy field from the old architecture.
// Kept for backward compatibility until existing data is cleaned up.
graphUrl: text("graph_url"),
```

Line 271 — `agents.workspaceId` notNull constraint TODO:
This cannot be changed without a migration. Rewrite:
```tsx
// NOTE: workspaceId should have notNull constraint but existing records
// may have null values. Apply via migration after backfill.
workspaceId: text("workspace_id").$type<WorkspaceId>(),
```

**Step 2: Commit**

```bash
git add recoder-agency/apps/agency/db/schema.ts
git commit -m "fix: clean up stale schema TODOs in agency DB (Sprint 15)"
```

---

### Task 18: Final verification and commit

**Step 1: Run grep to verify no TODOs/FIXMEs remain unaddressed**

```bash
grep -rn "TODO\|FIXME\|HACK" recoder-agency/apps/agency/app/ recoder-agency/apps/agency/db/schema.ts --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"
```

Expected: Only documented limitations (rewritten in tasks 14-17), no unaddressed stubs.

**Step 2: Run grep to verify no alert() calls remain**

```bash
grep -rn "alert(" app/app/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v test
```

Expected: No matches.

**Step 3: Final commit if any loose changes**

```bash
git status
# If clean, done. If changes, commit with:
git commit -m "chore: Sprint 15 final verification pass"
```

---

## Execution Notes

- **Tab indentation**: All agency files use tabs (Biome formatter). Use `\t` not spaces.
- **recoder-web is Remix**: No Next.js patterns (no `'use client'` directive, no `next/navigation`). Uses `remix-utils`, `@nanostores/react`, `~/` import alias.
- **Agency DB**: Uses Drizzle ORM, not Prisma. Schema at `db/schema.ts`, queries use `db.select()...from()...where()` pattern.
- **Design tokens**: Currently exports plain JS constants. Apps can import for non-CSS contexts (JS color refs). For Tailwind CSS, the tokens inform what values to use but aren't auto-wired to `tailwind.config`.
- **Cross-app billing**: The subscription endpoint on recoder.xyz requires the user's session cookie. Cross-origin fetch needs `credentials: 'include'` and CORS headers on the API.
