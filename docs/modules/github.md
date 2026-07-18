# GITHUB module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): apps/desktop/engines/recodergit + gh CLI

**Interface:** `analyzeRepo · domainMap · reviewPR · openPR · comment · search · health`

**Shipped:** `backend/src/domains/engines/github/` (the `GithubModule` composition + MCP
binders), mounted by the engines domain (`engines-module.ts`). The `gh` facet drives
`gh search repos / pr create / pr comment / pr view+diff` via the bounded `runCli`
seam; the `recodergit` facet drives `analyzeRepo`/`domainMap` through `RecoderGitService`
(flag-gated by `RECODER_CODE_GRAPH_ENABLED`). The previously advertised-but-404
`github.*` (`github.search / github.pr.create / github.pr.comment / github.pr_review`)
and `repo.*` (`repo.read / repo.search / repo.diff`) MCP tools now bind LIVE through the
governed interop host, reachable over the MCP HTTP edge `POST /api/mcp/tools/:server/:tool/call`.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. The single `GithubHealth` probe folds both
facets (`gh`, `recodergitLib`): `up` = both available, `degraded` = one, `down` = neither.
Degrade-safe: any engine down → that facet reports down, never fakes success.
See ../RECODER-MODULES.md §GITHUB.
