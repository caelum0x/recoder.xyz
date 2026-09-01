# Recoder + VCPeer — Cheap ARM Migration Runbook

Move `recoder.xyz` off the **$30/mo Hetzner CPX42 (8 vCPU / 16 GB)** onto a
**~$4–7/mo ARM box** using the lean, self-contained stack in
[`docker-compose.cheap.yml`](../docker-compose.cheap.yml). Two ≈0-user apps do
not justify $30/mo.

> This runbook covers **recoder.xyz**. **VCPeer is a separate app** — see
> [§8 VCPeer](#8-vcpeer--separate-app-read-this). Do not expect it in the compose
> stack; it isn't there, on purpose.

---

## 0. What the lean stack runs (and what it drops)

**Kept** (the minimum to serve the public product):

| Service          | Image                    | Purpose                                  |
|------------------|--------------------------|------------------------------------------|
| postgres         | `pgvector/pgvector:pg17` | in-compose DB (recoder_main/backend/pm)  |
| redis            | `redis:7-alpine`         | sessions + A2A bus                       |
| backend          | built (`backend/Dockerfile`) | control plane — api.recoder.xyz      |
| recoder-app      | built (`app/Dockerfile`) | recoder.xyz Next.js site                 |
| recoder-frontend | built (`recoder-agents/Dockerfile`) | agents.recoder.xyz *(build-prereq gated)* |
| caddy            | `caddy:2-alpine`         | TLS reverse proxy, **auto-HTTPS**        |

All base images are **multi-arch (arm64 + amd64)**; the three custom images build
natively on the ARM host.

**Dropped** (re-enable via `docker-compose.deploy.yml` / `docker-compose.selfhost.yml`):
qdrant (optional — see below), the **entire monitoring stack** (grafana,
victoria-metrics, prometheus exporters, alertmanager, blackbox),
recoder-workspace, openclaw, daytona, and the **xds/governance/envoy service
mesh**.

**Why qdrant is out:** the backend's `VectorStorePort`
(`backend/src/domains/memory/vector-store.ts`) is a **truthful no-op when
`QDRANT_URL` is unset** — vector search degrades to keyword/lance fallback and the
backend still boots and serves. It is **not** required to boot. To turn vector
search back on: uncomment the `qdrant` service in the compose file and set
`QDRANT_URL=http://qdrant:6333` on `backend`.

**Why the governance/envoy mesh is out:** the `@recoder/governance` facade
**falls back to its pure-TS deny-biased path** when `GOVERNANCE_SOCKET` is unset
(`deploy/README.md`: "never a hard dependency"). Governance stays fail-closed;
only the separate Rust daemon + Envoy edge are omitted.

---

## 1. Provision the box

### Recommended: Hetzner **CAX21** (Ampere ARM, 4 vCPU / 8 GB / 80 GB) — ~$7.49/mo

Enough RAM to **build the Node images natively** (Next.js + backend builds are the
real memory pressure, not runtime). This is the pragmatic pick.

### Cheapest that runs: Hetzner **CAX11** (2 vCPU / 4 GB / 40 GB) — ~$3.79/mo

The stack **runs** in ~4 GB (see §7), but **building on 4 GB is risky** — a
Next.js build can OOM. If you pick CAX11, either:
- add 2–4 GB swap before building (`fallocate -l 4G /swapfile && mkswap /swapfile && swapon /swapfile`), **or**
- build the images on the CAX21 / your Mac (`--platform linux/arm64`), push to a
  registry, and run `redeploy.sh --no-build` on the CAX11.

### $0 option: **Oracle Cloud Always-Free ARM** (Ampere A1 — now 2 OCPU / 12 GB max)

Genuinely free forever and the **best value** — 12 GB (the Always-Free A1 cap was
reduced from 4 OCPU/24 GB to **2 OCPU/12 GB** in 2026, still plenty: the lean stack
idles ~1–2 GB, plus VCPeer ~1–2 GB, with headroom for Node build spikes). Setup:

1. **Create instance:** Compute → Instances → Create → Shape **Ampere /
   VM.Standard.A1.Flex**, set **2 OCPU / 12 GB**. Image **Ubuntu 22.04 (aarch64)**.
   Add your SSH key. If it says **"out of host capacity"** (common for A1), retry
   or switch Availability Domain — it frees up.
2. **⚠️ Two Oracle-only gotchas — do BOTH or the site is unreachable:**
   - **VCN ingress:** the default Security List only opens port 22. Add ingress
     rules for **80** and **443** (Source `0.0.0.0/0`) in the instance's subnet
     Security List.
   - **Instance iptables:** Oracle's Ubuntu image ships restrictive iptables. On
     the box, open 80/443 and persist:
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
3. Reclaim policy applies to *idle* always-free compute — the running containers
   keep it active enough. Then continue at §2 (Docker install).

**Pick:** **CAX21** for a no-drama paid box you can build on; **Oracle A1** if you
want $0 and can tolerate the capacity lottery. Avoid CAX11 unless you build
off-box or add swap.

Create the box with **Ubuntu 24.04 (arm64)**, add your SSH key, and note its IPv4
(and IPv6). Open ports **22, 80, 443** in the firewall/cloud console.

---

## 2. Install Docker + Compose (on the box)

```bash
ssh -o BatchMode=yes root@NEW_IP
apt-get update && apt-get install -y ca-certificates curl git postgresql-client
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version   # verify v2 plugin
```

---

## 3. Clone the repo + set `.env`

```bash
mkdir -p /opt/recoder && cd /opt/recoder
git clone <YOUR_RECODER_REMOTE> .        # or rsync the working tree
cp .env.cheap.example .env.cheap
# Edit .env.cheap: set a strong POSTGRES_PASSWORD (required) and your domains.
# Leave INTERNAL_SERVICE_KEY / RECODER_GOVERNANCE_SIGNING_KEY / BETTER_AUTH_SECRET
# empty — redeploy.sh generates them.
nano .env.cheap
```

**Build prerequisites** (`redeploy.sh` handles the first two automatically):
- `backend/dist/server.js` — prebuilt server bundle (`cd backend && pnpm install && pnpm build`).
- `pi-mono-dist/` — stub created by `redeploy.sh` if absent.
- **recoder-frontend only:** the `recoder-agents/` source tree + its `Dockerfile`
  must be staged at the repo root. These are **gitignored build artifacts** the
  current prod deploy already relies on; they are **not in the repo**. If they are
  absent, comment out the `recoder-frontend` service in
  `docker-compose.cheap.yml` and its block in `deploy/caddy/Caddyfile`, and serve
  `recoder.xyz` only.

---

## 4. Bring it up

```bash
./deploy/redeploy.sh
```

This validates the compose config, ensures prerequisites, generates secrets,
builds the three images, and starts the stack. First build is slow (Node images);
subsequent runs are cached.

Manual equivalent:
```bash
docker compose --env-file .env.cheap -f docker-compose.cheap.yml up -d --build
```

---

## 5. Restore the database

On the **OLD CPX42**, dump the host Postgres and copy it over:

```bash
# on the old box (repo checked out there):
PGHOST=127.0.0.1 PGUSER=recoder PGPASSWORD='<old-pw>' ./deploy/backup-db.sh
scp backups/recoder-db-*.tar.gz root@NEW_IP:/opt/recoder/
```

On the **NEW box**, restore into the running in-compose Postgres (prompts before
overwriting):

```bash
cd /opt/recoder
./deploy/redeploy.sh --restore recoder-db-<timestamp>.tar.gz
```

> The dumps use `--clean --if-exists`, so restore is repeatable. The three
> databases (`recoder_main`, `recoder_backend`, `recoder_pm`) are created on first
> boot by `deploy/postgres/init-databases.sh`, then overwritten by the restore.

---

## 6. Cut over DNS, verify, destroy the old box

1. **Verify on the new box before touching DNS** (bypass DNS with `--resolve`):
   ```bash
   docker compose -f docker-compose.cheap.yml ps          # all healthy
   docker compose -f docker-compose.cheap.yml exec backend curl -sf http://localhost:3100/health
   curl -sk --resolve recoder.xyz:443:NEW_IP https://recoder.xyz/ -o /dev/null -w '%{http_code}\n'
   ```
2. **Point DNS** at `NEW_IP` (A + AAAA) for: `recoder.xyz`, `www.recoder.xyz`,
   `api.recoder.xyz`, `agents.recoder.xyz`, `app.recoder.xyz`.
   - If you use **Cloudflare**: set records to **DNS-only (grey cloud)** for the
     first request so Caddy can complete the Let's Encrypt HTTP-01 challenge, then
     re-enable proxying if you want. (Or keep Cloudflare proxied and use an Origin
     cert instead of Caddy's ACME — but grey-cloud-first is simplest.)
3. **Watch Caddy issue certs:**
   ```bash
   docker compose -f docker-compose.cheap.yml logs -f caddy   # look for "certificate obtained"
   ```
4. Once the new box serves real traffic and certs are green, **destroy the CPX42**
   from the Hetzner console (delete the server + its volumes). Keep the DB tarball
   backup for a few days first.

---

## 7. Measured / estimated RAM footprint

Idle, zero-user (the current reality). `mem_limit` is the cap; "idle" is the
realistic resident set.

| Service          | Idle (est.) | `mem_limit` |
|------------------|-------------|-------------|
| postgres         | 120–220 MB  | 512 MB      |
| redis            | 15–60 MB    | 384 MB      |
| backend (Node)   | 350–700 MB  | 1536 MB     |
| recoder-app      | 250–500 MB  | 1024 MB     |
| recoder-frontend | 200–450 MB  | 768 MB      |
| caddy            | 15–35 MB    | 128 MB      |
| **Total idle**   | **~1.0–1.9 GB** | (caps sum ~4.3 GB) |

**Fits comfortably in 8 GB (CAX21)** with headroom for build spikes. **Runs in
4 GB (CAX11)** at idle, but leave the caps as guardrails and build off-box or with
swap. Drop `recoder-frontend` (serve recoder.xyz only) to shave ~200–450 MB.

**Monthly cost:** CAX21 ≈ **$7.49**, CAX11 ≈ **$3.79**, Oracle A1 = **$0** —
versus **$30** today. Even the safe pick is a **~75% cut**.

---

## 8. VCPeer — separate app, READ THIS

**VCPeer's code is NOT in this repo and NOT in the recoder docker stack.** Verified:

- VCPeer (vcpeer.com) lives in a **separate repository**:
  `/Users/arhansubasi/products/vcglass` (the `vcglass` codebase).
- It is a **Next.js 14 + Prisma + local PostgreSQL 17** app, deployed via
  **rsync + PM2 + nginx + Cloudflare** to **its own Hetzner VPS** — it does not use
  Docker and shares nothing with recoder's compose files.
  (Source: `/Users/arhansubasi/products/docs/vcpeer.md`, "Deployed to a Hetzner
  VPS … via rsync + PM2, fronted by nginx + Cloudflare".)

Because it is a distinct PM2/nginx app with its own database and ~660 API routes, a
Docker service for it was **deliberately not fabricated**. But this box is wired to
**co-host it turnkey**: Caddy already has a `vcpeer.com` site block that proxies to
the host on `VCPEER_HOST_PORT` (default 3200), and the caddy service has the
`host.docker.internal:host-gateway` mapping so it can reach a host PM2 process. So
VCPeer runs on the HOST (its normal PM2 model), and recoder's Caddy provides its TLS
— **drop VCPeer's own nginx; one proxy fronts both products.**

### 8a. Co-host VCPeer on this same box (recommended — one $0/cheap box for both)
```bash
# 1) Node 20 + PM2 (arm64) on the box
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm i -g pm2 pnpm

# 2) Postgres for VCPeer — reuse the SAME in-compose Postgres (add a db) OR a
#    host Postgres. Simplest: add a `vcpeer` database to recoder's compose
#    Postgres and point VCPeer's DATABASE_URL at 127.0.0.1:5432 (the compose
#    Postgres publishes 5432 on the host). Keep users/passwords distinct.

# 3) Get the vcglass tree onto the box + install + build
rsync -az --delete /path/to/vcglass/ deploy@BOX:/opt/vcpeer/   # or git clone
cd /opt/vcpeer && pnpm install --frozen-lockfile
# set /opt/vcpeer/.env from vcglass/.env.example:
#   NEXT_PUBLIC_APP_URL=https://vcpeer.com   NEXTAUTH_URL=https://vcpeer.com
#   DATABASE_URL=postgresql://vcpeer:...@127.0.0.1:5432/vcpeer   PORT=3200
pnpm prisma migrate deploy && pnpm build

# 4) Run it on port 3200 under PM2 (matches the Caddy route)
PORT=3200 pm2 start pnpm --name vcpeer -- start
pm2 save && pm2 startup   # survive reboots

# 5) Restore the current VCPeer DB dump into the vcpeer database, then in §6
#    ALSO point vcpeer.com (+ www) DNS at this box. Caddy issues its cert on
#    first request. NO nginx needed — Caddy's vcpeer.com block handles TLS.
```
NextAuth/`NEXT_PUBLIC_APP_URL` must be the real `https://vcpeer.com` (never
localhost) — VCPeer's callbacks depend on it.

### 8b. Or keep VCPeer on its own tiny box
A CAX11 (~$3.79) or a second Oracle A1 is plenty for a ~2-user app. Then delete the
`vcpeer.com` block from the Caddyfile here and migrate recoder only.

**What the owner must provide either way:** confirm `vcglass` is the deploy source,
its production `.env` (DB URL, NextAuth secret, provider keys), and the current
VCPeer server's DB dump. The Caddy + compose wiring for co-hosting is already in
place; the only manual steps are the PM2 app + DB restore above.

---

## 9. Rollback

Nothing here is destructive until you delete the CPX42. If the new box misbehaves:
point DNS back to the old IP (TTL-bound), debug the new box, retry. Keep the DB
tarball until the new box has served real traffic for a few days.
