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
| mem0 | `mem0ai` in-process (→ vendor `mem0/mem0-ts` as `@recoder/mem0`) | extract-subset | **wired** (SDK in-process via `docker-backend/src/mem0-client.ts`); ownership-vendor pending |
| a2a-js | `@recoder/a2a-sdk` (canonical proto vendored) | extract-types + conformance | **gate landed**; adopt `AgentCard`/types next |
| pal-mcp-server | `@recoder/pal` | sidecar (Python) | adapter exists; deepen |
| GitNexus | `@recoder/git-nexus` | sidecar + lib | adapter exists; wire as evidence producer |
| beads | `@recoder/beads-adapter` (`bd`) | adopt | wired for issue tracking |
| recoder-a2a | `@recoder/recoder-a2a` | adopt | published; route via bridge queue |
| daytona-projects | `@recoder/sandbox-daytona` | adapt SDK | replace in-memory `SandboxRecord` store |
| E2B | `@recoder/sandbox-e2b` | adapt SDK (fallback) | secondary sandbox |
| stagehand | `@recoder/browser-stagehand` | adopt | browser-runtime evidence producer |
| agent-browser | `@recoder/browser-cdp` (Rust sidecar) | sidecar | socket adapter → evidence |
| opencode | `@recoder/runtime-opencode` | extract types/session | runtime adapter |
| pi | `@recoder/runtime-pi` | adopt `pi-agent-core` | runtime adapter |
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
