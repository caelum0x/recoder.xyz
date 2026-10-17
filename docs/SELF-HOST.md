# Self-Hosting Recoder

Run the full Recoder control plane — governed orchestration, Postgres
state-of-record, the shared brain, and a **fail-closed** Envoy edge — on your
own Linux server, Mac mini, or Windows box (via WSL2/Docker Desktop), with one
command, or as a baked machine image.

This page documents what actually ships in [`deploy/`](../deploy/),
[`scripts/`](../scripts/), and
[`docker-compose.selfhost.yml`](../docker-compose.selfhost.yml). It is honest
about what is verified today, what needs a real host, and what degrades
safely when a dependency is absent. Every claim below was either run directly
or traced against the source it describes — nothing here is aspirational.

**The pitch:** you already pay for Claude Code / Codex / Cursor / your model
provider. Recoder is not another AI subscription — it's the governed
orchestration layer (parallel git worktrees, audit trail, approvals, memory)
that sits on top of whatever coding agent and model key you already have.
Run it on hardware you own and your code, state, and audit log never leave
your network.

Related docs:

- [`deploy/README.md`](../deploy/README.md) — the deploy directory's own operator notes (stack table, governance daemon, xDS detail).
- [`docs/LOOM-INTEGRATION.md`](./LOOM-INTEGRATION.md) / [`docs/LOOM-ROADMAP.md`](./LOOM-ROADMAP.md) — the Loom workspace-substrate engine this stack runs.
- [`docs/LOOM-REMOTE-ATTACH-ZITI.md`](./LOOM-REMOTE-ATTACH-ZITI.md) — status of true host-to-host Loom transport (not yet shipped; see **Known gaps** below).

---

## What you get

The self-host stack (`docker-compose.selfhost.yml`, project name
`recoder-selfhost`) brings up:

| Service | Image / build | Host port | Role |
|---|---|---|---|
| `backend` | built from [`backend/Dockerfile`](../backend/Dockerfile) → `recoder/backend:selfhost` | `${BACKEND_PORT:-3100}` | The Recoder control plane (the product) |
| `postgres` | `postgres:17` | internal | `recoder_main` / `recoder_backend` / `recoder_pm` |
| `redis` | `redis:7` | internal | sessions, A2A bus |
| `qdrant` | `qdrant/qdrant` | internal | vector store (mem0 / embeddings, the shared brain) |
| `recoder-xds` | reuses `recoder/backend:selfhost` | internal (`18000`/`18001`) | Envoy **xDS (ADS)** control plane — dynamic LDS/CDS/RDS |
| `recoder-governance` | built from [`deploy/governance-daemon.Dockerfile`](../deploy/governance-daemon.Dockerfile) | internal (UDS) | Rust deny-biased governance daemon |
| `envoy` | `envoyproxy/envoy:v1.31` | `${EDGE_HTTP_PORT:-8080}` + `${ENVOY_ADMIN_PORT:-9901}` | L7 edge proxy, fail-closed `ext_authz` gate |

The backend image is built with the **repo root** as the build context
(`context: .`) because [`backend/Dockerfile`](../backend/Dockerfile) copies
sibling paths (`packages/`, `shared/`, `pi-mono-dist/`, etc.) and the
prebuilt `backend/dist/server.js`.

### Degrade-safe by design

Two services are **enhancements, never hard dependencies**:

- **`recoder-governance`** — the backend's `@recoder/governance` facade
  delegates to the Rust daemon over a shared Unix socket (`GOVERNANCE_SOCKET`),
  and falls back to its pure-TS deny-biased path on **any** failure. A
  dead/absent daemon degrades truthfully (verdicts marked `degraded`) — never
  an open gate.
- **`recoder-xds`** — gives Envoy live config over ADS. If it is down or its
  binary was not built, Envoy keeps serving via its **static fallback
  listener** on `:8080`. The edge never goes dark because of xDS.

Both are reported non-fatally by the bring-up script and are **not** in its
hard health gate (see [`scripts/selfhost-up.sh`](../scripts/selfhost-up.sh)).

---

## Prerequisites (you need a real host)

Self-hosting is **not** a no-op locally: the backend image build assumes a
prebuilt dist and sibling artifacts. [`scripts/selfhost-up.sh`](../scripts/selfhost-up.sh)
checks these honestly and fails fast if they are missing:

- Docker Engine + Docker Compose v2 (or legacy `docker-compose`), daemon running.
- `backend/dist/server.js` present — build it first:
  ```bash
  (cd backend && pnpm install && pnpm build)
  ```
- `pi-mono-dist/` present. If you do not need the Pi coding-agent SDK, create a
  stub layout:
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

New to a bare Linux box and don't want to run these steps by hand? See
**[Fastest path: install script + systemd unit](#fastest-path-install-script--systemd-unit)**
below — it wraps this exact flow plus boot-time auto-start.

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

**Bring your own AI provider key (BYOK) — fully optional:** Recoder itself
needs no AI provider key; it's a governed orchestration layer around whatever
coding agent you point it at. The model key is consumed by the agent CLI
running *inside* a workspace pane (Claude Code, Codex, etc.), not by Recoder.
Set whichever you use in `.env.selfhost`:

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

All three are optional and degrade-safe — omit the ones you don't use. See
**Known gaps** below: the backend image does not install an agent CLI for
you today, so you'll need one on `PATH` inside the container (or mount it
in) until that's packaged.

**Other optional vars (degrade safely when unset, truthful health):** host
ports (`BACKEND_PORT`, `EDGE_HTTP_PORT`, `ENVOY_ADMIN_PORT`),
`GOVERNANCE_SOCKET`, xDS tunables (`XDS_LISTEN_PORT`, `XDS_HEALTH_PORT`,
`XDS_LOG_LEVEL`, `XDS_CONFIG_URL`), billing (`POLAR_*`), agent sandboxes
(`DAYTONA_*`, `USE_DAYTONA_CONTAINERS`), and the Loom workspace substrate
(`CONDUCTOR_LOOM_BIN`, `CONDUCTOR_LOOM_DISABLED` — see **Known gaps**).

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
Envoy **denies** the request. The edge is hostile-by-default — a dead
governance path closes the gate rather than opening it.

### How `validate-selfhost.sh` enforces it

[`deploy/validate-selfhost.sh`](../deploy/validate-selfhost.sh) runs static,
truthful checks **without bringing anything up**, and exits non-zero on the
first hard failure (skips are reported, never silently passed):

```bash
deploy/validate-selfhost.sh
```

1. **`docker compose ... config -q`** — the compose file is well-formed and
   every `${VAR:?required}` interpolation resolves, fed a **temporary** env
   file of throwaway placeholders (`mktemp`, `rm`'d on exit — never real
   secrets, never written to the repo).
2. **`bash -n`** on every self-host shell script.
3. **YAML parse** of both Envoy bootstraps **plus** a structural **fail-closed
   posture assertion** via [`deploy/envoy/check-fail-closed.py`](../deploy/envoy/check-fail-closed.py)
   (requires `python3` + PyYAML; otherwise skipped + reported).
4. **`packer validate`** of the AMI template, **if** Packer is installed (else
   skipped + reported as gated).

A string `grep ext_authz` is **not** enough — a config could carry an
ext_authz filter that is `failure_mode_allow: true` (fail-OPEN) and still
match. So `check-fail-closed.py` walks the **parsed YAML** and proves, for
**every** ext_authz filter in **both** bootstraps:

- at least one ext_authz filter exists (the edge is governed);
- `failure_mode_allow` is present **and explicitly `false`** (a missing key
  defaults to false in Envoy, but the check requires it stated explicitly so
  the posture is auditable and cannot silently flip on a default change);
- the authz call targets the `recoder_ext_authz` cluster **and** that cluster
  is actually defined in `static_resources.clusters` (no dangling governance
  gate).

Any violation is a **hard failure** — the stack never ships a fail-open /
ungoverned edge.

---

## Fastest path: install script + systemd unit

For a fresh Linux box (bare metal, a VPS, or a VM) where you don't want to
build a Packer AMI, [`scripts/install-selfhost.sh`](../scripts/install-selfhost.sh)
and [`deploy/systemd/recoder-selfhost.service`](../deploy/systemd/recoder-selfhost.service)
give you a one-command path that starts the stack on boot:

```bash
git clone <this repo> /opt/recoder && cd /opt/recoder
sudo scripts/install-selfhost.sh
```

It installs Docker if missing (Debian/Ubuntu `apt` path), seeds
`.env.selfhost` from the example if absent, installs
`recoder-selfhost.service` as a systemd unit pointed at the repo directory,
and enables (but does not silently start) it — you still set
`POSTGRES_PASSWORD` in `.env.selfhost` before `systemctl start`. See the
script's own header comment for exactly what it does and does not do; it
never overwrites a `.env.selfhost` you already have.

**macOS (Mac mini) today:** there is no launchd equivalent yet — this is a
known gap (see below). Run `scripts/selfhost-up.sh` directly after installing
Docker Desktop; boot-time auto-start isn't wired up, so after a reboot you'd
re-run the script (or add your own `launchd` plist — not shipped here because
it isn't verified).

**Windows:** via WSL2 + Docker Desktop, the same Linux path above applies
inside the WSL2 distro. There is no native Windows service wrapper here
either — same gap as macOS, tracked below, not faked as shipped.

---

## AMI / machine-image build (Packer)

[`deploy/packer/recoder.pkr.hcl`](../deploy/packer/recoder.pkr.hcl) bakes
Docker + the compose stack + the pinned substrate binaries so a booted
instance runs Recoder via the same systemd unit pattern. Two builders:

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

> **Needs a real host:** building an AMI needs AWS credentials + the `amazon`
> Packer plugin (fetched by `packer init`); the `null` builder needs a
> reachable SSH target. `validate-selfhost.sh` reports `packer validate` as
> skipped/gated when Packer is not installed. If you just want a single box
> running today without AWS, prefer the install script above.

---

## Pointing desktops at a self-hosted control plane

The [`apps/desktop`](../apps/desktop) Recoder app talks to a backend over an
HTTP base URL. By default it boots its **own** embedded backend, but you can
point it at your self-hosted control plane instead.

- The cockpit's backend URL comes from `DOCKER_BACKEND_URL`, defaulting to
  `http://localhost:3100` (`apps/desktop/main.js`:
  `process.env.DOCKER_BACKEND_URL || 'http://localhost:3100'`).
- When the embedded backend supervisor is **READY**, its resolved
  `{ backendUrl, apiKey }` **override** `DOCKER_BACKEND_URL` for the cockpit.
  The embedded backend is **on by default for packaged builds** and **off in
  dev** unless `RECODER_EMBEDDED_BACKEND` is set.

To target your self-hosted backend, disable the embedded backend and set the URL:

```bash
RECODER_EMBEDDED_BACKEND=false \
DOCKER_BACKEND_URL=http://your-host:3100 \
  <launch the desktop app>
```

Point at the **Envoy edge** (`:8080`) rather than the backend (`:3100`)
directly when you want the fail-closed governance gate in front of desktop
traffic.

> The desktop supervisor polls `GET ${backendUrl}/api/conductor/health` with
> the API key until it returns 200, so a self-hosted backend must expose that
> route (the standard control-plane image does).

**CLI:** `packages/herd` (`recoder-herd`) can read and attach to a running
workspace from the command line. Its own source comment is explicit that
"this surface only reads and attaches" and its attach path is
`tmux`-specific — see **Known gaps**, since the default workspace substrate
is now Loom, not tmux.

---

## Known gaps (honest, not sugar-coated)

These were confirmed against the source and the build, not assumed:

1. ~~The backend image does not bake the `loom` binary.~~ **Fixed.**
   `backend/Dockerfile` now has a dedicated `loom` build stage (Rust 1.96.1 +
   Zig exactly 0.15.2, mirroring the existing `tmux`/`bd`/`recoder-xds`
   substrate stage) that builds `apps/desktop/engines/loom` and bakes the
   binary into the image at the path
   [`backend/src/domains/engines/loom-path.ts`](../backend/src/domains/engines/loom-path.ts)
   expects via `CONDUCTOR_LOOM_BIN` (exported by
   `docker-substrate-entrypoint.sh`, same degrade-safe pattern as tmux/bd). A
   vanilla `docker compose up` now launches workspaces on Loom without either
   workaround below. The build stage is degrade-safe like its siblings — if
   the toolchain or network is unavailable during the image build, the binary
   is simply absent and the two workarounds below still apply:
   - set `CONDUCTOR_LOOM_DISABLED=1` in `.env.selfhost` (falls back to the
     tmux substrate, fully supported), or
   - build Loom yourself (`cd apps/desktop/engines/loom && cargo build
     --release --locked` — requires Rust 1.96.1 and **exactly** Zig 0.15.2,
     see `apps/desktop/engines/loom/RECODER-VENDOR.md`) and mount it into the
     backend container with `CONDUCTOR_LOOM_BIN=/path/to/loom`.

2. **No coding-agent CLI is installed in the backend image.** The
   "bring your own AI subscription" story is real for the *API key*
   (BYOK, above), but the image does not install Claude Code, Codex,
   opencode, or any other agent CLI for you — you add one yourself inside the
   container (a custom image layer, or a volume mount onto `PATH`) today.

3. **True machine-to-machine remote Loom transport isn't solved.** Loom's
   control socket is Unix-domain only — there is no TCP path. The designed
   transport for a second host is an OpenZiti bridge
   ([`docs/LOOM-REMOTE-ATTACH-ZITI.md`](./LOOM-REMOTE-ATTACH-ZITI.md)),
   explicitly marked "live provisioning pending." What already works is the
   backend's own HTTP/WS/MCP edge (`:3100`, or `:8080` via Envoy) talking to a
   **co-located** Loom daemon over its private socket — "self-host on your
   server" today means "backend + Loom live together on that one box," not
   yet "Loom on box A, client on box B" without a tunnel you build yourself.

4. **No first-party headless CLI for full workspace lifecycle management.**
   The Node backend's REST surface (`/api/conductor/*`) is self-sufficient in
   principle for headless use, but the one shipped CLI
   (`packages/herd`/`recoder-herd`) is read-and-attach only and
   `tmux`-specific, not Loom-aware.

5. **No native boot-time service wrapper for macOS or Windows.** The systemd
   unit (above) covers Linux. A Mac mini or Windows box runs the stack fine
   via Docker Desktop, but auto-restart-on-boot is not wired up there yet.

None of these block trying Recoder self-hosted today — they define exactly
where the edges of "self-host on your own infra" currently are, and (1) and
(5) now each have a documented, real workaround above.
