# Recoder Self-Host

One-command self-hosted Recoder: the control plane (`docker-backend`) plus its
data dependencies (Postgres, Redis, Qdrant) behind an Envoy edge proxy. This is
master-plan wave 6 — *single-command self-hosted Recoder (compose + daemon)*.

Everything here lives in `deploy/`, `scripts/`, and the top-level
`docker-compose.selfhost.yml`. It does not modify application source.

---

## Stack

| Service   | Image                          | Port (host) | Purpose                                   |
|-----------|--------------------------------|-------------|-------------------------------------------|
| backend   | built from `docker-backend/Dockerfile` | `3100`      | Recoder control plane (the product)       |
| postgres  | `postgres:17`                  | internal    | `recoder_main` + `recoder_backend` + `recoder_pm` |
| redis     | `redis:7`                      | internal    | sessions + A2A bus                        |
| qdrant    | `qdrant/qdrant`                | internal    | vector store (mem0 / embeddings)          |
| envoy     | `envoyproxy/envoy:v1.31`       | `8080`, `9901` | L7 edge proxy + admin                  |

The backend image's `Dockerfile` includes a **substrate stage** that builds the
pinned `tmux` + `bd` binaries the Conductor drives. They are baked into the image
and degrade safely to system `tmux`/`bd` if a build toolchain was unavailable.

---

## Prerequisites

- **Docker** + **Docker Compose v2** (or legacy `docker-compose`).
- The backend image is built with the **repo root as build context** (the
  `Dockerfile` copies sibling paths: `packages/`, `shared/`, `pi-mono-dist/`,
  `c/`, `go/`, `scripts/`, and the prebuilt `docker-backend/dist/server.js`).
- **Build the backend dist before the first bring-up** (the Dockerfile asserts
  `docker-backend/dist/server.js` exists):
  ```bash
  cd docker-backend && pnpm install && pnpm build && cd ..
  ```
- **`pi-mono-dist/`** is copied by the Dockerfile for the optional Pi
  coding-agent SDK. If you have a real build, place it at the repo root. If you
  do not need Pi, create the minimal stub the up-script suggests:
  ```bash
  mkdir -p pi-mono-dist/coding-agent/dist
  printf '{"name":"@recoder/pi-coding-agent","version":"0.0.0","private":true}\n' \
    > pi-mono-dist/coding-agent/package.json
  ```
- Optional (recommended) — bake the pinned substrate binaries so the image
  ships them instead of apt's tmux:
  ```bash
  make substrate-binaries
  ```

---

## One-command bring-up

```bash
cp .env.selfhost.example .env.selfhost
# Edit .env.selfhost and set POSTGRES_USER + POSTGRES_PASSWORD (required).
scripts/selfhost-up.sh
```

`scripts/selfhost-up.sh`:

1. Creates `.env.selfhost` from the example if missing.
2. **Generates** `INTERNAL_SERVICE_KEY`, `RECODER_GOVERNANCE_SIGNING_KEY`, and
   `BETTER_AUTH_SECRET` when empty (64-hex via `openssl`/`/dev/urandom`).
3. **Fails fast** if `POSTGRES_USER` / `POSTGRES_PASSWORD` are missing (it must
   not invent your data-owning credential).
4. Verifies Docker is running and the build prerequisites exist.
5. `docker compose up -d --build`.
6. **Waits for every healthcheck** to go healthy (10-minute bound); on failure
   it dumps the offending service logs and exits non-zero. No faked success.
7. Prints the URLs.

### URLs

| What                | URL                            |
|---------------------|--------------------------------|
| Control plane       | `http://localhost:3100`        |
| Health              | `http://localhost:3100/health` |
| Edge (Envoy)        | `http://localhost:8080`        |
| Envoy admin         | `http://localhost:9901`        |

### Tear down

```bash
scripts/selfhost-down.sh            # stop, KEEP data volumes
scripts/selfhost-down.sh --volumes  # stop AND delete data volumes
```

---

## Required environment

Set in `.env.selfhost` (template: `.env.selfhost.example`).

### Required (stack will not start without these)

| Var                              | Notes                                                        |
|----------------------------------|--------------------------------------------------------------|
| `POSTGRES_USER`                  | Postgres superuser the stack runs as.                        |
| `POSTGRES_PASSWORD`              | Strong password. **Not auto-generated.**                     |
| `INTERNAL_SERVICE_KEY`           | worker→backend `/internal/*` auth. *Auto-generated if empty.*|
| `RECODER_GOVERNANCE_SIGNING_KEY` | governance audit signing key. *Auto-generated if empty.*     |
| `BETTER_AUTH_SECRET`             | Better Auth session/JWT secret. *Auto-generated if empty.*   |

### Optional (degrade safely when unset)

| Group   | Vars                                                                                   |
|---------|----------------------------------------------------------------------------------------|
| Ports   | `BACKEND_PORT` (3100), `EDGE_HTTP_PORT` (8080), `ENVOY_ADMIN_PORT` (9901)               |
| Billing | `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER`   |
| Sandbox | `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `DAYTONA_ORGANIZATION_ID`, `DAYTONA_TARGET`, `USE_DAYTONA_CONTAINERS` |
| BYOK    | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`                                 |

Missing optional keys make the corresponding feature report **unavailable**
rather than fake success — billing/runtime health fail safe by design.

The three Postgres databases are created on first boot by
`deploy/postgres/init-databases.sh` (runs once on an empty data volume). The
backend reaches them via the compose DNS name `postgres`:

```
recoder_backend  ->  DATABASE_URL / AGENT_OS_DATABASE_URL
recoder_main     ->  AUTH_DATABASE_URL
recoder_pm       ->  PM_DATABASE_URL (pgvector)
```

---

## Envoy config

`deploy/envoy/envoy.selfhost.yaml` is a real, valid static bootstrap: an HTTP
listener on `:8080` proxying to the `backend` cluster (`backend:3100`) with
health checks + access logs, and the admin interface on `:9901`.

When the backend's network module exposes `GET /api/network/envoy-config`, you
can regenerate the file from the live control plane and reload Envoy:

```bash
curl -fsS -H "X-Internal-Service-Key: $INTERNAL_SERVICE_KEY" \
  http://localhost:3100/api/network/envoy-config \
  -o deploy/envoy/envoy.selfhost.yaml
docker compose -f docker-compose.selfhost.yml restart envoy
```

---

## Machine image (AMI / generic host)

`deploy/packer/recoder.pkr.hcl` bakes Docker + the compose stack + the pinned
substrate binaries into an image whose `recoder-selfhost.service` systemd unit
runs Recoder on boot.

```bash
packer init     deploy/packer/recoder.pkr.hcl
packer validate deploy/packer/recoder.pkr.hcl
```

### Build an AWS AMI

```bash
packer build -only='amazon-ebs.recoder' deploy/packer/recoder.pkr.hcl
```

### Provision any reachable host over SSH (qemu / bare metal / existing VM)

```bash
packer build -only='null.recoder' \
  -var 'ssh_host=1.2.3.4' \
  -var 'ssh_username=ubuntu' \
  -var 'ssh_private_key_file=~/.ssh/id_ed25519' \
  deploy/packer/recoder.pkr.hcl
```

`deploy/packer/provision.sh` (runs inside the builder):

1. Installs Docker Engine + compose plugin, Node 20 + pnpm, Go.
2. rsyncs the uploaded repo to `/opt/recoder`.
3. `make substrate-binaries` (degrade-safe).
4. Builds `docker-backend/dist` if absent; ensures `pi-mono-dist/` exists.
5. Pre-builds `recoder/docker-backend:selfhost` into the local Docker cache.
6. Installs + enables `recoder-selfhost.service`.

A post-provision step **asserts** the image exists and the service is enabled,
so a broken image fails the Packer build instead of shipping silently.

> On first boot the systemd unit runs `selfhost-up.sh`, which fails fast unless
> `POSTGRES_PASSWORD` is set in `/opt/recoder/.env.selfhost` (bake it via Packer
> vars, inject via cloud-init/user-data, or set it before enabling the service).

---

## Validate the artifacts

```bash
# Compose is well-formed:
docker compose -f docker-compose.selfhost.yml config -q

# Shell scripts parse:
bash -n scripts/selfhost-up.sh scripts/selfhost-down.sh deploy/packer/provision.sh

# Packer template (if packer is installed):
packer validate deploy/packer/recoder.pkr.hcl
```
