# Self-Hosting the Recoder Control Plane

Run the full Recoder control plane (`docker-backend`) plus its data dependencies,
a deny-biased governance daemon, and a **fail-closed** Envoy edge on your own
host — with one command, or as a baked machine image.

This page documents what actually ships in [`deploy/`](../deploy/) and
[`docker-compose.selfhost.yml`](../docker-compose.selfhost.yml). It is honest
about what needs a real host and what degrades safely when a dependency is
absent.

Related docs:

- [`deploy/README.md`](../deploy/README.md) — the deploy directory's own operator notes.
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — overall platform architecture.
- [`docs/CONDUCTOR-ARCHITECTURE.md`](./CONDUCTOR-ARCHITECTURE.md) — the agent orchestration the backend drives.

---

## What you get

The self-host stack ([`docker-compose.selfhost.yml`](../docker-compose.selfhost.yml),
project name `recoder-selfhost`) brings up:

| Service | Image / build | Host port | Role |
|---|---|---|---|
| `backend` | built from [`docker-backend/Dockerfile`](../docker-backend/Dockerfile) → `recoder/docker-backend:selfhost` | `${BACKEND_PORT:-3100}` | The Recoder control plane (the product) |
| `postgres` | `postgres:17` | internal | `recoder_main` / `recoder_backend` / `recoder_pm` |
| `redis` | `redis:7` | internal | sessions, A2A bus |
| `qdrant` | `qdrant/qdrant:latest` | internal | vector store (mem0 / embeddings) |
| `recoder-xds` | reuses `recoder/docker-backend:selfhost` | internal (`18000`/`18001`) | Go Envoy **xDS (ADS)** control plane — dynamic LDS/CDS/RDS |
| `recoder-governance` | built from [`deploy/governance-daemon.Dockerfile`](../deploy/governance-daemon.Dockerfile) → `recoder/governance-daemon:selfhost` | internal (UDS) | Rust deny-biased governance daemon |
| `envoy` | `envoyproxy/envoy:v1.31-latest` | `${EDGE_HTTP_PORT:-8080}` + `${ENVOY_ADMIN_PORT:-9901}` | L7 edge proxy, fail-closed `ext_authz` gate |

The backend image is built with the **repo root** as the build context
(`context: .`) because [`docker-backend/Dockerfile`](../docker-backend/Dockerfile)
copies sibling paths (`packages/`, `shared/`, `pi-mono-dist/`, etc.) and the
prebuilt `docker-backend/dist/server.js`.

### Degrade-safe by design

Two services are **enhancements, never hard dependencies**:

- **`recoder-governance`** — the backend's `@recoder/governance` facade delegates
  to the Rust daemon over a shared Unix socket (`GOVERNANCE_SOCKET`), and falls
  back to its pure-TS deny-biased path on **any** failure. A dead/absent daemon
  degrades truthfully (verdicts marked `degraded`) — never an open gate.
- **`recoder-xds`** — gives Envoy live config over ADS. If it is down or its
  binary was not built, Envoy keeps serving via its **static fallback listener**
  on `:8080`. The edge never goes dark because of xDS.

Both are reported non-fatally by the bring-up script and are **not** in its
hard health gate (see [`scripts/selfhost-up.sh`](../scripts/selfhost-up.sh)).

---

## Prerequisites (you need a real host)

Self-hosting is **not** a no-op locally: the backend image build assumes a
prebuilt dist and sibling artifacts. [`scripts/selfhost-up.sh`](../scripts/selfhost-up.sh)
checks these honestly and fails fast if they are missing:

- Docker Engine + Docker Compose v2 (or legacy `docker-compose`), daemon running.
- `docker-backend/dist/server.js` present — build it first:
  ```bash
  (cd docker-backend && pnpm install && pnpm build)
  ```
- `pi-mono-dist/` present. If you do not need the Pi coding-agent SDK, the
  up-script tells you to create a stub layout:
  ```bash
  mkdir -p pi-mono-dist/coding-agent/dist
  printf '{"name":"@recoder/pi-coding-agent","version":"0.0.0","private":true}\n' \
    > pi-mono-dist/coding-agent/package.json
  ```
- The Conductor manages sibling agent-sandbox containers via the **host Docker
  socket**, mounted read-write into `backend` — so a real Docker host is
  required, not a restricted/rootless socket.

> The AMI/Packer path (below) bakes all of these for you, so a booted machine
> needs none of the manual build steps.

---

## One-command bring-up (compose + daemon + Envoy + xDS)

```bash
# 1. Configure required values
cp -f .env.selfhost.example .env.selfhost
#    Edit .env.selfhost and set POSTGRES_USER / POSTGRES_PASSWORD (not auto-generated).

# 2. Bring the whole stack up
scripts/selfhost-up.sh
```

[`scripts/selfhost-up.sh`](../scripts/selfhost-up.sh) does, in order:

1. Locates the repo root + compose file.
2. Loads `.env.selfhost` (creating it from the example if absent).
3. **Auto-generates** safe 64-hex secrets when empty: `INTERNAL_SERVICE_KEY`,
   `RECODER_GOVERNANCE_SIGNING_KEY`, `BETTER_AUTH_SECRET`.
4. **Fails fast** for required values it must not generate: `POSTGRES_USER`,
   `POSTGRES_PASSWORD`.
5. Verifies Docker + compose + the build prerequisites above.
6. `docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml up -d --build`.
7. Waits (bounded **600s**) for the **core** healthchecks — `postgres`, `redis`,
   `qdrant`, `backend`, `envoy` — and dumps failing service logs + exits non-zero
   if any never goes healthy. `recoder-xds` and `recoder-governance` are reported
   non-fatally (degrade-safe).
8. Prints the URLs.

On success it prints:

```
Recoder self-host is up.

  Control plane (direct):   http://localhost:3100
  Health:                   http://localhost:3100/health
  Edge (Envoy):             http://localhost:8080
  Envoy admin:              http://localhost:9901

  xDS control plane:        internal (recoder-xds, ADS on :18000, /healthz :18001)
  Governance daemon:        internal (recoder-governance, UDS on governance-sock)
```

### Tear down

```bash
scripts/selfhost-down.sh             # stop + remove containers, KEEP volumes (data survives)
scripts/selfhost-down.sh --volumes   # also remove pgdata/redisdata/qdrantdata/backenddata (DESTROYS DATA)
```

Volumes (`pgdata`, `redisdata`, `qdrantdata`, `backenddata`, `governance-sock`)
are **preserved by default** — see [`scripts/selfhost-down.sh`](../scripts/selfhost-down.sh).

### Logs

```bash
docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml logs -f
```

---

## Configuration

Copy [`.env.selfhost.example`](../.env.selfhost.example) → `.env.selfhost`.
**Never commit a filled-in `.env.selfhost`; no real secrets belong in the
example.**

**Required:**

| Var | Notes |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Postgres superuser that owns the three databases. **Not** auto-generated — you keep control of the credential that owns your data. |
| `INTERNAL_SERVICE_KEY` | Shared key for worker→backend `/internal/*` calls + aggregator loopback, **and** the governance daemon's channel. `[auto]` if empty. |
| `RECODER_GOVERNANCE_SIGNING_KEY` | Signs governance audit envelopes (tamper-evident audit chain). `[auto]` if empty. |
| `BETTER_AUTH_SECRET` | Better Auth session/JWT signing. `[auto]` if empty. |

**Optional (degrade safely when unset, truthful health):** host ports
(`BACKEND_PORT`, `EDGE_HTTP_PORT`, `ENVOY_ADMIN_PORT`), `GOVERNANCE_SOCKET`,
xDS tunables (`XDS_LISTEN_PORT`, `XDS_HEALTH_PORT`, `XDS_LOG_LEVEL`,
`XDS_CONFIG_URL`), billing (`POLAR_*`), agent sandboxes (`DAYTONA_*`,
`USE_DAYTONA_CONTAINERS`), and BYOK model keys (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`).

The three databases are created by
[`deploy/postgres/init-databases.sh`](../deploy/postgres/init-databases.sh),
mounted into the Postgres init dir. The compose healthcheck waits for **all
three** (`recoder_main`, `recoder_backend`, `recoder_pm`) before dependents start.

---

## The fail-closed governance edge

This is the security posture the self-host image exists to enforce.

### How the gate works

Envoy ([`deploy/envoy/envoy.xds.yaml`](../deploy/envoy/envoy.xds.yaml)) runs an
`envoy.filters.http.ext_authz` filter in front of the backend. For every
non-`/healthz` request it calls the backend's ext_authz HTTP contract endpoint
**`/internal/network/authz`** on a dedicated `recoder_ext_authz` cluster. That
endpoint runs the network authz decision through the governance facade, which
delegates to the owned Rust daemon over the shared UDS and falls back to the
pure-TS deny-biased path on failure. So the edge is governed even on the
always-on **static fallback** listener, not just the dynamic LDS one.

### FAIL-CLOSED, explicitly

```yaml
# deploy/envoy/envoy.xds.yaml
- name: envoy.filters.http.ext_authz
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthz
    failure_mode_allow: false        # unreachable authz => Envoy DENIES
    http_service:
      server_uri:
        uri: http://backend:3100
        cluster: recoder_ext_authz
      path_prefix: /internal/network/authz
```

`failure_mode_allow: false` means that if the authz upstream is unreachable,
Envoy **denies** the request. The edge is hostile-by-default — a dead governance
path closes the gate rather than opening it.

### How `validate-selfhost.sh` enforces it

[`deploy/validate-selfhost.sh`](../deploy/validate-selfhost.sh) runs static,
truthful checks **without bringing anything up**, and exits non-zero on the first
hard failure (skips are reported, never silently passed):

```bash
deploy/validate-selfhost.sh
```

1. **`docker compose ... config -q`** — the compose file is well-formed and every
   `${VAR:?required}` interpolation resolves. It feeds a **temporary** env-file of
   throwaway placeholders (created with `mktemp`, `rm`'d on exit — never real
   secrets, never written to the repo).
2. **`bash -n`** on every self-host shell script.
3. **YAML parse** of both Envoy bootstraps **plus** a structural **fail-closed
   posture assertion** via [`deploy/envoy/check-fail-closed.py`](../deploy/envoy/check-fail-closed.py)
   (requires `python3` + PyYAML; otherwise skipped + reported).
4. **`packer validate`** of the AMI template, **if** Packer is installed (else
   skipped + reported as gated).

A string `grep ext_authz` is **not** enough — a config could carry an ext_authz
filter that is `failure_mode_allow: true` (fail-OPEN) and still match. So
`check-fail-closed.py` walks the **parsed YAML** and proves, for **every**
ext_authz filter in **both** bootstraps:

- at least one ext_authz filter exists (the edge is governed);
- `failure_mode_allow` is present **and explicitly `false`** (a missing key
  defaults to false in Envoy, but the check requires it stated explicitly so the
  posture is auditable and cannot silently flip on a default change);
- the authz call targets the `recoder_ext_authz` cluster **and** that cluster is
  actually defined in `static_resources.clusters` (no dangling governance gate).

Any violation is a **hard failure** — the stack never ships a fail-open /
ungoverned edge.

### Static vs dynamic Envoy bootstrap

| File | Used by | Behavior |
|---|---|---|
| [`deploy/envoy/envoy.xds.yaml`](../deploy/envoy/envoy.xds.yaml) | the `envoy` service (default) | Dynamic LDS/CDS/RDS over ADS from `recoder-xds`, **plus** an always-on static `:8080` fallback listener. Node id `recoder-mesh` must match the xDS server. |
| [`deploy/envoy/envoy.selfhost.yaml`](../deploy/envoy/envoy.selfhost.yaml) | pin the pure-static path | Point the `envoy` service's volume mount at this file to drop xDS entirely. |

Both bootstraps carry the same fail-closed `ext_authz` gate, which is why
`check-fail-closed.py` is run against **both**.

---

## AMI / machine-image build (Packer)

[`deploy/packer/recoder.pkr.hcl`](../deploy/packer/recoder.pkr.hcl) bakes Docker +
the compose stack + the pinned substrate binaries so a booted instance runs
Recoder via a `recoder-selfhost.service` systemd unit. Two builders:

| Builder | Target |
|---|---|
| `amazon-ebs.recoder` | a real, publishable AMI (boot-to-run Recoder) |
| `null.recoder` | provisions **any** reachable host over SSH (bare metal, existing VM, Multipass, libvirt, a CI runner) — the portable path that does not require a cloud account |

```bash
packer init     deploy/packer/recoder.pkr.hcl
packer validate deploy/packer/recoder.pkr.hcl

# AMI:
packer build -only='amazon-ebs.recoder' deploy/packer/recoder.pkr.hcl

# Generic host over SSH:
packer build -only='null.recoder' \
  -var 'ssh_host=1.2.3.4' -var 'ssh_username=ubuntu' \
  -var 'ssh_private_key_file=~/.ssh/id_ed25519' \
  deploy/packer/recoder.pkr.hcl
```

Both builders upload the repo, then run
[`deploy/packer/provision.sh`](../deploy/packer/provision.sh) inside the builder,
which (with `set -euo pipefail`, failing the build loudly on any error):

1. Installs Docker Engine + compose plugin, Node 20 + pnpm, Go, and the autotools
   build toolchain.
2. Stages the repo at `/opt/recoder` (rsync, excluding `.git` / `node_modules`).
3. Builds the pinned substrate binaries (`make substrate-binaries`; degrades to
   system `tmux`/`bd` with a warning if the toolchain build fails).
4. Builds `docker-backend/dist` if absent, and ensures a `pi-mono-dist/` stub.
5. **Verifies** every required self-host artifact is present (compose file,
   `.env.selfhost.example`, the up/down scripts, the governance Dockerfile, both
   Envoy bootstraps, `check-fail-closed.py`, `validate-selfhost.sh`, the Postgres
   init) — failing the build if any is missing.
6. Pre-builds `recoder/docker-backend:selfhost` and
   `recoder/governance-daemon:selfhost` into the local Docker cache, and pre-pulls
   the pinned third-party images so first boot is offline-safe.
7. Seeds `.env.selfhost` from the example (secrets generated on first boot).
8. Installs and enables a `recoder-selfhost.service` systemd unit whose
   `ExecStart` runs `scripts/selfhost-up.sh` (and `ExecStop` runs the down
   script). `POSTGRES_PASSWORD` must be set in `.env.selfhost` (or injected via
   cloud-init/user-data) before first boot, or the service fails fast with a clear
   message — the intended fail-safe.

The Packer template ends with a **truthful post-provision check** that asserts
both images exist, the systemd unit is enabled, and the compose + Envoy artifacts
are staged — failing the build if not.

> **Needs a real host:** building an AMI needs AWS credentials + the `amazon`
> Packer plugin (fetched by `packer init`); the `null` builder needs a reachable
> SSH target. `validate-selfhost.sh` reports `packer validate` as skipped/gated
> when Packer is not installed.

---

## Pointing desktops at a self-hosted control plane

The [`apps/desktop`](../apps/desktop) Recoder app talks to a backend over an HTTP
base URL. By default it boots its **own** embedded backend, but you can point it
at your self-hosted control plane instead.

- The cockpit's backend URL comes from `DOCKER_BACKEND_URL`, defaulting to
  `http://localhost:3100` ([`apps/desktop/main.js`](../apps/desktop/main.js):
  `process.env.DOCKER_BACKEND_URL || 'http://localhost:3100'`).
- When the embedded backend supervisor is **READY**, its resolved
  `{ backendUrl, apiKey }` **override** `DOCKER_BACKEND_URL` for the cockpit. The
  embedded backend is **on by default for packaged builds** and **off in dev**
  unless `RECODER_EMBEDDED_BACKEND` is set
  ([`apps/desktop/backend-supervisor.js`](../apps/desktop/backend-supervisor.js),
  [`apps/desktop/main.js`](../apps/desktop/main.js)).

To target your self-hosted backend, disable the embedded backend and set the URL:

```bash
RECODER_EMBEDDED_BACKEND=false \
DOCKER_BACKEND_URL=http://your-host:3100 \
  <launch the desktop app>
```

Point at the **Envoy edge** (`:8080`) rather than the backend (`:3100`) directly
when you want the fail-closed governance gate in front of desktop traffic. See
[`apps/desktop/README.md`](../apps/desktop/README.md) for the desktop's own
environment notes.

> The desktop supervisor polls `GET ${backendUrl}/api/conductor/health` with the
> API key until it returns 200, so a self-hosted backend must expose that route
> (the standard control-plane image does).

---

## Honesty checklist

- The compose stack and Packer image are real and runnable; the up-script and
  validator fail loudly rather than faking success.
- `XDS_CONFIG_URL` is **optional and currently empty** by default — the example
  notes a `http://backend:3100/api/network/config` URL "once the backend exposes
  it," so treat the live-config-from-backend path as **planned/gated** and rely on
  env-derived xDS defaults (or the static bootstrap) until then.
- Building an AMI, provisioning a remote host, or running a production edge all
  require a **real host** (Docker daemon, build toolchain, and — for AWS — cloud
  credentials). Local validation via `deploy/validate-selfhost.sh` is static-only
  and clearly reports what it skipped.
