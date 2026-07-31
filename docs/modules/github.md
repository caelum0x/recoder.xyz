# GITHUB module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): apps/desktop/engines/recodergit + gh CLI

**Interface:** `analyzeRepo · domainMap · reviewPR · openPR · comment · search · symbolSearch · findReferences · callGraph · definition · prStatus · health`

**Shipped:** `backend/src/domains/engines/github/` (the `GithubModule` composition + MCP
binders), mounted by the engines domain (`engines-module.ts`). The `gh` facet drives
`gh search repos / pr create / pr comment / pr view+diff` via the bounded `runCli`
seam; the `recodergit` facet drives `analyzeRepo`/`domainMap` through `RecoderGitService`
(flag-gated by `RECODER_CODE_GRAPH_ENABLED`). The previously advertised-but-404
`github.*` (`github.search / github.pr.create / github.pr.comment / github.pr_review`)
and `repo.*` (`repo.read / repo.search / repo.diff`) MCP tools now bind LIVE through the
governed interop host, reachable over the MCP HTTP edge `POST /api/mcp/tools/:server/:tool/call`.

**Shipped (code-graph MCP tools).** The `recodergit` facet now exposes four
real-bound, degrade-truthful code-graph tools over the same governed interop host:
`recodergit.symbol_search` (locate a symbol across the repo), `recodergit.find_references`
(all call/use sites of a symbol), `recodergit.call_graph` (caller/callee edges around a
symbol), and `recodergit.definition` (jump to a symbol's defining site). These drive the
real recodergit engine in place (flag-gated by `RECODER_CODE_GRAPH_ENABLED`); when the
engine is unavailable the facet reports down rather than faking a result.

**Shipped (PR status).** Per-workspace PR status folds in through the conductor domain:
per-repo setup-script run on worktree create, plus `GET /api/conductor/workspaces/:id/pr-status`
(driven by `gh`). The desktop surface is the Wave `recoder-*` shell (NOT the deleted Preact
cockpit): the PR chip renders inside the compare panel `RecoderComparePanel`
(`apps/desktop/app/frontend/app/view/recoder/recoder-compare.tsx:91-98` — `PR #{number} {state}`,
fed by the per-workspace readiness model in `recoder-model.ts`), which the board opens from
`recoder.tsx` (imports it at `recoder-compare.tsx` line 10, renders it at line ~999). The
per-repo setup script remains a backend/conductor feature (worktree-create hook + the
`/api/conductor/workspaces/:id/pr-status` edge); the current Wave shell exposes no dedicated
repo-settings panel.

**Shipped (public agent-facing MCP tools).** Alongside the engine-namespace tools above,
the governed capability surface exposes five public, agent-callable GitHub/repo tools
(registered in `mcp/recoder-capability-tools.cjs`): `recoder_github_pr_create`,
`recoder_github_pr_review`, `recoder_github_search_repos` (find repos by query — complements
the CODE search), `recoder_repo_search` (search code across the repo), and `recoder_repo_diff`.
These are the stable public ids agents invoke; the engine-namespace `github.*` / `repo.*` /
`recodergit.*` verbs above are the internal governed bindings behind them.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. The single `GithubHealth` probe folds both
facets (`gh`, `recodergitLib`): `up` = both available, `degraded` = one, `down` = neither.
Degrade-safe: any engine down → that facet reports down, never fakes success.
See ../RECODER-MODULES.md §GITHUB.
