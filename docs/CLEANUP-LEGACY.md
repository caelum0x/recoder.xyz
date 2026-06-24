# Legacy Cleanup Inventory — remove BYOK-chat / web-builder

Per `PIVOT-INFRA.md` §5. Recoder is infra to run agents; these surfaces are the
BYOK-chat + web-builder past. **Deletions are staged and require approval** —
each stage keeps the build green and is committed separately.

## DONE — full web-app surface removal (2026-06-24, recoder-9eph)

Whole legacy web-app/frontend surfaces removed (user-directed, "infra not web app"):
`app/` (recoder.xyz), `recoder-agents/` (chat), `backend/` (Python chat backend),
`recoder-pm/`, `recoder-agency/`, `internal-packages/`, `apps/ui.giselles.ai/`.
Workspace/package.json/tsconfig/jest/Dockerfile config cleaned; pnpm workspace
resolves and `docker-backend` `tsc --noEmit` exits 0.

Remaining reference sweep tracked in **recoder-d6bg** (scripts/CI/nginx, A2A
agent-registry platform entries, root apex Next app + auth source-of-truth, docs).
The section below is the original staged inventory, now superseded by the full cut.

## A. recoder-agents — BYOK chat / canvas / modes (frontend; the "Ahoy" app)

Heavy, interconnected frontend subtree. Removing it is a real refactor (many
internal imports), so stage it:

| Surface | Path | Action |
| --- | --- | --- |
| Chat thread UI | `src/components/thread/**`, `src/app/(dashboard)/thread*`, `src/app/share/[threadId]` | remove (chat) |
| Canvas / web-builder modes | `src/components/canvas/**`, `src/lib/canvas/**`, `src/hooks/canvas/**`, `src/app/api/canvas/**` | remove |
| Mode chips / panel | `src/components/dashboard/recoder-modes-panel.tsx`, `src/components/thread/mode-indicator.tsx` | remove |
| Hooks | `src/hooks/threads/**` | remove |

Keep: the **control-plane** surfaces already there (`src/components/agent-os/**`,
`src/app/(dashboard)/agent-os`, mission-control, run-timeline) + the reframed
home hero. recoder-agents becomes a *thin operator console* over the APIs, or is
demoted further later. **Risk:** broad imports — remove leaf routes/pages first,
then components, fixing the build at each step.

## B. docker-backend — web-builder integrations (Sprint 11–13)

Backend routes/stores that exist only for the web-IDE/web-builder product:

| Module | Path | Action |
| --- | --- | --- |
| Visual editing | `src/visual-editing-transform.ts`, `src/style-utils.ts` | **DONE** (7dfd5995) |
| Themes | `src/integrations/{theme-store,theme-generator,builtin-themes}.ts` | **DONE** (27d5ef64) |
| Vercel | `src/integrations/vercel-store.ts` | **DONE** (a49c0018) |
| Supabase | `src/integrations/supabase-client.ts` | **DONE** (6c8375c4) |
| Neon | `src/integrations/neon-client.ts` | **DEFERRED** — coupled to snapshot/version-restore (server.ts:6025); decide whether version-time-travel stays before removing |
| Prompt library | `src/integrations/prompt-store.ts` | review (may be reused for task specs) |
| Integration store | `src/integrations/integration-store.ts` | review (per-user creds — check non-web-builder use) |

Plus the **server.ts routes** that mount these (Sprint 11–13 sections:
`/api/visual-edit`, theme routes, supabase/neon/vercel routes). Remove the routes
with the modules. **Risk:** server.ts is large; remove route blocks + imports
together, `tsc` after each.

## C. Keep (the infra)

`packages/agent-os`, `a2a-sdk`, owned `@recoder/{pi-*,mem0,sandbox-daytona,
daytona-*-api-client,git-nexus,context7-sdk,a2a-js}`, `docker-backend/src/{agent-os,
a2a,conductor}`, A2A, CLI (Recoder Code), `/api/agent-os/*` + `/api/conductor/*`.

## D. Sequence (each stage = approve → remove → tsc/test → commit)

1. **B (backend web-builder)** first — lower coupling than the frontend subtree;
   removes themes/visual-edit/supabase/neon/vercel + their server.ts routes.
2. **A (recoder-agents chat/canvas/modes)** — leaf routes → components, build-green
   at each step; recoder-agents left as a thin control-plane/conductor console.
3. Cut deploy/CI/nav refs to removed surfaces (like the recoder-web cut).

Then build the conductor runtime adapters (Claude Code/Codex/opencode/openclaw).
