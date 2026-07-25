# recoder-backend

The Recoder **control-plane spine**: a Node/TypeScript (Express + `express-ws`)
server that runs the conductor, Agent OS, the MCP host, and the deeply-fused OSS
engines behind one governance gate. The desktop app embeds and supervises this
same binary; the website consumes the same edges.

> This replaces the retired ~12.8k-line v1 "Docker execution backend" (per-project
> containers, `/api/container`, WebContainer replacement). That design is gone. If
> you are looking for it, see `docs/archive/`. The current backend does **not**
> spawn per-project Docker containers — it orchestrates coding agents in isolated
> git worktrees.

## Shape

- **Entry:** `src/server.ts` — a thin shell that loads `.env`, calls
  `bootstrap.start()`, and handles top-level boot failures. No domain logic.
- **Composition root:** `src/bootstrap/index.ts` — constructs and `start()`s all
  domains in dependency order, registers a per-domain `HealthRegistry`, and mounts
  the `RouteProvider`s onto the Express app.
- **Domains:** `src/domains/*` — 15 domains:

  | Domain | Responsibility |
  |---|---|
  | `persistence` | Postgres repositories, migrations |
  | `identity` | Better Auth session verification, orgs, `sk_` API keys |
  | `governance` | Rust kernel `decide → risk → audit` on every stateful write |
  | `edge` | HTTP edge, `/api/*` surface, error envelope |
  | `agent-os` | Control-plane state: spaces, tasks, runs, approvals, artifacts |
  | `conductor` | Parallel agent launch into isolated git worktrees, terminal |
  | `engines` | Deeply-fused OSS engines (openfang, recodergit, mem0, colbert, …) |
  | `inference` | In-proc TensorZero gateway, BYOK routing, entitlement + metering |
  | `memory` | Reviewed memory-candidate lifecycle, recall fusion |
  | `interop` / `interop-wire` | A2A wire interop, MCP tool stream, connectors |
  | `billing` | Merchant-of-record providers (Polar/Creem/Paddle/Dodo — never Stripe) |
  | `cloud` | Sandboxes, previews, mesh seams (ziti/xds, cloud-tier-deferred) |
  | `social` | Social connectors |
  | `observability` | Health roster, audit XDR, ops |

- **Health:** the server boots with truthful per-domain health sources. Missing
  keys/dependencies degrade **safe and explicit** (`SERVICE_UNAVAILABLE`), never
  faked. See `docs/RECODER-BACKEND/BUILD-STATUS.md` for the live status.

## Develop

```bash
# from repo root, install workspace deps (pnpm) first — see docs/STATUS.md #22
pnpm run dev        # tsx watch src/server.ts (hot reload)
pnpm run build      # tsc → dist/
pnpm run start      # node dist/server.js
pnpm run test       # vitest --run
```

`ci:preflight` guards that local `tsc`/`vitest` are installed before running the
focused CI check set (`pnpm run ci:check`).

## API surface

Canonical control-plane routes live under `/api/agent-os/*` (spaces, agents,
tasks, runs, approvals, artifacts, memory, instructions, policies, events,
workflows). A2A wire interop is under `/api/a2a/*`; the MCP host is under
`/api/mcp/*`; worker-to-backend calls use `/internal/agent-os/*` behind
`INTERNAL_SERVICE_KEY`. See `.claude/rules/api.md` for the boundary rules.

## Architecture docs

- `docs/RECODER-BACKEND/ARCHITECTURE.md` — full spine design
- `docs/RECODER-BACKEND/BUILD-STATUS.md` — phase status + health roster
- `docs/RECODER-BACKEND/FUSION-STATUS.md` — per-engine fusion depth
- `docs/RECODER-BACKEND/domains/*.md` — per-domain specs
