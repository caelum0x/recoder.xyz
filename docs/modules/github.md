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
(driven by `gh`) surfaced as the cockpit PR chip. The cockpit `RepoSettings` panel manages
the per-repo setup script.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. The single `GithubHealth` probe folds both
facets (`gh`, `recodergitLib`): `up` = both available, `degraded` = one, `down` = neither.
Degrade-safe: any engine down → that facet reports down, never fakes success.
See ../RECODER-MODULES.md §GITHUB.
