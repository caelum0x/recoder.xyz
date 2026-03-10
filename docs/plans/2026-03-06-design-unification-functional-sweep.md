# Design Unification & Functional Sweep

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify the visual design across all 5 active Recoder apps (app, agents, agency, PM, web) with Roobert font + orange/purple palette, and ensure every page loads without errors with working navigation and auth.

**Architecture:** Update the existing dormant `@recoder/design-tokens` package with canonical brand values (colors, fonts, gradients). Export both JS constants and a CSS custom properties file. Each app imports the shared CSS and adapts its globals.css. Font files (Roobert woff2) are copied to each app that needs them. Functional fixes are applied per-app after design alignment.

**Tech Stack:** Tailwind CSS (v3 in app/, v4 in agents/agency/PM), UnoCSS (recoder-web), Roobert font (local woff2), CSS custom properties, Next.js (app/agents/agency/PM), Remix (recoder-web)

**Active apps (studio is ABANDONED):**
- `app/` -> recoder.xyz (Tailwind 3, Next.js)
- `recoder-agents/` -> agents.recoder.xyz (Tailwind 4, Next.js)
- `recoder-agency/` -> agency.recoder.xyz (Tailwind 4, Next.js)
- `recoder-pm/` -> pm.recoder.xyz (Tailwind 4, Next.js)
- `recoder-web/` -> web.recoder.xyz (UnoCSS + Tailwind, Remix)

---

## Task 1: Update @recoder/design-tokens Package

**Files:**
- Modify: `packages/design-tokens/src/index.ts`
- Create: `packages/design-tokens/src/tokens.css`
- Modify: `packages/design-tokens/package.json`

**Step 1: Update design-tokens/src/index.ts with canonical brand values**

Replace the entire file with unified tokens matching the orange-primary / purple-secondary palette and Roobert font stack:

```typescript
/**
 * Recoder Design Tokens
 *
 * Canonical brand colors, typography, and spacing used across all Recoder apps.
 * Import these tokens instead of hard-coding values to ensure consistency.
 */

// -- Brand Colors (HSL values for CSS custom properties) --
export const colorHSL = {
  orange: {
    50: "25 100% 95%",
    100: "25 100% 90%",
    200: "25 100% 80%",
    300: "25 95% 65%",
    400: "25 95% 58%",
    500: "25 95% 53%",   // primary
    600: "25 95% 45%",   // primary hover
    700: "25 90% 38%",
  },
  purple: {
    50: "270 100% 95%",
    100: "270 100% 90%",
    200: "270 91% 80%",
    300: "270 91% 72%",
    400: "270 91% 65%",  // secondary
    500: "270 85% 58%",
    600: "270 80% 50%",  // secondary hover
    700: "270 75% 42%",
  },
  gray: {
    50: "0 0% 98%",
    100: "0 0% 95%",
    200: "0 0% 90%",
    300: "0 0% 80%",
    400: "0 0% 64%",
    500: "0 0% 45%",
    600: "0 0% 32%",
    700: "0 0% 20%",
    800: "0 0% 12%",
    900: "0 0% 8%",
    950: "0 0% 5%",
  },
} as const;

// -- Hex colors for non-CSS contexts --
export const colors = {
  orange: {
    500: "#F79009",
    600: "#DC6803",
  },
  purple: {
    400: "#A855F7",
    600: "#9333EA",
  },
  black: "#000000",
  white: "#FFFFFF",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
} as const;

// -- Gradients --
export const gradients = {
  primary: `linear-gradient(to right, ${colors.orange[500]}, ${colors.purple[400]})`,
  primaryTailwind: "bg-gradient-to-r from-[#F79009] to-[#A855F7]",
} as const;

// -- Typography --
export const fonts = {
  sans: "Roobert, system-ui, -apple-system, sans-serif",
  mono: "Roobert Mono, Consolas, monospace",
} as const;

// -- Spacing (Tailwind default scale) --
export const spacing = {
  0: "0", 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem",
  5: "1.25rem", 6: "1.5rem", 8: "2rem", 10: "2.5rem", 12: "3rem",
  16: "4rem", 20: "5rem",
} as const;

// -- Border Radius --
export const radii = {
  sm: "0.125rem", md: "0.375rem", lg: "0.75rem",
  xl: "1rem", "2xl": "1.5rem", full: "9999px",
} as const;

// -- Breakpoints --
export const breakpoints = {
  sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px",
} as const;
```

**Step 2: Create tokens.css with shared CSS custom properties**

Create `packages/design-tokens/src/tokens.css`:

```css
/*
 * Recoder Design Tokens — CSS Custom Properties
 *
 * Import this file in each app's globals.css:
 *   @import "@recoder/design-tokens/tokens.css";
 *
 * Then reference variables like:
 *   color: hsl(var(--recoder-orange-500));
 *   font-family: var(--font-sans);
 */

:root {
  /* Brand: Orange (primary) */
  --recoder-orange-50: 25 100% 95%;
  --recoder-orange-100: 25 100% 90%;
  --recoder-orange-200: 25 100% 80%;
  --recoder-orange-300: 25 95% 65%;
  --recoder-orange-400: 25 95% 58%;
  --recoder-orange-500: 25 95% 53%;
  --recoder-orange-600: 25 95% 45%;
  --recoder-orange-700: 25 90% 38%;

  /* Brand: Purple (secondary) */
  --recoder-purple-50: 270 100% 95%;
  --recoder-purple-100: 270 100% 90%;
  --recoder-purple-200: 270 91% 80%;
  --recoder-purple-300: 270 91% 72%;
  --recoder-purple-400: 270 91% 65%;
  --recoder-purple-500: 270 85% 58%;
  --recoder-purple-600: 270 80% 50%;
  --recoder-purple-700: 270 75% 42%;

  /* Neutrals */
  --recoder-gray-50: 0 0% 98%;
  --recoder-gray-100: 0 0% 95%;
  --recoder-gray-200: 0 0% 90%;
  --recoder-gray-300: 0 0% 80%;
  --recoder-gray-400: 0 0% 64%;
  --recoder-gray-500: 0 0% 45%;
  --recoder-gray-600: 0 0% 32%;
  --recoder-gray-700: 0 0% 20%;
  --recoder-gray-800: 0 0% 12%;
  --recoder-gray-900: 0 0% 8%;
  --recoder-gray-950: 0 0% 5%;

  /* Semantic */
  --recoder-success: 160 84% 39%;
  --recoder-warning: 38 92% 50%;
  --recoder-error: 0 84% 60%;
  --recoder-info: 217 91% 60%;

  /* Typography */
  --font-sans: Roobert, system-ui, -apple-system, sans-serif;
  --font-mono: Roobert Mono, Consolas, monospace;

  /* Border Radius */
  --radius: 0.625rem;
}
```

**Step 3: Update package.json exports**

```json
{
  "name": "@recoder/design-tokens",
  "version": "0.2.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./src/tokens.css"
  }
}
```

**Step 4: Commit**

```bash
git add packages/design-tokens/
git commit -m "feat(design-tokens): update with unified orange/purple palette and Roobert font"
```

---

## Task 2: Distribute Roobert Font Files

Roobert woff2 files currently only exist in `recoder-agents/public/fonts/roobert/`. Copy them to every app that needs local font loading.

**Files:**
- Source: `recoder-agents/public/fonts/roobert/*.woff2` (4 files)
- Copy to: `app/public/fonts/roobert/`
- Copy to: `recoder-agency/apps/agency/public/fonts/roobert/`
- Copy to: `recoder-pm/apps/web/public/fonts/roobert/`
- Copy to: `recoder-pm/apps/app/public/fonts/roobert/`
- Copy to: `recoder-pm/apps/portal/public/fonts/roobert/`
- Copy to: `recoder-web/public/fonts/roobert/`

**Step 1: Copy font files**

```bash
for dir in \
  app/public/fonts/roobert \
  recoder-agency/apps/agency/public/fonts/roobert \
  recoder-pm/apps/web/public/fonts/roobert \
  recoder-pm/apps/app/public/fonts/roobert \
  recoder-pm/apps/portal/public/fonts/roobert \
  recoder-web/public/fonts/roobert; do
  mkdir -p "$dir"
  cp recoder-agents/public/fonts/roobert/*.woff2 "$dir/"
done
```

**Step 2: Commit**

```bash
git add "*/public/fonts/roobert/*.woff2"
git commit -m "feat: distribute Roobert font files to all active apps"
```

---

## Task 3: Align app/ (recoder.xyz) Design

**Files:**
- Create: `app/app/fonts/roobert.ts`
- Modify: `app/app/globals.css`
- Modify: `app/app/[locale]/layout.tsx`

**Step 1: Create Roobert font loader for app/**

Create `app/app/fonts/roobert.ts`:

```typescript
import localFont from "next/font/local";

export const roobert = localFont({
  src: [
    { path: "../../public/fonts/roobert/RoobertUprightsVF.woff2", style: "normal", weight: "100 900" },
    { path: "../../public/fonts/roobert/RoobertItalicsVF.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-roobert",
  display: "swap",
  declarations: [
    { prop: "font-feature-settings", value: "'ss10' on, 'ss09' on, 'ss03' on, 'ss04' on, 'ss14' on" },
  ],
});

export const roobertMono = localFont({
  src: [
    { path: "../../public/fonts/roobert/RoobertMonoUprightsVF.woff2", style: "normal", weight: "100 900" },
    { path: "../../public/fonts/roobert/RoobertMonoItalicsVF.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-roobert-mono",
  display: "swap",
});
```

**Step 2: Update globals.css — replace font-family references**

In `app/app/globals.css`, find the existing `:root` block and ensure:
- `--font-sans` points to `Roobert, system-ui, -apple-system, sans-serif`
- `--font-mono` points to `Roobert Mono, Consolas, monospace`
- Primary/secondary colors remain `25 95% 53%` (orange) and `270 91% 65%` (purple) — these already match, just verify no drift

**Step 3: Wire Roobert into the root layout**

In `app/app/[locale]/layout.tsx`, import the font and add CSS variable classes to `<html>` or `<body>`:

```typescript
import { roobert, roobertMono } from "../fonts/roobert";
// ... in the component:
<html className={`${roobert.variable} ${roobertMono.variable}`}>
// or on <body>:
<body className={`${roobert.variable} ${roobertMono.variable} font-sans`}>
```

**Step 4: Verify locally**

```bash
cd app && pnpm dev
# Open http://localhost:3000 — text should render in Roobert
```

**Step 5: Commit**

```bash
git add app/app/fonts/ app/app/globals.css app/app/\[locale\]/layout.tsx
git commit -m "feat(app): switch to Roobert font, verify orange/purple palette"
```

---

## Task 4: Align recoder-agents Design

recoder-agents is already the closest to the target. Minor fixes only.

**Files:**
- Modify: `recoder-agents/src/app/globals.css` (if any color drift)

**Step 1: Verify primary color is orange, not a different hue**

Read `recoder-agents/src/app/globals.css` and confirm:
- `--primary` maps to the orange hue (25 95% 53%) not a different value
- `--secondary` or equivalent maps to purple (270 91% 65%)
- Font references `--font-roobert` (already done)

If values differ, update them to match the canonical tokens from Task 1.

**Step 2: Fix hardcoded colors in showcase**

In `recoder-agents/src/components/home/showcase-section.tsx`, replace any hardcoded `#000000` or `bg-black` with `text-foreground` / `bg-background` theme tokens.

**Step 3: Commit if changes made**

```bash
git add recoder-agents/
git commit -m "fix(agents): align color tokens to canonical palette"
```

---

## Task 5: Align recoder-agency Design

Agency uses DM Sans + blue accent (#0087f6). Needs to switch to Roobert + orange primary.

**Files:**
- Create: `recoder-agency/apps/agency/app/fonts/roobert.ts`
- Modify: `recoder-agency/apps/agency/app/layout.tsx`
- Modify: `recoder-agency/apps/agency/app/globals.css`

**Step 1: Create Roobert font loader**

Create `recoder-agency/apps/agency/app/fonts/roobert.ts` (same pattern as Task 3 Step 1, adjust paths relative to this app):

```typescript
import localFont from "next/font/local";

export const roobert = localFont({
  src: [
    { path: "../../public/fonts/roobert/RoobertUprightsVF.woff2", style: "normal", weight: "100 900" },
    { path: "../../public/fonts/roobert/RoobertItalicsVF.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-roobert",
  display: "swap",
  declarations: [
    { prop: "font-feature-settings", value: "'ss10' on, 'ss09' on, 'ss03' on, 'ss04' on, 'ss14' on" },
  ],
});

export const roobertMono = localFont({
  src: [
    { path: "../../public/fonts/roobert/RoobertMonoUprightsVF.woff2", style: "normal", weight: "100 900" },
    { path: "../../public/fonts/roobert/RoobertMonoItalicsVF.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-roobert-mono",
  display: "swap",
});
```

**Step 2: Update layout.tsx — swap DM Sans for Roobert**

In `recoder-agency/apps/agency/app/layout.tsx`:
- Remove DM Sans / DM Mono imports from `next/font/google`
- Import roobert from `./fonts/roobert`
- Replace font CSS variable classes on `<html>`/`<body>`

**Step 3: Update globals.css — swap accent from blue to orange**

In `recoder-agency/apps/agency/app/globals.css`:
- Replace `--font-dm-sans` / `--font-dm-mono` references with `--font-roobert` / `--font-roobert-mono`
- Replace the blue accent color (`#0087f6` / water blue references) with orange (`25 95% 53%` / `#F79009`)
- Keep existing node-type colors (text, file, generation, etc.) — those are functional, not brand
- Update any heading text-shadow glow effects from blue to orange

**Step 4: Verify locally**

```bash
cd recoder-agency && pnpm install && pnpm build-sdk && pnpm -F agency dev
# Check lobby, showcase, tasks pages load with Roobert + orange accent
```

**Step 5: Commit**

```bash
git add recoder-agency/apps/agency/
git commit -m "feat(agency): switch to Roobert font and orange primary accent"
```

---

## Task 6: Align recoder-pm Design

PM uses Geist font + purple primary (OKLCH). Needs Roobert + orange primary.

**Files:**
- Create: `recoder-pm/apps/web/app/fonts/roobert.ts`
- Create: `recoder-pm/apps/app/app/fonts/roobert.ts`
- Create: `recoder-pm/apps/portal/app/fonts/roobert.ts`
- Modify: `recoder-pm/packages/design-system/styles/globals.css`
- Modify: `recoder-pm/packages/design-system/lib/fonts.ts`
- Modify: `recoder-pm/apps/web/app/layout.tsx`
- Modify: `recoder-pm/apps/app/app/layout.tsx` (if separate)
- Modify: `recoder-pm/apps/portal/app/layout.tsx` (if separate)

**Step 1: Create Roobert font loaders for each PM sub-app**

Each PM sub-app (web, app, portal) needs its own font loader file. Use the same pattern as Task 3 Step 1. Adjust the `path` values relative to each app's font file location vs public directory.

**Step 2: Update design-system fonts.ts**

In `recoder-pm/packages/design-system/lib/fonts.ts`:
- Remove GeistSans/GeistMono imports
- Export Roobert CSS variable names instead:

```typescript
export const fontVariables = "--font-roobert --font-roobert-mono";
```

Or if fonts.ts just provides class names, update to reference `--font-roobert`.

**Step 3: Update design-system globals.css — orange primary**

In `recoder-pm/packages/design-system/styles/globals.css`:
- Change `--primary: oklch(0.61 0.22 293)` (purple) to orange equivalent: `oklch(0.7 0.18 55)` (approximate orange in OKLCH, or switch to HSL: `25 95% 53%`)
- Update `--font-geist-sans` references to `--font-roobert`
- Update `--font-geist-mono` references to `--font-roobert-mono`

**Note:** If PM's design-system heavily relies on OKLCH, consider keeping OKLCH for PM but changing the hue to orange. The exact OKLCH value for #F79009 is approximately `oklch(0.75 0.17 60)`. Test visually.

**Step 4: Wire Roobert into each PM layout**

For each of `web/app/layout.tsx`, `app/app/layout.tsx`, `portal/app/layout.tsx`:
- Import the local roobert font loader
- Add CSS variable classes to `<html>` or `<body>`
- Remove Geist font package imports

**Step 5: Verify locally**

```bash
cd recoder-pm && pnpm install && pnpm dev
# Check web (marketing), app (dashboard), portal pages
```

**Step 6: Commit**

```bash
git add recoder-pm/
git commit -m "feat(pm): switch to Roobert font and orange primary"
```

---

## Task 7: Align recoder-web Design

recoder-web uses UnoCSS + SCSS with a well-defined variable system. Needs font swap and color alignment.

**Files:**
- Modify: `recoder-web/app/styles/variables.scss`
- Modify: `recoder-web/app/root.tsx`
- Create: `recoder-web/app/styles/roobert-font.css`

**Step 1: Create @font-face declarations for Roobert**

Since recoder-web is Remix (not Next.js), it can't use `next/font/local`. Instead, create CSS @font-face rules.

Create `recoder-web/app/styles/roobert-font.css`:

```css
@font-face {
  font-family: "Roobert";
  src: url("/fonts/roobert/RoobertUprightsVF.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
  font-feature-settings: "ss10" on, "ss09" on, "ss03" on, "ss04" on, "ss14" on;
}

@font-face {
  font-family: "Roobert";
  src: url("/fonts/roobert/RoobertItalicsVF.woff2") format("woff2");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "Roobert Mono";
  src: url("/fonts/roobert/RoobertMonoUprightsVF.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Roobert Mono";
  src: url("/fonts/roobert/RoobertMonoItalicsVF.woff2") format("woff2");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}
```

**Step 2: Import font CSS in root.tsx**

In `recoder-web/app/root.tsx`, add the font CSS import alongside existing style imports:

```typescript
import roobertFontStyles from "./styles/roobert-font.css?url";
// Add to links() export:
{ rel: "stylesheet", href: roobertFontStyles },
```

**Step 3: Update variables.scss — set font-family and align accent color**

In `recoder-web/app/styles/variables.scss`:
- Set `--font-family-sans: Roobert, system-ui, -apple-system, sans-serif;`
- Set `--font-family-mono: Roobert Mono, Consolas, monospace;`
- Verify `--recoder-elements-actions-active` / primary action color is orange (#F79009), not a different hue
- If accent color is already orange, leave it. If not, update to `#F79009`

**Step 4: Verify locally**

```bash
cd recoder-web && pnpm dev
# Open http://localhost:5173 — verify font renders as Roobert
```

**Step 5: Commit**

```bash
git add recoder-web/
git commit -m "feat(web): switch to Roobert font, align accent to orange"
```

---

## Task 8: Fix recoder-agency Functional Issues — Wire Up Data

Agency lobby/showcase/tasks have hardcoded empty arrays. Wire them to actual DB queries.

**Files:**
- Modify: `recoder-agency/apps/agency/app/(main)/lobby/lobby-client.tsx`
- Modify: `recoder-agency/apps/agency/app/(main)/lobby/page.tsx` (server component)
- Modify: `recoder-agency/apps/agency/app/(main)/stage/showcase/showcase-client.tsx`
- Modify: `recoder-agency/apps/agency/app/(main)/tasks/page.tsx`

**Step 1: Read the existing data layer**

Before implementing, read:
- `recoder-agency/apps/agency/db/schema.ts` — understand what tables exist
- `recoder-agency/apps/agency/app/(main)/lobby/page.tsx` — what data is passed to LobbyClient
- `recoder-agency/apps/agency/app/(main)/stage/showcase/page.tsx` — what data is fetched for showcase
- Any existing API routes or server actions for apps/workspaces

**Step 2: Wire lobby data**

In the lobby server component (`page.tsx`), fetch recent apps and workflows from the database using the existing Drizzle ORM setup, then pass as props to `LobbyClient`.

In `lobby-client.tsx`:
- Replace `const hasRecentApps = false` with prop-driven check
- Replace `const featuredApps: ... = []` with actual props
- Replace `const recentApps: ... = []` with actual props
- Same for workflows

**Step 3: Wire showcase data**

In showcase server component, fetch user's apps from DB. The showcase-client.tsx likely already accepts props — verify and connect.

**Step 4: Wire tasks data**

Tasks page already seems partially wired (it has pagination). Verify it fetches real data. Fix any TODO columns (input, model) by either implementing them or removing the commented-out columns cleanly.

**Step 5: Wire favorites**

Replace empty `onClick` on star icons with actual favorite toggle (persist to DB or localStorage as appropriate for current data layer).

**Step 6: Wire playlists**

In showcase playlist tab, replace `const playlists: Playlist[] = []` with DB query or localStorage persistence. If DB tables don't exist for playlists, use localStorage as temporary persistence (already has save/load utils in studio).

**Step 7: Verify**

```bash
cd recoder-agency && pnpm -F agency dev
# Check lobby shows real data (or proper empty states if DB is empty)
# Check showcase tabs load without errors
# Check tasks page loads and paginates
```

**Step 8: Commit**

```bash
git add recoder-agency/
git commit -m "feat(agency): wire lobby, showcase, and tasks to real data"
```

---

## Task 9: Fix recoder-pm — Add AppSwitcher to Authenticated App

The PM authenticated dashboard (`apps/app/`) is missing the AppSwitcher that exists in the marketing site.

**Files:**
- Modify: `recoder-pm/apps/app/components/sidebar/index.tsx`
- Or modify: `recoder-pm/apps/app/app/layout.tsx`

**Step 1: Read the existing PM app layout**

Read `recoder-pm/apps/app/app/layout.tsx` and `recoder-pm/apps/app/components/sidebar/index.tsx` fully to understand the current structure.

**Step 2: Add AppSwitcher**

Import the AppSwitcher component (from `recoder-pm/apps/web/components/app-switcher.tsx` or create a shared one). Add it to the sidebar header or the top-left corner of the app layout, matching the pattern used in web.

The AppSwitcher should:
- Use `getSwitcherApps()` from `@recoder/ecosystem-config`
- Highlight "pm" as the current app
- Link to other apps with external arrow icons

**Step 3: Fix portal global error page**

Read `recoder-pm/apps/portal/app/global-error.tsx`. It's currently minimal/unstyled. Replace with a styled version matching the web app's error page pattern (centered layout, logo, "Try Again" button, "Return Home" link).

**Step 4: Verify**

```bash
cd recoder-pm && pnpm dev
# Check apps/app dashboard has AppSwitcher visible
# Check portal error page renders properly (trigger by visiting invalid route)
```

**Step 5: Commit**

```bash
git add recoder-pm/
git commit -m "fix(pm): add AppSwitcher to authenticated app, style portal error page"
```

---

## Task 10: Cross-App Navigation & Page Load Verification

Verify every page loads without errors across all 5 apps.

**Files:**
- No new files — this is a verification pass
- Potentially fix any broken pages discovered

**Step 1: Build all apps**

```bash
# Main app
cd app && pnpm build

# Agents
cd recoder-agents && pnpm build

# Agency
cd recoder-agency && pnpm build-sdk && pnpm -F agency build

# PM
cd recoder-pm && pnpm build

# Web
cd recoder-web && pnpm build
```

Each build must succeed without errors. Fix any TypeScript or build errors found.

**Step 2: Verify page loads (dev mode is fine)**

For each app, start dev server and verify these pages load:

**app/ (recoder.xyz):**
- `/` (landing page)
- `/auth/signin`
- `/auth/signup`
- `/about`
- `/learn`

**recoder-agents:**
- `/` (home)
- `/app` (dashboard, requires auth)
- `/pricing`
- `/checkout` (requires auth)

**recoder-agency:**
- `/` (redirects to lobby or login)
- Lobby page (requires auth)
- Showcase page (requires auth)
- Tasks page (requires auth)

**recoder-pm:**
- `/` (marketing landing)
- `/pricing`
- `/app` (redirects to dashboard or signin)

**recoder-web:**
- `/` (redirects to auth or loads IDE)

**Step 3: Verify AppSwitcher works in all apps**

In each app, click the AppSwitcher and verify:
- All 5 active apps are listed (not studio)
- Current app is highlighted
- Links navigate to correct subdomains
- No broken/dead links

**Step 4: Fix any issues found**

Document and fix any pages that error, show blank screens, or have broken navigation.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve page load errors found during cross-app verification"
```

---

## Task 11: Update Plan & Todo Files

**Files:**
- Modify: `plan.md`
- Modify: `tasks/todo.md`

**Step 1: Update plan.md**

Add a new section under "Completed Work" documenting the design unification:
- Roobert font deployed to all apps
- Orange primary / purple secondary palette unified
- Agency data wired to DB
- PM AppSwitcher added to authenticated app
- All pages verified loading without errors

**Step 2: Update tasks/todo.md**

Mark design unification as complete. Update any changed status for functional items.

**Step 3: Commit**

```bash
git add plan.md tasks/todo.md
git commit -m "docs: update plan and todo with design unification completion"
```

---

## Summary of Changes

| Task | App(s) | What Changes |
|------|--------|-------------|
| 1 | shared | Update @recoder/design-tokens with canonical palette + CSS file |
| 2 | all | Copy Roobert woff2 font files to all apps |
| 3 | app/ | Add Roobert font loader, wire into layout |
| 4 | agents | Minor color alignment, fix hardcoded colors |
| 5 | agency | Swap DM Sans -> Roobert, blue -> orange accent |
| 6 | PM | Swap Geist -> Roobert, purple -> orange primary |
| 7 | web | Add @font-face for Roobert, align accent color |
| 8 | agency | Wire lobby/showcase/tasks to real DB data |
| 9 | PM | Add AppSwitcher to dashboard, fix portal error page |
| 10 | all | Build + page load verification sweep |
| 11 | docs | Update plan.md and tasks/todo.md |
