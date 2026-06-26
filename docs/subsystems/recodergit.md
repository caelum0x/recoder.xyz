# RecoderGit → Recoder: Code Knowledge Graph Integration

> **Goal:** make RecoderGit a first-class Recoder capability — every connected repo (GitHub or
> local) is continuously indexed into a **code knowledge graph**, grouped into **domains**, and
> served to the Brain, to agents (via MCP), to the backend API, and to the UI. This is how
> Recoder gains real structural understanding of code: dependencies, call chains, impact, scope,
> and domain boundaries — not text guesses.

Status: **engine build in progress** (the real Node CLI/MCP engine at `ts/recodergit/gitnexus`);
Brain `RepoIntelPort` adapter already shipped (degrade-safe). This doc is the plan to go from
"adapter exists" to "fully integrated, live, GitHub-driven."

---

## 1. What RecoderGit actually is (verified)

A monorepo with **two targets sharing one core** (`gitnexus-shared`):

| Target | What | Recoder uses |
|---|---|---|
| `ts/recodergit/gitnexus` | **Node CLI + MCP server** — tree-sitter parse → scope resolution → knowledge graph → **LadybugDB (`lbug`)** storage → embeddings → hybrid search. Native deps (tree-sitter node-gyp, onnxruntime, `@ladybugdb/core`). | **YES** — this is the engine we drive |
| `ts/recodergit/gitnexus-web` | the **browser** app (WASM/transformers.js, zero-server) | optional — UI reference only |

The Node engine exposes (confirmed from source):

- **CLI commands:** `setup` · `index`/`analyze` (build the graph) · `status` · `detect-changes` (incremental delta) · `group` (group repos = **domains**) · `list`/`repo` · `serve`/`mcp` (run as a server) · `doctor` · `clean`.
- **MCP tools (agent-facing, 22):** `context` · `impact` / `detect_impact` / `api_impact` · `query` · `pdg_query` · `cypher` (raw graph query) · `scope` · `explain` · `trace` · `route_map` · `generate_map` · `list_repos` / `repo` · `group_list` / `group_sync` · `rename` · `shape_check` · `tool_map` · `check` · `base_ref`.
- **Storage:** per-repo lbug graph + `repo-manager`, `branch-index`, `parse-cache`, `scope-index-store` (so graphs are persistent + incrementally updatable, keyed by repo + branch + file-hash).

**Key consequence:** RecoderGit is stateful — a repo must be **indexed once** (`index`) to build its
lbug graph, then queries (`impact`/`query`/`context`) run against that persistent graph and stay
fresh via `detect-changes`/incremental. So the integration is fundamentally about an **indexing
lifecycle + a persistent graph server**, not one-shot CLI calls.

---

## 2. Two access modes — and the decision

| Mode | How | Pros | Cons |
|---|---|---|---|
| **CLI per-call** (today's adapter) | shell `gitnexus impact … --json` | simplest; no daemon | needs the repo pre-indexed; cold call returns nothing; re-pays process startup per query |
| **MCP server** (option c — **chosen for live**) | run `gitnexus mcp`/`serve` once per host; talk to it over MCP/HTTP | graph stays warm in memory; all 22 tools; matches Recoder's MCP host; multi-repo via `group` | a managed long-lived process to supervise |

**Decision: run RecoderGit as a persistent MCP server, with the CLI as the indexing + fallback
path.** The Brain's `RepoIntelPort` gets a second adapter, `RecoderGitMcpRepoIntel`, that calls the
running server's `impact`/`context`/`scope` tools; `createRepoIntelAuto()` prefers the MCP server
when reachable, falls back to the CLI adapter, then to the context-pack default — degrade-safe at
every step. Indexing is always done via the CLI/server `index` command (one-time + incremental).

---

## 3. Architecture

```
   GitHub repo / local repo
            │  connect (project) / push (webhook)
            ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  docker-backend: RecoderGitService (new, in src/agent-os/)          │
   │   • clone/locate repo  • index lifecycle (cold + incremental)     │
   │   • supervises the gitnexus MCP server  • per-project index state  │
   │   • GitHub webhook → detect-changes → re-index                    │
   └──────────────┬───────────────────────────────┬───────────────────┘
                  │ drives (CLI: index/group)      │ exposes
                  ▼                                 ▼
        gitnexus MCP server  ◄──────────  /api/agent-os/code-graph/*   (REST)
        (persistent lbug graphs,                    + interop MCP host
         grouped into domains)                      (agents call gitnexus tools)
                  │ tools: impact/context/scope/query/cypher
                  ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  @recoder/brain  ── RepoIntelPort ◄ RecoderGitMcpRepoIntel          │
   │   BrainContext.repo now = real code-knowledge-graph intelligence  │
   │   (every agent reads it once, reused)                             │
   └──────────────────────────────────────────────────────────────────┘
                  ▼
        UI: code-graph + domain map (adapted from gitnexus-web)
```

---

## 4. Domains (the "domained" requirement)

RecoderGit's **`group`** is Recoder's **domain** primitive:

- A Recoder **space/project** maps to a RecoderGit **group**; repos in that project are `group_sync`'d together so cross-repo edges (a service calling a shared lib) are in one graph.
- Within a repo, **domains** are derived from the graph's module/package clustering + ownership (`route_map`/`generate_map` produce architectural maps; `scope` gives boundaries). Recoder surfaces these as a **domain map**: bounded contexts, their entry points, their cross-domain dependencies, and risk.
- Domain boundaries feed governance (a change crossing a domain boundary or touching a high-risk domain raises the approval tier) and coordination (work-locks can be domain-scoped).

`DomainMap` (Recoder-side projection): `{ domains: [{ name, repos[], entryPoints[], owns: glob[], dependsOn: domain[], risk }], crossEdges: [{ from, to, kind, count }] }`.

---

## 5. Indexing lifecycle

| Trigger | Action | RecoderGit call |
|---|---|---|
| Project connects a repo | clone (GitHub) or locate (local) → cold index → register in the project's group | `setup` → `index` → `group_sync` |
| `git push` (GitHub webhook) | compute changed files → incremental re-index → refresh impact | `detect-changes` → incremental `index` |
| Branch switch / PR | branch-scoped index (uses `branch-index`) | `index --ref <branch>` |
| Periodic staleness check | `status` reports stale; re-index if drifted | `status` → `detect-changes` |
| Agent run start | Brain assembles `RepoIntelPort` over the warm graph | MCP `context`/`impact`/`scope` |

Index state is tracked **per project** in Recoder (agent-os artifact/state): `{ repoId, group, lastIndexedSha, branch, indexedAt, status }` — truthful (never claim indexed without the sha), so the doctor/health can report "graph is N commits stale."

---

## 6. Integration points (file-level)

### 6.1 Brain (`packages/brain`)
- `src/repo/recodergit-mcp-repo-intel.ts` — **NEW** `RecoderGitMcpRepoIntel implements RepoIntelPort` over the running MCP server (injectable transport; calls `impact`/`context`/`scope`, maps → `ContextPack`). Degrade-safe.
- `src/repo/repo-intel-adapter.ts` factory `createRepoIntelAuto()` — **EDIT**: prefer MCP server (if `RECODERGIT_MCP_URL`/resolver finds it), else the existing CLI `RecoderGitRepoIntel`, else `ContextPackRepoIntel`.
- `src/domain/repo-intel.types.ts` — **NEW/EXTEND** richer `RepoIntel`/`DomainMap` shapes (graph nodes/edges/domains) beyond the mock `ContextPack`.
- `src/runtime/engine-resolver.ts` — **EDIT**: add `gitnexusMcpUrl` resolution + a `gitnexus index` capability probe in `doctor`.

### 6.2 Backend (`docker-backend/src/agent-os`)
- `gitnexus-service.ts` — **NEW**: clone/locate, index lifecycle, MCP-server supervision (spawn `gitnexus mcp` on a port, health, restart), per-project index state, `reindexOnPush(changed)`. Flag-gated (`RECODER_CODE_GRAPH_ENABLED`), fail-safe.
- `routes/code-graph.routes.ts` — **NEW**: `/api/agent-os/code-graph/*` → index status, domain map, impact/query proxied to the server (auth + flag guarded). Read-only for agents.
- `brain-service.ts` — **EDIT**: build the Brain with the MCP-backed `createRepoIntelAuto()` once the server is up.
- GitHub webhook (existing `agent-os/routes/github-webhook.routes.ts`) — **EDIT (additive)**: on push, call `gitnexusService.reindexOnPush()`.

### 6.3 interop / MCP host (`packages/interop` / `docker-backend` MCP)
- Register the gitnexus MCP server in Recoder's MCP registry so **agents** can call `context`/`impact`/`query`/`scope`/`explain`/`cypher` directly (risk-scored + audited per the interop security rules). This is RecoderGit's intended "make your agent reliable" surface, governed by Recoder.

### 6.4 UI
- A `code-graph` panel: domain map + impact view + dependency graph, adapted from `gitnexus-web`'s renderer (read-only over the backend's `/code-graph` API). Per the frontend rules: show real index state/provenance, not "AI is working."

---

## 7. GitHub knowledge graphs (the headline)

1. User connects a GitHub repo to a Recoder project (existing GitHub auth/app).
2. `RecoderGitService` clones it (shallow), runs `index` → builds the lbug knowledge graph, `group_sync`s it into the project domain.
3. Recoder now answers structurally for that repo: "what breaks if I change X" (`impact`), "show me the auth domain" (`scope`/domain map), "how does request flow" (`trace`/`route_map`), "where is Y defined and used" (`query`).
4. On every push, the webhook triggers `detect-changes` → incremental re-index → the graph (and every agent's Brain context) stays current.
5. Multi-repo projects get **cross-repo** edges via groups — a true org-level code knowledge graph.

---

## 8. Phased rollout

| Phase | Deliverable | Gate |
|---|---|---|
| **0** | Build the gitnexus Node engine (native compile) + verify `index → impact/query/context` end-to-end on a sample repo | engine `--help` runs, `dist/cli` present, a real query returns graph data |
| **1** | `RecoderGitMcpRepoIntel` + `createRepoIntelAuto` prefers MCP server; brain green | brain check-types/build/test green; MCP path returns real impact |
| **2** | `RecoderGitService` (index lifecycle + server supervision + per-project state) in docker-backend, flag-gated | service tests green; cold index of a fixture repo works; flag-off no-op |
| **3** | `/api/agent-os/code-graph/*` routes + domain map projection | route tests; domain map returns real groups/scopes |
| **4** | GitHub webhook → incremental re-index | webhook test triggers `detect-changes`; staleness truthful |
| **5** | Register gitnexus MCP tools in Recoder's MCP host (agents call them, governed) | interop registry test; tool calls risk-scored + audited |
| **6** | UI code-graph + domain map panel | reads real `/code-graph` state |

Each phase lands **green + fail-safe** (flag-off = no behavior change), same bar as the rest of
the Brain work. Build via workflows, verify each gate before the next.

---

## 9. Verification

```bash
# Engine (phase 0)
cd ts/recodergit/gitnexus && node dist/cli/index.js --help
node dist/cli/index.js index <repo> && node dist/cli/index.js impact <symbol> --file <f> --json

# Brain (phase 1)
pnpm -F @recoder/brain check-types && build && test

# Backend (phases 2–4)
cd docker-backend && npx vitest --run src/agent-os/gitnexus-service.test.ts
npx vitest --run src/agent-os/routes/code-graph.routes.test.ts

# Truthful health
# brain runDoctor() reports gitnexus live=true only when the MCP server answers; index state
# reports lastIndexedSha vs HEAD (never claims fresh when stale)
```

---

## 10. Risks & honest constraints

- **Native build is heavy** (tree-sitter node-gyp + onnxruntime + grammar compile + model downloads). It must build on the host that runs the server; degrade-safe everywhere it isn't built.
- **Stateful engine**: queries are meaningless without a prior index — the lifecycle (Phase 2) is the load-bearing part, not the adapter.
- **Resource**: the MCP server holds graphs in memory + lbug on disk; per the server-capacity note, index large repos carefully and store lbug on the data volume.
- **Security** (interop rules): the gitnexus MCP tools are read-only over code; still risk-scored, authenticated, and audited like any MCP surface — never trust raw tool output as authority.
- **Truthful state**: index status, staleness, and engine availability are always reported honestly (the doctor pattern), never faked.
