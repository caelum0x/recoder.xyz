# Recoder — Wire-Up Backlog

> The built-but-**unused** first-party code: real, tested packages that exist but
> nothing in the product imports yet. "Using all the folders in the product"
> *means working this list.* From [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) (15
> wire-up dirs of 129). Ordered by leverage. Check a box only when the consumer
> actually imports + runs it end-to-end.

Status: ⬜ todo · 🔄 in progress · ✅ wired (consumer imports + runs it) · ⏭️ skipped (honest: no clean additive seam — reason in row)

**Progress (2026-06-29): 10 of 15 wired in-process on the real product path; 3 skipped with reasons; 2 open.**

| | Package (built, unused) | Wire into (consumer) | Status |
|---|--------------------------|----------------------|----------------|
| ✅ | **`packages/pal`** | `docker-backend` conductor run loop | **wired** — `pal-plan.ts` fused into `workspace-service.createWorkspace`; defaults runtime+substrate on the real create path; risk annotates (D1) |
| ⏭️ | **`apps/agent-gateway`** | fold into `docker-backend` | **skipped** — private ESM, unresolvable from CJS backend; backend outbox-drain is richer; engine already fused via `post-run-workflow.ts`. Standalone kept (D2) |
| ⏭️ | **`apps/agent-worker`** | `docker-backend` (scale-out) | **skipped** — same; worker's drain has no status tracking (would regress). Standalone kept for cloud scale-out |
| ✅ | **`packages/agent-workflows`** | `docker-backend` (workflow driver) | **wired** — `AgentOsWorkflowRunner` drives the completion-watcher post-run graph (verify→browser-check→memory) |
| ✅ | **`packages/agent-hooks`** | `docker-backend` lifecycle | **wired** — in-process `hook-gate.ts` gates runtime launches (secret/path) on the run loop |
| ✅ | **`packages/agent-schemas`** | `docker-backend` ingress validation | **wired** — `validateBody` guard at `/api/conductor` + `/api/agent-os` boundaries |
| ✅ | **`packages/beads-adapter`** | `agent-os` ↔ `bd` | **wired** — `beads-sync.ts` drives `IssueTrackerSyncService` + `BeadsIssueTracker` (shells to `bd`, degrade-safe) |
| ✅ | **`packages/conductor-ui`** | `apps/desktop/cockpit` | **wired** — cockpit streams live workspace events via the typed `ConductorClient` |
| ✅ | **`packages/agent-oss`** | runtime dispatch | **wired** — `oss-dispatch.ts` routes OSS-provider workspaces through the in_process substrate |
| ⬜ | **`py/ops-recorder`** | `/work-signals` ingress (docker-backend) | open — backend already has a same-named inline concept; needs Python-vs-TS call (INTEGRATION-PLAN §d.4) |
| ✅ | **`packages/document-preprocessor`** | `packages/brain` RAG ingest | **wired** — `POST /api/conductor/context/ingest` → `brain.ingestDocument` (preprocess→remember) |
| ✅ | **`packages/browser-verification`** | browser-check node in the run loop | **wired** — `browser-check.ts` node verifies preview health on the post-run path |
| ⬜ | **`packages/recoder-browser-tools`** | the browser-check node | open — source-only ESM + playwright peer; needs a CJS dist before the node can drive Playwright (browser-verification used meanwhile) |
| ✅ | **`packages/design-tokens`** | `apps/desktop/cockpit` | **wired** — `applyDesignTokens` rebinds cockpit semantic colors at startup |
| ⏭️ | **`shared/src/animations`** | `apps/desktop/cockpit` | **skipped** — React-coupled hooks; aliasing react→preact/compat breaks cockpit's live poll. Needs a Preact-native hook variant first |

## How to work this list
- Each wire-up is a small PR: import the package at the named consumer, replace the
  bespoke/inline path, add a test proving the consumer uses it, commit.
- Do these in **parallel disjoint workflows** (different consumer trees) — but never
  two on the same consumer at once.
- After a wire-up, flip its `DIRECTORY-MAP.md` verdict to `keep-supporting` and check
  the box here.
- **#1 `pal` → the run loop is the headline**: it's the largest first-party package
  the shipping product doesn't touch.

## Not on this list (handled elsewhere)
- **Park** (43 dirs): vendored forks/clones (`ts/oh-my-*`, `openfang`, `lance`,
  `tensorzero`, `polar`, the Giselle/agency subtree) → move under a labeled
  `vendor/` area; see DIRECTORY-MAP §park.
- **Drop** (5 dirs): `app/` slice (can't build), `packages/{ui,performance,plugins}`,
  `py/colbert` — zero-import / non-building; see DIRECTORY-MAP §drop.
