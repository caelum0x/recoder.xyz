# Recoder OSS Ownership & Merge Plan

> Directive (2026-06-22): "merge all oss stuff to recoder — we own that shit."
> Full product merge, deep integration, no thin HTTP adapters.

## Principle

Bring the vendored OSS in the repo root (`mem0/`, `opencode/`, `pi/`, `a2a-js/`,
`stagehand/`, `GitNexus/`, `pal-mcp-server/`, `openclaw/`, `agent-browser/`,
`daytona-projects/`, `E2B/`, `ziti/`, `polar/`, …) into Recoder as **owned
first-party code under `@recoder/*`**, deeply wired into the Agent OS spine —
not consumed as external npm deps and not wrapped in thin HTTP shims.

## The one hard rule: do not slurp foreign monorepos

Each OSS dir is its own monorepo with its own build, deps, and versions. Adding
`opencode/**` / `pi/**` / `stagehand/**` to `pnpm-workspace.yaml` wholesale would
pull hundreds of internal packages and conflicting versions into Recoder's graph
and break `pnpm install` + every build. So we **merge by extraction**, package by
package, keeping the monorepo green at every step:

1. Identify the minimal package(s) we actually use from the OSS monorepo.
2. Vendor that subset into a new owned workspace location (see Layout) renamed to
   `@recoder/<name>`, reconciling deps onto the existing `catalog:` in
   `pnpm-workspace.yaml` (reuse pinned versions; don't introduce duplicates).
3. Point Recoder consumers at `workspace:*`, delete the external-dep usage.
4. `pnpm install` + `pnpm check-types` + targeted tests must stay green.
5. Only then move to the next package. Use worktree-isolated workflows to do
   independent merges in parallel.

## Layout

- Merged TS packages live under the EXISTING `packages/*` workspace glob as
  `packages/<name>` with `package.json` name `@recoder/<name>` — no
  `pnpm-workspace.yaml` change, and the glob only matches direct children so it
  can never slurp a foreign monorepo.
- Cross-runtime/native services (Rust: `agent-browser`, `ziti`, `GitNexus` engine;
  Python: `pal-mcp-server`, `backend`) are owned as **sidecars** invoked over a
  typed boundary, still first-party, source kept in place and built separately.

## Merge ledger (status + approach)

| OSS | Owned as | Approach | Status |
| --- | --- | --- | --- |
| mem0 | `@recoder/mem0` (vendored `mem0/mem0-ts`, provider barrel pruned) | extract-subset | **DONE** — owned + in-process via `docker-backend/src/mem0-client.ts` (workspace:*) |
| daytona | `@recoder/sandbox-daytona` + `@recoder/daytona-api-client` + `@recoder/daytona-toolbox-api-client` (OTel neutralized) | vendor-package | **DONE** — owned + wired into docker-backend daytona-client hub (`daytona-sdk.ts`, opt-in via DAYTONA_USE_SDK) |
| a2a-js | `/a2a-sdk` (proto + official types vendored) | extract-types + conformance | **DONE** — canonical a2a.proto + a2a-js types (CanonicalA2A namespace) owned in the SDK |
| pal-mcp-server | `@recoder/pal` | sidecar (Python) | adapter exists; deepen |
| GitNexus | `/git-nexus` | lib | **DONE** — wired into agent-os (/tasks/:id/context-pack via git-context.ts) |
| beads | `@recoder/beads-adapter` (`bd`) | adopt | wired for issue tracking |
| recoder-a2a | `@recoder/recoder-a2a` | adopt | published; route via bridge queue |
| daytona-projects | `@recoder/sandbox-daytona` (see above) | vendor-package | **DONE** (see daytona row above) |
| E2B | `@recoder/sandbox-e2b` | adapt SDK (fallback) | secondary sandbox |
| stagehand | `/browser-stagehand` | adopt | TODO — custom esbuild build, from-scratch consumer |
| agent-browser | `@recoder/browser-cdp` (Rust sidecar) | sidecar | socket adapter → evidence |
| opencode | `@recoder/runtime-opencode` | extract types/session | runtime adapter |
| pi | `/pi-{ai,agent-core,tui,coding-agent}` | vendor-packages | **DONE** — used in docker-backend A2A pi adapter + recoder-code `pi` command |
| openclaw | `@recoder/gateway-openclaw` | adapt (adapter exists) | channel→capability scopes |
| polar | billing wiring of `polar-webhook` | adopt | wire to usage/entitlement events |
| ziti | `ziti-*` (already wired) | sidecar | connectivity for runners |
| ollama / vllm | — | **DEFER** | 16GB/no-GPU box; cloud LLM + on-box Qdrant |

## Sequence (keep monorepo green; parallelize independent rows via worktree workflows)

1. **Foundations (serial):** add `oss/*` workspace glob; vendor `@recoder/mem0`
   (clean single package) as the proof-of-pattern merge; `pnpm install` green.
2. **Runtime substrates (parallel, worktree-isolated):** `@recoder/sandbox-daytona`,
   `@recoder/browser-stagehand` — both are first evidence producers into the run
   history/runtime-evidence subsystem already shipped.
3. **Runtime adapters (parallel):** `@recoder/runtime-pi`, `@recoder/runtime-opencode`
   behind the `agent-runtimes` adapter contract.
4. **Commercial + planning:** wire `polar-webhook` → billing events; deepen
   `@recoder/pal` + `@recoder/git-nexus` as planning/evidence producers.

## Definition of done per merge

- Source owned under `oss/<name>/` as `@recoder/<name>` (no external-dep usage).
- Consumers use `workspace:*`; deep-wired into an Agent OS subsystem (run events,
  evidence, routing, memory, or billing) — not a thin pass-through.
- `pnpm install` + `pnpm check-types` green; the touched subsystem proven.
