# go/ — Go services & vendored Go projects

> Code documentation for `/Users/arhansubasi/recoder.xyz/go`.
> Verified by reading source on 2026-07-01. Accuracy over completeness — where a
> subtree is vendored upstream or gitignored, it is called out explicitly.
>
> **Roadmap status (2026-07-13).** All four trees are still on disk and this doc is accurate. In the
> engine program these are **Phase 5 (platform) — deferred**: `recoder-xds` + `ziti` are the cloud/teams
> networking tier (not needed for the loopback desktop; the backend degrades to a static Envoy bootstrap
> / loopback-only when they are absent), and `multica` is the degrade target for the in-proc
> `@recoder/coordination` engine (single-host work-locks run without it). Only `bd` (beads) is exercised
> today. See [RECODER-ENGINES §6](../architecture/RECODER-ENGINES.md).

## 1. Purpose

`go/` collects the repo's Go code. It is **not a single Go module** — it holds
four independent module trees with very different ownership and roles:

- One **Recoder-native, repo-tracked** service: `recoder-xds`, the Envoy xDS
  control plane for the Recoder service mesh.
- Three **vendored / gitignored upstream projects** that Recoder builds on or
  evaluates: `beads` (the `bd` issue tracker mandated by `AGENTS.md`), `ziti`
  (OpenZiti zero-trust networking), and `multica` (an open-source managed-agents
  platform — itself a TS monorepo with an embedded Go server).

Only `recoder-xds` is owned and version-controlled by this repo. The other three
are full upstream checkouts placed here for local building, reference, and
integration work; the root repo's `.gitignore` excludes them (see Gotchas). Treat
`recoder-xds` as "Recoder code" and the rest as "third-party here for convenience."

## 2. Layout

| Subdir | Module path | Tracked in root repo? | What it is |
|---|---|---|---|
| `recoder-xds/` | `github.com/recoder-xyz/recoder-xds` | **Yes** (14 files) | Recoder-owned Envoy xDS control plane. The one to actually maintain here. |
| `beads/` | `github.com/steveyegge/beads` | No (gitignored) | Upstream **beads** — the `bd` distributed graph issue tracker (Dolt-backed) that `AGENTS.md` requires for task tracking. |
| `ziti/` | `github.com/openziti/ziti/v2` | No (gitignored) | Upstream **OpenZiti** zero-trust mesh networking (controller, router, tunnel, `ziti` CLI). |
| `multica/` | TS monorepo + `github.com/multica-ai/multica/server` | No (gitignored) | Upstream **Multica** managed-agents platform: pnpm/turbo TS apps + an embedded Go backend under `multica/server/`. |

### recoder-xds internals (the Recoder-owned one)

| Path | Holds |
|---|---|
| `recoder-xds/cmd/recoder-xds/` | `main.go` (boot), `readiness.go` |
| `recoder-xds/internal/config/` | `NetworkConfig` Go struct mirroring `docker-backend/src/network/types.ts` |
| `recoder-xds/internal/snapshot/` | `builder.go` — `NetworkConfig` → Envoy v3 protos → `cache.Snapshot` |
| `recoder-xds/internal/server/` | ADS gRPC server over a go-control-plane `SnapshotCache` |
| `recoder-xds/internal/contract/` | `contract.go` + `contract.json` — cross-language naming contract pinned with the TS `@recoder/network` side |

### multica/server internals (vendored, Go backend of Multica)

| Path | Holds |
|---|---|
| `multica/server/cmd/` | Four `main`s: `server` (API/daemon), `multica` (CLI), `migrate`, `backfill_task_usage_hourly` |
| `multica/server/internal/` | `handler/`, `service/`, `daemon/`, `daemonws/`, `realtime/`, `auth/`, `events/`, `storage/`, `middleware/`, etc. |
| `multica/server/pkg/` | `db/` (sqlc-generated, pgx/v5), `agent/`, `protocol/`, `redact/` |
| `multica/server/migrations/` | SQL migrations (also used as sqlc schema source) |
| `multica/apps/`, `multica/packages/` | The TS half (web/desktop/mobile/docs + core/ui/views) — not Go |

## 3. Entry points

Start reading here, by module:

- **recoder-xds** (Recoder-owned): `go/recoder-xds/cmd/recoder-xds/main.go:24`
  (`func main`) → `run()` at `main.go:31`. Loads config (file / URL / env
  defaults), builds the snapshot, serves ADS gRPC on `:18000` and `/healthz` on
  `:18001`. The contract surface is `go/recoder-xds/internal/contract/contract.json`.
- **beads**: `go/beads/cmd/bd/main.go:1` — a large Cobra CLI (`bd`). Command files
  live alongside it in `cmd/bd/` (e.g. `assign.go`, `backup.go`, `branch.go`),
  with logic in `internal/`. This is the binary the repo's agent workflow calls.
- **ziti**: `go/ziti/ziti/main.go` — the `ziti` CLI; subcommands under
  `ziti/ziti/cmd/`, `run/`, `tunnel/`, `enroll/`, `pki/`.
- **multica** (Go backend): `go/multica/server/cmd/server/main.go:1` is the API
  server; `cmd/multica/main.go` the CLI, `cmd/migrate/main.go` migrations.

## 4. Build / run / test

### recoder-xds (Recoder-owned — use these)
No Makefile; commands are in its README and are plain `go`:
```bash
cd go/recoder-xds
go build ./...
go vet ./...
go test -race ./...
./recoder-xds                                   # env-derived defaults
./recoder-xds --config-file ./network.json
./recoder-xds --config-url http://docker-backend:3100/api/network/config
```
Flags/env: `--xds-addr`/`XDS_LISTEN_ADDR` (`:18000`), `--health-addr`/`XDS_HEALTH_ADDR`
(`:18001`), `--config-file`/`XDS_CONFIG_FILE`, `--config-url`/`XDS_CONFIG_URL`,
`--log-level`/`XDS_LOG_LEVEL`.

### beads (vendored) — `go/beads/Makefile`
Real targets include: `build`, `test`, `test-full-cgo`, `bench`, `install`,
`fmt`, `fmt-check`, `ci-pr-core`, `ci-pr-policy`, `ci-pr-lint`, `ci-package-npm`,
`test-upgrade`, `test-migration`. Has CGO and no-CGO build variants
(`beads_cgo.go` / `beads_nocgo.go`). Normally you install the released `bd`
binary, not build from this tree (its own README says "don't clone this repo into
your project").

### multica (vendored) — `go/multica/Makefile`
Self-describing targets (`make help`): `build` (server/CLI/migrate into
`server/bin`), `test` (Go tests after ensuring DB + migrations), `check`
(typecheck + TS tests + Go tests + Playwright E2E), `dev`, `server`, `daemon`,
`cli`, `migrate-up`/`migrate-down`, `db-up`/`db-down`/`db-reset`. DB queries are
**sqlc**-generated (`multica/server/sqlc.yaml`, engine postgresql, `pgx/v5`).

### ziti (vendored)
Standard OpenZiti build; see `go/ziti/BUILD.md` and `go/ziti/Makefile`. Not built
by Recoder tooling.

## 5. Key patterns & contracts

- **recoder-xds ↔ TypeScript cross-language contract.** The Go `NetworkConfig`
  (`internal/config/network_config.go:76`) mirrors
  `docker-backend/src/network/types.ts` field-for-field with JSON tags, so a
  `NetworkConfig` JSON round-trips between Go and TS. Naming is pinned in
  `internal/contract/contract.json` (`nodeId: recoder-mesh`,
  `listenerName: recoder_https_listener`, `routeConfigName: recoder_local_route`,
  `extAuthzClusterName: recoder_ext_authz`, plus the HTTP filter order). The TS
  `@recoder/network` package (`packages/network/src/xds-contract.ts`) emits the
  consuming Envoy bootstrap against this same contract, and tests on **both**
  sides assert it stays byte-identical. Changing one side without the other will
  break the mesh.
- **Hostile-by-default filter chain (recoder-xds).** The HCM HTTP filter order is
  fixed: `local_ratelimit` → `ext_authz` (**fail-closed**, pointed at the
  `recoder_ext_authz` cluster) → `router`. The dynamic snapshot is the runtime
  equivalent of the static bootstrap `docker-backend/src/network` already
  generates; this server pushes live LDS/CDS/RDS without restarting Envoy.
- **Snapshot must be `Consistent()`.** recoder-xds tests assert the built
  `cache.Snapshot` is consistent, carries the expected clusters
  (`docker-backend`, `recoder-app`, `recoder-agents`, `recoder-pm`,
  `recoder-agency`, plus `recoder_ext_authz`), and that the listener's HCM
  actually wires `ext_authz` before the router.
- **multica/server**: sqlc-generated DB layer in `pkg/db/generated` over `pgx/v5`,
  Redis (`go-redis/v9`), structured logging via `log/slog`, websocket daemon
  channels (`daemonws/`, `realtime/`). This is the architecture of an *upstream*
  project, not a Recoder contract — useful as reference for the managed-agents
  pattern, but not part of Recoder's control-plane contracts.
- **beads**: Dolt-backed graph issue tracker exposed as the `bd` CLI; the
  Recoder integration point is the CLI commands documented in `AGENTS.md`
  (`bd ready/show/update/close/vc status`), not its Go internals.

## 6. Gotchas

- **Three of four trees are gitignored.** Only `recoder-xds` is tracked in the
  root repo (14 files). `beads/`, `ziti/`, and `multica/` are excluded by
  `.gitignore` (lines 665–667: `go/beads/`, `go/ziti/`, `go/multica/`). Edits in
  those trees run on disk but **never commit to the root repo** — same class of
  landmine as the vendored `py/pal-mcp-server` and `ts/oh-my-codex` subtrees. If
  you mean to change Recoder Go code, you almost certainly mean `recoder-xds`.
- **These are full upstream checkouts, not Recoder forks-in-place.** `beads` is
  `github.com/steveyegge/beads`, `ziti` is `github.com/openziti/ziti/v2`,
  `multica` is `github.com/multica-ai/multica`. Their `AGENTS.md`/`CLAUDE.md`
  files are the *upstream projects'* instructions and do not represent Recoder
  policy. beads' own README explicitly warns against cloning it into your project.
- **No top-level Go module / workspace.** There is no `go.work` and no shared
  `go.mod`; each subdir is its own module with its own `go.mod`/`go.sum` and even
  different Go versions (recoder-xds `go 1.24`; beads `1.26.2`; ziti/multica
  `1.26.1`). Run `go` commands from inside the specific module dir.
- **multica is a TS-first monorepo with a Go server inside it.** `multica/` has
  `package.json`, `pnpm-workspace.yaml`, `turbo.json`, and `apps/`+`packages/`
  (TS), while the Go code is confined to `multica/server/`. Don't mistake the
  whole tree for a Go project.
- **beads has CGO/no-CGO split builds** (`beads_cgo.go` / `beads_nocgo.go`,
  `make test-full-cgo`); building from source needs the right CGO/ICU setup. Use
  the released `bd` binary unless you specifically need to build it.
