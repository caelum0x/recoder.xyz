# Recoder — Wire-Up Backlog

> The built-but-**unused** first-party code: real, tested packages that exist but
> nothing in the product imports yet. "Using all the folders in the product"
> *means working this list.* From [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) (15
> wire-up dirs of 129). Ordered by leverage. Check a box only when the consumer
> actually imports + runs it end-to-end.

Status: ⬜ todo · 🔄 in progress · ✅ wired (consumer imports + runs it) · ⏭️ skipped (honest: no clean additive seam — reason in row)

**Progress (2026-06-29): 11 of 15 wired in-process on the real product path; 2 skipped (gateway/worker — engine already fused elsewhere); 2 open (`ops-recorder` gitignored, `recoder-browser-tools` dist now ready to consume). BYOK runtime drivers verified real (FR-1).**

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
| ✅ | **`shared/src/animations`** | `apps/desktop/cockpit` | **wired** — added a Preact-native `@recoder/shared/animations/preact` entry (preact/hooks, no compat); cockpit `EventLog` streams live RunEvents via `useSmoothText`. Root-caused the original break: duplicate preact copies → anchored aliases |

## How to work this list
- Each wire-up is a small PR: import the package at the named consumer, replace the
  bespoke/inline path, add a test proving the consumer uses it, commit.
- Do these in **parallel disjoint workflows** (different consumer trees) — but never
  two on the same consumer at once.
- After a wire-up, flip its `DIRECTORY-MAP.md` verdict to `keep-supporting` and check
  the box here.
- **#1 `pal` → the run loop is the headline**: it's the largest first-party package
  the shipping product doesn't touch.

## Park / drop — reclassified 2026-06-29 (per owner: "use the stuff")
The earlier park/drop call was too aggressive. Corrected:
- **`ts/*` are OURS (customized), NOT park** → keep + used. The runtime drivers now
  **prefer the repo-built `ts/*` engines** (`ts/opencode`, `ts/oh-my-codex`,
  `ts/oh-my-openagent`, `ts/dmux`, `ts/recodergit`) over global PATH via a new
  `repo_engine` tier in the cli-locator. They are the BYOK agent subprocesses.
- **`py/colbert` is functionality, NOT drop** → **wired** as the optional ColBERT
  late-interaction **reranker** for `packages/rag` (`COLBERT_RERANK_URL`, degrade-safe).
- **Dropped (removed):** `packages/{ui,performance,plugins}` — verified zero dep + zero
  import. `packages/cli` (legacy `recoder-cli`, 306 errors) — **removed**; its conductor
  commands were ported into the real published `packages/recoder-code` CLI first.
- **Held:** `app/` — a slice, but deploy.yml builds the server's own
  `/root/recoder.xyz/app` and it's auth-sensitive, so not touched.
- **Still park** (genuine never-touched upstreams): `crates/tensorzero`, `crates/lance`,
  `crates/openfang`, `go/ziti`, the daytona/sst upstreams — candidates for a labeled
  `vendor/` area (not yet moved).
